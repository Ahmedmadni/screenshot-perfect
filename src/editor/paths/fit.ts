/**
 * Curve fitting: Schneider's least-squares cubic fitting ("An Algorithm for
 * Automatically Fitting Digitized Curves", Graphics Gems 1990). Used to simplify
 * freehand strokes and to merge two segments when a node is deleted.
 */
import type { PathNode } from "../model";
import { add, cubicAt, cubicDeriv, cubicDeriv2, dist, dot, isZero, mul, norm, sub, type Cubic, type Vec } from "./geometry";

export function chordParams(points: Vec[]): number[] {
  const u = [0];
  for (let i = 1; i < points.length; i++) u.push(u[i - 1]! + dist(points[i]!, points[i - 1]!));
  const total = u[u.length - 1]!;
  return total > 0 ? u.map((x) => x / total) : u.map((_, i) => i / Math.max(1, points.length - 1));
}

/** Least-squares cubic through points with fixed endpoints and unit end tangents (t2 points backwards). */
export function generateBezier(points: Vec[], params: number[], t1: Vec, t2: Vec): Cubic {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;
  const base: Cubic = [first, first, last, last];
  params.forEach((u, i) => {
    const a0 = mul(t1, 3 * (1 - u) * (1 - u) * u);
    const a1 = mul(t2, 3 * (1 - u) * u * u);
    c00 += dot(a0, a0);
    c01 += dot(a0, a1);
    c11 += dot(a1, a1);
    const tmp = sub(points[i]!, cubicAt(base, u));
    x0 += dot(a0, tmp);
    x1 += dot(a1, tmp);
  });
  const det = c00 * c11 - c01 * c01;
  let al = det === 0 ? 0 : (x0 * c11 - x1 * c01) / det;
  let ar = det === 0 ? 0 : (c00 * x1 - c01 * x0) / det;
  const seg = dist(first, last);
  const eps = 1e-6 * seg;
  if (al < eps || ar < eps) {
    al = seg / 3;
    ar = seg / 3;
  }
  return [first, add(first, mul(t1, al)), add(last, mul(t2, ar)), last];
}

function maxError(points: Vec[], c: Cubic, params: number[]): { err: number; split: number } {
  let err = 0;
  let split = Math.floor(points.length / 2);
  params.forEach((u, i) => {
    const d = dist(cubicAt(c, u), points[i]!) ** 2;
    if (d > err) [err, split] = [d, i];
  });
  return { err, split: Math.min(points.length - 2, Math.max(1, split)) };
}

function reparameterize(c: Cubic, points: Vec[], params: number[]): number[] {
  return params.map((u, i) => {
    const d = sub(cubicAt(c, u), points[i]!);
    const d1 = cubicDeriv(c, u);
    const d2 = cubicDeriv2(c, u);
    const den = dot(d1, d1) + dot(d, d2);
    return Math.abs(den) < 1e-12 ? u : Math.min(1, Math.max(0, u - dot(d, d1) / den));
  });
}

/** One cubic best fitting the points (endpoint tangents fixed), refined by Newton reparameterization. */
export function fitSingle(points: Vec[], t1: Vec, t2: Vec, iterations = 8): Cubic {
  let params = chordParams(points);
  let c = generateBezier(points, params, t1, t2);
  for (let i = 0; i < iterations; i++) {
    params = reparameterize(c, points, params);
    c = generateBezier(points, params, t1, t2);
  }
  return c;
}

function fitCubic(points: Vec[], t1: Vec, t2: Vec, errSq: number, depth: number): Cubic[] {
  if (points.length === 2) {
    const d = dist(points[0]!, points[1]!) / 3;
    return [[points[0]!, add(points[0]!, mul(t1, d)), add(points[1]!, mul(t2, d)), points[1]!]];
  }
  let params = chordParams(points);
  let c = generateBezier(points, params, t1, t2);
  let { err, split } = maxError(points, c, params);
  if (err < errSq) return [c];
  if (err < errSq * 16) {
    for (let i = 0; i < 20; i++) {
      params = reparameterize(c, points, params);
      c = generateBezier(points, params, t1, t2);
      ({ err, split } = maxError(points, c, params));
      if (err < errSq) return [c];
    }
  }
  if (depth > 24) return [c];
  let center = sub(points[split - 1]!, points[split + 1]!);
  if (isZero(center)) {
    const d = sub(points[split - 1]!, points[split]!);
    center = [-d[1], d[0]];
  }
  const tc = norm(center);
  return [...fitCubic(points.slice(0, split + 1), t1, tc, errSq, depth + 1), ...fitCubic(points.slice(split), mul(tc, -1), t2, errSq, depth + 1)];
}

/** Removes consecutive points closer than `minGap`. */
export function dedupe(points: Vec[], minGap = 0.01): Vec[] {
  const out: Vec[] = [];
  for (const p of points) if (!out.length || dist(out[out.length - 1]!, p) > minGap) out.push(p);
  return out;
}

/** Fits a polyline (e.g. a freehand stroke) with as few cubics as the tolerance allows. */
export function fitCurve(raw: Vec[], tolerance: number): Cubic[] {
  const points = dedupe(raw);
  if (points.length < 2) return [];
  const t1 = norm(sub(points[1]!, points[0]!));
  const t2 = norm(sub(points[points.length - 2]!, points[points.length - 1]!));
  return fitCubic(points, t1, t2, tolerance * tolerance, 0);
}

/** Chains cubics (each starting where the previous ends) into path nodes. */
export function cubicsToNodes(cubics: Cubic[]): PathNode[] {
  if (!cubics.length) return [];
  const nodes: PathNode[] = [{ x: cubics[0]![0][0], y: cubics[0]![0][1], in: [0, 0], out: sub(cubics[0]![1], cubics[0]![0]), type: "corner" }];
  cubics.forEach((c, i) => {
    const next = cubics[i + 1];
    nodes.push({ x: c[3][0], y: c[3][1], in: sub(c[2], c[3]), out: next ? sub(next[1], next[0]) : [0, 0], type: next ? "smooth" : "corner" });
  });
  return nodes;
}

/** Curvature-tool point: the curve passes through it; tangent is automatic unless dragged. */
export interface CurvePoint {
  x: number;
  y: number;
  corner?: boolean | undefined;
  tangent?: Vec | undefined;
}

/** Smooth interpolating nodes (Catmull-Rom style tangents) through curvature-tool points. */
export function curvatureNodes(pts: CurvePoint[], closed: boolean): PathNode[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const prev = i > 0 ? pts[i - 1] : closed && n > 2 ? pts[n - 1] : undefined;
    const next = i < n - 1 ? pts[i + 1] : closed && n > 2 ? pts[0] : undefined;
    if (p.corner || n < 2) return { x: p.x, y: p.y, in: [0, 0], out: [0, 0], type: "corner" };
    const here: Vec = [p.x, p.y];
    const pv: Vec | null = prev ? [prev.x, prev.y] : null;
    const nv: Vec | null = next ? [next.x, next.y] : null;
    let dir: Vec;
    if (p.tangent && !isZero(p.tangent)) dir = norm(p.tangent);
    else if (pv && nv) dir = norm(sub(nv, pv));
    else if (nv) dir = norm(sub(nv, here));
    else dir = norm(sub(here, pv!));
    const lin = pv ? dist(here, pv) / 3 : 0;
    const lout = nv ? dist(here, nv) / 3 : 0;
    return { x: p.x, y: p.y, in: mul(dir, -lin), out: mul(dir, lout), type: "smooth" };
  });
}
