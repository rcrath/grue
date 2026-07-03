// Legacy Tufts VUE (.vue) import/export.
// Format spec extracted from the legacy source: docs/legacy-specs/format.md.

import {
  GDoc, GFont, GLayer, GLink, GNode, GResource, LinkEnd, NodeShape,
  LINK_DEFAULTS, NODE_DEFAULTS, newDoc, paintOrder,
} from "./model";

// ---- codecs ----

/** Legacy color: #RRGGBB opaque, #AARRGGBB with alpha (alpha in the TOP byte when
 *  more than 6 hex digits), case-insensitive, tolerate short forms like #cccc. */
export function parseVueColor(s: string | null | undefined): string | null {
  if (!s) return null;
  let t = s.trim();
  if (t.startsWith("#")) t = t.slice(1);
  if (!/^[0-9a-fA-F]{1,8}$/.test(t)) {
    // rare comma form r,g,b[,a]
    const parts = s.trim().split(",").map((x) => parseInt(x.trim(), 10));
    if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) {
      const [r, g, b, a] = parts;
      return a != null && a < 255
        ? `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`
        : rgbHex(r, g, b);
    }
    return null;
  }
  const v = parseInt(t, 16);
  if (t.length > 6) {
    const a = (v >>> 24) & 0xff;
    return `rgba(${(v >>> 16) & 0xff},${(v >>> 8) & 0xff},${v & 0xff},${(a / 255).toFixed(3)})`;
  }
  return rgbHex((v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
}

function rgbHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

/** Emit legacy color string: #RRGGBB (or #AARRGGBB from rgba()). Null for no color. */
export function toVueColor(css: string | null): string | null {
  if (!css) return null;
  const m = css.match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/);
  if (m) {
    const a = Math.round(parseFloat(m[4]) * 255);
    const hex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
    if (a >= 255) return "#" + hex(+m[1]) + hex(+m[2]) + hex(+m[3]);
    return "#" + hex(a) + hex(+m[1]) + hex(+m[2]) + hex(+m[3]);
  }
  if (/^#[0-9a-fA-F]{6}$/.test(css)) return css.toUpperCase();
  return css;
}

/** Legacy font string "Family-style-size"; family may contain "-"-free spaces,
 *  so parse from the right. Style: plain|bold|italic|bolditalic [+ underline]. */
export function parseVueFont(s: string | null | undefined, fallback: GFont): GFont {
  if (!s) return { ...fallback };
  const parts = s.split("-");
  if (parts.length < 3) return { ...fallback };
  const size = parseFloat(parts[parts.length - 1]);
  const style = parts[parts.length - 2].toLowerCase();
  const family = mapJavaFamily(parts.slice(0, -2).join("-"));
  if (!Number.isFinite(size)) return { ...fallback };
  return {
    family,
    size,
    bold: style.includes("bold"),
    italic: style.includes("italic"),
    underline: style.includes("underline"),
  };
}

function mapJavaFamily(f: string): string {
  const low = f.toLowerCase();
  if (low === "sansserif" || low === "dialog" || low === "dialoginput") return "Arial";
  if (low === "serif") return "Times New Roman";
  if (low === "monospaced") return "Consolas";
  return f;
}

export function toVueFont(f: GFont): string {
  let style = f.bold && f.italic ? "bolditalic" : f.bold ? "bold" : f.italic ? "italic" : "plain";
  if (f.underline) style += "underline";
  return `${f.family}-${style}-${Math.round(f.size)}`;
}

/** Label text: castor writes newlines as &#xa; (XML handles those); very old files
 *  embed literal "%nl;". Applied to labels and notes alike. */
function unescapeVueText(s: string): string {
  return s
    .replace(/%nl;/g, "\n")
    .replace(/%tab;/g, "\t")
    .replace(/%sp;/g, " ")
    .replace(/%pct;/g, "%");
}

/** Notes element: collapse castor's re-indentation first, then unescape
 *  (%nl; newline, %tab; tab, %sp; space, %pct; percent — legacy LWComponent). */
function parseVueNotes(s: string): string {
  const collapsed = s.replace(/\n[ \t]*%nl;/g, "%nl;").replace(/\n[ \t]*/g, " ").trim();
  return unescapeVueText(collapsed);
}

/** Legacy notes escaping on write: % first, then newlines/tabs/double spaces. */
function escapeVueNotes(s: string): string {
  return s
    .replace(/%/g, "%pct;")
    .replace(/\r\n|\r|\n/g, "%nl;")
    .replace(/\t/g, "%tab;")
    .replace(/ {2}/g, " %sp;");
}

// ---- import ----

const SHAPE_MAP: Record<string, NodeShape> = {
  roundrect: "roundRect",
  roundrectraw: "roundRect",
  rectangle: "rect",
  ellipse: "ellipse",
  diamond: "diamond",
  hexagon: "hexagon",
  octagon: "octagon",
  triangle: "triangle",
  shield: "shield",
  flag: "flag",
  flag2: "flag2",
  rhombus: "rhombus",
  chevron: "chevron",
  pentagon: "pentagon",
  polygon: "hexagon",
};

export interface VueImportResult {
  doc: GDoc;
  warnings: string[];
}

export function importVue(text: string): VueImportResult {
  const warnings: string[] = [];

  // Strip the HTML-comment envelope that precedes the XML declaration — every real
  // .vue file is invalid XML at the top.
  let xml = text;
  const declAt = xml.indexOf("<?xml");
  if (declAt > 0) xml = xml.slice(declAt);
  else if (declAt < 0) {
    const rootAt = xml.indexOf("<LW-MAP");
    if (rootAt > 0) xml = xml.slice(rootAt);
  }

  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  const err = parsed.querySelector("parsererror");
  if (err) throw new Error("Could not parse .vue file: " + (err.textContent || "XML error").slice(0, 200));
  const root = parsed.documentElement;
  if (root.tagName !== "LW-MAP") throw new Error("Not a VUE map file (no LW-MAP root).");

  const doc = newDoc();
  const bg = parseVueColor(directChildText(root, "fillColor"));
  if (bg) doc.background = bg;

  const modelVersion = parseInt(directChildText(root, "modelVersion") || "0", 10) || 0;
  const relativeCoords = modelVersion >= 1;

  const uz = parseFloat(directChildText(root, "userZoom") || "1");
  if (Number.isFinite(uz) && uz > 0) doc.userZoom = uz;
  const uo = directChild(root, "userOrigin");
  if (uo) {
    doc.userOrigin = {
      x: parseFloat(uo.getAttribute("x") || "0") || 0,
      y: parseFloat(uo.getAttribute("y") || "0") || 0,
    };
  }

  // Layer shells (modelVersion >= 5): <layer> elements are empty; components carry
  // a layerID attribute. Pre-layer files have neither — one default layer at the end.
  const layers: GLayer[] = [];
  for (const el of Array.from(root.children)) {
    if (el.tagName !== "layer") continue;
    const lid = el.getAttribute("ID");
    if (!lid) continue;
    layers.push({
      id: lid,
      name: el.getAttribute("label") || `Layer ${layers.length + 1}`,
      hidden: el.getAttribute("hidden") === "true",
      locked: el.getAttribute("locked") === "true",
    });
  }
  const layerIds = new Set(layers.map((l) => l.id));

  /** Layer for a component: its layerID attribute, else the enclosing <layer> element. */
  const layerFor = (el: Element, enclosing: string | null): string => {
    const ref = el.getAttribute("layerID");
    if (ref && layerIds.has(ref)) return ref;
    return enclosing ?? "";
  };

  // Old→new id mapping is identity (legacy ids are numeric strings) but guard dupes.
  const seenIds = new Set<string>();
  const pendingLinks: { el: Element; ox: number; oy: number; layerId: string }[] = [];

  const importChildren = (parent: Element, ox: number, oy: number, scale: number, layerId: string | null) => {
    for (const el of Array.from(parent.children)) {
      if (el.tagName === "layer") {
        // layers sit at 0,0 scale 1; their children are map coordinates
        importChildren(el, 0, 0, 1, el.getAttribute("ID"));
        continue;
      }
      if (el.tagName !== "child") continue;
      const t = (el.getAttribute("xsi:type") || el.getAttributeNS("http://www.w3.org/2001/XMLSchema-instance", "type") || "").toLowerCase();
      if (t === "link") {
        pendingLinks.push({ el, ox, oy, layerId: layerFor(el, layerId) });
        continue;
      }
      if (t === "node" || t === "text" || t === "") {
        const n = importNode(el, ox, oy, scale, t === "text");
        if (n) {
          if (seenIds.has(n.id)) {
            warnings.push(`Duplicate id ${n.id}; skipped a component.`);
            continue;
          }
          n.layer = layerFor(el, layerId);
          seenIds.add(n.id);
          doc.items.push(n);
          // nested children (nodes inside nodes): flatten, scaled 75% per level
          importChildren(
            el,
            relativeCoords ? n.x : 0,
            relativeCoords ? n.y : 0,
            scale * 0.75,
            n.layer || layerId,
          );
        }
        continue;
      }
      if (t === "group") {
        const gx = parseFloat(el.getAttribute("x") || "0") || 0;
        const gy = parseFloat(el.getAttribute("y") || "0") || 0;
        importChildren(el, relativeCoords ? ox + gx : 0, relativeCoords ? oy + gy : 0, scale, layerFor(el, layerId));
        continue;
      }
      warnings.push(`Skipped unsupported component type "${t || "unknown"}".`);
    }
  };

  const importNode = (el: Element, ox: number, oy: number, scale: number, isText: boolean): GNode | null => {
    const id = el.getAttribute("ID");
    if (!id) return null;
    const x = (parseFloat(el.getAttribute("x") || "0") || 0) * (relativeCoords ? scale : 1) + ox;
    const y = (parseFloat(el.getAttribute("y") || "0") || 0) * (relativeCoords ? scale : 1) + oy;
    const w = Math.max(10, (parseFloat(el.getAttribute("width") || "60") || 60) * scale);
    const h = Math.max(10, (parseFloat(el.getAttribute("height") || "24") || 24) * scale);

    let shape: NodeShape = "roundRect";
    let shapeEl = directChild(el, "shape");
    if (!shapeEl) {
      const wrap = directChild(el, "nodeShape"); // 2008-era wrapper variant
      if (wrap) shapeEl = directChild(wrap, "shape");
    }
    if (shapeEl) {
      const st = (shapeEl.getAttribute("xsi:type") || "").toLowerCase();
      shape = SHAPE_MAP[st] ?? "roundRect";
    }

    const rawLabel = el.getAttribute("label") || "";
    const fill = parseVueColor(directChildText(el, "fillColor"));
    const stroke = parseVueColor(directChildText(el, "strokeColor")) || "#404040";
    const textColor = parseVueColor(directChildText(el, "textColor")) || "#000000";
    const font = parseVueFont(directChildText(el, "font"), NODE_DEFAULTS.font());
    const strokeWidth = parseFloat(el.getAttribute("strokeWidth") || "1");
    const strokeStyle = parseInt(el.getAttribute("strokeStyle") || "0", 10) || 0;

    return {
      kind: "node",
      id,
      label: unescapeVueText(rawLabel),
      x, y, w, h,
      shape,
      fill: isText && fill == null ? null : fill,
      stroke,
      strokeWidth: Number.isFinite(strokeWidth) ? strokeWidth : 1,
      strokeStyle,
      textColor,
      font,
      autoSized: el.getAttribute("autoSized") === "true",
      hidden: el.getAttribute("hidden") === "true",
      collapsed: false, // legacy collapse is a global mode, never persisted per node
      layer: "", // assigned by the caller
      notes: importNotes(el),
      resource: importResource(el),
    };
  };

  importChildren(root, 0, 0, 1, null);

  for (const { el, ox, oy, layerId } of pendingLinks) {
    const id = el.getAttribute("ID");
    if (!id || seenIds.has(id)) continue;
    const id1 = directChildText(el, "ID1");
    const id2 = directChildText(el, "ID2");
    const p1 = pointOf(el, "point1", ox, oy);
    const p2 = pointOf(el, "point2", ox, oy);
    const mkEnd = (ref: string | null, pt: { x: number; y: number } | null): LinkEnd => {
      const attached = ref != null && seenIds.has(ref);
      return {
        node: attached ? ref : null,
        x: pt?.x ?? 0,
        y: pt?.y ?? 0,
      };
    };
    if (id1 && !seenIds.has(id1)) warnings.push(`Link ${id}: endpoint ${id1} not found; kept as free end.`);
    if (id2 && !seenIds.has(id2)) warnings.push(`Link ${id}: endpoint ${id2} not found; kept as free end.`);

    const controlCountRaw = parseInt(el.getAttribute("controlCount") || "0", 10) || 0;
    const ctrl0 = pointOf(el, "ctrlPoint0", ox, oy);
    const ctrl1 = pointOf(el, "ctrlPoint1", ox, oy);
    // presence of control points implies curve state even if the attribute disagrees
    const controlCount = (ctrl1 ? 2 : ctrl0 ? Math.max(1, controlCountRaw) : 0) as 0 | 1 | 2;

    const link: GLink = {
      kind: "link",
      id,
      label: unescapeVueText(el.getAttribute("label") || ""),
      head: mkEnd(id1, p1),
      tail: mkEnd(id2, p2),
      controlCount,
      ctrl0: controlCount >= 1 ? ctrl0 : null,
      ctrl1: controlCount === 2 ? ctrl1 : null,
      arrowState: parseInt(el.getAttribute("arrowState") || "0", 10) || 0,
      stroke: parseVueColor(directChildText(el, "strokeColor")) || LINK_DEFAULTS.stroke,
      strokeWidth: parseFloat(el.getAttribute("strokeWidth") || "1") || 1,
      strokeStyle: parseInt(el.getAttribute("strokeStyle") || "0", 10) || 0,
      textColor: parseVueColor(directChildText(el, "textColor")) || LINK_DEFAULTS.textColor,
      font: parseVueFont(directChildText(el, "font"), LINK_DEFAULTS.font()),
      hidden: el.getAttribute("hidden") === "true",
      headPruned: directChildText(el, "headUserPruned") === "true",
      tailPruned: directChildText(el, "tailUserPruned") === "true",
      layer: layerId,
      notes: importNotes(el),
      resource: importResource(el),
    };
    seenIds.add(id);
    doc.items.push(link);
  }

  let maxId = 0;
  const bump = (sid: string) => {
    const n = parseInt(sid, 10);
    if (Number.isFinite(n) && n > maxId) maxId = n;
  };
  for (const sid of seenIds) bump(sid);
  for (const l of layers) bump(l.id);

  // pre-layer files (modelVersion < 5): one default layer holds everything
  if (layers.length === 0)
    layers.push({ id: String(++maxId), name: "Layer 1", hidden: false, locked: false });
  doc.layers = layers;
  for (const it of doc.items) {
    if (!it.layer || !layers.some((l) => l.id === it.layer)) it.layer = layers[0].id;
  }
  // legacy restore picks the layer named "Default", else the second layer, else the first
  const active = layers.find((l) => l.name === "Default") ?? (layers.length > 1 ? layers[1] : layers[0]);
  doc.activeLayer = active.id;

  doc.nextId = maxId + 1;

  return { doc, warnings };
}

function importNotes(el: Element): string {
  const c = directChild(el, "notes");
  return c ? parseVueNotes(c.textContent ?? "") : "";
}

/** Legacy <resource>: spec attribute (path or URL), optional <title>, and
 *  <property key= value=/> children (or the propertyEntry entryKey/entryValue form). */
function importResource(el: Element): GResource | null {
  const res = directChild(el, "resource");
  if (!res) return null;
  const spec = res.getAttribute("spec") || "";
  if (!spec) return null;
  const properties: { key: string; value: string }[] = [];
  for (const p of Array.from(res.children)) {
    if (p.tagName !== "property") continue;
    let key = p.getAttribute("key");
    let value = p.getAttribute("value");
    if (key == null) {
      key = directChildText(p, "entryKey");
      value = directChildText(p, "entryValue");
    }
    if (key) properties.push({ key, value: value ?? "" });
  }
  const title = directChildText(res, "title");
  return { spec, title: title || null, properties };
}

function directChild(el: Element, tag: string): Element | null {
  for (const c of Array.from(el.children)) if (c.tagName === tag) return c;
  return null;
}

function directChildText(el: Element, tag: string): string | null {
  const c = directChild(el, tag);
  return c ? (c.textContent ?? "").trim() : null;
}

function pointOf(el: Element, tag: string, ox: number, oy: number): { x: number; y: number } | null {
  const c = directChild(el, tag);
  if (!c) return null;
  const x = parseFloat(c.getAttribute("x") || "");
  const y = parseFloat(c.getAttribute("y") || "");
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: x + ox, y: y + oy };
}

