// Shape outlines, intersection and hit-test math. Mirrors legacy VUE's approach:
// shapes are flattened to polylines and links clip at the first ray/outline intersection
// (falling back to the node center when shapes overlap).

import type { GNode, NodeShape } from "./model";

export interface Pt {
  x: number;
  y: number;
}

/** Closed outline polyline for a node shape, in map coordinates. */
export function nodeOutline(n: GNode): Pt[] {
  return shapeOutline(n.shape, n.x, n.y, n.w, n.h);
}

export function shapeOutline(shape: NodeShape, x: number, y: number, w: number, h: number): Pt[] {
  switch (shape) {
    case "rect":
      return [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)];
    case "roundRect": {
      // legacy VUE RoundRect2D: fixed 20x20 arc => corner radius 10, clamped to size
      const r = Math.min(10, w / 2, h / 2);
      return roundRectOutline(x, y, w, h, r);
    }
    case "ellipse":
      return ellipseOutline(x, y, w, h);
    case "diamond":
      return [p(x + w / 2, y), p(x + w, y + h / 2), p(x + w / 2, y + h), p(x, y + h / 2)];
    case "hexagon": {
      const ix = 0.2257085 * w; // legacy VUE Hexagon x-inset
      return [p(x + ix, y), p(x + w - ix, y), p(x + w, y + h / 2), p(x + w - ix, y + h), p(x + ix, y + h), p(x, y + h / 2)];
    }
    case "octagon": {
      const iw = w / 3.4, ih = h / 3.4; // legacy VUE Octagon insets
      return [
        p(x + iw, y), p(x + w - iw, y), p(x + w, y + ih), p(x + w, y + h - ih),
        p(x + w - iw, y + h), p(x + iw, y + h), p(x, y + h - ih), p(x, y + ih),
      ];
    }
    case "triangle":
      return [p(x + w / 2, y), p(x + w, y + h), p(x, y + h)];
    case "shield":
      return [p(x, y), p(x + w, y), p(x + w, y + h * 0.6), p(x + w / 2, y + h), p(x, y + h * 0.6)];
    case "flag": {
      const k = w * 0.25;
      return [p(x, y), p(x + w - k, y), p(x + w, y + h / 2), p(x + w - k, y + h), p(x, y + h)];
    }
    case "flag2": {
      const k = w * 0.25;
      return [p(x + k, y), p(x + w, y), p(x + w, y + h), p(x + k, y + h), p(x, y + h / 2)];
    }
    case "rhombus": {
      const k = w * 0.25;
      return [p(x + k, y), p(x + w, y), p(x + w - k, y + h), p(x, y + h)];
    }
    case "chevron": {
      const k = w * 0.25;
      return [p(x, y), p(x + w - k, y), p(x + w, y + h / 2), p(x + w - k, y + h), p(x, y + h), p(x + k, y + h / 2)];
    }
    case "pentagon": {
      return [p(x + w / 2, y), p(x + w, y + h * 0.38), p(x + w * 0.81, y + h), p(x + w * 0.19, y + h), p(x, y + h * 0.38)];
    }
  }
}

function p(x: number, y: number): Pt {
  return { x, y };
}

function roundRectOutline(x: number, y: number, w: number, h: number, r: number): Pt[] {
  const pts: Pt[] = [];
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    const STEPS = 6;
    for (let i = 0; i <= STEPS; i++) {
      const a = a0 + ((a1 - a0) * i) / STEPS;
      pts.push(p(cx + r * Math.cos(a), cy + r * Math.sin(a)));
    }
  };
  arc(x + r, y + r, Math.PI, Math.PI * 1.5); // top-left
  arc(x + w - r, y + r, Math.PI * 1.5, Math.PI * 2); // top-right
  arc(x + w - r, y + h - r, 0, Math.PI * 0.5); // bottom-right
  arc(x + r, y + h - r, Math.PI * 0.5, Math.PI); // bottom-left
  return pts;
}

