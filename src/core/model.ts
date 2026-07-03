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

export interface GFont {
  family: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
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
  url: string | null;
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
}

export type GItem = GNode | GLink;

export interface GDoc {
  background: string;
  userZoom: number;
  userOrigin: { x: number; y: number };
  nextId: number;
  items: GItem[]; // paint order: first = bottom
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
  return {
    background: "#ffffff",
    userZoom: 1,
    userOrigin: { x: 0, y: 0 },
    nextId: 1,
    items: [],
  };
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
    url: null,
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

/** Delete items by id. Deleting a node detaches (frees) link endpoints connected to it,
 *  unless the link is also being deleted. Fully dangling links (both ends were attached
 *  only to deleted nodes) are removed with the node, matching editor expectations. */
export function deleteItems(doc: GDoc, ids: Set<string>): void {
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

const FORMAT = "grrrphue-map";
const FORMAT_VERSION = 1;

export function docToJson(doc: GDoc): string {
  return JSON.stringify(
    {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      background: doc.background,
      userZoom: doc.userZoom,
      userOrigin: doc.userOrigin,
      nextId: doc.nextId,
      items: doc.items,
    },
    null,
    2,
  );
}

export function docFromJson(text: string): GDoc {
  const j = JSON.parse(text);
  if (j.format !== FORMAT) throw new Error("Not a GrrrphUE map file.");
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
  for (const it of doc.items) {
    const n = parseInt(it.id, 10);
    if (Number.isFinite(n) && n > maxId) maxId = n;
  }
  doc.nextId = Math.max(typeof j.nextId === "number" ? j.nextId : 1, maxId + 1);
  return doc;
}

export function cloneDoc(doc: GDoc): GDoc {
  return structuredClone(doc);
}
