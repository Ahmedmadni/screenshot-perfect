/**
 * Export pipeline.
 *  - PNG: Canvas 2D. Plain text uses the browser's text engine (unchanged); text
 *    with OpenType overrides or diacritic adjustments is drawn from glyph-engine
 *    outlines because Canvas 2D cannot apply font-feature-settings.
 *  - Editable SVG: live <text> with embedded fonts (viewer-dependent).
 *  - Outline SVG and PDF: built from one vector Scene of glyph outlines, so they
 *    do not depend on fonts at all.
 */
import { fontService } from "./fonts";
import { featureCss } from "./calligraphy/features";
import { displayText, fontCss, lineAnchorX, lineOffsets, needsGlyphEngine, objectSize, shapePath, type ProjectDoc, type TextObject } from "./model";
import { glyphEngine } from "./glyphs/engine";
import type { TextLayout } from "./glyphs/layout";
import { buildScene, objectMatrix, pathToSvg, sceneToSvg, textPaths, matAttr } from "./glyphs/scene";
import { sceneToPdf, type PdfBackground, type PdfPage } from "./glyphs/pdf";

type LayoutFor = (o: TextObject) => TextLayout | null;

export function renderToCanvas(ctx: CanvasRenderingContext2D, doc: ProjectDoc, scale = 1, layoutFor: LayoutFor = () => null) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, doc.width, doc.height);
  if (!doc.transparentBackground) {
    ctx.fillStyle = doc.background;
    ctx.fillRect(0, 0, doc.width, doc.height);
  }
  for (const o of doc.objects) {
    if (o.hidden) continue;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate((o.rotation * Math.PI) / 180);
    ctx.globalAlpha = o.opacity;
    if (o.type === "shape") {
      const p = new Path2D(shapePath(o.shape, o.width, o.height, o.cornerRadius));
      if (o.fill !== "transparent") {
        ctx.fillStyle = o.fill;
        ctx.fill(p);
      }
      if (o.strokeWidth > 0 && o.stroke !== "transparent") {
        ctx.strokeStyle = o.stroke;
        ctx.lineWidth = o.strokeWidth;
        ctx.lineJoin = "round";
        ctx.stroke(p);
      }
    } else {
      const layout = needsGlyphEngine(o) ? layoutFor(o) : null;
      if (layout) drawGlyphs(ctx, o, layout);
      else drawText(ctx, o);
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawGlyphs(ctx: CanvasRenderingContext2D, o: TextObject, layout: TextLayout) {
  // Draw into an offscreen layer when translucent so overlapping glyphs don't double up.
  const paths = textPaths(o, layout);
  ctx.fillStyle = o.color;
  ctx.strokeStyle = o.color;
  ctx.lineJoin = "round";
  for (const p of paths) {
    ctx.save();
    ctx.transform(...p.m);
    const path = new Path2D(p.d);
    ctx.fill(path);
    if (p.stroke) {
      ctx.lineWidth = p.strokeWidth;
      ctx.stroke(path);
    }
    ctx.restore();
  }
}

function drawText(ctx: CanvasRenderingContext2D, o: TextObject) {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string; wordSpacing?: string };
  ctx.font = fontCss(o);
  ctx.direction = o.direction;
  ctx.textAlign = o.align;
  ctx.textBaseline = "middle";
  c.letterSpacing = `${o.letterSpacing}px`;
  c.wordSpacing = `${o.wordSpacing}px`;
  ctx.fillStyle = o.color;
  const { width } = objectSize(o);
  const ax = lineAnchorX(o, width);
  const offsets = lineOffsets(o);
  displayText(o)
    .split("\n")
    .forEach((line, i) => ctx.fillText(line, ax, offsets[i] ?? 0));
}

const usedFonts = (doc: ProjectDoc) => [...new Set(doc.objects.flatMap((o) => (o.type === "text" && !o.hidden ? [o.fontFamily] : [])))];
const visibleText = (doc: ProjectDoc) => doc.objects.filter((o): o is TextObject => o.type === "text" && !o.hidden);

/** Lays out text objects with the glyph engine; collects readable errors per font. */
async function collectLayouts(objs: TextObject[]): Promise<{ layouts: Map<string, TextLayout>; errors: string[] }> {
  const layouts = new Map<string, TextLayout>();
  const errors = new Set<string>();
  await Promise.all(
    objs.map(async (o) => {
      try {
        layouts.set(o.id, await glyphEngine.layoutAsync(o));
      } catch (e) {
        errors.add(`${o.fontFamily}: ${(e as Error).message}`);
      }
    }),
  );
  return { layouts, errors: [...errors] };
}

export interface ExportResult {
  blob: Blob;
  warnings: string[];
}

export async function exportPNG(doc: ProjectDoc, scale = 2): Promise<ExportResult> {
  await fontService.ensureLoaded(usedFonts(doc));
  const { layouts, errors } = await collectLayouts(visibleText(doc).filter(needsGlyphEngine));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(doc.width * scale);
  canvas.height = Math.round(doc.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  renderToCanvas(ctx, doc, scale, (o) => layouts.get(o.id) ?? null);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed."))), "image/png"));
  const warnings = errors.length ? [`OpenType settings and diacritic adjustments were not applied for: ${errors.join("; ")}`] : [];
  return { blob, warnings };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Editable SVG. Objects with diacritic adjustments are written as outlines when `outlined` has their layout. */
export function buildSvg(doc: ProjectDoc, fontCssBlocks: string[] = [], outlined: Map<string, TextLayout> = new Map()): string {
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}" height="${doc.height}" viewBox="0 0 ${doc.width} ${doc.height}">`);
  if (fontCssBlocks.length) parts.push(`<defs><style>${fontCssBlocks.join("\n")}</style></defs>`);
  if (!doc.transparentBackground) parts.push(`<rect width="${doc.width}" height="${doc.height}" fill="${esc(doc.background)}"/>`);
  for (const o of doc.objects) {
    if (o.hidden) continue;
    const t = `translate(${o.x} ${o.y}) rotate(${o.rotation})`;
    if (o.type === "shape") {
      parts.push(
        `<path transform="${t}" opacity="${o.opacity}" d="${shapePath(o.shape, o.width, o.height, o.cornerRadius)}" fill="${o.fill === "transparent" ? "none" : esc(o.fill)}" stroke="${o.strokeWidth > 0 ? esc(o.stroke) : "none"}" stroke-width="${o.strokeWidth}" stroke-linejoin="round"/>`,
      );
      continue;
    }
    const layout = outlined.get(o.id);
    if (layout) {
      parts.push(`<g transform="${matAttr(objectMatrix(o))}" opacity="${o.opacity}" role="img" aria-label="${esc(o.text)}">${textPaths(o, layout).map(pathToSvg).join("")}</g>`);
      continue;
    }
    const { width } = objectSize(o);
    const ax = lineAnchorX(o, width);
    const anchor = o.align === "center" ? "middle" : o.align;
    const offs = lineOffsets(o);
    const tspans = displayText(o)
      .split("\n")
      .map((line, i) => `<tspan x="${ax}" y="${offs[i]}">${esc(line)}</tspan>`)
      .join("");
    const ff = featureCss(o.features);
    parts.push(
      `<text transform="${t}" opacity="${o.opacity}" direction="${o.direction}" unicode-bidi="plaintext" text-anchor="${anchor}" dominant-baseline="central" font-family="&quot;${esc(o.fontFamily)}&quot;, serif" font-size="${o.fontSize}" font-weight="${o.fontWeight}" letter-spacing="${o.letterSpacing}" word-spacing="${o.wordSpacing}" fill="${esc(o.color)}"${ff ? ` style="font-feature-settings:${esc(ff)}"` : ""} xml:space="preserve">${tspans}</text>`,
    );
  }
  parts.push("</svg>");
  return parts.join("\n");
}

export async function exportSVG(doc: ProjectDoc): Promise<{ blob: Blob; missing: string[]; outlinedCount: number }> {
  const fonts = usedFonts(doc);
  const blocks: string[] = [];
  const missing: string[] = [];
  for (const f of fonts) {
    const css = await fontService.embedCss(f);
    if (css) blocks.push(css);
    else missing.push(f);
  }
  const { layouts } = await collectLayouts(visibleText(doc).filter((o) => o.marks.length > 0));
  return { blob: new Blob([buildSvg(doc, blocks, layouts)], { type: "image/svg+xml" }), missing, outlinedCount: layouts.size };
}

/** Builds the vector scene for outline exports; refuses rather than producing wrong output. */
async function outlineScene(doc: ProjectDoc) {
  const { layouts, errors } = await collectLayouts(visibleText(doc));
  if (errors.length) throw new Error(`Outline export needs the original font files. ${errors.join(" ")}`);
  const missing = new Set<string>();
  for (const l of layouts.values()) l.missing.forEach((c) => missing.add(c));
  if (missing.size)
    throw new Error(`The chosen font has no glyphs for: ${[...missing].join(" ")}. The browser substitutes another font for these on screen, but outlines can only use the chosen font. Change the font or remove these characters.`);
  return buildScene(doc, (o) => layouts.get(o.id)!);
}

export async function exportOutlineSVG(doc: ProjectDoc): Promise<Blob> {
  const scene = await outlineScene(doc);
  return new Blob([sceneToSvg(scene, doc.name)], { type: "image/svg+xml" });
}

const browserDeflate = async (data: Uint8Array) => {
  const cs = new CompressionStream("deflate");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

export async function exportPDF(doc: ProjectDoc, opts: { page: PdfPage; background: PdfBackground }): Promise<Blob> {
  const scene = await outlineScene(doc);
  const bytes = await sceneToPdf(scene, { ...opts, title: doc.name, deflate: typeof CompressionStream !== "undefined" ? browserDeflate : undefined });
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