function ellipseOutline(x: number, y: number, w: number, h: number): Pt[] {
  const pts: Pt[] = [];
  const cx = x + w / 2, cy = y + h / 2;
  const STEPS = 32;
  for (let i = 0; i < STEPS; i++) {
    const a = (Math.PI * 2 * i) / STEPS;
    pts.push(p(cx + (w / 2) * Math.cos(a), cy + (h / 2) * Math.sin(a)));
  }
  return pts;
}

/** SVG path data for a node shape (used for rendering; outline used for math). */
export function shapePathData(shape: NodeShape, x: number, y: number, w: number, h: number): string {
  if (shape === "roundRect") {
    const r = Math.min(10, w / 2, h / 2);
    return (
      `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r}` +
      ` A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r}` +
      ` V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`
    );
  }
  if (shape === "ellipse") {
    const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2;
    return `M${cx - rx},${cy} A${rx},${ry} 0 1 0 ${cx + rx},${cy} A${rx},${ry} 0 1 0 ${cx - rx},${cy} Z`;
  }
  const pts = shapeOutline(shape, x, y, w, h);
  return "M" + pts.map((q) => `${q.x},${q.y}`).join(" L") + " Z";
}

/** Segment/segment intersection point, or null. */
function segIntersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a1.x + t * d1x, y: a1.y + t * d1y };
}

/** First intersection of the ray a->b with a closed outline, nearest to `a`.
 *  Returns null when there is no intersection (a inside and b inside, or disjoint). */
export function rayOutlineIntersection(a: Pt, b: Pt, outline: Pt[]): Pt | null {
  let best: Pt | null = null;
  let bestD = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const q = segIntersect(a, b, outline[i], outline[(i + 1) % outline.length]);
    if (q) {
      const d = (q.x - a.x) ** 2 + (q.y - a.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
  }
  return best;
}

export function pointInOutline(pt: Pt, outline: Pt[]): boolean {
  // even-odd ray cast
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i], b = outline[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

export function nodeCenter(n: GNode): Pt {
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
}

/** Squared distance from point to segment. */
export function distSqToSegment(pt: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * dx, py = a.y + t * dy;
  return (pt.x - px) ** 2 + (pt.y - py) ** 2;
}

/** Flatten a link path (straight/quad/cubic) into a polyline for hit tests and midpoints. */
export function flattenLinkPath(headPt: Pt, tailPt: Pt, ctrl0: Pt | null, ctrl1: Pt | null): Pt[] {
  if (ctrl0 && ctrl1) {
    const pts: Pt[] = [];
    const STEPS = 24;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const mt = 1 - t;
      pts.push({
        x: mt ** 3 * headPt.x + 3 * mt * mt * t * ctrl0.x + 3 * mt * t * t * ctrl1.x + t ** 3 * tailPt.x,
        y: mt ** 3 * headPt.y + 3 * mt * mt * t * ctrl0.y + 3 * mt * t * t * ctrl1.y + t ** 3 * tailPt.y,
      });
    }
    return pts;
  }
  if (ctrl0) {
    const pts: Pt[] = [];
    const STEPS = 18;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const mt = 1 - t;
      pts.push({
        x: mt * mt * headPt.x + 2 * mt * t * ctrl0.x + t * t * tailPt.x,
        y: mt * mt * headPt.y + 2 * mt * t * ctrl0.y + t * t * tailPt.y,
      });
    }
    return pts;
  }
  return [headPt, tailPt];
}

/** Midpoint of a link path (label anchor): curve midpoint for curves, segment middle otherwise. */
export function linkMidpoint(headPt: Pt, tailPt: Pt, ctrl0: Pt | null, ctrl1: Pt | null): Pt {
  if (ctrl0 && ctrl1) {
    // de Casteljau midpoint of cubic
    const m = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const ab = m(headPt, ctrl0), bc = m(ctrl0, ctrl1), cd = m(ctrl1, tailPt);
    return m(m(ab, bc), m(bc, cd));
  }
  if (ctrl0) {
    const m = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    return m(m(headPt, ctrl0), m(ctrl0, tailPt));
  }
  return { x: (headPt.x + tailPt.x) / 2, y: (headPt.y + tailPt.y) / 2 };
}
