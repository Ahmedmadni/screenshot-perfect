/**
 * Conversions into editable path contours: shapes and shaped glyph outlines.
 * Text conversion is explicit and opt-in; the original text object is kept.
 */
import { parsePath, type Seg } from "../glyphs/svgpath";
import type { Mat } from "../glyphs/scene";
import { shapePath, type Contour, type PathNode, type PathObject, type ShapeObject, type TextObject } from "../model";
import type { TextLayout } from "../glyphs/layout";
import { textPaths } from "../glyphs/scene";
import { dist, len, type Vec } from "./geometry";
import { createPathObject } from "./edit";

const apply = (m: Mat, p: Vec): Vec => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];

function classify(n: PathNode): PathNode {
  const li = len(n.in);
  const lo = len(n.out);
  if (li < 1e-6 || lo < 1e-6) return { ...n, type: "corner" };
  const cross = n.in[0] * n.out[1] - n.in[1] * n.out[0];
  const dotp = n.in[0] * n.out[0] + n.in[1] * n.out[1];
  if (Math.abs(cross) / (li * lo) > 1e-3 || dotp > 0) return { ...n, type: "corner" };
  return { ...n, type: Math.abs(li - lo) < 1e-3 * Math.max(li, lo) ? "symmetric" : "smooth" };
}

/** Absolute M/L/C/Z segments → contours, optionally transformed by an affine matrix. */
export function segsToContours(segs: Seg[], m: Mat = [1, 0, 0, 1, 0, 0]): Contour[] {
  const out: Contour[] = [];
  let cur: Contour | null = null;
  let start: Vec = [0, 0];
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const node = (p: Vec, hin: Vec = p): PathNode => ({ x: r(p[0]), y: r(p[1]), in: [r(hin[0] - p[0]), r(hin[1] - p[1])], out: [0, 0], type: "corner" });
  const open = (p: Vec) => {
    cur = { nodes: [node(p)], closed: false };
    out.push(cur);
  };
  for (const s of segs) {
    if (s.op === "M") {
      start = apply(m, s.p);
      open(start);
      continue;
    }
    if (s.op === "Z") {
      const c = cur as Contour | null;
      if (c && c.nodes.length) {
        const first = c.nodes[0]!;
        const last = c.nodes[c.nodes.length - 1]!;
        if (c.nodes.length > 1 && dist([first.x, first.y], [last.x, last.y]) < 1e-3) {
          c.nodes[0] = { ...first, in: last.in };
          c.nodes.pop();
        }
        c.closed = c.nodes.length > 1;
      }
      cur = null;
      continue;
    }
    if (!cur) open(start);
    const c = cur as unknown as Contour;
    if (s.op === "L") c.nodes.push(node(apply(m, s.p)));
    else if (s.op === "C") {
      const p = apply(m, s.p);
      const prev = c.nodes[c.nodes.length - 1]!;
      const c1 = apply(m, s.c1);
      c.nodes[c.nodes.length - 1] = { ...prev, out: [r(c1[0] - prev.x), r(c1[1] - prev.y)] };
      c.nodes.push(node(p, apply(m, s.c2)));
    }
  }
  return out.filter((c) => c.nodes.length > 0).map((c) => ({ ...c, nodes: c.nodes.map(classify) }));
}

export function shapeToPath(o: ShapeObject): PathObject {
  const contours = segsToContours(parsePath(shapePath(o.shape, o.width, o.height, o.cornerRadius)));
  const local = createPathObject(contours, { fill: o.fill, stroke: o.stroke, strokeWidth: o.strokeWidth, lineJoin: "round", name: `${o.name} (path)` });
  return placeLocal(local, o);
}

/** Glyph outlines of a shaped text layout as one compound path (nonzero winding, as in the font). */
export function textToPath(o: TextObject, layout: TextLayout): PathObject {
  const contours = textPaths(o, layout).flatMap((p) => segsToContours(parsePath(p.d), p.m));
  const bold = layout.boldStroke ?? 0;
  const local = createPathObject(contours, {
    fill: o.color,
    stroke: bold ? o.color : "transparent",
    strokeWidth: bold,
    lineJoin: "round",
    fillRule: "nonzero",
    name: `${o.name} (outlines)`,
  });
  return placeLocal(local, o);
}

/** Contours were built around (0,0) in the source object's frame: move into place with its transform. */
function placeLocal(p: PathObject, src: { x: number; y: number; rotation: number; opacity: number }): PathObject {
  const r = (src.rotation * Math.PI) / 180;
  const ox = p.x * Math.cos(r) - p.y * Math.sin(r);
  const oy = p.x * Math.sin(r) + p.y * Math.cos(r);
  return { ...p, x: src.x + ox, y: src.y + oy, rotation: src.rotation, opacity: src.opacity };
}
