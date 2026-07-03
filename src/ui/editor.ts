// SVG graph editor: tools, selection, drag, zoom/pan, label editing.
// Interaction model follows legacy VUE (docs/legacy-specs/interaction.md).

import {
  GDoc, GItem, GLink, GNode, LinkEnd, NodeShape, STROKE_DASHES,
  SELECTION_COLOR, deleteItems, docBounds, getNode, hasStraightLinkBetween,
  makeLink, makeNode, newDoc, allocId,
} from "../core/model";
import {
  Pt, distSqToSegment, flattenLinkPath, linkMidpoint, nodeCenter, nodeOutline,
  pointInOutline, rayOutlineIntersection, shapePathData,
} from "../core/geometry";
import { History } from "../core/history";
import { autoSizeFor, fontToCss, measureLabel } from "./measure";

export type Tool = "select" | "node" | "link" | "hand";

const ZOOM_PRESETS = [
  1 / 64, 1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 128,
];
const FIT_PAD = 20;
const DRAG_START_PX = 3;
const CREATE_MIN_PX = 10;

type Drag =
  | { kind: "none" }
  | { kind: "maybeMove"; startS: Pt; startW: Pt; hitId: string }
  | { kind: "move"; startW: Pt; orig: Map<string, { x: number; y: number }>; origLinks: Map<string, GLink>; moved: boolean }
  | { kind: "marquee"; startW: Pt; curW: Pt; toggle: boolean }
  | { kind: "nodeRect"; startW: Pt; curW: Pt; started: boolean }
  | { kind: "linkDraw"; sourceId: string; curW: Pt; targetId: string | null; startS: Pt }
  | { kind: "pan"; startS: Pt; origPan: Pt }
  | { kind: "resize"; nodeId: string; handle: number; orig: { x: number; y: number; w: number; h: number }; moved: boolean }
  | { kind: "endpoint"; linkId: string; end: "head" | "tail"; curW: Pt; targetId: string | null; moved: boolean }
  | { kind: "ctrl"; linkId: string; which: 0 | 1; moved: boolean };

export class Editor {
  doc: GDoc = newDoc();
  selection = new Set<string>();
  tool: Tool = "select";
  defaultShape: NodeShape = "roundRect";
  zoom = 1;
  panX = 0;
  panY = 0;
  dirty = false;

  private history = new History();
  private drag: Drag = { kind: "none" };
  private spaceDown = false;
  private editingId: string | null = null;
  private labelBox: HTMLTextAreaElement | null = null;

  private svg: SVGSVGElement;
  private world: SVGGElement;
  private itemsG: SVGGElement;
  private overlayG: SVGGElement;
  readonly container: HTMLElement;

  onChange: () => void = () => {};
  onViewChange: () => void = () => {};

  constructor(container: HTMLElement) {
    this.container = container;
    this.svg = el("svg") as SVGSVGElement;
    this.svg.setAttribute("width", "100%");
    this.svg.setAttribute("height", "100%");
    this.svg.style.display = "block";
    this.world = el("g") as SVGGElement;
    this.itemsG = el("g") as SVGGElement;
    this.overlayG = el("g") as SVGGElement;
    this.world.appendChild(this.itemsG);
    this.world.appendChild(this.overlayG);
    this.svg.appendChild(this.world);
    container.appendChild(this.svg);

    this.svg.addEventListener("pointerdown", (e) => this.pointerDown(e));
    this.svg.addEventListener("pointermove", (e) => this.pointerMove(e));
    this.svg.addEventListener("pointerup", (e) => this.pointerUp(e));
    this.svg.addEventListener("dblclick", (e) => this.doubleClick(e));
    this.svg.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    this.svg.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => this.keyDown(e));
    window.addEventListener("keyup", (e) => this.keyUp(e));

