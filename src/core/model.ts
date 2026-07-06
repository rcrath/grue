// Core document model. Platform-agnostic: no DOM, no Tauri.
// Defaults mirror legacy VUE exactly (docs/legacy-specs/defaults.md).

export type NodeShape =
  | "roundRect" | "rect" | "ellipse" | "diamond" | "hexagon" | "octagon"
  | "triangle" | "shield" | "flag" | "flag2" | "rhombus" | "chevron" | "pentagon";

export const NODE_SHAPES: NodeShape[] = [
  "roundRect", "rect", "ellipse", "diamond", "hexagon", "octagon",
  "triangle", "shield", "flag", "flag2", "rhombus", "chevron",
];

// Stroke dash patterns, indexed by strokeStyle ordinal (legacy VUE StrokeStyle enum).
export const STROKE_DASHES: (number[] | null)[] = [null, [1, 1], [2, 2], [3, 2], [5, 3]];

// Legacy VUE font size presets (VueResources.properties fontSizes).
export const FONT_SIZES = [8, 9, 10, 12, 14, 16, 18, 21, 24, 28, 32, 36, 42, 48, 54, 60, 72, 90];

// Legacy VUE stroke width steps (strokeWeightValues).
export const STROKE_WIDTHS = [0, 1, 2, 3, 4, 5, 6];

// Shared 48-swatch color palette (legacy fillColorValues = strokeColorValues =
// textColorValues; single list in VueResources.properties:1528). 8 cols x 6 rows;
// "transparent" replaces legacy 00000000.
export const PALETTE_COLORS: (string | null)[] = [
  "#000000", "#ffffff", "#eeeeee", "#d0d0d0", "#a6a6a6", "#7f7f7f", "#4c4c4c", null,
  "#fefec9", "#fefd8c", "#fefb03", "#e8e622", "#fde888", "#ffc63b", "#F2AE45", "#dd7b11",
  "#fcdbd9", "#fc938d", "#ea2218", "#ad0c03", "#f4e5ff", "#daa9ff", "#af55f4", "#7c18c9",
  "#eaeaff", "#c1c1ff", "#8484ef", "#5252a8", "#c6e8ff", "#83ceff", "#33a8f5", "#0877c0",
  "#e6f7fd", "#bde5f2", "#82cde4", "#5491a4", "#ecffd4", "#c1f780", "#9ddb53", "#76af31",
  "#e0ffe4", "#8aee95", "#30d643", "#0aad1d", "#f4f5e9", "#e4e6d2", "#b5b995", "#8c8f72",
];

