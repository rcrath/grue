// Wave-3 floating panels: Layers, Map Info, Info (selection), Outline, Panner,
// and Search. All extend FloatingPanel (open/closed + position remembered in
// localStorage, never in the doc). Every doc mutation goes through
// editor.mutate() for undo coverage; panel state itself is not undoable.

import {
  GItem, GLink, createLayer, deleteLayer, duplicateLayer, getLayer,
  getNode, layerItems, renameLayer, reorderLayer,
} from "../core/model";
import { Editor } from "./editor";
import { FloatingPanel } from "./panel";
import { FormatPalette, openSwatchPopup } from "./palette";
import { openNotesEditor } from "./dialogs";

export interface FileInfo {
  getPath(): string | null;
  getName(): string;
}

/** Truncate a label for list/menu display. */
function short(text: string, max = 28): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

function endName(editor: Editor, end: { node: string | null }): string {
  const n = getNode(editor.doc, end.node);
  if (!n) return "(free)";
  return n.label.trim() ? short(n.label, 18) : "(unlabeled)";
}

function div(cls: string, text?: string): HTMLElement {
  const d = document.createElement("div");
  d.className = cls;
  if (text != null) d.textContent = text;
  return d;
}

function btn(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "panel-btn";
  b.textContent = label;
  b.title = title;
  b.addEventListener("click", onClick);
  return b;
}

// ---------------------------------------------------------------- Layers

export class LayersPanel extends FloatingPanel {
  private list: HTMLElement;
  private buttons: { dup: HTMLButtonElement; del: HTMLButtonElement; up: HTMLButtonElement; down: HTMLButtonElement };
  private sig = "";
  private renamingId: string | null = null;

  constructor(private editor: Editor) {
    super({ key: "layers", title: "Layers", className: "panel-md", closeHint: "Close (Ctrl+5)", defaultPos: { top: 96, left: 14 } });
    const body = div("panel-body");
    this.list = div("layer-list");
    body.appendChild(this.list);

    const row = div("panel-btn-row");
    row.appendChild(btn("new", "New layer (becomes active, on top)", () => {
      this.editor.mutate(() => createLayer(this.editor.doc));
    }));
    const dup = btn("dup", "Duplicate the active layer and its contents", () => {
      this.editor.mutate(() => duplicateLayer(this.editor.doc, this.editor.doc.activeLayer));
    });
    const del = btn("del", "Delete the active layer AND everything on it", () => this.deleteActive());
    const up = btn("▲", "Move the active layer up (toward the top of the paint order)", () => this.moveActive(1));
    const down = btn("▼", "Move the active layer down", () => this.moveActive(-1));
    row.append(dup, del, up, down);
    body.appendChild(row);
    this.root.appendChild(body);
    this.buttons = { dup, del, up, down };
  }

  private deleteActive(): void {
    const doc = this.editor.doc;
    const layer = getLayer(doc, doc.activeLayer);
    if (!layer || doc.layers.length <= 1) return;
    const n = layerItems(doc, layer.id).length;
    const what = n === 0 ? "It is empty." : `Its ${n} item${n === 1 ? "" : "s"} will be deleted too.`;
    if (!window.confirm(`Delete layer "${layer.name}"? ${what}`)) return;
    this.editor.mutate(() => deleteLayer(doc, layer.id));
  }

  private moveActive(dir: 1 | -1): void {
    const doc = this.editor.doc;
    const idx = doc.layers.findIndex((l) => l.id === doc.activeLayer);
    if (idx < 0) return;
    const to = idx + dir;
    if (to < 0 || to >= doc.layers.length) return;
    this.editor.mutate(() => reorderLayer(doc, doc.activeLayer, to));
  }