    this.render();
  }

  // ---------- document lifecycle ----------

  setDoc(doc: GDoc): void {
    this.commitLabelEdit();
    this.doc = doc;
    this.selection.clear();
    this.history.clear();
    this.dirty = false;
    this.zoom = doc.userZoom > 0 ? doc.userZoom : 1;
    this.panX = -doc.userOrigin.x * this.zoom;
    this.panY = -doc.userOrigin.y * this.zoom;
    this.render();
    this.onChange();
    this.onViewChange();
  }

  /** Sync the viewport into the doc before saving. */
  prepareForSave(): void {
    this.commitLabelEdit();
    this.doc.userZoom = this.zoom;
    this.doc.userOrigin = { x: -this.panX / this.zoom, y: -this.panY / this.zoom };
  }

  markSaved(): void {
    this.dirty = false;
    this.onChange();
  }

  /** Run a mutation with an undo checkpoint. */
  mutate(fn: () => void): void {
    this.history.checkpoint(this.doc);
    fn();
    this.dirty = true;
    this.render();
    this.onChange();
  }

  undo(): void {
    this.commitLabelEdit();
    const prev = this.history.undo(this.doc);
    if (!prev) return;
    this.doc = prev;
    this.pruneSelection();
    this.dirty = true;
    this.render();
    this.onChange();
  }

  redo(): void {
    this.commitLabelEdit();
    const next = this.history.redo(this.doc);
    if (!next) return;
    this.doc = next;
    this.pruneSelection();
    this.dirty = true;
    this.render();
    this.onChange();
  }

  canUndo(): boolean { return this.history.canUndo(); }
  canRedo(): boolean { return this.history.canRedo(); }

  private pruneSelection(): void {
    const ids = new Set(this.doc.items.map((i) => i.id));
    for (const id of [...this.selection]) if (!ids.has(id)) this.selection.delete(id);
  }

  // ---------- tools / view ----------

  setTool(t: Tool): void {
    this.commitLabelEdit();
    this.tool = t;
    this.drag = { kind: "none" };
    this.updateCursor();
    this.render();
    this.onViewChange();
  }

  private effectiveTool(): Tool {
    return this.spaceDown ? "hand" : this.tool;
  }

  private updateCursor(): void {
    const t = this.effectiveTool();
    this.svg.style.cursor =
      t === "hand" ? (this.drag.kind === "pan" ? "grabbing" : "grab")
      : t === "node" || t === "link" ? "crosshair"
      : "default";
  }

  screenToWorld(sx: number, sy: number): Pt {
    const r = this.svg.getBoundingClientRect();
    return { x: (sx - r.left - this.panX) / this.zoom, y: (sy - r.top - this.panY) / this.zoom };
  }

  worldToScreen(wx: number, wy: number): Pt {
    const r = this.svg.getBoundingClientRect();
    return { x: wx * this.zoom + this.panX + r.left, y: wy * this.zoom + this.panY + r.top };
  }

  setZoom(z: number, anchorScreen?: Pt): void {
    z = Math.max(0.001, Math.min(128, z));
    const r = this.svg.getBoundingClientRect();
    const ax = anchorScreen ? anchorScreen.x - r.left : r.width / 2;
    const ay = anchorScreen ? anchorScreen.y - r.top : r.height / 2;
    const w = { x: (ax - this.panX) / this.zoom, y: (ay - this.panY) / this.zoom };
    this.zoom = z;
    this.panX = ax - w.x * z;
    this.panY = ay - w.y * z;
    this.render();
    this.onViewChange();
  }

  zoomStep(dir: 1 | -1): void {
    let next: number;
    if (dir > 0) next = ZOOM_PRESETS.find((p) => p > this.zoom + 1e-9) ?? ZOOM_PRESETS[ZOOM_PRESETS.length - 1];
    else next = [...ZOOM_PRESETS].reverse().find((p) => p < this.zoom - 1e-9) ?? ZOOM_PRESETS[0];
    this.setZoom(next);
  }

  zoomFit(): void {
    const b = docBounds(this.doc);
    const r = this.svg.getBoundingClientRect();
    if (!b || r.width < 10) return;
    const z = Math.min((r.width - FIT_PAD * 2) / Math.max(b.w, 1), (r.height - FIT_PAD * 2) / Math.max(b.h, 1));
    this.zoom = Math.max(0.001, Math.min(4, z));
    this.panX = (r.width - b.w * this.zoom) / 2 - b.x * this.zoom;
    this.panY = (r.height - b.h * this.zoom) / 2 - b.y * this.zoom;
    this.render();
    this.onViewChange();
  }

  zoomActual(): void {
    this.setZoom(1);
  }

  // ---------- editing operations ----------

  deleteSelection(): void {
    if (this.selection.size === 0) return;
    this.commitLabelEdit();
    this.mutate(() => deleteItems(this.doc, new Set(this.selection)));
    this.selection.clear();
    this.render();
  }

  selectAll(): void {
    for (const it of this.doc.items) this.selection.add(it.id);
    this.render();
  }

  deselectAll(): void {
    this.selection.clear();
    this.render();
  }

  duplicateSelection(): void {
    if (this.selection.size === 0) return;
    const idMap = new Map<string, string>();
    this.mutate(() => {
      const clones: GItem[] = [];
      for (const it of this.doc.items) {
        if (!this.selection.has(it.id)) continue;
        const clone = structuredClone(it);
        clone.id = allocId(this.doc);
        idMap.set(it.id, clone.id);
        if (clone.kind === "node") {
          clone.x += 10;
          clone.y += 10;
        } else {
          clone.head = { ...clone.head, x: clone.head.x + 10, y: clone.head.y + 10 };
          clone.tail = { ...clone.tail, x: clone.tail.x + 10, y: clone.tail.y + 10 };
          if (clone.ctrl0) clone.ctrl0 = { x: clone.ctrl0.x + 10, y: clone.ctrl0.y + 10 };
          if (clone.ctrl1) clone.ctrl1 = { x: clone.ctrl1.x + 10, y: clone.ctrl1.y + 10 };
        }
        clones.push(clone);
      }
      // remap duplicated links: keep connections when the endpoint was also duplicated, else detach
      for (const c of clones) {
        if (c.kind !== "link") continue;
        c.head.node = c.head.node ? idMap.get(c.head.node) ?? null : null;
        c.tail.node = c.tail.node ? idMap.get(c.tail.node) ?? null : null;
      }
      this.doc.items.push(...clones);
      this.selection = new Set(clones.map((c) => c.id));
    });
  }

  nudgeSelection(dx: number, dy: number): void {
    if (this.selection.size === 0) return;
    this.mutate(() => this.translateItems(this.selection, dx, dy));
  }

  /** Move nodes; move link free-endpoints/controls when the link is selected or both its endpoints move. */
  private translateItems(ids: Set<string>, dx: number, dy: number): void {
    for (const it of this.doc.items) {
      if (it.kind === "node" && ids.has(it.id)) {
        it.x += dx;
        it.y += dy;
      }
    }
    for (const it of this.doc.items) {
      if (it.kind !== "link") continue;
      const headMoves = it.head.node != null && ids.has(it.head.node);
      const tailMoves = it.tail.node != null && ids.has(it.tail.node);
      const selected = ids.has(it.id);
      if (selected) {
        if (it.head.node == null) { it.head.x += dx; it.head.y += dy; }
        if (it.tail.node == null) { it.tail.x += dx; it.tail.y += dy; }
      }
      const bothEndsMove =
        (headMoves || it.head.node == null && selected) &&
        (tailMoves || it.tail.node == null && selected);
      if (bothEndsMove) {
        if (it.ctrl0) { it.ctrl0.x += dx; it.ctrl0.y += dy; }
        if (it.ctrl1) { it.ctrl1.x += dx; it.ctrl1.y += dy; }
      }
    }
  }

  createNodeAt(wx: number, wy: number, openEditor = true): GNode {
    let created: GNode;
    this.mutate(() => {
      const size = autoSizeFor("New Node", { family: "Arial", size: 12, bold: false, italic: false, underline: false });
      created = makeNode(this.doc, wx - size.w / 2, wy - size.h / 2, size.w, size.h, this.defaultShape);
      this.doc.items.push(created);
      this.selection = new Set([created.id]);
    });
    if (openEditor) this.startLabelEdit(created!.id, true);
    return created!;
  }

  applyStyleToSelection(patch: Partial<Pick<GNode, "fill" | "stroke" | "textColor" | "shape">> & { arrowState?: number; controlCount?: 0 | 1 | 2 }): void {
    if (this.selection.size === 0) return;
    this.mutate(() => {
      for (const it of this.doc.items) {
        if (!this.selection.has(it.id)) continue;
        if (it.kind === "node") {
          if (patch.fill !== undefined) it.fill = patch.fill;
          if (patch.stroke !== undefined) it.stroke = patch.stroke;
          if (patch.textColor !== undefined) it.textColor = patch.textColor;
          if (patch.shape !== undefined) it.shape = patch.shape;
        } else {
          if (patch.stroke !== undefined) it.stroke = patch.stroke;
          if (patch.textColor !== undefined) it.textColor = patch.textColor;
          if (patch.arrowState !== undefined) it.arrowState = patch.arrowState;
          if (patch.controlCount !== undefined) this.setLinkCurve(it, patch.controlCount);
        }
      }
    });
  }

  private setLinkCurve(l: GLink, count: 0 | 1 | 2): void {
    const g = this.linkGeometry(l);
    l.controlCount = count;
    if (count === 0) {
      l.ctrl0 = null;
      l.ctrl1 = null;
    } else {
      const mid = { x: (g.headPt.x + g.tailPt.x) / 2, y: (g.headPt.y + g.tailPt.y) / 2 };
      const dx = g.tailPt.x - g.headPt.x, dy = g.tailPt.y - g.headPt.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len; // perpendicular
      if (count === 1) {
        if (!l.ctrl0) l.ctrl0 = { x: mid.x + nx * (len / 3), y: mid.y + ny * (len / 3) };
        l.ctrl1 = null;
      } else {
        if (!l.ctrl0) l.ctrl0 = { x: g.headPt.x + dx / 4 + nx * (len / 4), y: g.headPt.y + dy / 4 + ny * (len / 4) };
        if (!l.ctrl1) l.ctrl1 = { x: g.headPt.x + (3 * dx) / 4 + nx * (len / 4), y: g.headPt.y + (3 * dy) / 4 + ny * (len / 4) };
      }
    }
  }

  // ---------- link geometry ----------

  private linkGeometry(l: GLink): { headPt: Pt; tailPt: Pt; ctrl0: Pt | null; ctrl1: Pt | null; flat: Pt[]; mid: Pt } {
    const headNode = getNode(this.doc, l.head.node);
    const tailNode = getNode(this.doc, l.tail.node);
    const headBase = headNode ? nodeCenter(headNode) : { x: l.head.x, y: l.head.y };
    const tailBase = tailNode ? nodeCenter(tailNode) : { x: l.tail.x, y: l.tail.y };
    const ctrl0 = l.controlCount >= 1 ? l.ctrl0 : null;
    const ctrl1 = l.controlCount === 2 ? l.ctrl1 : null;

    // ray targets: nearest control point, else the opposite end
    const headTarget = ctrl0 ?? tailBase;
    const tailTarget = ctrl1 ?? ctrl0 ?? headBase;

    let headPt = headBase;
    if (headNode) headPt = rayOutlineIntersection(headBase, headTarget, nodeOutline(headNode)) ?? headBase;
    let tailPt = tailBase;
    if (tailNode) tailPt = rayOutlineIntersection(tailBase, tailTarget, nodeOutline(tailNode)) ?? tailBase;

    // keep persisted endpoint coordinates fresh (legacy VUE does the same on save)
    l.head.x = headPt.x; l.head.y = headPt.y;
    l.tail.x = tailPt.x; l.tail.y = tailPt.y;

    const flat = flattenLinkPath(headPt, tailPt, ctrl0, ctrl1);
    const mid = linkMidpoint(headPt, tailPt, ctrl0, ctrl1);
    return { headPt, tailPt, ctrl0, ctrl1, flat, mid };
  }

  // ---------- hit testing ----------

  hitTest(w: Pt): GItem | null {
    const slop = Math.max(4 / this.zoom, 2);
    for (let i = this.doc.items.length - 1; i >= 0; i--) {
      const it = this.doc.items[i];
      if (it.kind === "node") {
        if (w.x < it.x - slop || w.x > it.x + it.w + slop || w.y < it.y - slop || w.y > it.y + it.h + slop) continue;
        if (pointInOutline(w, nodeOutline(it))) return it;
        // near the stroke of thin shapes still counts
        const out = nodeOutline(it);
        for (let j = 0; j < out.length; j++) {
          if (distSqToSegment(w, out[j], out[(j + 1) % out.length]) <= slop * slop) return it;
        }
      } else {
        const g = this.linkGeometry(it);
        const r = Math.max(it.strokeWidth / 2 + 1, slop);
        for (let j = 0; j < g.flat.length - 1; j++) {
          if (distSqToSegment(w, g.flat[j], g.flat[j + 1]) <= r * r) return it;
        }
        if (it.label) {
          const m = measureLabel(it.label, it.font);
          if (Math.abs(w.x - g.mid.x) <= m.w / 2 + 3 && Math.abs(w.y - g.mid.y) <= m.h / 2 + 2) return it;
        }
      }
    }
    return null;
  }

  private hitNode(w: Pt): GNode | null {
    const hit = this.hitTest(w);
    return hit && hit.kind === "node" ? hit : null;
  }

  // ---------- pointer handling ----------

  private pointerDown(e: PointerEvent): void {
    if (e.button === 2) return;
    this.commitLabelEdit();
    try {
      this.svg.setPointerCapture(e.pointerId);
    } catch {
      // synthetic events (tests) have no active pointer to capture
    }
    const w = this.screenToWorld(e.clientX, e.clientY);
    const s = { x: e.clientX, y: e.clientY };


    if (e.button === 1 || this.effectiveTool() === "hand") {
      this.drag = { kind: "pan", startS: s, origPan: { x: this.panX, y: this.panY } };
      this.updateCursor();
      return;
    }

    const tool = this.effectiveTool();

    if (tool === "select") {
      // selection handles first (resize / link endpoints / curve controls)
      const handle = this.hitHandle(w);
      if (handle) {
        this.drag = handle;
        return;
      }
      const hit = this.hitTest(w);
      if (hit) {
        const additive = e.shiftKey || e.ctrlKey;
        if (additive) {
          if (this.selection.has(hit.id)) this.selection.delete(hit.id);
          else this.selection.add(hit.id);
          this.render();
          return; // no drag from a toggle-click
        }
        if (!this.selection.has(hit.id)) this.selection = new Set([hit.id]);
        this.drag = { kind: "maybeMove", startS: s, startW: w, hitId: hit.id };
        this.render();
      } else {
        if (!e.shiftKey) this.selection.clear();
        this.drag = { kind: "marquee", startW: w, curW: w, toggle: e.shiftKey };
        this.render();
      }
      return;
    }

    if (tool === "node") {
      this.drag = { kind: "nodeRect", startW: w, curW: w, started: false };
      return;
    }

    if (tool === "link") {
      const src = this.hitNode(w);
      if (src) this.drag = { kind: "linkDraw", sourceId: src.id, curW: w, targetId: null, startS: s };
      return;
    }
  }

  private pointerMove(e: PointerEvent): void {
    const w = this.screenToWorld(e.clientX, e.clientY);

    const d = this.drag;

    switch (d.kind) {
      case "none":
        return;
      case "pan": {
        this.panX = d.origPan.x + (e.clientX - d.startS.x);
        this.panY = d.origPan.y + (e.clientY - d.startS.y);
        this.render();
        this.onViewChange();
        return;
      }
      case "maybeMove": {
        if (Math.abs(e.clientX - d.startS.x) < DRAG_START_PX && Math.abs(e.clientY - d.startS.y) < DRAG_START_PX) return;
        this.history.checkpoint(this.doc);
        const orig = new Map<string, { x: number; y: number }>();
        const origLinks = new Map<string, GLink>();
        for (const it of this.doc.items) {
          if (!this.selection.has(it.id)) continue;
          if (it.kind === "node") orig.set(it.id, { x: it.x, y: it.y });
          else origLinks.set(it.id, structuredClone(it));
        }
        this.drag = { kind: "move", startW: d.startW, orig, origLinks, moved: false };
        this.pointerMove(e);
        return;
      }
      case "move": {
        const dx = w.x - d.startW.x, dy = w.y - d.startW.y;
        // restore originals then translate — keeps the translation exact
        for (const it of this.doc.items) {
          if (it.kind === "node") {
            const o = d.orig.get(it.id);
            if (o) { it.x = o.x; it.y = o.y; }
          } else {
            const o = d.origLinks.get(it.id);
            if (o) { it.head = structuredClone(o.head); it.tail = structuredClone(o.tail); it.ctrl0 = structuredClone(o.ctrl0); it.ctrl1 = structuredClone(o.ctrl1); }
          }
        }
        this.translateItems(this.selection, dx, dy);
        d.moved = true;
        this.dirty = true;
        this.render();
        return;
      }
      case "marquee": {
        d.curW = w;
        this.render();
        return;
      }
      case "nodeRect": {
        d.curW = w;
        const dxs = Math.abs(w.x - d.startW.x) * this.zoom;
        const dys = Math.abs(w.y - d.startW.y) * this.zoom;
        if (dxs > CREATE_MIN_PX || dys > CREATE_MIN_PX) d.started = true;
        this.render();
        return;
      }
      case "linkDraw": {
        d.curW = w;
        const over = this.hitNode(w);
        d.targetId = over && over.id !== d.sourceId ? over.id : null;
        this.render();
        return;
      }
      case "resize": {
        const n = getNode(this.doc, d.nodeId);
        if (!n) return;
        if (!d.moved) {
          this.history.checkpoint(this.doc);
          d.moved = true;
        }
        this.applyResize(n, d.handle, d.orig, w);
        this.dirty = true;
        this.render();
        return;
      }
      case "endpoint": {
        const l = this.doc.items.find((i) => i.id === d.linkId) as GLink | undefined;
        if (!l) return;
        if (!d.moved) {
          this.history.checkpoint(this.doc);
          d.moved = true;
        }
        d.curW = w;
        const over = this.hitNode(w);
        const otherEnd = d.end === "head" ? l.tail : l.head;
        d.targetId = over && over.id !== otherEnd.node ? over.id : null;
        const end: LinkEnd = { node: null, x: w.x, y: w.y };
        if (d.end === "head") l.head = end;
        else l.tail = end;
        this.dirty = true;
        this.render();
        return;
      }
      case "ctrl": {
        const l = this.doc.items.find((i) => i.id === d.linkId) as GLink | undefined;
        if (!l) return;
        if (!d.moved) {
          this.history.checkpoint(this.doc);
          d.moved = true;
        }
        if (d.which === 0) l.ctrl0 = { x: w.x, y: w.y };
        else l.ctrl1 = { x: w.x, y: w.y };
        this.dirty = true;
        this.render();
        return;
      }
    }
  }

  private pointerUp(e: PointerEvent): void {
    const w = this.screenToWorld(e.clientX, e.clientY);
    const d = this.drag;
    this.drag = { kind: "none" };
    this.updateCursor();

    switch (d.kind) {
      case "maybeMove": {
        // plain click on an already-selected item: re-select just it
        this.selection = new Set([d.hitId]);
        this.render();
        return;
      }
      case "move": {
        if (d.moved) this.onChange();
        return;
      }
      case "marquee": {
        const rect = normRect(d.startW, d.curW);
        const picked = this.itemsInRect(rect);
        if (d.toggle) {
          for (const id of picked) {
            if (this.selection.has(id)) this.selection.delete(id);
            else this.selection.add(id);
          }
        } else {
          this.selection = new Set(picked);
        }
        this.render();
        return;
      }
      case "nodeRect": {
        if (d.started) {
          const r = normRect(d.startW, d.curW);
          this.mutate(() => {
            const n = makeNode(this.doc, r.x, r.y, Math.max(10, r.w), Math.max(10, r.h), this.defaultShape);
            n.autoSized = false;
            this.doc.items.push(n);
            this.selection = new Set([n.id]);
          });
          const id = [...this.selection][0];
          this.startLabelEdit(id, true);
        } else {
          // click: create a default auto-sized node at the click point
          this.createNodeAt(d.startW.x, d.startW.y);
        }
        return;
      }
      case "linkDraw": {
        const dist = Math.max(Math.abs(e.clientX - d.startS.x), Math.abs(e.clientY - d.startS.y));
        if (dist <= CREATE_MIN_PX) {
          this.render();
          return;
        }
        const srcNode = getNode(this.doc, d.sourceId);
        if (!srcNode) return;
        this.mutate(() => {
          let link: GLink;
          if (d.targetId && !e.shiftKey) {
            link = makeLink(
              this.doc,
              { node: d.sourceId, x: 0, y: 0 },
              { node: d.targetId, x: 0, y: 0 },
            );
            // parallel straight links auto-curve, like legacy VUE
            if (hasStraightLinkBetween(this.doc, d.sourceId, d.targetId)) this.setLinkCurve(link, 1);
          } else {
            link = makeLink(
              this.doc,
              { node: d.sourceId, x: 0, y: 0 },
              { node: null, x: w.x, y: w.y },
            );
          }
          this.doc.items.push(link);
          this.selection = new Set([link.id]);
        });
        const id = [...this.selection][0];
        this.startLabelEdit(id, true);
        return;
      }
      case "resize": {
        if (d.moved) this.onChange();
        return;
      }
      case "endpoint": {
        const l = this.doc.items.find((i) => i.id === d.linkId) as GLink | undefined;
        if (!l) return;
        if (d.targetId && !e.shiftKey) {
          const end: LinkEnd = { node: d.targetId, x: w.x, y: w.y };
          if (d.end === "head") l.head = end;
          else l.tail = end;
        }
        this.dirty = true;
        this.render();
        this.onChange();
        return;
      }
      case "ctrl": {
        if (d.moved) this.onChange();
        return;
      }
    }
  }

  private doubleClick(e: MouseEvent): void {
    if (this.effectiveTool() !== "select") return;
    const w = this.screenToWorld(e.clientX, e.clientY);
    const hit = this.hitTest(w);
    if (hit) {
      this.selection = new Set([hit.id]);
      this.startLabelEdit(hit.id);
    }
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const notches = e.deltaY / 100;
    if (e.ctrlKey || e.altKey || e.metaKey) {
      const factor = Math.pow(1.15, -notches);
      this.setZoom(this.zoom * factor, { x: e.clientX, y: e.clientY });
      return;
    }
    const step = 24 * notches;
    if (e.shiftKey) this.panX -= step;
    else if (e.deltaX) {
      this.panX -= e.deltaX;
      this.panY -= e.deltaY;
    } else this.panY -= step;
    this.render();
    this.onViewChange();
  }

  // ---------- keyboard ----------

  private keyDown(e: KeyboardEvent): void {
    if (this.labelBox) return; // label editor handles its own keys
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
    const cmd = e.ctrlKey || e.metaKey;

    if (cmd) {
      switch (e.key.toLowerCase()) {
        case "z":
          e.preventDefault();
          if (e.shiftKey) this.redo();
          else this.undo();
          return;
        case "y":
          e.preventDefault();
          this.redo();
          return;
        case "a":
          e.preventDefault();
          if (e.shiftKey) this.deselectAll();
          else this.selectAll();
          return;
        case "d":
          e.preventDefault();
          this.duplicateSelection();
          return;
        case "=":
        case "+":
          e.preventDefault();
          this.zoomStep(1);
          return;
        case "-":
          e.preventDefault();
          this.zoomStep(-1);
          return;
        case "]":
          e.preventDefault();
          this.zoomFit();
          return;
        case "'":
          e.preventDefault();
          this.zoomActual();
          return;
      }
      return; // other cmd-chords (O/S/N) are handled by main.ts
    }

    switch (e.key) {
      case " ":
        if (!this.spaceDown) {
          this.spaceDown = true;
          this.updateCursor();
        }
        e.preventDefault();
        return;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        this.deleteSelection();
        return;
      case "Escape":
        this.cancelDrag();
        this.deselectAll();
        return;
      case "F2":
      case "Enter": {
        const sel = [...this.selection];
        if (sel.length === 1) {
          e.preventDefault();
          this.startLabelEdit(sel[0]);
        }
        return;
      }
      case "ArrowUp":
        e.preventDefault();
        this.nudgeSelection(0, (e.shiftKey ? -10 : -1) / this.zoom);
        return;
      case "ArrowDown":
        e.preventDefault();
        this.nudgeSelection(0, (e.shiftKey ? 10 : 1) / this.zoom);
        return;
      case "ArrowLeft":
        e.preventDefault();
        this.nudgeSelection((e.shiftKey ? -10 : -1) / this.zoom, 0);
        return;
      case "ArrowRight":
        e.preventDefault();
        this.nudgeSelection((e.shiftKey ? 10 : 1) / this.zoom, 0);
        return;
      case "s":
        this.setTool("select");
        return;
      case "n":
        this.setTool("node");
        return;
      case "l":
        this.setTool("link");
        return;
      case "m":
        this.setTool("hand");
        return;
    }
  }

  private keyUp(e: KeyboardEvent): void {
    if (e.key === " ") {
      this.spaceDown = false;
      this.updateCursor();
    }
  }

  private cancelDrag(): void {
    const d = this.drag;
    if (d.kind === "move" && d.moved) this.undo();
    else if ((d.kind === "resize" || d.kind === "endpoint" || d.kind === "ctrl") && d.moved) this.undo();
    this.drag = { kind: "none" };
    this.render();
  }

  // ---------- label editing ----------

  startLabelEdit(id: string, isNew = false): void {
    this.commitLabelEdit();
    const it = this.doc.items.find((i) => i.id === id);
    if (!it) return;
    this.editingId = id;

    const box = document.createElement("textarea");
    box.className = "label-edit";
    box.value = it.label;
    box.placeholder = "label";
    box.spellcheck = false;

    const font = it.kind === "node" ? it.font : it.font;
    box.style.font = fontToCss({ ...font, size: font.size * this.zoom });

    this.positionLabelBox(box, it);
    document.body.appendChild(box);
    box.focus();
    if (isNew) box.select();
    this.labelBox = box;

    const commit = () => this.commitLabelEdit();
    box.addEventListener("blur", commit);
    box.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.abortLabelEdit();
      }
    });
    this.render();
  }

  private positionLabelBox(box: HTMLTextAreaElement, it: GItem): void {
    let sx: number, sy: number, minW: number;
    if (it.kind === "node") {
      const p1 = this.worldToScreen(it.x, it.y);
      sx = p1.x;
      sy = p1.y;
      minW = Math.max(80, it.w * this.zoom);
    } else {
      const g = this.linkGeometry(it);
      const p1 = this.worldToScreen(g.mid.x - 60, g.mid.y - 12);
      sx = p1.x;
      sy = p1.y;
      minW = 120;
    }
    box.style.left = `${sx}px`;
    box.style.top = `${sy}px`;
    box.style.width = `${minW}px`;
    box.style.height = `${Math.max(26, 26 * this.zoom)}px`;
  }

  commitLabelEdit(): void {
    if (!this.labelBox || this.editingId == null) return;
    const box = this.labelBox;
    const id = this.editingId;
    this.labelBox = null;
    this.editingId = null;
    const value = box.value;
    box.remove();
    const it = this.doc.items.find((i) => i.id === id);
    if (!it) return;
    if (it.label === value) {
      this.render();
      return;
    }
    this.mutate(() => {
      it.label = value;
      if (it.kind === "node" && it.autoSized) {
        const size = autoSizeFor(value, it.font);
        const cx = it.x + it.w / 2;
        it.w = size.w;
        it.h = size.h;
        it.x = cx - size.w / 2;
      }
    });
  }

  private abortLabelEdit(): void {
    if (!this.labelBox) return;
    this.labelBox.remove();
    this.labelBox = null;
    this.editingId = null;
    this.render();
  }

  // ---------- selection helpers ----------

  private itemsInRect(r: { x: number; y: number; w: number; h: number }): string[] {
    const out: string[] = [];
    for (const it of this.doc.items) {
      if (it.kind === "node") {
        if (it.x < r.x + r.w && it.x + it.w > r.x && it.y < r.y + r.h && it.y + it.h > r.y) out.push(it.id);
      } else {
        const g = this.linkGeometry(it);
        let hit = false;
        for (let j = 0; j < g.flat.length - 1 && !hit; j++) {
          hit = segmentIntersectsRect(g.flat[j], g.flat[j + 1], r);
        }
        if (hit) out.push(it.id);
      }
    }
    return out;
  }

  /** Resize handles (single selected node) and link endpoint/control handles (single selected link). */
  private hitHandle(w: Pt): Drag | null {
    if (this.selection.size !== 1) return null;
    const id = [...this.selection][0];
    const it = this.doc.items.find((i) => i.id === id);
    if (!it) return null;
    const hs = 6 / this.zoom; // half-size hit slop

    if (it.kind === "node") {
      const pts = handlePoints(it);
      for (let i = 0; i < pts.length; i++) {
        if (Math.abs(w.x - pts[i].x) <= hs && Math.abs(w.y - pts[i].y) <= hs) {
          return { kind: "resize", nodeId: it.id, handle: i, orig: { x: it.x, y: it.y, w: it.w, h: it.h }, moved: false };
        }
      }
      return null;
    }

    const g = this.linkGeometry(it);
    if (Math.abs(w.x - g.headPt.x) <= hs && Math.abs(w.y - g.headPt.y) <= hs)
      return { kind: "endpoint", linkId: it.id, end: "head", curW: w, targetId: null, moved: false };
    if (Math.abs(w.x - g.tailPt.x) <= hs && Math.abs(w.y - g.tailPt.y) <= hs)
      return { kind: "endpoint", linkId: it.id, end: "tail", curW: w, targetId: null, moved: false };
    if (g.ctrl0 && Math.abs(w.x - g.ctrl0.x) <= hs && Math.abs(w.y - g.ctrl0.y) <= hs)
      return { kind: "ctrl", linkId: it.id, which: 0, moved: false };
    if (g.ctrl1 && Math.abs(w.x - g.ctrl1.x) <= hs && Math.abs(w.y - g.ctrl1.y) <= hs)
      return { kind: "ctrl", linkId: it.id, which: 1, moved: false };
    return null;
  }

  private applyResize(n: GNode, handle: number, orig: { x: number; y: number; w: number; h: number }, w: Pt): void {
    // handles: 0 NW, 1 N, 2 NE, 3 E, 4 SE, 5 S, 6 SW, 7 W
    let { x, y } = orig;
    let right = orig.x + orig.w;
    let bottom = orig.y + orig.h;
    if (handle === 0 || handle === 6 || handle === 7) x = Math.min(w.x, right - 10);
    if (handle === 0 || handle === 1 || handle === 2) y = Math.min(w.y, bottom - 10);
    if (handle === 2 || handle === 3 || handle === 4) right = Math.max(w.x, x + 10);
    if (handle === 4 || handle === 5 || handle === 6) bottom = Math.max(w.y, y + 10);
    n.x = x;
    n.y = y;
    n.w = right - x;
    n.h = bottom - y;
    n.autoSized = false;
  }

  // ---------- rendering ----------

  render(): void {
    this.svg.style.background = this.doc.background;
    this.world.setAttribute("transform", `translate(${this.panX},${this.panY}) scale(${this.zoom})`);
    this.itemsG.replaceChildren();
    this.overlayG.replaceChildren();

    for (const it of this.doc.items) {
      if (it.kind === "node") this.renderNode(it);
      else this.renderLink(it);
    }
    this.renderOverlay();
  }

  private renderNode(n: GNode): void {
    const g = el("g");
    const path = el("path");
    path.setAttribute("d", shapePathData(n.shape, n.x, n.y, n.w, n.h));
    path.setAttribute("fill", n.fill ?? "none");
    if (n.strokeWidth > 0) {
      path.setAttribute("stroke", n.stroke);
      path.setAttribute("stroke-width", String(n.strokeWidth));
      const dash = STROKE_DASHES[n.strokeStyle];
      if (dash) path.setAttribute("stroke-dasharray", dash.map((d) => d * Math.max(1, n.strokeWidth)).join(" "));
    }
    g.appendChild(path);

    if (n.label && this.editingId !== n.id) {
      g.appendChild(this.renderText(n.label, n.x + n.w / 2, n.y + n.h / 2, n.font, n.textColor, "middle"));
    }
    this.itemsG.appendChild(g);
  }

  private renderLink(l: GLink): void {
    const geo = this.linkGeometry(l);
    const g = el("g");
    const path = el("path");
    let dPath: string;
    if (geo.ctrl0 && geo.ctrl1)
      dPath = `M${geo.headPt.x},${geo.headPt.y} C${geo.ctrl0.x},${geo.ctrl0.y} ${geo.ctrl1.x},${geo.ctrl1.y} ${geo.tailPt.x},${geo.tailPt.y}`;
    else if (geo.ctrl0)
      dPath = `M${geo.headPt.x},${geo.headPt.y} Q${geo.ctrl0.x},${geo.ctrl0.y} ${geo.tailPt.x},${geo.tailPt.y}`;
    else dPath = `M${geo.headPt.x},${geo.headPt.y} L${geo.tailPt.x},${geo.tailPt.y}`;
    path.setAttribute("d", dPath);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", l.stroke);
    path.setAttribute("stroke-width", String(Math.max(l.strokeWidth, 0.5)));
    const dash = STROKE_DASHES[l.strokeStyle];
    if (dash) path.setAttribute("stroke-dasharray", dash.map((x) => x * Math.max(1, l.strokeWidth)).join(" "));
    g.appendChild(path);

    // arrowheads: filled triangles pointing at the endpoint, oriented along the path
    if (l.arrowState & 1) g.appendChild(this.arrowHead(geo.headPt, geo.ctrl0 ?? geo.tailPt, l));
    if (l.arrowState & 2) g.appendChild(this.arrowHead(geo.tailPt, geo.ctrl1 ?? geo.ctrl0 ?? geo.headPt, l));

    if (l.label && this.editingId !== l.id) {
      const m = measureLabel(l.label, l.font);
      const bg = el("rect");
      bg.setAttribute("x", String(geo.mid.x - m.w / 2 - 2));
      bg.setAttribute("y", String(geo.mid.y - m.h / 2 - 1));
      bg.setAttribute("width", String(m.w + 4));
      bg.setAttribute("height", String(m.h + 2));
      bg.setAttribute("fill", this.doc.background);
      g.appendChild(bg);
      g.appendChild(this.renderText(l.label, geo.mid.x, geo.mid.y, l.font, l.textColor, "middle"));
    }
    this.itemsG.appendChild(g);
  }

  private arrowHead(tip: Pt, from: Pt, l: GLink): SVGElement {
    const size = 5 + Math.max(0, l.strokeWidth - 1) * 2;
    const len = size * 1.3;
    const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
    const bx = tip.x - len * Math.cos(ang);
    const by = tip.y - len * Math.sin(ang);
    const px = -Math.sin(ang) * (size / 2);
    const py = Math.cos(ang) * (size / 2);
    const path = el("path");
    path.setAttribute("d", `M${tip.x},${tip.y} L${bx + px},${by + py} L${bx - px},${by - py} Z`);
    path.setAttribute("fill", l.stroke);
    return path;
  }

  private renderText(label: string, cx: number, cy: number, font: GNode["font"], color: string, anchor: string): SVGElement {
    const text = el("text");
    text.setAttribute("x", String(cx));
    text.setAttribute("text-anchor", anchor);
    text.setAttribute("fill", color);
    text.style.font = fontToCss(font);
    if (font.underline) text.setAttribute("text-decoration", "underline");
    text.style.userSelect = "none";
    const lines = label.split("\n");
    const lineHeight = font.size * 1.25;
    const firstY = cy - ((lines.length - 1) * lineHeight) / 2 + font.size * 0.35;
    lines.forEach((line, i) => {
      const tspan = el("tspan");
      tspan.setAttribute("x", String(cx));
      tspan.setAttribute("y", String(firstY + i * lineHeight));
      tspan.textContent = line || " ";
      text.appendChild(tspan);
    });
    return text;
  }

  private renderOverlay(): void {
    const sw = 1.5 / this.zoom;

    // link-draw preview + target highlight
    if (this.drag.kind === "linkDraw") {
      const src = getNode(this.doc, this.drag.sourceId);
      if (src) {
        const c = nodeCenter(src);
        const start = rayOutlineIntersection(c, this.drag.curW, nodeOutline(src)) ?? c;
        const line = el("line");
        line.setAttribute("x1", String(start.x));
        line.setAttribute("y1", String(start.y));
        line.setAttribute("x2", String(this.drag.curW.x));
        line.setAttribute("y2", String(this.drag.curW.y));
        line.setAttribute("stroke", "#404040");
        line.setAttribute("stroke-width", String(Math.max(1 / this.zoom, 1)));
        this.overlayG.appendChild(line);
      }
      if (this.drag.targetId) this.highlightNode(this.drag.targetId);
    }
    if (this.drag.kind === "endpoint" && this.drag.targetId) this.highlightNode(this.drag.targetId);

    // selection chrome
    for (const id of this.selection) {
      const it = this.doc.items.find((i) => i.id === id);
      if (!it) continue;
      if (it.kind === "node") {
        const outline = el("path");
        outline.setAttribute("d", shapePathData(it.shape, it.x, it.y, it.w, it.h));
        outline.setAttribute("fill", "none");
        outline.setAttribute("stroke", SELECTION_COLOR);
        outline.setAttribute("stroke-width", String(sw * 2));
        this.overlayG.appendChild(outline);
        if (this.selection.size === 1) {
          for (const p of handlePoints(it)) this.overlayG.appendChild(this.handleRect(p));
        }
      } else {
        const geo = this.linkGeometry(it);
        const halo = el("path");
        let dPath: string;
        if (geo.ctrl0 && geo.ctrl1)
          dPath = `M${geo.headPt.x},${geo.headPt.y} C${geo.ctrl0.x},${geo.ctrl0.y} ${geo.ctrl1.x},${geo.ctrl1.y} ${geo.tailPt.x},${geo.tailPt.y}`;
        else if (geo.ctrl0)
          dPath = `M${geo.headPt.x},${geo.headPt.y} Q${geo.ctrl0.x},${geo.ctrl0.y} ${geo.tailPt.x},${geo.tailPt.y}`;
        else dPath = `M${geo.headPt.x},${geo.headPt.y} L${geo.tailPt.x},${geo.tailPt.y}`;
        halo.setAttribute("d", dPath);
        halo.setAttribute("fill", "none");
        halo.setAttribute("stroke", "rgba(74,149,255,0.5)");
        halo.setAttribute("stroke-width", String((it.strokeWidth + 5) / this.zoom > it.strokeWidth + 5 ? (it.strokeWidth + 5) / this.zoom : it.strokeWidth + 5));
        halo.setAttribute("stroke-linecap", "round");
        this.overlayG.appendChild(halo);
        if (this.selection.size === 1) {
          this.overlayG.appendChild(this.handleCircle(geo.headPt, it.head.node != null));
          this.overlayG.appendChild(this.handleCircle(geo.tailPt, it.tail.node != null));
          if (geo.ctrl0) {
            this.overlayG.appendChild(this.guideLine(geo.headPt, geo.ctrl0));
            this.overlayG.appendChild(this.handleCircle(geo.ctrl0, false, true));
          }
          if (geo.ctrl1) {
            this.overlayG.appendChild(this.guideLine(geo.tailPt, geo.ctrl1));
            this.overlayG.appendChild(this.handleCircle(geo.ctrl1, false, true));
          }
        }
      }
    }

    // marquee
    if (this.drag.kind === "marquee") {
      const r = normRect(this.drag.startW, this.drag.curW);
      const rect = el("rect");
      rect.setAttribute("x", String(r.x));
      rect.setAttribute("y", String(r.y));
      rect.setAttribute("width", String(r.w));
      rect.setAttribute("height", String(r.h));
      rect.setAttribute("fill", "rgba(74,149,255,0.08)");
      rect.setAttribute("stroke", "#808080");
      rect.setAttribute("stroke-width", String(sw));
      rect.setAttribute("stroke-dasharray", `${4 / this.zoom} ${3 / this.zoom}`);
      this.overlayG.appendChild(rect);
    }

    // node-tool drag preview
    if (this.drag.kind === "nodeRect" && this.drag.started) {
      const r = normRect(this.drag.startW, this.drag.curW);
      const path = el("path");
      path.setAttribute("d", shapePathData(this.defaultShape, r.x, r.y, Math.max(r.w, 1), Math.max(r.h, 1)));
      path.setAttribute("fill", "rgba(242,174,69,0.45)");
      path.setAttribute("stroke", SELECTION_COLOR);
      path.setAttribute("stroke-width", String(sw));
      this.overlayG.appendChild(path);
    }
  }

  private highlightNode(id: string): void {
    const n = getNode(this.doc, id);
    if (!n) return;
    const glow = el("path");
    glow.setAttribute("d", shapePathData(n.shape, n.x, n.y, n.w, n.h));
    glow.setAttribute("fill", "none");
    glow.setAttribute("stroke", "rgba(74,149,255,0.5)");
    glow.setAttribute("stroke-width", String(5 / this.zoom));
    this.overlayG.appendChild(glow);
  }

  private handleRect(p: Pt): SVGElement {
    const s = 8 / this.zoom;
    const r = el("rect");
    r.setAttribute("x", String(p.x - s / 2));
    r.setAttribute("y", String(p.y - s / 2));
    r.setAttribute("width", String(s));
    r.setAttribute("height", String(s));
    r.setAttribute("fill", "#ffffff");
    r.setAttribute("stroke", SELECTION_COLOR);
    r.setAttribute("stroke-width", String(1 / this.zoom));
    return r;
  }

  private handleCircle(p: Pt, attached: boolean, isCtrl = false): SVGElement {
    const c = el("circle");
    c.setAttribute("cx", String(p.x));
    c.setAttribute("cy", String(p.y));
    c.setAttribute("r", String((isCtrl ? 4 : 4.5) / this.zoom));
    c.setAttribute("fill", attached ? SELECTION_COLOR : "#ffffff");
    c.setAttribute("stroke", isCtrl ? "#7fb5ff" : SELECTION_COLOR);
    c.setAttribute("stroke-width", String(1 / this.zoom));
    return c;
  }

  private guideLine(a: Pt, b: Pt): SVGElement {
    const line = el("line");
    line.setAttribute("x1", String(a.x));
    line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x));
    line.setAttribute("y2", String(b.y));
    line.setAttribute("stroke", "rgba(74,149,255,0.6)");
    line.setAttribute("stroke-width", String(0.75 / this.zoom));
    return line;
  }
}

