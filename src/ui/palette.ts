// Format palette (ui-spec §4): floating panel with node / link / text sections
// that switch on selection kind, plus the shared 48-swatch color picker.

import { FONT_SIZES, NodeShape, PALETTE_COLORS, STROKE_WIDTHS } from "../core/model";
import { shapePathData } from "../core/geometry";
import { Editor } from "./editor";
import { FloatingPanel } from "./panel";

/** Legacy picker order (nodeModeTool.subtool.* — pentagon intentionally absent). */
export const SHAPE_ORDER: NodeShape[] = [
  "roundRect", "rect", "ellipse", "diamond", "hexagon", "octagon",
  "flag", "flag2", "triangle", "shield", "rhombus", "chevron",
];

export const SHAPE_LABELS: Record<NodeShape, string> = {
  roundRect: "Rounded Rectangle",
  rect: "Rectangle",
  ellipse: "Oval",
  diamond: "Diamond",
  hexagon: "Hexagon",
  octagon: "Octagon",
  flag: "Flag",
  flag2: "Flag 2",
  triangle: "Triangle",
  shield: "Shield",
  rhombus: "Rhombus",
  chevron: "Chevron",
  pentagon: "Pentagon", // importable-only, no picker button
};

export const STROKE_STYLE_NAMES = ["solid", "dotted", "dashed", "dash 2", "dash 3"];

const ARROW_OPTIONS: { state: number; label: string; title: string }[] = [
  { state: 0, label: "─", title: "No arrows" },
  { state: 1, label: "◄─", title: "Arrow at start" },
  { state: 2, label: "─►", title: "Arrow at end" },
  { state: 3, label: "◄─►", title: "Arrows at both ends" },
];

const LINE_OPTIONS: { count: 0 | 1 | 2; label: string; title: string }[] = [
  { count: 0, label: "straight", title: "Straight" },
  { count: 1, label: "curved", title: "Curved" },
  { count: 2, label: "s-curve", title: "S-curved" },
];

export class FormatPalette extends FloatingPanel {
  private getEditor: () => Editor;
  private sig = "";

  constructor(getEditor: () => Editor) {
    super({
      key: "format",
      title: "Format",
      className: "palette",
      closeHint: "Close (Ctrl+1)",
      defaultPos: { top: 96, right: 14 },
    });
    this.getEditor = getEditor;
    this.build();
  }

  /** Always the ACTIVE document's editor (multi-doc: panels track the active tab). */
  private get editor(): Editor {
    return this.getEditor();
  }

  protected onShow(): void {
    this.sig = ""; // force a rebuild of the section state
  }

  // ---- DOM ----

  private nodeSection!: HTMLElement;
  private linkSection!: HTMLElement;
  private textSection!: HTMLElement;
  private emptyHint!: HTMLElement;
  private shapeBtns = new Map<NodeShape, HTMLButtonElement>();
  private fillBtn!: HTMLButtonElement;
  private nodeStrokeBtn!: HTMLButtonElement;
  private nodeWidth!: HTMLSelectElement;
  private nodeStyle!: HTMLSelectElement;
  private arrowBtns: HTMLButtonElement[] = [];
  private lineBtns: HTMLButtonElement[] = [];
  private linkStrokeBtn!: HTMLButtonElement;
  private linkWidth!: HTMLSelectElement;
  private linkStyle!: HTMLSelectElement;
  private familyInput!: HTMLInputElement;
  private sizeSelect!: HTMLSelectElement;
  private boldBtn!: HTMLButtonElement;
  private italicBtn!: HTMLButtonElement;
  private underlineBtn!: HTMLButtonElement;
  private textColorBtn!: HTMLButtonElement;