  refresh(): void {
    if (!this.isOpen() || this.renamingId != null) return;
    const doc = this.editor.doc;
    const sig = JSON.stringify([doc.layers, doc.activeLayer]);
    if (sig === this.sig) return;
    this.sig = sig;

    this.list.replaceChildren();
    // top of the list = top of the paint order = last element of doc.layers
    for (const layer of [...doc.layers].reverse()) {
      const row = div("layer-row" + (layer.id === doc.activeLayer ? " active" : ""));

      // look the layer up by id at click time — undo/redo replaces the doc,
      // so objects captured at build time can go stale
      const eye = btn("👁", layer.hidden ? "Show layer" : "Hide layer", () => {
        const l = getLayer(this.editor.doc, layer.id);
        if (l) this.editor.mutate(() => (l.hidden = !l.hidden));
      });
      eye.classList.toggle("off", layer.hidden);

      const lock = btn("🔒", layer.locked ? "Unlock layer" : "Lock layer (contents not selectable)", () => {
        const l = getLayer(this.editor.doc, layer.id);
        if (l) this.editor.mutate(() => (l.locked = !l.locked));
      });
      lock.classList.toggle("off", !layer.locked);

      const name = div("layer-name", layer.name);
      name.title = `${layerItems(doc, layer.id).length} item(s) — double-click to rename`;
      name.addEventListener("dblclick", () => this.startRename(layer.id, name));

      row.append(eye, lock, name);
      row.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).tagName === "BUTTON" || (e.target as HTMLElement).tagName === "INPUT") return;
        this.editor.activateLayer(layer.id);
      });
      this.list.appendChild(row);
    }

    const idx = doc.layers.findIndex((l) => l.id === doc.activeLayer);
    this.buttons.del.disabled = doc.layers.length <= 1;
    this.buttons.up.disabled = idx >= doc.layers.length - 1;
    this.buttons.down.disabled = idx <= 0;
  }

  private startRename(layerId: string, nameEl: HTMLElement): void {
    this.renamingId = layerId;
    const layer = getLayer(this.editor.doc, layerId);
    const input = document.createElement("input");
    input.type = "text";
    input.className = "layer-rename";
    input.value = layer?.name ?? "";
    input.spellcheck = false;
    nameEl.replaceChildren(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      this.renamingId = null;
      const value = input.value.trim();
      this.sig = ""; // force rebuild
      if (commit && value && layer && value !== layer.name) {
        this.editor.mutate(() => renameLayer(this.editor.doc, layerId, value));
      } else {
        this.refresh();
      }
    };
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
    });
  }
}

// ---------------------------------------------------------------- Map Info

export class MapInfoPanel extends FloatingPanel {
  private pathEl: HTMLElement;
  private countsEl: HTMLElement;
  private bgBtn: HTMLButtonElement;
  private sig = "";

  constructor(private editor: Editor, private file: FileInfo) {
    super({ key: "mapinfo", title: "Map Info", className: "panel-md", closeHint: "Close (Ctrl+6)", defaultPos: { top: 300, left: 14 } });
    const body = div("panel-body");

    this.pathEl = div("panel-value");
    body.append(div("panel-label", "File"), this.pathEl);

    this.countsEl = div("panel-value");
    body.append(div("panel-label", "Contents"), this.countsEl);

    const bgRow = div("panel-row");
    bgRow.appendChild(div("panel-label", "Background"));
    this.bgBtn = document.createElement("button");
    this.bgBtn.className = "swatch-btn";
    this.bgBtn.title = "Canvas background color";
    this.bgBtn.addEventListener("click", () =>
      openSwatchPopup(this.bgBtn, (c) => this.editor.setBackground(c ?? "#ffffff")),
    );
    bgRow.appendChild(this.bgBtn);
    body.appendChild(bgRow);
    this.root.appendChild(body);
  }

  refresh(): void {
    if (!this.isOpen()) return;
    const doc = this.editor.doc;
    const nodeCount = doc.items.filter((i) => i.kind === "node").length;
    const linkCount = doc.items.length - nodeCount;
    const path = this.file.getPath();
    const sig = JSON.stringify([path, this.file.getName(), nodeCount, linkCount, doc.layers.length, doc.background]);
    if (sig === this.sig) return;
    this.sig = sig;
    this.pathEl.textContent = path ?? `${this.file.getName()} (not saved to a file yet)`;
    this.pathEl.title = path ?? "";
    this.countsEl.textContent = `${nodeCount} node${nodeCount === 1 ? "" : "s"}, ${linkCount} link${linkCount === 1 ? "" : "s"}, ${doc.layers.length} layer${doc.layers.length === 1 ? "" : "s"}`;
    this.bgBtn.style.background = doc.background;
  }
}

// ---------------------------------------------------------------- Info (selection)

export class InfoPanel extends FloatingPanel {
  private kindEl: HTMLElement;
  private labelInput: HTMLInputElement;
  private geomEl: HTMLElement;
  private resEl: HTMLElement;
  private resRemove: HTMLButtonElement;
  private notesEl: HTMLElement;
  private notesBtn: HTMLButtonElement;
  private detail: HTMLElement;
  private sig = "";