export interface GFont {
  family: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

/** Attached file/URL resource (legacy VUE <resource> element). No open/launch behavior yet. */
export interface GResource {
  spec: string; // file path or URL
  title: string | null;
  properties: { key: string; value: string }[];
}

/** True when a resource points at an image file (an "image node" is just a node
 *  whose attached resource is an image — no separate image component type). */
export function isImageResource(r: GResource | null): boolean {
  if (!r) return false;
  const spec = r.spec.split(/[?#]/)[0];
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(spec);
}

/** Inline image display block on a node (the image FILE is the node's resource).
 *  w/h reserve the display box in map units; the bitmap is drawn aspect-fit
 *  inside it. naturalW/H come from the legacy resource properties
 *  image.width / image.height when known. */
export interface GImage {
  w: number;
  h: number;
  naturalW: number | null;
  naturalH: number | null;
  hidden: boolean; // Format > Image > Hide Image
}

/** Flat item group: members select/move as a unit. Minimal wave-2 model —
 *  no nesting, no group-owned geometry or style (legacy LWGroup is a container;
 *  grue keeps membership sets and expands selection to whole groups). */
export interface GGroup {
  id: string;
  members: string[]; // item ids, 2+
}

/** Map layer. List order in GDoc.layers = paint order (first = bottom). */
export interface GLayer {
  id: string;
  name: string;
  hidden: boolean; // hides all items on the layer
  locked: boolean; // items on the layer aren't selectable/editable
}

export interface GNode {
  kind: "node";
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: NodeShape;
  fill: string | null;
  stroke: string;
  strokeWidth: number;
  strokeStyle: number;
  textColor: string;
  font: GFont;
  autoSized: boolean;
  hidden: boolean;
  collapsed: boolean; // hides this node's children (and links to them)
  layer: string; // GLayer id
  notes: string;
  resource: GResource | null;
  parent: string | null; // containing node id (node containment), null = top-level
  image: GImage | null; // inline image display (file comes from `resource`)
}

export interface LinkEnd {
  node: string | null; // node id, or null = free-floating endpoint
  x: number;
  y: number;
}

export interface GLink {
  kind: "link";
  id: string;
  label: string;
  head: LinkEnd;
  tail: LinkEnd;
  controlCount: 0 | 1 | 2;
  ctrl0: { x: number; y: number } | null;
  ctrl1: { x: number; y: number } | null;
  arrowState: number; // bit 1 = arrow at head, bit 2 = arrow at tail
  stroke: string;
  strokeWidth: number;
  strokeStyle: number;
  textColor: string;
  font: GFont;
  hidden: boolean;
  headPruned: boolean; // legacy headUserPruned
  tailPruned: boolean; // legacy tailUserPruned
  layer: string; // GLayer id
  notes: string;
  resource: GResource | null;
}

export type GItem = GNode | GLink;

export interface GDoc {
  background: string; // map fill color (no alpha, legacy rule)
  userZoom: number;
  userOrigin: { x: number; y: number };
  nextId: number;
  layers: GLayer[]; // paint order: first = bottom
  activeLayer: string; // GLayer id; new items land here
  items: GItem[]; // paint order within a layer: first = bottom
  groups: GGroup[]; // flat membership sets (see GGroup)
}

// ---- legacy-VUE defaults ----

export const NODE_DEFAULTS = {
  fill: "#F2AE45",
  stroke: "#776D6D",
  strokeWidth: 1,
  textColor: "#000000",
  font: (): GFont => ({ family: "Arial", size: 12, bold: false, italic: false, underline: false }),
  label: "New Node",
};

export const LINK_DEFAULTS = {
  stroke: "#404040",
  strokeWidth: 1,
  textColor: "#404040",
  font: (): GFont => ({ family: "Arial", size: 11, bold: false, italic: false, underline: false }),
  arrowState: 2, // tail arrow on newly drawn links
};

export const SELECTION_COLOR = "#4A95FF";
export const HIGHLIGHT_COLOR = "rgba(74,149,255,0.5)";

export function newDoc(): GDoc {
  const doc: GDoc = {
    background: "#ffffff",
    userZoom: 1,
    userOrigin: { x: 0, y: 0 },
    nextId: 1,
    layers: [],
    activeLayer: "",
    items: [],
    groups: [],
  };
  const layer: GLayer = { id: allocId(doc), name: "Layer 1", hidden: false, locked: false };
  doc.layers.push(layer);
  doc.activeLayer = layer.id;
  return doc;
}

export function allocId(doc: GDoc): string {
  return String(doc.nextId++);
}

export function makeNode(doc: GDoc, x: number, y: number, w: number, h: number, shape: NodeShape = "roundRect"): GNode {
  return {
    kind: "node",
    id: allocId(doc),
    label: NODE_DEFAULTS.label,
    x, y, w, h,
    shape,
    fill: NODE_DEFAULTS.fill,
    stroke: NODE_DEFAULTS.stroke,
    strokeWidth: NODE_DEFAULTS.strokeWidth,
    strokeStyle: 0,
    textColor: NODE_DEFAULTS.textColor,
    font: NODE_DEFAULTS.font(),
    autoSized: true,
    hidden: false,
    collapsed: false,
    layer: doc.activeLayer,
    notes: "",
    resource: null,
    parent: null,
    image: null,
  };
}

export function makeLink(doc: GDoc, head: LinkEnd, tail: LinkEnd): GLink {
  return {
    kind: "link",
    id: allocId(doc),
    label: "",
    head, tail,
    controlCount: 0,
    ctrl0: null,
    ctrl1: null,
    arrowState: LINK_DEFAULTS.arrowState,
    stroke: LINK_DEFAULTS.stroke,
    strokeWidth: LINK_DEFAULTS.strokeWidth,
    strokeStyle: 0,
    textColor: LINK_DEFAULTS.textColor,
    font: LINK_DEFAULTS.font(),
    hidden: false,
    headPruned: false,
    tailPruned: false,
    layer: doc.activeLayer,
    notes: "",
    resource: null,
  };
}

export function getItem(doc: GDoc, id: string): GItem | undefined {
  return doc.items.find((i) => i.id === id);
}

export function getNode(doc: GDoc, id: string | null): GNode | undefined {
  if (id == null) return undefined;
  const it = getItem(doc, id);
  return it && it.kind === "node" ? it : undefined;
}

export function nodes(doc: GDoc): GNode[] {
  return doc.items.filter((i): i is GNode => i.kind === "node");
}

export function links(doc: GDoc): GLink[] {
  return doc.items.filter((i): i is GLink => i.kind === "link");
}

/** Links with at least one endpoint attached to the given node. */
export function linksTouching(doc: GDoc, nodeId: string): GLink[] {
  return links(doc).filter((l) => l.head.node === nodeId || l.tail.node === nodeId);
}

/** True if a straight link already connects the two nodes (either direction). */
export function hasStraightLinkBetween(doc: GDoc, a: string, b: string): boolean {
  return links(doc).some(
    (l) =>
      l.controlCount === 0 &&
      ((l.head.node === a && l.tail.node === b) || (l.head.node === b && l.tail.node === a)),
  );
}

// ---- layers ----

export function getLayer(doc: GDoc, id: string): GLayer | undefined {
  return doc.layers.find((l) => l.id === id);
}

/** Items on a layer, in item (z) order. */
export function layerItems(doc: GDoc, layerId: string): GItem[] {
  return doc.items.filter((i) => i.layer === layerId);
}

/** Global paint order: layers bottom-to-top, item order within each layer.
 *  Items referencing a missing layer paint last (on top). */
export function paintOrder(doc: GDoc): GItem[] {
  const byLayer = new Map<string, GItem[]>();
  for (const l of doc.layers) byLayer.set(l.id, []);
  const orphans: GItem[] = [];
  for (const it of doc.items) (byLayer.get(it.layer) ?? orphans).push(it);
  const out: GItem[] = [];
  for (const l of doc.layers) out.push(...byLayer.get(l.id)!);
  out.push(...orphans);
  return out;
}

/** Hidden items and items on hidden layers don't render. */
export function isItemVisible(doc: GDoc, it: GItem): boolean {
  if (it.hidden) return false;
  const layer = getLayer(doc, it.layer);
  return !(layer && layer.hidden);
}

/** Invisible items and items on locked layers can't be hit-tested/selected/edited. */
export function isItemSelectable(doc: GDoc, it: GItem): boolean {
  if (!isItemVisible(doc, it)) return false;
  const layer = getLayer(doc, it.layer);
  return !(layer && layer.locked);
}

/** New layer on top; becomes the active layer (legacy behavior). */
export function createLayer(doc: GDoc, name?: string): GLayer {
  const layer: GLayer = {
    id: allocId(doc),
    name: name ?? `Layer ${doc.layers.length + 1}`,
    hidden: false,
    locked: false,
  };
  doc.layers.push(layer);
  doc.activeLayer = layer.id;
  return layer;
}

/** Delete a layer AND its contents (legacy VUE behavior; the UI confirms first).
 *  Refuses to delete the last layer. Returns false when refused or not found. */
export function deleteLayer(doc: GDoc, id: string): boolean {
  const idx = doc.layers.findIndex((l) => l.id === id);
  if (idx < 0 || doc.layers.length <= 1) return false;
  deleteItems(doc, new Set(layerItems(doc, id).map((i) => i.id)));
  doc.layers.splice(idx, 1);
  if (doc.activeLayer === id) doc.activeLayer = doc.layers[Math.max(0, idx - 1)].id;
  return true;
}

export function renameLayer(doc: GDoc, id: string, name: string): void {
  const layer = getLayer(doc, id);
  if (layer) layer.name = name;
}

/** Move a layer to a new index in the paint order (0 = bottom). */
export function reorderLayer(doc: GDoc, id: string, toIndex: number): void {
  const idx = doc.layers.findIndex((l) => l.id === id);
  if (idx < 0) return;
  const clamped = Math.max(0, Math.min(doc.layers.length - 1, toIndex));
  const [layer] = doc.layers.splice(idx, 1);
  doc.layers.splice(clamped, 0, layer);
}

/** Duplicate a layer and its contents. The copy sits directly above the original,
 *  is named "<name> Copy", and becomes active (legacy behavior). Links keep their
 *  connections when the endpoint node was also duplicated, otherwise the end is freed. */
export function duplicateLayer(doc: GDoc, id: string): GLayer | null {
  const idx = doc.layers.findIndex((l) => l.id === id);
  if (idx < 0) return null;
  const src = doc.layers[idx];
  const dupe: GLayer = { id: allocId(doc), name: src.name + " Copy", hidden: src.hidden, locked: src.locked };
  doc.layers.splice(idx + 1, 0, dupe);
  const idMap = new Map<string, string>();
  const clones: GItem[] = [];
  for (const it of doc.items) {
    if (it.layer !== id) continue;
    const clone = structuredClone(it);
    clone.id = allocId(doc);
    clone.layer = dupe.id;
    idMap.set(it.id, clone.id);
    clones.push(clone);
  }
  for (const c of clones) {
    if (c.kind === "link") {
      c.head.node = c.head.node ? idMap.get(c.head.node) ?? null : null;
      c.tail.node = c.tail.node ? idMap.get(c.tail.node) ?? null : null;
    } else {
      c.parent = c.parent ? idMap.get(c.parent) ?? null : null;
    }
  }
  doc.items.push(...clones);
  doc.activeLayer = dupe.id;
  return dupe;
}

export function setActiveLayer(doc: GDoc, id: string): void {
  if (getLayer(doc, id)) doc.activeLayer = id;
}

// ---- groups ----

/** The group containing an item, or undefined. Membership is exclusive
 *  (an item belongs to at most one group; groupItems enforces it). */
export function groupOf(doc: GDoc, itemId: string): GGroup | undefined {
  return doc.groups.find((g) => g.members.includes(itemId));
}

/** Group the given items. Items are pulled out of any group they were in;
 *  groups left with fewer than 2 members dissolve. Returns null when fewer
 *  than 2 valid items were supplied. */
export function groupItems(doc: GDoc, ids: string[]): GGroup | null {
  const valid = ids.filter((id) => getItem(doc, id));
  if (valid.length < 2) return null;
  const taking = new Set(valid);
  for (const g of doc.groups) g.members = g.members.filter((m) => !taking.has(m));
  doc.groups = doc.groups.filter((g) => g.members.length >= 2);
  const group: GGroup = { id: allocId(doc), members: valid };
  doc.groups.push(group);
  return group;
}

/** Dissolve every group that contains any of the given items. Returns how many dissolved. */
export function ungroupItems(doc: GDoc, ids: Set<string>): number {
  const before = doc.groups.length;
  doc.groups = doc.groups.filter((g) => !g.members.some((m) => ids.has(m)));
  return before - doc.groups.length;
}

/** Expand a set of item ids to include all members of any group touched. */
export function expandToGroups(doc: GDoc, ids: Set<string>): Set<string> {
  const out = new Set(ids);
  for (const g of doc.groups) {
    if (g.members.some((m) => out.has(m))) for (const m of g.members) out.add(m);
  }
  return out;
}

// ---- node containment (parent/child) ----

// Legacy LWNode child-layout constants (LWNode.java): children stack in a
// vertical column below the label with small padding; the parent grows to fit.
export const EDGE_PAD_Y = 4;
export const CHILD_PAD_X = 5; // ChildPadX (no icon gutter in grue)
export const CHILD_GAP_Y = 3; // ChildVerticalGap
export const CHILD_PAD_BOTTOM = 2; // ChildrenPadBottom

/** Direct children of a node, in items (z) order. */
export function childrenOf(doc: GDoc, nodeId: string): GNode[] {
  return doc.items.filter((i): i is GNode => i.kind === "node" && i.parent === nodeId);
}

/** True when `maybeDesc` sits somewhere below `ancestorId` in the containment tree. */
export function isDescendantOf(doc: GDoc, maybeDescId: string, ancestorId: string): boolean {
  let cur = getNode(doc, maybeDescId);
  const seen = new Set<string>();
  while (cur && cur.parent != null && !seen.has(cur.id)) {
    if (cur.parent === ancestorId) return true;
    seen.add(cur.id);
    cur = getNode(doc, cur.parent);
  }
  return false;
}

/** Expand a set of item ids with every node descendant of any node in the set
 *  (children move/copy/delete with their parent). */
export function expandWithDescendants(doc: GDoc, ids: Set<string>): Set<string> {
  const out = new Set(ids);
  const kids = new Map<string, GNode[]>();
  for (const n of nodes(doc)) {
    if (n.parent == null) continue;
    let arr = kids.get(n.parent);
    if (!arr) kids.set(n.parent, (arr = []));
    arr.push(n);
  }
  const queue = [...ids];
  while (queue.length) {
    const id = queue.pop()!;
    for (const c of kids.get(id) ?? []) {
      if (!out.has(c.id)) {
        out.add(c.id);
        queue.push(c.id);
      }
    }
  }
  return out;
}

/** Node ids of a node's whole subtree (itself + descendants), in items order. */
export function subtreeNodeIds(doc: GDoc, rootId: string): string[] {
  const set = expandWithDescendants(doc, new Set([rootId]));
  return doc.items.filter((i) => i.kind === "node" && set.has(i.id)).map((i) => i.id);
}

/** Make `childId` a child of `parentId`: sets the parent ref, moves the child's
 *  subtree onto the parent's layer, and reorders items so the subtree paints
 *  right after the parent's existing subtree (children always paint above
 *  their parent). Refuses cycles and self-parenting. */
export function attachChild(doc: GDoc, childId: string, parentId: string): boolean {
  const child = getNode(doc, childId);
  const parent = getNode(doc, parentId);
  if (!child || !parent || child.id === parent.id) return false;
  if (isDescendantOf(doc, parentId, childId)) return false; // would create a cycle
  child.parent = parent.id;
  const sub = new Set(subtreeNodeIds(doc, childId));
  for (const id of sub) {
    const n = getNode(doc, id);
    if (n) n.layer = parent.layer;
  }
  // reorder: pull the subtree out and re-insert after the parent's subtree
  const moved = doc.items.filter((i) => sub.has(i.id));
  const rest = doc.items.filter((i) => !sub.has(i.id));
  const parentSub = new Set(subtreeNodeIds(doc, parentId));
  let insertAt = -1;
  for (let i = 0; i < rest.length; i++) if (parentSub.has(rest[i].id)) insertAt = i;
  if (insertAt < 0) return true; // parent vanished mid-flight; refs are still consistent
  rest.splice(insertAt + 1, 0, ...moved);
  doc.items = rest;
  return true;
}

/** Detach a node from its parent (it stays where it is on the canvas). */
export function detachChild(doc: GDoc, childId: string): void {
  const child = getNode(doc, childId);
  if (child) child.parent = null;
}

/** Height of the label block at the top of a node (0 when label-less).
 *  Pure line-count arithmetic — no text measurement needed. */
export function labelBlockHeight(n: GNode): number {
  if (!n.label) return 0;
  const lines = n.label.split("\n").length;
  return lines * Math.round(n.font.size * 1.25) + EDGE_PAD_Y * 2;
}

function contentTopPad(n: GNode): number {
  const lh = labelBlockHeight(n);
  return lh > 0 ? lh : EDGE_PAD_Y;
}

/** Where a node's inline image draws, in map coordinates. The image fills the
 *  area below the label (whole node when label-less and childless); the bitmap
 *  is aspect-fit inside this box at render time. Null when no visible image. */
export function imageBox(
  n: GNode,
  hasChildren: boolean,
): { x: number; y: number; w: number; h: number } | null {
  if (!n.image || n.image.hidden) return null;
  if (!n.label && !hasChildren) return { x: n.x, y: n.y, w: n.w, h: n.h };
  return {
    x: n.x + CHILD_PAD_X,
    y: n.y + contentTopPad(n),
    w: Math.max(4, n.w - CHILD_PAD_X * 2),
    h: n.image.h,
  };
}

/** Containment layout, legacy LWNode column style: children stack vertically
 *  inside the parent below the label (and below the inline image), small
 *  padding, parent grows to contain them. Sizes are computed bottom-up,
 *  positions top-down. Widths only grow (labels aren't measurable here);
 *  heights are set from content for auto-sized or collapsed parents and
 *  clamped-to-content otherwise. Idempotent. */
export function layoutContainers(doc: GDoc): void {
  const byId = new Map<string, GNode>();
  for (const n of nodes(doc)) byId.set(n.id, n);
  const kids = new Map<string, GNode[]>();
  let anyImage = false;
  for (const n of nodes(doc)) {
    if (n.image) anyImage = true;
    if (n.parent == null) continue;
    const p = byId.get(n.parent);
    if (!p || p.id === n.id) {
      n.parent = null; // dangling/self parent ref
      continue;
    }
    let arr = kids.get(n.parent);
    if (!arr) kids.set(n.parent, (arr = []));
    arr.push(n);
  }
  if (kids.size === 0 && !anyImage) return;

  const depthCache = new Map<string, number>();
  const depthOf = (n: GNode): number => {
    const hit = depthCache.get(n.id);
    if (hit != null) return hit;
    let d = 0;
    let cur: GNode | undefined = n;
    const seen = new Set<string>();
    while (cur && cur.parent != null && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parent);
      d++;
    }
    depthCache.set(n.id, d);
    return d;
  };

  const containers = nodes(doc).filter((n) => kids.has(n.id) || n.image != null);

  // pass 1: sizes, deepest first
  containers.sort((a, b) => depthOf(b) - depthOf(a));
  for (const p of containers) {
    const cs = (kids.get(p.id) ?? []).filter((c) => !c.hidden);
    const img = p.image && !p.image.hidden ? p.image : null;
    if (img && !p.label && cs.length === 0) {
      // pure image node: frame tracks the image display box exactly
      p.w = Math.max(10, img.w);
      p.h = Math.max(10, img.h);
      continue;
    }
    const top = contentTopPad(p);
    let contentH = top;
    let minW = 10;
    if (img) {
      contentH += img.h;
      minW = Math.max(minW, img.w + CHILD_PAD_X * 2);
    }
    if (!p.collapsed && cs.length) {
      if (img) contentH += CHILD_GAP_Y;
      for (let i = 0; i < cs.length; i++) {
        contentH += cs[i].h + (i < cs.length - 1 ? CHILD_GAP_Y : 0);
        minW = Math.max(minW, cs[i].w + CHILD_PAD_X * 2);
      }
      contentH += CHILD_PAD_BOTTOM;
    } else if (img) {
      contentH += CHILD_PAD_BOTTOM;
    } else if (!p.label) {
      contentH = 10; // collapsed/empty label-less shell
    }
    p.w = Math.max(p.w, minW);
    p.h = p.autoSized || p.collapsed ? Math.max(contentH, 10) : Math.max(p.h, contentH);
  }

  // pass 2: positions, shallowest first (a child's own children are placed
  // after the child has moved, so no subtree translation is needed)
  containers.sort((a, b) => depthOf(a) - depthOf(b));
  for (const p of containers) {
    if (p.collapsed) continue;
    const cs = (kids.get(p.id) ?? []).filter((c) => !c.hidden);
    if (!cs.length) continue;
    const img = p.image && !p.image.hidden ? p.image : null;
    let y = p.y + contentTopPad(p) + (img ? img.h + CHILD_GAP_Y : 0);
    for (const c of cs) {
      c.x = p.x + CHILD_PAD_X;
      c.y = y;
      y += c.h + CHILD_GAP_Y;
    }
  }
}

/** Item ids hidden because an ancestor node is collapsed: every descendant of a
 *  collapsed parent, plus links with an endpoint on a hidden descendant
 *  (legacy hides such links entirely). The collapsed parent itself stays visible. */
export function collapseHiddenIds(doc: GDoc): Set<string> {
  const hidden = new Set<string>();
  const all = nodes(doc);
  if (!all.some((n) => n.collapsed)) return hidden;
  const byId = new Map<string, GNode>();
  for (const n of all) byId.set(n.id, n);
  for (const n of all) {
    if (n.parent == null) continue;
    let cur = byId.get(n.parent);
    const seen = new Set<string>([n.id]);
    while (cur && !seen.has(cur.id)) {
      if (cur.collapsed) {
        hidden.add(n.id);
        break;
      }
      seen.add(cur.id);
      cur = cur.parent != null ? byId.get(cur.parent) : undefined;
    }
  }
  if (hidden.size) {
    for (const l of links(doc)) {
      if ((l.head.node != null && hidden.has(l.head.node)) || (l.tail.node != null && hidden.has(l.tail.node)))
        hidden.add(l.id);
    }
  }
  return hidden;
}

/** Delete items by id. Deleting a node also deletes its children (containment),
 *  and detaches (frees) link endpoints connected to deleted nodes unless the
 *  link is also being deleted. Fully dangling links (both ends were attached
 *  only to deleted nodes) are removed with the node, matching editor expectations. */
export function deleteItems(doc: GDoc, ids: Set<string>): void {
  // children die with their parent
  for (const id of expandWithDescendants(doc, ids)) ids.add(id);
  const deletingNodes = new Set(
    doc.items.filter((i) => i.kind === "node" && ids.has(i.id)).map((i) => i.id),
  );
  for (const l of links(doc)) {
    if (ids.has(l.id)) continue;
    const headGone = l.head.node != null && deletingNodes.has(l.head.node);
    const tailGone = l.tail.node != null && deletingNodes.has(l.tail.node);
    if (headGone && (tailGone || l.tail.node == null)) ids.add(l.id);
    else if (tailGone && l.head.node == null) ids.add(l.id);
    else {
      if (headGone) l.head = { node: null, x: l.head.x, y: l.head.y };
      if (tailGone) l.tail = { node: null, x: l.tail.x, y: l.tail.y };
    }
  }
  doc.items = doc.items.filter((i) => !ids.has(i.id));
  // groups: drop deleted members; dissolve groups left with fewer than 2
  for (const g of doc.groups) g.members = g.members.filter((m) => !ids.has(m));
  doc.groups = doc.groups.filter((g) => g.members.length >= 2);
}

// ---- pruning (legacy LWLink semantics) ----

/** Item ids hidden by user prunes, per legacy LWLink semantics:
 *  a link with `headPruned` hides everything reachable from its TAIL node
 *  without passing through its HEAD node — the head side survives and the link
 *  renders as a stub dot at the head end (legacy setHeadUserPruned →
 *  pruneToggle(getEndpointChain(tail.node)), backstop = head.node).
 *  `tailPruned` is the mirror image. The pruning link itself is never hidden,
 *  and traversal stops at (but still hides) other links pruned at the node
 *  being walked (legacy LWComponent.getLinkChain / LWLink.isPrunedBelow). */
export function pruneHiddenIds(doc: GDoc): Set<string> {
  const allLinks = links(doc);
  const hidden = new Set<string>();
  if (!allLinks.some((l) => l.headPruned || l.tailPruned)) return hidden;

  const byNode = new Map<string, GLink[]>();
  for (const l of allLinks) {
    for (const nid of [l.head.node, l.tail.node]) {
      if (nid == null) continue;
      let arr = byNode.get(nid);
      if (!arr) byNode.set(nid, (arr = []));
      arr.push(l);
    }
  }

  const walk = (source: GLink, start: string | null, backstop: string | null) => {
    if (start == null) return;
    const bag = new Set<string>([start]);
    const queue = [start];
    while (queue.length) {
      const nid = queue.pop()!;
      for (const l of byNode.get(nid) ?? []) {
        if (l.id === source.id) continue; // never hide the pruning link itself
        bag.add(l.id);
        // a link pruned at this end is included but not walked through (legacy isPrunedBelow)
        const prunedHere = (l.head.node === nid && l.headPruned) || (l.tail.node === nid && l.tailPruned);
        if (prunedHere) continue;
        const other = l.head.node === nid ? l.tail.node : l.head.node;
        if (other == null || other === backstop || bag.has(other)) continue;
        bag.add(other);
        queue.push(other);
      }
    }
    for (const id of bag) hidden.add(id);
  };

  for (const l of allLinks) {
    if (l.headPruned) walk(l, l.tail.node, l.head.node);
    if (l.tailPruned) walk(l, l.head.node, l.tail.node);
  }
  return hidden;
}

/** Bounding box of all items (nodes + link points), or null when empty. */
export function docBounds(doc: GDoc): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const it of doc.items) {
    if (it.kind === "node") {
      grow(it.x, it.y);
      grow(it.x + it.w, it.y + it.h);
    } else {
      grow(it.head.x, it.head.y);
      grow(it.tail.x, it.tail.y);
      if (it.ctrl0) grow(it.ctrl0.x, it.ctrl0.y);
      if (it.ctrl1) grow(it.ctrl1.x, it.ctrl1.y);
    }
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ---- native JSON persistence ----

const FORMAT = "grue-map";
const LEGACY_FORMAT = "grrrphue-map"; // maps saved before the rename
const FORMAT_VERSION = 2; // v2: layers, hidden/collapsed/pruned flags, notes, resource

export function docToJson(doc: GDoc): string {
  return JSON.stringify(
    {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      background: doc.background,
      userZoom: doc.userZoom,
      userOrigin: doc.userOrigin,
      nextId: doc.nextId,
      layers: doc.layers,
      activeLayer: doc.activeLayer,
      items: doc.items,
      groups: doc.groups,
    },
    null,
    2,
  );
}

export function docFromJson(text: string): GDoc {
  const j = JSON.parse(text);
  if (j.format !== FORMAT && j.format !== LEGACY_FORMAT) throw new Error("Not a grue map file.");
  if (typeof j.formatVersion !== "number" || j.formatVersion > FORMAT_VERSION)
    throw new Error(`Map file version ${j.formatVersion} is newer than this app understands.`);
  const doc = newDoc();
  doc.background = typeof j.background === "string" ? j.background : "#ffffff";
  doc.userZoom = typeof j.userZoom === "number" && j.userZoom > 0 ? j.userZoom : 1;
  if (j.userOrigin && typeof j.userOrigin.x === "number" && typeof j.userOrigin.y === "number")
    doc.userOrigin = { x: j.userOrigin.x, y: j.userOrigin.y };
  doc.items = Array.isArray(j.items) ? j.items : [];

  // nextId must clear every existing numeric id even if the saved value is stale
  let maxId = 0;
  const bump = (id: unknown) => {
    const n = parseInt(String(id), 10);
    if (Number.isFinite(n) && n > maxId) maxId = n;
  };
  for (const it of doc.items) bump(it.id);

  // layers: v1 files have none — everything lands on one default layer
  const layers: GLayer[] = [];
  if (Array.isArray(j.layers)) {
    for (const l of j.layers) {
      if (!l || typeof l.id !== "string") continue;
      bump(l.id);
      layers.push({
        id: l.id,
        name: typeof l.name === "string" ? l.name : "Layer",
        hidden: l.hidden === true,
        locked: l.locked === true,
      });
    }
  }
  if (layers.length === 0)
    layers.push({ id: String(++maxId), name: "Layer 1", hidden: false, locked: false });
  doc.layers = layers;
  const layerIds = new Set(layers.map((l) => l.id));
  doc.activeLayer =
    typeof j.activeLayer === "string" && layerIds.has(j.activeLayer) ? j.activeLayer : layers[0].id;

  // per-item defaults for fields older files don't have
  for (const it of doc.items) {
    it.hidden = (it as { hidden?: unknown }).hidden === true;
    it.notes = typeof it.notes === "string" ? it.notes : "";
    it.resource = normalizeResource(it.resource);
    if (typeof it.layer !== "string" || !layerIds.has(it.layer)) it.layer = layers[0].id;
    if (it.kind === "node") {
      it.collapsed = (it as { collapsed?: unknown }).collapsed === true;
      // v2-additive fields: parent (containment) and image (inline display)
      const rawParent = (it as { parent?: unknown }).parent;
      it.parent = typeof rawParent === "string" ? rawParent : null;
      it.image = normalizeImage((it as { image?: unknown }).image);
      // v1 stored a bare url string; migrate it to a resource
      const legacyUrl = (it as unknown as { url?: unknown }).url;
      if (it.resource == null && typeof legacyUrl === "string" && legacyUrl)
        it.resource = { spec: legacyUrl, title: null, properties: [] };
      delete (it as unknown as { url?: unknown }).url;
    } else {
      it.headPruned = (it as { headPruned?: unknown }).headPruned === true;
      it.tailPruned = (it as { tailPruned?: unknown }).tailPruned === true;
    }
  }

  // groups (additive v2 field; absent in older files)
  const itemIds = new Set(doc.items.map((i) => i.id));
  const groups: GGroup[] = [];
  if (Array.isArray(j.groups)) {
    for (const g of j.groups) {
      if (!g || typeof g.id !== "string" || !Array.isArray(g.members)) continue;
      bump(g.id);
      const members = g.members.filter((m: unknown): m is string => typeof m === "string" && itemIds.has(m));
      if (members.length >= 2) groups.push({ id: g.id, members });
    }
  }
  doc.groups = groups;

  // containment sanity: parent must be an existing node; break cycles
  const nodeIds = new Set(doc.items.filter((i) => i.kind === "node").map((i) => i.id));
  for (const it of doc.items) {
    if (it.kind !== "node") continue;
    if (it.parent != null && (!nodeIds.has(it.parent) || it.parent === it.id)) it.parent = null;
  }
  for (const it of doc.items) {
    if (it.kind !== "node" || it.parent == null) continue;
    const seen = new Set<string>([it.id]);
    let cur = getNode(doc, it.parent);
    while (cur) {
      if (seen.has(cur.id)) {
        it.parent = null; // cycle: cut it at this node
        break;
      }
      seen.add(cur.id);
      cur = cur.parent != null ? getNode(doc, cur.parent) : undefined;
    }
  }

  doc.nextId = Math.max(typeof j.nextId === "number" ? j.nextId : 1, maxId + 1);
  return doc;
}

function normalizeImage(v: unknown): GImage | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { w?: unknown; h?: unknown; naturalW?: unknown; naturalH?: unknown; hidden?: unknown };
  if (typeof o.w !== "number" || typeof o.h !== "number" || o.w <= 0 || o.h <= 0) return null;
  return {
    w: o.w,
    h: o.h,
    naturalW: typeof o.naturalW === "number" && o.naturalW > 0 ? o.naturalW : null,
    naturalH: typeof o.naturalH === "number" && o.naturalH > 0 ? o.naturalH : null,
    hidden: o.hidden === true,
  };
}

function normalizeResource(r: unknown): GResource | null {
  if (!r || typeof r !== "object") return null;
  const o = r as { spec?: unknown; title?: unknown; properties?: unknown };
  if (typeof o.spec !== "string" || !o.spec) return null;
  const properties: { key: string; value: string }[] = [];
  if (Array.isArray(o.properties)) {
    for (const p of o.properties) {
      if (p && typeof p.key === "string")
        properties.push({ key: p.key, value: typeof p.value === "string" ? p.value : "" });
    }
  }
  return { spec: o.spec, title: typeof o.title === "string" && o.title ? o.title : null, properties };
}

export function cloneDoc(doc: GDoc): GDoc {
  return structuredClone(doc);
}