  private build(): void {
    this.emptyHint = document.createElement("div");
    this.emptyHint.className = "pal-hint";
    this.emptyHint.textContent = "Select nodes or links to edit their style.";
    this.root.appendChild(this.emptyHint);

    // ----- node section -----
    this.nodeSection = this.section("Node");
    const grid = document.createElement("div");
    grid.className = "shape-grid";
    for (const s of SHAPE_ORDER) {
      const b = document.createElement("button");
      b.className = "shape-btn";
      b.title = SHAPE_LABELS[s];
      b.innerHTML = `<svg viewBox="0 0 22 16"><path d="${shapePathData(s, 2, 2, 18, 12)}" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;
      b.addEventListener("click", () => {
        this.editor.defaultShape = s;
        this.editor.applyStyleToSelection({ shape: s });
      });
      this.shapeBtns.set(s, b);
      grid.appendChild(b);
    }
    this.nodeSection.appendChild(grid);

    this.fillBtn = this.swatchButton("Fill", (c) => this.editor.applyStyleToSelection({ fill: c }));
    this.nodeStrokeBtn = this.swatchButton("Stroke", (c) =>
      this.editor.applyStyleToSelection({ stroke: c ?? "transparent" }, "node"),
    );
    this.nodeSection.appendChild(this.row(this.fillBtn.parentElement!, this.nodeStrokeBtn.parentElement!));

    this.nodeWidth = this.widthSelect((n) => this.editor.applyStyleToSelection({ strokeWidth: n }, "node"));
    this.nodeStyle = this.styleSelect((n) => this.editor.applyStyleToSelection({ strokeStyle: n }, "node"));
    this.nodeSection.appendChild(this.row(labeled("Width", this.nodeWidth), labeled("Style", this.nodeStyle)));

    // ----- link section -----
    this.linkSection = this.section("Link");
    const arrowRow = document.createElement("div");
    arrowRow.className = "pal-row";
    for (const opt of ARROW_OPTIONS) {
      const b = document.createElement("button");
      b.className = "pal-toggle";
      b.textContent = opt.label;
      b.title = opt.title;
      b.addEventListener("click", () => this.editor.applyStyleToSelection({ arrowState: opt.state }));
      this.arrowBtns.push(b);
      arrowRow.appendChild(b);
    }
    this.linkSection.appendChild(arrowRow);

    const lineRow = document.createElement("div");
    lineRow.className = "pal-row";
    for (const opt of LINE_OPTIONS) {
      const b = document.createElement("button");
      b.className = "pal-toggle";
      b.textContent = opt.label;
      b.title = opt.title;
      b.addEventListener("click", () => this.editor.applyStyleToSelection({ controlCount: opt.count }));
      this.lineBtns.push(b);
      lineRow.appendChild(b);
    }
    this.linkSection.appendChild(lineRow);

    this.linkStrokeBtn = this.swatchButton("Color", (c) =>
      this.editor.applyStyleToSelection({ stroke: c ?? "transparent" }, "link"),
    );
    this.linkWidth = this.widthSelect((n) => this.editor.applyStyleToSelection({ strokeWidth: n }, "link"));
    this.linkStyle = this.styleSelect((n) => this.editor.applyStyleToSelection({ strokeStyle: n }, "link"));
    this.linkSection.appendChild(
      this.row(this.linkStrokeBtn.parentElement!, labeled("Width", this.linkWidth), labeled("Style", this.linkStyle)),
    );

    // ----- text section -----
    this.textSection = this.section("Text");
    this.familyInput = document.createElement("input");
    this.familyInput.type = "text";
    this.familyInput.className = "pal-family";
    this.familyInput.spellcheck = false;
    this.familyInput.addEventListener("change", () => {
      const family = this.familyInput.value.trim();
      if (family) this.editor.applyFontToSelection({ family });
    });
    this.textSection.appendChild(this.row(labeled("Font", this.familyInput)));

    this.sizeSelect = document.createElement("select");
    for (const s of FONT_SIZES) {
      const o = document.createElement("option");
      o.value = String(s);
      o.textContent = String(s);
      this.sizeSelect.appendChild(o);
    }
    this.sizeSelect.addEventListener("change", () =>
      this.editor.applyFontToSelection({ size: parseInt(this.sizeSelect.value, 10) }),
    );

    const mk = (label: string, flag: "bold" | "italic" | "underline", cls: string) => {
      const b = document.createElement("button");
      b.className = `pal-toggle ${cls}`;
      b.textContent = label;
      b.title = flag[0].toUpperCase() + flag.slice(1);
      b.addEventListener("click", () => this.editor.toggleFontFlag(flag));
      return b;
    };
    this.boldBtn = mk("B", "bold", "pal-b");
    this.italicBtn = mk("I", "italic", "pal-i");
    this.underlineBtn = mk("U", "underline", "pal-u");
    this.textColorBtn = this.swatchButton("Color", (c) =>
      this.editor.applyStyleToSelection({ textColor: c ?? "transparent" }),
    );
    this.textSection.appendChild(
      this.row(
        labeled("Size", this.sizeSelect),
        this.boldBtn,
        this.italicBtn,
        this.underlineBtn,
        this.textColorBtn.parentElement!,
      ),
    );
  }

  private section(title: string): HTMLElement {
    const s = document.createElement("div");
    s.className = "pal-section";
    const t = document.createElement("div");
    t.className = "pal-title";
    t.textContent = title;
    s.appendChild(t);
    this.root.appendChild(s);
    return s;
  }

  private row(...children: HTMLElement[]): HTMLElement {
    const r = document.createElement("div");
    r.className = "pal-row";
    r.append(...children);
    return r;
  }

  private swatchButton(label: string, onPick: (color: string | null) => void): HTMLButtonElement {
    const wrap = document.createElement("label");
    wrap.className = "pal-swatch";
    const span = document.createElement("span");
    span.textContent = label;
    const b = document.createElement("button");
    b.className = "swatch-btn";
    b.title = `${label} color`;
    b.addEventListener("click", () => openSwatchPopup(b, onPick));
    wrap.append(span, b);
    return b;
  }

  private widthSelect(onChange: (n: number) => void): HTMLSelectElement {
    const sel = document.createElement("select");
    for (const w of STROKE_WIDTHS) {
      const o = document.createElement("option");
      o.value = String(w);
      o.textContent = `${w} px`;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => onChange(parseInt(sel.value, 10)));
    return sel;
  }

  private styleSelect(onChange: (n: number) => void): HTMLSelectElement {
    const sel = document.createElement("select");
    STROKE_STYLE_NAMES.forEach((name, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = name;
      sel.appendChild(o);
    });
    sel.addEventListener("change", () => onChange(parseInt(sel.value, 10)));
    return sel;
  }

  // ---- state sync ----

  refresh(): void {
    if (!this.isOpen()) return;
    const nodes = this.editor.selectedNodes();
    const links = this.editor.selectedLinks();
    const items = this.editor.selectedItems();
    const n = nodes[0], l = links[0], first = items[0];

    const sig = JSON.stringify([
      nodes.length, links.length,
      n && [n.shape, n.fill, n.stroke, n.strokeWidth, n.strokeStyle],
      l && [l.arrowState, l.controlCount, l.stroke, l.strokeWidth, l.strokeStyle],
      first && [first.textColor, first.font],
    ]);
    if (sig === this.sig) return;
    this.sig = sig;

    this.emptyHint.style.display = items.length ? "none" : "";
    this.nodeSection.style.display = nodes.length ? "" : "none";
    this.linkSection.style.display = links.length ? "" : "none";
    this.textSection.style.display = items.length ? "" : "none";

    if (n) {
      for (const [s, b] of this.shapeBtns) b.classList.toggle("active", nodes.every((x) => x.shape === s));
      setSwatch(this.fillBtn, n.fill);
      setSwatch(this.nodeStrokeBtn, n.stroke);
      this.nodeWidth.value = String(Math.round(n.strokeWidth));
      this.nodeStyle.value = String(n.strokeStyle);
    }
    if (l) {
      this.arrowBtns.forEach((b, i) => b.classList.toggle("active", ARROW_OPTIONS[i].state === l.arrowState));
      this.lineBtns.forEach((b, i) => b.classList.toggle("active", LINE_OPTIONS[i].count === l.controlCount));
      setSwatch(this.linkStrokeBtn, l.stroke);
      this.linkWidth.value = String(Math.round(l.strokeWidth));
      this.linkStyle.value = String(l.strokeStyle);
    }
    if (first) {
      this.familyInput.value = first.font.family;
      // non-preset sizes (e.g. link default 11) get a temporary option
      this.sizeSelect.querySelectorAll("option[data-temp]").forEach((o) => o.remove());
      if (!FONT_SIZES.includes(first.font.size)) {
        const o = document.createElement("option");
        o.value = String(first.font.size);
        o.textContent = String(first.font.size);
        o.dataset.temp = "1";
        this.sizeSelect.appendChild(o);
      }
      this.sizeSelect.value = String(first.font.size);
      this.boldBtn.classList.toggle("active", first.font.bold);
      this.italicBtn.classList.toggle("active", first.font.italic);
      this.underlineBtn.classList.toggle("active", first.font.underline);
      setSwatch(this.textColorBtn, first.textColor);
    }
  }
}

function labeled(text: string, control: HTMLElement): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = "pal-labeled";
  const span = document.createElement("span");
  span.textContent = text;
  wrap.append(span, control);
  return wrap;
}

function setSwatch(btn: HTMLElement, color: string | null): void {
  btn.classList.toggle("swatch-none", color == null || color === "transparent");
  btn.style.background = color == null || color === "transparent" ? "" : color;
}

/** Shared 48-swatch popup (8×6, transparent swatch rendered as checkerboard).
 *  `anchor` is the button it drops from, or a fixed screen point. */
export function openSwatchPopup(
  anchor: HTMLElement | { x: number; y: number },
  onPick: (color: string | null) => void,
): void {
  document.querySelector(".swatch-pop")?.remove();
  const pop = document.createElement("div");
  pop.className = "swatch-pop";
  for (const c of PALETTE_COLORS) {
    const b = document.createElement("button");
    b.className = "swatch-cell" + (c == null ? " swatch-none" : "");
    if (c != null) b.style.background = c;
    b.title = c ?? "none (transparent)";
    b.addEventListener("click", () => {
      pop.remove();
      onPick(c);
    });
    pop.appendChild(b);
  }
  document.body.appendChild(pop);
  const a =
    anchor instanceof HTMLElement
      ? anchor.getBoundingClientRect()
      : new DOMRect(anchor.x, anchor.y, 0, 0);
  const r = pop.getBoundingClientRect();
  let x = a.left, y = a.bottom + 4;
  if (x + r.width > innerWidth - 4) x = Math.max(4, innerWidth - r.width - 4);
  if (y + r.height > innerHeight - 4) y = Math.max(4, a.top - r.height - 4);
  pop.style.left = `${x}px`;
  pop.style.top = `${y}px`;
  const close = (e: PointerEvent) => {
    if (!pop.contains(e.target as Node)) {
      pop.remove();
      document.removeEventListener("pointerdown", close, true);
    }
  };
  setTimeout(() => document.addEventListener("pointerdown", close, true));
}