  constructor(private editor: Editor) {
    super({ key: "info", title: "Info", className: "panel-md", closeHint: "Close (Ctrl+2)", defaultPos: { top: 96, right: 260 } });
    const body = div("panel-body");
    this.kindEl = div("panel-value");
    body.appendChild(this.kindEl);

    this.detail = div("panel-detail");

    this.labelInput = document.createElement("input");
    this.labelInput.type = "text";
    this.labelInput.className = "panel-input";
    this.labelInput.spellcheck = false;
    this.labelInput.addEventListener("change", () => {
      const it = this.single();
      if (it) this.editor.setLabel(it.id, this.labelInput.value);
    });
    this.labelInput.addEventListener("keydown", (e) => e.stopPropagation());
    this.detail.append(div("panel-label", "Label"), this.labelInput);

    this.geomEl = div("panel-value");
    this.detail.append(div("panel-label", "Position / size"), this.geomEl);

    const resHead = div("panel-row");
    resHead.appendChild(div("panel-label", "Attachment"));
    this.resRemove = btn("remove", "Remove the attached file/URL", () => {
      if (this.single()?.resource) this.editor.setResourceOnSelection(null);
    });
    resHead.appendChild(this.resRemove);
    this.resEl = div("panel-value");
    this.detail.append(resHead, this.resEl);

    const notesHead = div("panel-row");
    notesHead.appendChild(div("panel-label", "Notes"));
    this.notesBtn = btn("edit…", "Edit notes", () => {
      const it = this.single();
      if (!it) return;
      const name = it.label.trim() || (it.kind === "node" ? "node" : "link");
      openNotesEditor({
        title: `Notes — ${short(name, 24)}`,
        initial: it.notes,
        onSave: (text) => this.editor.setNotes(it.id, text),
      });
    });
    notesHead.appendChild(this.notesBtn);
    this.notesEl = div("panel-value panel-notes");
    this.detail.append(notesHead, this.notesEl);

    body.appendChild(this.detail);
    this.root.appendChild(body);
  }

  private single(): GItem | undefined {
    return this.editor.selection.size === 1 ? this.editor.selectedItems()[0] : undefined;
  }

  refresh(): void {
    if (!this.isOpen()) return;
    const sel = this.editor.selectedItems();
    const it = sel.length === 1 ? sel[0] : undefined;
    const sig = JSON.stringify([sel.map((i) => i.id), it]);
    if (sig === this.sig) return;
    this.sig = sig;

    if (!it) {
      const n = sel.filter((i) => i.kind === "node").length;
      this.kindEl.textContent =
        sel.length === 0 ? "Nothing selected." : `${sel.length} items selected (${n} node${n === 1 ? "" : "s"}, ${sel.length - n} link${sel.length - n === 1 ? "" : "s"}).`;
      this.detail.style.display = "none";
      return;
    }
    this.detail.style.display = "";
    this.kindEl.textContent = it.kind === "node" ? `Node (id ${it.id})` : `Link (id ${it.id})`;
    if (document.activeElement !== this.labelInput) this.labelInput.value = it.label;
    if (it.kind === "node") {
      this.geomEl.textContent = `x ${Math.round(it.x)}, y ${Math.round(it.y)} — ${Math.round(it.w)} × ${Math.round(it.h)}`;
    } else {
      const l = it as GLink;
      this.geomEl.textContent = `${endName(this.editor, l.head)} → ${endName(this.editor, l.tail)}`;
    }
    if (it.resource) {
      this.resEl.textContent = it.resource.title ? `${it.resource.title} — ${it.resource.spec}` : it.resource.spec;
      this.resEl.title = it.resource.spec;
      this.resRemove.style.display = "";
    } else {
      this.resEl.textContent = "none";
      this.resEl.title = "";
      this.resRemove.style.display = "none";
    }
    this.notesEl.textContent = it.notes ? short(it.notes, 220) : "none";
  }
}

// ---------------------------------------------------------------- Outline

export class OutlinePanel extends FloatingPanel {
  private list: HTMLElement;
  private sig = "";

  constructor(private editor: Editor) {
    super({ key: "outline", title: "Outline", className: "panel-md", closeHint: "Close (Ctrl+7)", defaultPos: { top: 96, left: 260 } });
    const body = div("panel-body panel-scroll");
    this.list = div("outline-list");
    body.appendChild(this.list);
    this.root.appendChild(body);
  }

