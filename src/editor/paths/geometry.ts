/**
 * Cubic Bézier geometry for path objects: evaluation, splitting, exact bounds,
 * SVG path data and nearest-point search. Pure functions, no DOM.
 */
import type { Contour, PathNode } from "../model";

export type Vec = [number, number];
export type Cubic = [Vec, Vec, Vec, Vec];

const EPS = 1e-9;
export const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s];
export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];
export const len = (a: Vec) => Math.hypot(a[0], a[1]);
export const dist = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const isZero = (a: Vec) => Math.abs(a[0]) < EPS && Math.abs(a[1]) < EPS;
export const norm = (a: Vec): Vec => {
  const l = len(a);
  return l < EPS ? [0, 0] : [a[0] / l, a[1] / l];
};

export function cubicAt(c: Cubic, t: number): Vec {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const d = 3 * mt * t * t;
  const e = t * t * t;
  return [a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0], a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1]];
}

export function cubicDeriv(c: Cubic, t: number): Vec {
  const mt = 1 - t;
  const a = 3 * mt * mt;
  const b = 6 * mt * t;
  const d = 3 * t * t;
  return [
    a * (c[1][0] - c[0][0]) + b * (c[2][0] - c[1][0]) + d * (c[3][0] - c[2][0]),
    a * (c[1][1] - c[0][1]) + b * (c[2][1] - c[1][1]) + d * (c[3][1] - c[2][1]),
  ];
}

export function cubicDeriv2(c: Cubic, t: number): Vec {
  const mt = 1 - t;
  return [
    6 * mt * (c[2][0] - 2 * c[1][0] + c[0][0]) + 6 * t * (c[3][0] - 2 * c[2][0] + c[1][0]),
    6 * mt * (c[2][1] - 2 * c[1][1] + c[0][1]) + 6 * t * (c[3][1] - 2 * c[2][1] + c[1][1]),
  ];
}

/** De Casteljau split at t; the two halves trace exactly the original curve. */
export function splitCubic(c: Cubic, t: number): [Cubic, Cubic] {
  const lerp = (a: Vec, b: Vec): Vec => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const p01 = lerp(c[0], c[1]);
  const p12 = lerp(c[1], c[2]);
  const p23 = lerp(c[2], c[3]);
  const p012 = lerp(p01, p12);
  const p123 = lerp(p12, p23);
  const m = lerp(p012, p123);
  return [
    [c[0], p01, p012, m],
    [m, p123, p23, c[3]],
  ];
}

/** Parameters in (0,1) where the curve's x or y derivative is zero. */
function extrema(c: Cubic): number[] {
  const out: number[] = [];
  for (const k of [0, 1] as const) {
    const p0 = c[0][k];
    const p1 = c[1][k];
    const p2 = c[2][k];
    const p3 = c[3][k];
    const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3);
    const b = 6 * (p0 - 2 * p1 + p2);
    const cc = 3 * (p1 - p0);
    if (Math.abs(a) < 1e-12) {
      if (Math.abs(b) > 1e-12) out.push(-cc / b);
      continue;
    }
    const disc = b * b - 4 * a * cc;
    if (disc < 0) continue;
    const s = Math.sqrt(disc);
    out.push((-b + s) / (2 * a), (-b - s) / (2 * a));
  }
  return out.filter((t) => t > 0 && t < 1);
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Exact (not control-polygon) bounding box of a cubic. */
export function cubicBounds(c: Cubic): Bounds {
  const pts = [c[0], c[3], ...extrema(c).map((t) => cubicAt(c, t))];
  return {
    minX: Math.min(...pts.map((p) => p[0])),
    minY: Math.min(...pts.map((p) => p[1])),
    maxX: Math.max(...pts.map((p) => p[0])),
    maxY: Math.max(...pts.map((p) => p[1])),
  };
}

export const anchor = (n: PathNode): Vec => [n.x, n.y];

export function segmentCount(ct: Contour): number {
  const n = ct.nodes.length;
  if (n < 2) return 0;
  return ct.closed ? n : n - 1;
}

