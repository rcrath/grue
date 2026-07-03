// Text measurement for node auto-sizing, via an offscreen canvas.

import type { GFont } from "../core/model";

let ctx: CanvasRenderingContext2D | null = null;

export function fontToCss(f: GFont): string {
  return `${f.italic ? "italic " : ""}${f.bold ? "bold " : ""}${f.size}px "${f.family}", sans-serif`;
}

export function measureLabel(label: string, font: GFont): { w: number; h: number; lines: string[] } {
  if (!ctx) {
    const c = document.createElement("canvas");
    ctx = c.getContext("2d")!;
  }
  ctx.font = fontToCss(font);
  const lines = label.length ? label.split("\n") : [""];
  let w = 0;
  for (const line of lines) w = Math.max(w, ctx.measureText(line).width);
  const lineHeight = Math.round(font.size * 1.25);
  return { w: Math.ceil(w), h: lines.length * lineHeight, lines };
}

/** Node frame that fits a label, legacy-VUE-ish padding, 10px minimums. */
export function autoSizeFor(label: string, font: GFont): { w: number; h: number } {
  const m = measureLabel(label, font);
  return {
    w: Math.max(10, m.w + 22),
    h: Math.max(10, m.h + 11),
  };
}