  refresh(): void {
    if (!this.isOpen()) return;
    const doc = this.editor.doc;
    const sig = JSON.stringify([
      doc.layers.map((l) => [l.id, l.name, l.hidden]),
      doc.items.map((i) => [i.id, i.kind, i.label, i.layer, i.kind === "link" ? [i.head.node, i.tail.node] : null]),
      [...this.editor.selection],
    ]);
    if (sig === this.sig) return;
    this.sig = sig;

    this.list.replaceChildren();
    for (const layer of [...doc.layers].reverse()) {
      const head = div("outline-layer", layer.name + (layer.hidden ? " (hidden)" : ""));
      this.list.appendChild(head);
      const items = layerItems(doc, layer.id);
      for (const it of [...items].reverse()) {
        const text =
          it.kind === "node"
            ? it.label.trim()
              ? short(it.label)
              : "(unlabeled node)"
            : `${endName(this.editor, it.head)} → ${endName(this.editor, it.tail)}`;
        const row = div("outline-item" + (this.editor.selection.has(it.id) ? " sel" : ""), (it.kind === "node" ? "▢ " : "— ") + text);
        row.title = it.kind === "node" ? "Click to select, double-click to zoom" : `Link${it.label ? `: ${short(it.label)}` : ""}`;
        row.addEventListener("click", () => {
          this.editor.selection = new Set([it.id]);
          this.editor.revealItem(it.id);
          this.editor.render();
        });
        row.addEventListener("dblclick", () => this.editor.zoomToItem(it.id));
        this.list.appendChild(row);
      }
      if (items.length === 0) this.list.appendChild(div("outline-item empty", "(empty)"));
    }
  }
}

// ---------------------------------------------------------------- Panner

const PANNER_W = 208;
const PANNER_H = 140;

export class PannerPanel extends FloatingPanel {
  private canvas: HTMLCanvasElement;
  private view = { scale: 1, ox: 0, oy: 0 }; // world→canvas mapping of the last draw

  constructor(private editor: Editor) {
    super({ key: "panner", title: "Panner", closeHint: "Close (Ctrl+8)", defaultPos: { bottom: 40, right: 14 } });
    this.canvas = document.createElement("canvas");
    this.canvas.width = PANNER_W;
    this.canvas.height = PANNER_H;
    this.canvas.className = "panner-canvas";
    this.root.appendChild(this.canvas);

    let dragging = false;
    const jump = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      const wx = (e.clientX - r.left - this.view.ox) / this.view.scale;
      const wy = (e.clientY - r.top - this.view.oy) / this.view.scale;
      this.editor.centerWorld(wx, wy);
    };
    this.canvas.addEventListener("pointerdown", (e) => {
      dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      jump(e);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (dragging) jump(e);
    });
    this.canvas.addEventListener("pointerup", () => (dragging = false));
  }

  refresh(): void {
    if (!this.isOpen()) return;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const doc = this.editor.doc;
    const vp = this.editor.viewportWorld();

    // fit the union of item bounds and the viewport, padded
    let minX = vp.x, minY = vp.y, maxX = vp.x + vp.w, maxY = vp.y + vp.h;
    for (const it of doc.items) {
      if (!this.editor.itemVisible(it)) continue;
      if (it.kind === "node") {
        minX = Math.min(minX, it.x); minY = Math.min(minY, it.y);
        maxX = Math.max(maxX, it.x + it.w); maxY = Math.max(maxY, it.y + it.h);
      } else {
        minX = Math.min(minX, it.head.x, it.tail.x); minY = Math.min(minY, it.head.y, it.tail.y);
        maxX = Math.max(maxX, it.head.x, it.tail.x); maxY = Math.max(maxY, it.head.y, it.tail.y);
      }
    }
    const padX = (maxX - minX) * 0.05 + 10, padY = (maxY - minY) * 0.05 + 10;
    minX -= padX; minY -= padY; maxX += padX; maxY += padY;
    const scale = Math.min(PANNER_W / (maxX - minX), PANNER_H / (maxY - minY));
    const ox = (PANNER_W - (maxX - minX) * scale) / 2 - minX * scale;
    const oy = (PANNER_H - (maxY - minY) * scale) / 2 - minY * scale;
    this.view = { scale, ox, oy };

    ctx.clearRect(0, 0, PANNER_W, PANNER_H);
    ctx.fillStyle = doc.background;
    ctx.fillRect(0, 0, PANNER_W, PANNER_H);

    // simplified boxes only (cheap by design)
    for (const it of doc.items) {
      if (it.kind !== "node" || !this.editor.itemVisible(it)) continue;
      ctx.fillStyle = it.fill ?? "#c9c9c9";
      ctx.fillRect(
        it.x * scale + ox,
        it.y * scale + oy,
        Math.max(2, it.w * scale),
        Math.max(2, it.h * scale),
      );
    }

    // viewport rectangle
    ctx.strokeStyle = "#4A95FF";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vp.x * scale + ox, vp.y * scale + oy, vp.w * scale, vp.h * scale);
  }
}

