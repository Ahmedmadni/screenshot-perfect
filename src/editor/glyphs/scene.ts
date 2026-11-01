/**
 * Renderer-neutral vector scene. Shapes and glyph outlines become paths with
 * affine matrices; the outline SVG and PDF writers both consume this, so they
 * cannot drift apart.
 */
import { shapePath, type FillRule, type LineCap, type LineJoin, type PathObject, type ProjectDoc, type TextObject } from "../model";
import { contoursToD } from "../paths/geometry";
import type { TextLayout } from "./layout";

export type Mat = [number, number, number, number, number, number];

export interface ScenePath {
  d: string;
  m: Mat;
  fill: string | null;
  stroke: string | null;
  /** In the path's own (pre-matrix) units. */
  strokeWidth: number;
  /** Defaults: nonzero fill, butt caps, round joins. */
  fillRule?: FillRule | undefined;
  lineCap?: LineCap | undefined;
  lineJoin?: LineJoin | undefined;
}

export function pathObjectPath(o: PathObject): ScenePath {
  return {
    d: contoursToD(o.contours),
    m: [1, 0, 0, 1, 0, 0],
    fill: color(o.fill),
    stroke: o.strokeWidth > 0 ? color(o.stroke) : null,
    strokeWidth: o.strokeWidth,
    fillRule: o.fillRule,
    lineCap: o.lineCap,
    lineJoin: o.lineJoin,
  };
}

export interface SceneObject {
  id: string;
  name: string;
  /** Original text for text objects (kept as metadata in exports). */
  text?: string | undefined;
  m: Mat;
  opacity: number;
  paths: ScenePath[];
}

export interface Scene {
  width: number;
  height: number;
  background: string | null;
  objects: SceneObject[];
}

export function objectMatrix(o: { x: number; y: number; rotation: number; scaleX?: number; scaleY?: number }): Mat {
  const r = (o.rotation * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const sx = o.scaleX ?? 1;
  const sy = o.scaleY ?? 1;
  return [c * sx, s * sx, -s * sy, c * sy, o.x, o.y];
}

const color = (c: string) => (c === "transparent" ? null : c);

export function textPaths(o: TextObject, layout: TextLayout): ScenePath[] {
  return layout.glyphs
    .filter((g) => g.d)
    .map((g) => ({
      d: g.d,
      m: [g.k * g.sx, 0, 0, -g.k * g.sy, g.tx, g.ty] as Mat,
      fill: color(o.color),
      stroke: layout.boldStroke || o.strokeWidth > 0 || g.thickness > 0 ? color(o.color) : null,
      strokeWidth: Math.max(layout.boldStroke ? layout.boldStroke / g.k : 0, o.strokeWidth / Math.max(g.k, 0.0001), g.thickness / Math.max(g.k, 0.0001)),
    }));
}

export function buildScene(doc: ProjectDoc, layoutFor: (o: TextObject) => TextLayout): Scene {
  return {
    width: doc.width,
    height: doc.height,
    background: doc.transparentBackground ? null : doc.background,
    objects: doc.objects
      .filter((o) => !o.hidden)
      .map((o) => ({
        id: o.id,
        name: o.name,
        text: o.type === "text" ? o.text : undefined,
        m: objectMatrix(o),
        opacity: o.opacity,
        paths:
          o.type === "shape"
            ? [
                {
                  d: shapePath(o.shape, o.width, o.height, o.cornerRadius),
                  m: [1, 0, 0, 1, 0, 0] as Mat,
                  fill: color(o.fill),
                  stroke: o.strokeWidth > 0 ? color(o.stroke) : null,
                  strokeWidth: o.strokeWidth,
                },
              ]
            : o.type === "path"
              ? [pathObjectPath(o)]
              : textPaths(o, layoutFor(o)),
      })),
  };
}

export const fmt = (n: number) => {
  const s = (Math.abs(n) < 1e-9 ? 0 : n).toFixed(3).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const matAttr = (m: Mat) => `matrix(${m.map(fmt).join(" ")})`;

export function pathToSvg(p: ScenePath): string {
  const stroke = p.stroke
    ? ` stroke="${esc(p.stroke)}" stroke-width="${fmt(p.strokeWidth)}" stroke-linejoin="${p.lineJoin ?? "round"}"${p.lineCap && p.lineCap !== "butt" ? ` stroke-linecap="${p.lineCap}"` : ""}`
    : "";
  const rule = p.fillRule === "evenodd" ? ` fill-rule="evenodd"` : "";
  return `<path transform="${matAttr(p.m)}" d="${p.d}" fill="${p.fill ? esc(p.fill) : "none"}"${rule}${stroke}/>`;
}

/** Outline SVG: every glyph is a path, so no font is needed to view it. */
export function sceneToSvg(scene: Scene, title: string): string {
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}">`);
  out.push(`<title>${esc(title)}</title>`);
  if (scene.background) out.push(`<rect width="${scene.width}" height="${scene.height}" fill="${esc(scene.background)}"/>`);
  for (const o of scene.objects) {
    const label = o.text !== undefined ? ` role="img" aria-label="${esc(o.text)}"` : "";
    out.push(`<g transform="${matAttr(o.m)}"${o.opacity < 1 ? ` opacity="${fmt(o.opacity)}"` : ""}${label}>`);
    for (const p of o.paths) out.push(pathToSvg(p));
    out.push("</g>");
  }
  out.push("</svg>");
  return out.join("\n");
}
