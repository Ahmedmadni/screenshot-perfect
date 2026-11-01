/**
 * Immutable editing operations on path contours: handle constraints, node type
 * conversion, insertion/deletion, closing, transforms and normalization.
 */
import { uid, type Contour, type EditorObject, type NodeType, type PathNode, type PathObject, type ProjectDoc } from "../model";
import { contoursBounds, cubicAt, dist, isStraight, isZero, len, mul, norm, segment, splitCubic, sub, type Vec } from "./geometry";
import { fitSingle } from "./fit";

export type HandleSide = "in" | "out";
/** A node address: [contour index, node index]. */
export type NodeRef = [number, number];

const EPS = 1e-9;

/**
 * Moves one handle to offset `v`, then applies the node's constraint to the
 * opposite handle. `independent` (Alt held) temporarily behaves like a corner.
 */
export function moveHandle(node: PathNode, side: HandleSide, v: Vec, independent = false): PathNode {
  const other: HandleSide = side === "in" ? "out" : "in";
  const next: PathNode = { ...node, [side]: v };
  if (independent || node.type === "corner") return next;
  if (node.type === "symmetric") return { ...next, [other]: mul(v, -1) };
  // smooth: keep the opposite handle's length, align it opposite to v
  const l = len(node[other]);
  if (l < EPS || len(v) < EPS) return next;
  return { ...next, [other]: mul(norm(v), -l) };
}

function neighbours(ct: Contour, i: number): { prev: PathNode | undefined; next: PathNode | undefined } {
  const n = ct.nodes.length;
  const prev = i > 0 ? ct.nodes[i - 1] : ct.closed && n > 1 ? ct.nodes[n - 1] : undefined;
  const next = i < n - 1 ? ct.nodes[i + 1] : ct.closed && n > 1 ? ct.nodes[0] : undefined;
  return { prev, next };
}

/** Changes a node's behaviour, adjusting handles so the constraint holds. */
export function convertNode(ct: Contour, i: number, type: NodeType): Contour {
  const node = ct.nodes[i];
  if (!node) return ct;
  let { in: hin, out: hout } = node;
  if (type !== "corner") {
    const here: Vec = [node.x, node.y];
    const { prev, next } = neighbours(ct, i);
    const pv: Vec | null = prev ? [prev.x, prev.y] : null;
    const nv: Vec | null = next ? [next.x, next.y] : null;
    let lin = len(hin);
    let lout = len(hout);
    let dir: Vec;
    if (lin > EPS && lout > EPS) dir = norm(sub(norm(hout), norm(hin)));
    else if (lout > EPS) dir = norm(hout);
    else if (lin > EPS) dir = mul(norm(hin), -1);
    else if (pv && nv) dir = norm(sub(nv, pv));
    else if (nv) dir = norm(sub(nv, here));
    else if (pv) dir = norm(sub(here, pv));
    else dir = [1, 0];
    if (isZero(dir)) dir = [1, 0];
    if (lin < EPS && pv) lin = dist(here, pv) / 3;
    if (lout < EPS && nv) lout = dist(here, nv) / 3;
    if (type === "symmetric") {
      const l = lin > EPS && lout > EPS ? (lin + lout) / 2 : Math.max(lin, lout);
      lin = lout = l;
    }
    hin = mul(dir, -lin);
    hout = mul(dir, lout);
  }
  return { ...ct, nodes: ct.nodes.map((n, j) => (j === i ? { ...n, type, in: hin, out: hout } : n)) };
}

/** Removes both handles, making a sharp corner with straight adjoining segment ends. */
export function retractHandles(ct: Contour, i: number): Contour {
  return { ...ct, nodes: ct.nodes.map((n, j) => (j === i ? { ...n, type: "corner", in: [0, 0], out: [0, 0] } : n)) };
}