// ---------------------------------------------------------------- Search

export class SearchPanel extends FloatingPanel {
  private input: HTMLInputElement;
  private results: HTMLElement;
  private lastQuery = "";

  constructor(private editor: Editor) {
    super({ key: "search", title: "Search", className: "panel-md", closeHint: "Close (Ctrl+9)", defaultPos: { top: 300, right: 14 } });
    const body = div("panel-body");
    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "panel-input";
    this.input.placeholder = "find in labels and notes";
    this.input.spellcheck = false;
    this.input.addEventListener("input", () => this.search());
    this.input.addEventListener("keydown", (e) => e.stopPropagation());
    body.appendChild(this.input);
    this.results = div("search-results");
    body.appendChild(this.results);
    this.root.appendChild(body);
  }

  protected onShow(): void {
    setTimeout(() => this.input.focus());
  }

  refresh(): void {
    if (!this.isOpen()) return;
    if (this.lastQuery) this.search(); // keep results current as the doc changes
  }

  private search(): void {
    const q = this.input.value.trim().toLowerCase();
    this.lastQuery = q;
    this.results.replaceChildren();
    if (!q) return;
    const matches: { it: GItem; where: string }[] = [];
    for (const it of this.editor.doc.items) {
      if (it.label.toLowerCase().includes(q)) matches.push({ it, where: it.label });
      else if (it.notes.toLowerCase().includes(q)) matches.push({ it, where: it.notes });
      if (matches.length >= 100) break;
    }
    if (!matches.length) {
      this.results.appendChild(div("search-empty", "no matches"));
      return;
    }
    for (const m of matches) {
      const label =
        m.it.kind === "node"
          ? m.it.label.trim()
            ? short(m.it.label)
            : "(unlabeled node)"
          : `${endName(this.editor, (m.it as GLink).head)} → ${endName(this.editor, (m.it as GLink).tail)}`;
      const row = div("search-item", `${m.it.kind === "node" ? "▢" : "—"} ${label}`);
      const i = m.where.toLowerCase().indexOf(q);
      if (i >= 0 && m.where !== m.it.label) row.title = "…" + m.where.slice(Math.max(0, i - 30), i + 50) + "…";
      row.addEventListener("click", () => {
        this.editor.selection = new Set([m.it.id]);
        this.editor.revealItem(m.it.id, true);
        this.editor.render();
      });
      this.results.appendChild(row);
    }
  }
}

// ---------------------------------------------------------------- panel set

export interface PanelSet {
  palette: FormatPalette;
  info: InfoPanel;
  layers: LayersPanel;
  mapInfo: MapInfoPanel;
  outline: OutlinePanel;
  panner: PannerPanel;
  search: SearchPanel;
  all(): FloatingPanel[];
  /** Gather Windows: put every panel back at its default position. */
  gather(): void;
  /** Refresh every open panel (wired to editor.onRender). */
  refreshAll(): void;
}

export function createPanels(editor: Editor, file: FileInfo): PanelSet {
  const palette = new FormatPalette(editor);
  const info = new InfoPanel(editor);
  const layers = new LayersPanel(editor);
  const mapInfo = new MapInfoPanel(editor, file);
  const outline = new OutlinePanel(editor);
  const panner = new PannerPanel(editor);
  const search = new SearchPanel(editor);
  const list: FloatingPanel[] = [palette, info, layers, mapInfo, outline, panner, search];
  return {
    palette, info, layers, mapInfo, outline, panner, search,
    all: () => list,
    gather: () => list.forEach((p) => p.gather()),
    refreshAll: () => list.forEach((p) => p.refresh()),
  };
}
