/**
 * Export pipeline. PNG uses the browser's Canvas 2D renderer, which shapes Arabic
 * with the same engine as the on-screen view. SVG keeps live text and embeds the
 * fonts used so shaping is reproduced by any SVG viewer that supports web fonts.
 */
import { fontService } from "./fonts";
import { fontCss, lineAnchorX, lineOffsets, objectSize, shapePath, type ProjectDoc, type TextObject } from "./model";

export function renderToCanvas(ctx: CanvasRenderingContext2D, doc: ProjectDoc, scale = 1) {
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
      drawText(ctx, o);
    }
    ctx.restore();
  }
  ctx.restore();
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
  o.text.split("\n").forEach((line, i) => ctx.fillText(line, ax, offsets[i]));
}

const usedFonts = (doc: ProjectDoc) => [...new Set(doc.objects.flatMap((o) => (o.type === "text" && !o.hidden ? [o.fontFamily] : [])))];

export async function exportPNG(doc: ProjectDoc, scale = 2): Promise<Blob> {
  await fontService.ensureLoaded(usedFonts(doc));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(doc.width * scale);
  canvas.height = Math.round(doc.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  renderToCanvas(ctx, doc, scale);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed."))), "image/png"));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildSvg(doc: ProjectDoc, fontCssBlocks: string[] = []): string {
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
    } else {
      const { width } = objectSize(o);
      const ax = lineAnchorX(o, width);
      const anchor = o.align === "center" ? "middle" : o.align;
      const offs = lineOffsets(o);
      const tspans = o.text
        .split("\n")
        .map((line, i) => `<tspan x="${ax}" y="${offs[i]}">${esc(line)}</tspan>`)
        .join("");
      parts.push(
        `<text transform="${t}" opacity="${o.opacity}" direction="${o.direction}" unicode-bidi="plaintext" text-anchor="${anchor}" dominant-baseline="central" font-family="&quot;${esc(o.fontFamily)}&quot;, serif" font-size="${o.fontSize}" font-weight="${o.fontWeight}" letter-spacing="${o.letterSpacing}" word-spacing="${o.wordSpacing}" fill="${esc(o.color)}" xml:space="preserve">${tspans}</text>`,
      );
    }
  }
  parts.push("</svg>");
  return parts.join("\n");
}

export async function exportSVG(doc: ProjectDoc): Promise<{ blob: Blob; missing: string[] }> {
  const fonts = usedFonts(doc);
  const blocks: string[] = [];
  const missing: string[] = [];
  for (const f of fonts) {
    const css = await fontService.embedCss(f);
    if (css) blocks.push(css);
    else missing.push(f);
  }
  return { blob: new Blob([buildSvg(doc, blocks)], { type: "image/svg+xml" }), missing };
}