// ---------- helpers ----------

function el(name: string): SVGElement {
  return document.createElementNS("http://www.w3.org/2000/svg", name);
}

function normRect(a: Pt, b: Pt): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

function handlePoints(n: GNode): Pt[] {
  const { x, y, w, h } = n;
  return [
    { x, y }, { x: x + w / 2, y }, { x: x + w, y }, { x: x + w, y: y + h / 2 },
    { x: x + w, y: y + h }, { x: x + w / 2, y: y + h }, { x, y: y + h }, { x, y: y + h / 2 },
  ];
}

function segmentIntersectsRect(a: Pt, b: Pt, r: { x: number; y: number; w: number; h: number }): boolean {
  const inside = (p: Pt) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  if (inside(a) || inside(b)) return true;
  const corners = [
    { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h },
  ];
  for (let i = 0; i < 4; i++) {
    const c1 = corners[i], c2 = corners[(i + 1) % 4];
    const d1x = b.x - a.x, d1y = b.y - a.y;
    const d2x = c2.x - c1.x, d2y = c2.y - c1.y;
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < 1e-12) continue;
    const t = ((c1.x - a.x) * d2y - (c1.y - a.y) * d2x) / denom;
    const u = ((c1.x - a.x) * d1y - (c1.y - a.y) * d1x) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
  }
  return false;
}