/** Cubic for segment k (node k → node k+1, wrapping on closed contours). */
export function segment(ct: Contour, k: number): Cubic {
  const n = ct.nodes.length;
  const a = ct.nodes[k]!;
  const b = ct.nodes[(k + 1) % n]!;
  return [
    [a.x, a.y],
    [a.x + a.out[0], a.y + a.out[1]],
    [b.x + b.in[0], b.y + b.in[1]],
    [b.x, b.y],
  ];
}

export function isStraight(ct: Contour, k: number): boolean {
  const n = ct.nodes.length;
  return isZero(ct.nodes[k]!.out) && isZero(ct.nodes[(k + 1) % n]!.in);
}

export function contoursBounds(contours: Contour[]): Bounds | null {
  let b: Bounds | null = null;
  const grow = (o: Bounds) => {
    b = b ? { minX: Math.min(b.minX, o.minX), minY: Math.min(b.minY, o.minY), maxX: Math.max(b.maxX, o.maxX), maxY: Math.max(b.maxY, o.maxY) } : o;
  };
  for (const ct of contours) {
    for (const n of ct.nodes) grow({ minX: n.x, minY: n.y, maxX: n.x, maxY: n.y });
    for (let k = 0; k < segmentCount(ct); k++) if (!isStraight(ct, k)) grow(cubicBounds(segment(ct, k)));
  }
  return b;
}

const f = (n: number) => {
  const s = (Math.abs(n) < 1e-9 ? 0 : n).toFixed(3).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
};

/** SVG path data (absolute M/L/C/Z). Straight segments are written as L. */
export function contourToD(ct: Contour): string {
  const ns = ct.nodes;
  if (!ns.length) return "";
  const parts = [`M${f(ns[0]!.x)} ${f(ns[0]!.y)}`];
  for (let k = 0; k < segmentCount(ct); k++) {
    const c = segment(ct, k);
    if (isStraight(ct, k)) {
      // The closing straight segment is drawn by Z itself.
      if (!(ct.closed && k === ns.length - 1)) parts.push(`L${f(c[3][0])} ${f(c[3][1])}`);
    } else parts.push(`C${f(c[1][0])} ${f(c[1][1])} ${f(c[2][0])} ${f(c[2][1])} ${f(c[3][0])} ${f(c[3][1])}`);
  }
  if (ct.closed) parts.push("Z");
  return parts.join("");
}

export const contoursToD = (contours: Contour[]) => contours.map(contourToD).filter(Boolean).join("");

export interface NearestHit {
  contour: number;
  seg: number;
  t: number;
  point: Vec;
  distance: number;
}

/** Closest point on any segment: coarse sampling refined by Newton iterations. */
export function nearestOnPath(contours: Contour[], p: Vec): NearestHit | null {
  let best: NearestHit | null = null;
  contours.forEach((ct, ci) => {
    for (let k = 0; k < segmentCount(ct); k++) {
      const c = segment(ct, k);
      let bt = 0;
      let bd = Infinity;
      const N = 32;
      for (let i = 0; i <= N; i++) {
        const d = dist(cubicAt(c, i / N), p);
        if (d < bd) [bd, bt] = [d, i / N];
      }
      let t = bt;
      for (let it = 0; it < 6; it++) {
        const q = sub(cubicAt(c, t), p);
        const d1 = cubicDeriv(c, t);
        const d2 = cubicDeriv2(c, t);
        const den = dot(d1, d1) + dot(q, d2);
        if (Math.abs(den) < 1e-12) break;
        t = Math.min(1, Math.max(0, t - dot(q, d1) / den));
      }
      const pt = cubicAt(c, t);
      const d = dist(pt, p);
      if (d > bd) [t] = [bt];
      const fd = Math.min(d, bd);
      if (!best || fd < best.distance) best = { contour: ci, seg: k, t, point: cubicAt(c, t), distance: fd };
    }
  });
  return best;
}