// ---- export ----

/** Minimal .vue writer: nodes + links + layer shells, modelVersion 5,
 *  mapping version 1.1 — loadable by legacy VUE. Children are written flat under
 *  LW-MAP grouped by layer (paint order) with layerID references, exactly like
 *  legacy VUE persists layered maps. All coordinates are absolute; that is safe
 *  because every exported component is a top-level child of a layer at 0,0. */
export function exportVue(doc: GDoc, mapLabel: string): string {
  const lines: string[] = [];
  lines.push(`<!-- Tufts VUE concept-map (${xmlEscape(mapLabel)}) -->`);
  lines.push(`<!-- Do Not Remove: VUE mapping @version(1.1) lw_mapping_1_1.xml -->`);
  lines.push(`<!-- Written by grue -->`);
  lines.push(`<?xml version="1.0" encoding="US-ASCII"?>`);
  lines.push(
    `<LW-MAP xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
      `xsi:noNamespaceSchemaLocation="none" ID="0" label="${xmlEscape(mapLabel)}">`,
  );
  const mapFill = toVueColor(doc.background);
  if (mapFill) lines.push(`  <fillColor>${mapFill}</fillColor>`);
  lines.push(`  <font>SansSerif-plain-18</font>`);

  const SHAPE_XML: Record<NodeShape, string> = {
    roundRect: "roundRect",
    rect: "rectangle",
    ellipse: "ellipse",
    diamond: "diamond",
    hexagon: "hexagon",
    octagon: "octagon",
    triangle: "triangle",
    shield: "shield",
    flag: "flag",
    flag2: "flag2",
    rhombus: "rhombus",
    chevron: "chevron",
    pentagon: "pentagon",
  };

  // Children flat under LW-MAP in global paint order (grouped by layer), each
  // tagged with its layerID — the shape legacy VUE writes for layered maps.
  for (const it of paintOrder(doc)) {
    const layerRef = ` layerID="${xmlEscape(it.layer)}"`;
    const hiddenAttr = it.hidden ? ` hidden="true"` : "";
    if (it.kind === "node") {
      lines.push(
        `  <child ID="${xmlEscape(it.id)}" label="${xmlEscape(it.label)}"${layerRef} ` +
          `x="${fx(it.x)}" y="${fx(it.y)}" width="${fx(it.w)}" height="${fx(it.h)}" ` +
          `strokeWidth="${fx(it.strokeWidth)}"${it.strokeStyle ? ` strokeStyle="${it.strokeStyle}"` : ""} ` +
          `autoSized="${it.autoSized}"${hiddenAttr} xsi:type="node">`,
      );
      if (it.notes) lines.push(`    <notes>${xmlEscape(escapeVueNotes(it.notes))}</notes>`);
      lines.push(...resourceXml(it.resource));
      const fill = toVueColor(it.fill);
      if (fill) lines.push(`    <fillColor>${fill}</fillColor>`);
      lines.push(`    <strokeColor>${toVueColor(it.stroke)}</strokeColor>`);
      lines.push(`    <textColor>${toVueColor(it.textColor)}</textColor>`);
      lines.push(`    <font>${xmlEscape(toVueFont(it.font))}</font>`);
      lines.push(`    <nodeFilter/>`);
      if (it.shape === "roundRect")
        lines.push(`    <shape arcwidth="20.0" archeight="20.0" xsi:type="roundRect"/>`);
      else lines.push(`    <shape xsi:type="${SHAPE_XML[it.shape]}"/>`);
      lines.push(`  </child>`);
    } else {
      lines.push(
        `  <child ID="${xmlEscape(it.id)}"${it.label ? ` label="${xmlEscape(it.label)}"` : ""}${layerRef} ` +
          `x="${fx(Math.min(it.head.x, it.tail.x))}" y="${fx(Math.min(it.head.y, it.tail.y))}" ` +
          `width="${fx(Math.abs(it.head.x - it.tail.x) || 1)}" height="${fx(Math.abs(it.head.y - it.tail.y) || 1)}" ` +
          `strokeWidth="${fx(it.strokeWidth)}"${it.strokeStyle ? ` strokeStyle="${it.strokeStyle}"` : ""} ` +
          `controlCount="${it.controlCount}" arrowState="${it.arrowState}"${hiddenAttr} xsi:type="link">`,
      );
      if (it.notes) lines.push(`    <notes>${xmlEscape(escapeVueNotes(it.notes))}</notes>`);
      lines.push(...resourceXml(it.resource));
      lines.push(`    <strokeColor>${toVueColor(it.stroke)}</strokeColor>`);
      lines.push(`    <textColor>${toVueColor(it.textColor)}</textColor>`);
      lines.push(`    <font>${xmlEscape(toVueFont(it.font))}</font>`);
      lines.push(`    <nodeFilter/>`);
      lines.push(`    <point1 x="${fx(it.head.x)}" y="${fx(it.head.y)}"/>`);
      lines.push(`    <point2 x="${fx(it.tail.x)}" y="${fx(it.tail.y)}"/>`);
      if (it.head.node != null) lines.push(`    <ID1>${xmlEscape(it.head.node)}</ID1>`);
      if (it.tail.node != null) lines.push(`    <ID2>${xmlEscape(it.tail.node)}</ID2>`);
      if (it.controlCount >= 1 && it.ctrl0)
        lines.push(`    <ctrlPoint0 x="${fx(it.ctrl0.x)}" y="${fx(it.ctrl0.y)}"/>`);
      if (it.controlCount === 2 && it.ctrl1)
        lines.push(`    <ctrlPoint1 x="${fx(it.ctrl1.x)}" y="${fx(it.ctrl1.y)}"/>`);
      if (it.headPruned) lines.push(`    <headUserPruned>true</headUserPruned>`);
      if (it.tailPruned) lines.push(`    <tailUserPruned>true</tailUserPruned>`);
      lines.push(`  </child>`);
    }
  }

  // empty layer shells, bottom-to-top (contents stay flat above, per legacy)
  for (const l of doc.layers) {
    lines.push(
      `  <layer ID="${xmlEscape(l.id)}" label="${xmlEscape(l.name)}" x="0.0" y="0.0" ` +
        `strokeWidth="0.0" autoSized="false"` +
        `${l.hidden ? ` hidden="true"` : ""}${l.locked ? ` locked="true"` : ""}/>`,
    );
  }

  lines.push(`  <userZoom>${doc.userZoom}</userZoom>`);
  lines.push(`  <userOrigin x="${fx(doc.userOrigin.x)}" y="${fx(doc.userOrigin.y)}"/>`);
  lines.push(`  <modelVersion>5</modelVersion>`);
  lines.push(`</LW-MAP>`);
  return lines.join("\n") + "\n";
}

/** Legacy <resource> element: spec attribute plus optional <title> and <property> children. */
function resourceXml(r: GResource | null): string[] {
  if (!r) return [];
  const open =
    `    <resource referenceCreated="0" size="-1" spec="${xmlEscape(r.spec)}" ` +
    `type="0" xsi:type="map-resource"`;
  if (!r.title && r.properties.length === 0) return [open + "/>"];
  const lines = [open + ">"];
  if (r.title) lines.push(`      <title>${xmlEscape(r.title)}</title>`);
  for (const p of r.properties)
    lines.push(`      <property key="${xmlEscape(p.key)}" value="${xmlEscape(p.value)}"/>`);
  lines.push(`    </resource>`);
  return lines;
}

function fx(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/** Escape XML specials and all non-ASCII (files declare US-ASCII). Newlines in
 *  attribute values become &#xa; like castor writes them. */
function xmlEscape(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === "&") out += "&amp;";
    else if (ch === "<") out += "&lt;";
    else if (ch === ">") out += "&gt;";
    else if (ch === '"') out += "&quot;";
    else if (ch === "\n") out += "&#xa;";
    else if (ch === "\r") continue;
    else if (c < 32 || c > 126) out += `&#x${c.toString(16)};`;
    else out += ch;
  }
  return out;
}