/** Inserts a node on segment k at parameter t without changing the curve's shape. */
export function insertNode(ct: Contour, k: number, t: number): { contour: Contour; index: number } {
  const n = ct.nodes.length;
  const a = ct.nodes[k]!;
  const bi = (k + 1) % n;
  const b = ct.nodes[bi]!;
  const c = segment(ct, k);
  const straight = isStraight(ct, k);
  const [l, r] = splitCubic(c, t);
  const m = l[3];
  const mid: PathNode = straight
    ? { x: m[0], y: m[1], in: [0, 0], out: [0, 0], type: "corner" }
    : { x: m[0], y: m[1], in: sub(l[2], m), out: sub(r[1], m), type: "smooth" };
  const nodes = ct.nodes.map((nd, j) => {
    if (straight) return nd;
    if (j === k) return { ...a, out: sub(l[1], l[0]) };
    if (j === bi) return { ...b, in: sub(r[2], r[3]) };
    return nd;
  });
  nodes.splice(k + 1, 0, mid);
  return { contour: { ...ct, nodes }, index: k + 1 };
}

/** Removes one node, refitting the merged segment so the shape stays as close as possible. */
function deleteOne(ct: Contour, i: number): Contour | null {
  const n = ct.nodes.length;
  // A single remaining node cannot draw anything.
  if (n <= 2) return null;
  const isEnd = !ct.closed && (i === 0 || i === n - 1);
  if (isEnd) {
    const nodes = ct.nodes.filter((_, j) => j !== i);
    // The new endpoint's outer handle no longer belongs to any segment.
    if (i === 0) nodes[0] = { ...nodes[0]!, in: [0, 0] };
    else nodes[nodes.length - 1] = { ...nodes[nodes.length - 1]!, out: [0, 0] };
    return { ...ct, nodes };
  }
  const pi = (i - 1 + n) % n;
  const ni = (i + 1) % n;
  const prev = ct.nodes[pi]!;
  const next = ct.nodes[ni]!;
  const s1 = pi;
  let pOut: Vec = [0, 0];
  let nIn: Vec = [0, 0];
  if (!(isStraight(ct, s1) && isStraight(ct, i))) {
    // Sample both original segments and fit one cubic with the outer tangents fixed.
    const pts: Vec[] = [];
    const c1 = segment(ct, s1);
    const c2 = segment(ct, i);
    const N = 24;
    for (let s = 0; s <= N; s++) pts.push(cubicAt(c1, s / N));
    for (let s = 1; s <= N; s++) pts.push(cubicAt(c2, s / N));
    const t1 = isZero(prev.out) ? norm(sub(pts[1]!, pts[0]!)) : norm(prev.out);
    const t2 = isZero(next.in) ? norm(sub(pts[pts.length - 2]!, pts[pts.length - 1]!)) : norm(next.in);
    const fit = fitSingle(pts, t1, t2);
    pOut = sub(fit[1], fit[0]);
    nIn = sub(fit[2], fit[3]);
  }
  const nodes = ct.nodes.map((nd, j) => (j === pi ? { ...nd, out: pOut } : j === ni ? { ...nd, in: nIn } : nd)).filter((_, j) => j !== i);
  return { ...ct, nodes };
}

/** Deletes several nodes of one contour (highest index first). Returns null when the contour vanishes. */
export function deleteNodes(ct: Contour, indices: number[]): Contour | null {
  let cur: Contour | null = ct;
  for (const i of [...new Set(indices)].sort((a, b) => b - a)) {
    if (!cur) break;
    cur = deleteOne(cur, i);
  }
  return cur && cur.nodes.length ? cur : null;
}

export function setClosed(ct: Contour, closed: boolean): Contour {
  if (closed && ct.nodes.length < 2) return ct;
  return { ...ct, closed };
}

export const moveNode = (n: PathNode, d: Vec): PathNode => ({ ...n, x: n.x + d[0], y: n.y + d[1] });

export function moveNodes(contours: Contour[], sel: NodeRef[], d: Vec): Contour[] {
  const set = new Set(sel.map(([c, i]) => `${c}:${i}`));
  return contours.map((ct, c) => ({ ...ct, nodes: ct.nodes.map((n, i) => (set.has(`${c}:${i}`) ? moveNode(n, d) : n)) }));
}

export function scaleContours(contours: Contour[], sx: number, sy: number): Contour[] {
  return contours.map((ct) => ({
    ...ct,
    nodes: ct.nodes.map((n) => ({ ...n, x: n.x * sx, y: n.y * sy, in: [n.in[0] * sx, n.in[1] * sy], out: [n.out[0] * sx, n.out[1] * sy] })),
  }));
}

/** Converts a doc-space vector to object-local space (undoing rotation). */
export function toLocalVec(o: { rotation: number }, v: Vec): Vec {
  const r = (-o.rotation * Math.PI) / 180;
  return [v[0] * Math.cos(r) - v[1] * Math.sin(r), v[0] * Math.sin(r) + v[1] * Math.cos(r)];
}

export function toLocalPoint(o: { x: number; y: number; rotation: number }, p: Vec): Vec {
  return toLocalVec(o, [p[0] - o.x, p[1] - o.y]);
}

/**
 * Re-centres the path on its bounding-box centre without moving it on the
 * canvas, so selection boxes, rotation and resizing pivot on the visual centre.
 */
export function normalizePath(o: PathObject): PathObject {
  const b = contoursBounds(o.contours);
  if (!b) return o;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  if (Math.abs(cx) < 1e-6 && Math.abs(cy) < 1e-6) return o;
  const r = (o.rotation * Math.PI) / 180;
  const shift: Vec = [cx * Math.cos(r) - cy * Math.sin(r), cx * Math.sin(r) + cy * Math.cos(r)];
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return {
    ...o,
    x: round(o.x + shift[0]),
    y: round(o.y + shift[1]),
    contours: o.contours.map((ct) => ({ ...ct, nodes: ct.nodes.map((n) => ({ ...n, x: round(n.x - cx), y: round(n.y - cy) })) })),
  };
}

export const PATH_STYLE = {
  fill: "transparent",
  stroke: "#a0703a",
  strokeWidth: 4,
  fillRule: "nonzero",
  lineCap: "round",
  lineJoin: "round",
} as const satisfies Partial<PathObject>;

/** Builds a path object from contours given in document coordinates. */
export function createPathObject(contours: Contour[], partial: Partial<PathObject> = {}): PathObject {
  return normalizePath({
    id: uid(),
    type: "path",
    name: "Path",
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    hidden: false,
    locked: false,
    ...PATH_STYLE,
    contours,
    ...partial,
  });
}

/** Applies `fn` to the path object `id` in a doc (no-op for other types). */
export function mapPath(doc: ProjectDoc, id: string, fn: (o: PathObject) => PathObject | null): ProjectDoc {
  const objects: EditorObject[] = [];
  for (const o of doc.objects) {
    if (o.id !== id || o.type !== "path") objects.push(o);
    else {
      const r = fn(o);
      if (r && r.contours.length) objects.push(r);
    }
  }
  return { ...doc, objects };
}

/** Removes the selected nodes across contours; contours that vanish are dropped. */
export function deleteSelectedNodes(o: PathObject, sel: NodeRef[]): PathObject {
  const contours: Contour[] = [];
  o.contours.forEach((ct, c) => {
    const idx = sel.filter(([sc]) => sc === c).map(([, i]) => i);
    if (!idx.length) {
      contours.push(ct);
      return;
    }
    const r = deleteNodes(ct, idx);
    if (r) contours.push(r);
  });
  return normalizePath({ ...o, contours });
}


/** Applies a node constraint to a selection spanning any number of contours. */
export function convertNodes(contours: Contour[], sel: NodeRef[], type: NodeType): Contour[] {
  const grouped = new Map<number, number[]>();
  for (const [ci, ni] of sel) {
    const indices = grouped.get(ci) ?? [];
    indices.push(ni);
    grouped.set(ci, indices);
  }
  return contours.map((ct, ci) => {
    const indices = grouped.get(ci);
    if (!indices?.length) return ct;
    return [...new Set(indices)].sort((a, b) => a - b).reduce((current, ni) => convertNode(current, ni, type), ct);
  });
}


/** Moves the same side of every selected node, preserving each node's handle constraint. */
export function moveHandles(contours: Contour[], sel: NodeRef[], side: HandleSide, delta: Vec, independent = false): Contour[] {
  const selected = new Set(sel.map(([ci, ni]) => `${ci}:${ni}`));
  return contours.map((ct, ci) => ({
    ...ct,
    nodes: ct.nodes.map((node, ni) => {
      if (!selected.has(`${ci}:${ni}`)) return node;
      const handle = node[side];
      if (isZero(handle)) return node;
      return moveHandle(node, side, [handle[0] + delta[0], handle[1] + delta[1]], independent);
    }),
  }));
}
