/**
 * Glyph layout: shapes a text object with HarfBuzz and returns positioned glyph
 * outlines. Pure and renderer-independent, so it can be unit-tested in Node and
 * reused by the canvas, PNG, outline SVG and PDF paths.
 *
 * Pipeline per line: kashida display text → Unicode bidi levels (bidi-js) →
 * runs shaped by HarfBuzz with full context → runs reordered visually (UBA L2).
 * Diacritics are identified by the font's GDEF mark class and paired with their
 * source characters through HarfBuzz cluster values, never by index guessing.
 */
import type * as HB from "harfbuzzjs";
import bidiFactory from "bidi-js";
import { applyKashida, isMarkChar } from "../calligraphy/kashida";
import { featureStrings } from "../calligraphy/features";
import type { TextObject } from "../model";

export type HbModule = typeof HB;

export interface ShapingFont {
  hb: HbModule;
  face: HB.Face;
  font: HB.Font;
  upem: number;
  ascender: number;
  descender: number;
  syntheticBold: boolean;
  glyphPath(gid: number): string;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedGlyph {
  gid: number;
  /** Original text index of the glyph's cluster (-1 for inserted tatweel). */
  src: number;
  /** Outline in font units, y up. Drawn with matrix(k 0 0 -k tx ty) in object-local px. */
  d: string;
  k: number;
  tx: number;
  ty: number;
  mark?: { at: number; ch: string; adjusted: boolean; box: Box };
  editAt: number; sx: number; sy: number; thickness: number;
}

export interface TextLayout {
  glyphs: PlacedGlyph[];
  boxWidth: number;
  boxHeight: number;
  /** Characters the font has no glyph for. */
  missing: string[];
  /** Synthetic-bold stroke width in px (0 when the font has a real bold). */
  boldStroke: number;
  markCount: number;
  /** Stored adjustments that no longer match a diacritic in the text. */
  unmatchedAdjustments: number;
}

let bidi: ReturnType<typeof bidiFactory> | null = null;
const getBidi = () => (bidi ??= bidiFactory());

/** Visual order of runs per UBA rule L2. */
export function visualRunOrder(levels: number[]): number[] {
  const order = levels.map((_, i) => i);
  if (!levels.length) return order;
  const max = Math.max(...levels);
  const minOdd = Math.min(...levels.filter((l) => l % 2 === 1), max + 1);
  for (let lvl = max; lvl >= minOdd; lvl--) {
    for (let i = 0; i < order.length; ) {
      if (levels[order[i]!]! >= lvl) {
        let j = i;
        while (j < order.length && levels[order[j]!]! >= lvl) j++;
        const seg = order.slice(i, j).reverse();
        order.splice(i, j - i, ...seg);
        i = j;
      } else i++;
    }
  }
  return order;
}

/** Chrome/Skia-style synthetic emboldening: outline grows by size/24..size/32. */
export function syntheticBoldStroke(fontSize: number): number {
  const t = Math.max(0, Math.min(1, (fontSize - 9) / (36 - 9)));
  const outset = fontSize * (1 / 24 + (1 / 32 - 1 / 24) * t);
  return outset * 2;
}

export function layoutText(sf: ShapingFont, o: TextObject): TextLayout {
  const { hb, face, font } = sf;
  const k = o.fontSize / sf.upem;
  const { text: display, map } = applyKashida(o.text, o.kashida);
  const features = featureStrings(o.features)
    .map((s) => hb.Feature.fromString(s))
    .filter((f): f is HB.Feature => !!f);
  const lines = display.split("\n");
  const lh = o.fontSize * o.lineHeight;
  const baselineShift = ((sf.ascender + sf.descender) / 2) * k;
  const adjustments = new Map(o.marks.map((m) => [m.at, m]));
  const glyphAdjustments = new Map(o.glyphs.map((g) => [`${g.at}:${g.gid}`, g]));
  const matched = new Set<number>();
  const missing = new Set<string>();
  const glyphs: PlacedGlyph[] = [];
  const lineGlyphs: { glyphs: PlacedGlyph[]; width: number }[] = [];
  let markCount = 0;
  let lineStart = 0;

  for (const line of lines) {
    const placed: PlacedGlyph[] = [];
    let pen = 0;
    if (line.length) {
      const { levels } = getBidi().getEmbeddingLevels(line, "auto");
      const runs: { start: number; end: number; level: number }[] = [];
      for (let i = 0; i < line.length; i++) {
        const lvl = levels[i]!;
        const last = runs[runs.length - 1];
        if (last && last.level === lvl) last.end = i + 1;
        else runs.push({ start: i, end: i + 1, level: lvl });
      }
      for (const ri of visualRunOrder(runs.map((r) => r.level))) {
        const run = runs[ri]!;
        const rtl = run.level % 2 === 1;
        const buf = new hb.Buffer();
        buf.addText(line, run.start, run.end - run.start);
        buf.setDirection(rtl ? hb.Direction.RTL : hb.Direction.LTR);
        buf.guessSegmentProperties();
        buf.setClusterLevel(hb.ClusterLevel.MONOTONE_CHARACTERS);
        hb.shape(font, buf, features);
        const infos = buf.getGlyphInfosAndPositions();
        const clusters = [...new Set(infos.map((g) => g.cluster))].sort((a, b) => a - b);
        const isMarkGlyph = infos.map((g) => {
          const cls = face.getGlyphClass(g.codepoint);
          if (cls === hb.GlyphClass.MARK) return true;
          return cls === hb.GlyphClass.UNCLASSIFIED && !g.xAdvance && isMarkChar(line[g.cluster] ?? "");
        });
        // Pair mark glyphs with source mark characters, per cluster, in logical order.
        const markOf = new Map<number, number>(); // glyph index → line char index
        const byCluster = new Map<number, number[]>();
        infos.forEach((g, gi) => {
          if (!isMarkGlyph[gi]) return;
          const list = byCluster.get(g.cluster) ?? [];
          list.push(gi);
          byCluster.set(g.cluster, list);
        });
        for (const [c, gis] of byCluster) {
          const next = clusters.find((x) => x > c) ?? run.end;
          const chars: number[] = [];
          for (let i = c; i < next; i++) if (isMarkChar(line[i]!)) chars.push(i);
          const logical = rtl ? [...gis].reverse() : gis;
          const free = new Set(chars);
          const pending: number[] = [];
          for (const gi of logical) {
            const gid = infos[gi]!.codepoint;
            const exact = chars.find((ci) => free.has(ci) && font.nominalGlyph(line.codePointAt(ci)!) === gid);
            if (exact !== undefined) {
              markOf.set(gi, exact);
              free.delete(exact);
            } else pending.push(gi);
          }
          for (const gi of pending) {
            const ci = chars.find((x) => free.has(x));
            if (ci === undefined) break;
            markOf.set(gi, ci);
            free.delete(ci);
          }
        }
        infos.forEach((g, gi) => {
          const gid = g.codepoint;
          const ch = line[g.cluster] ?? "";
          if (gid === 0 && !/\s/.test(ch)) missing.add(ch);
          const pg: PlacedGlyph = { gid, src: map[lineStart + g.cluster] ?? -1, d: sf.glyphPath(gid), k, tx: (pen + (g.xOffset ?? 0)) * k, ty: -(g.yOffset ?? 0) * k, editAt: map[lineStart + g.cluster] ?? -1, sx: 1, sy: 1, thickness: 0 };
          const li = markOf.get(gi);
          if (li !== undefined) {
            markCount++;
            const orig = map[lineStart + li] ?? -1;
            const adj = orig >= 0 ? adjustments.get(orig) : undefined;
            const ok = !!adj && adj.ch === line[li];
            if (ok) matched.add(orig);
            const ext = font.glyphExtents(gid) ?? { xBearing: 0, yBearing: 0, width: 0, height: 0 };
            const cx = ext.xBearing + ext.width / 2;
            const cy = ext.yBearing + ext.height / 2;
            const m = ok ? adj!.scale : 1;
            const km = k * m;
            pg.tx += k * cx * (1 - m) + (ok ? adj!.dx * o.fontSize : 0);
            pg.ty += -k * cy * (1 - m) + (ok ? adj!.dy * o.fontSize : 0);
            pg.k = km;
            const x0 = pg.tx + km * ext.xBearing;
            const y0 = pg.ty - km * ext.yBearing;
            pg.mark = { at: orig, ch: line[li]!, adjusted: ok, box: { x: x0, y: y0, w: km * ext.width, h: -km * ext.height } };
          }
          const glyphEdit = pg.src >= 0 ? glyphAdjustments.get(`${pg.src}:${gid}`) : undefined;
          if (glyphEdit) {
            // Scale around the outline centre rather than the font origin so
            // resizing a glyph does not make it drift along the baseline.
            const ext = font.glyphExtents(gid);
            if (ext) {
              const cx = ext.xBearing + ext.width / 2;
              const cy = ext.yBearing + ext.height / 2;
              pg.tx += k * cx * (1 - glyphEdit.scaleX);
              pg.ty -= k * cy * (1 - glyphEdit.scaleY);
            }
            pg.tx += glyphEdit.dx * o.fontSize;
            pg.ty += glyphEdit.dy * o.fontSize;
            pg.sx = glyphEdit.scaleX;
            pg.sy = glyphEdit.scaleY;
            pg.thickness = glyphEdit.thickness;
          }
          placed.push(pg);
          pen += g.xAdvance ?? 0;
          if (!isMarkGlyph[gi]) {
            pen += o.letterSpacing / k;
            if (ch === " ") pen += o.wordSpacing / k;
          }
        });
      }
    }
    lineGlyphs.push({ glyphs: placed, width: pen * k });
    lineStart += line.length + 1;
  }

  const maxW = Math.max(o.fontSize * 0.3, ...lineGlyphs.map((l) => l.width));
  let boxWidth = maxW + o.fontSize * 0.2;
  let boxHeight = Math.max(1, lines.length) * lh;
  const anchor = o.align === "center" ? 0 : (o.align === "start") === (o.direction === "rtl") ? boxWidth / 2 : -boxWidth / 2;
  lineGlyphs.forEach((l, i) => {
    const x0 = o.align === "center" ? anchor - l.width / 2 : (o.align === "start") === (o.direction === "rtl") ? anchor - l.width : anchor;
    const y = (i - (lines.length - 1) / 2) * lh + baselineShift;
    for (const g of l.glyphs) {
      g.tx += x0;
      g.ty += y;
      if (g.mark) {
        g.mark.box.x += x0;
        g.mark.box.y += y;
      }
      glyphs.push(g);
    }
  });

  // Expand the centred object bounds to include every transformed outline.
  // HarfBuzz extents are in font units (y-up); SVG/object coordinates are y-down.
  let minX = -boxWidth / 2;
  let maxX = boxWidth / 2;
  let minY = -boxHeight / 2;
  let maxY = boxHeight / 2;
  const boldOutset = o.fontWeight >= 600 && sf.syntheticBold ? syntheticBoldStroke(o.fontSize) / 2 : 0;
  for (const g of glyphs) {
    const ext = font.glyphExtents(g.gid);
    if (!ext) continue;
    const x1 = g.tx + g.k * g.sx * ext.xBearing;
    const x2 = g.tx + g.k * g.sx * (ext.xBearing + ext.width);
    const y1 = g.ty - g.k * g.sy * ext.yBearing;
    const y2 = g.ty - g.k * g.sy * (ext.yBearing + ext.height);
    const outset = Math.max(boldOutset, g.thickness / 2, 0);
    minX = Math.min(minX, Math.min(x1, x2) - outset);
    maxX = Math.max(maxX, Math.max(x1, x2) + outset);
    minY = Math.min(minY, Math.min(y1, y2) - outset);
    maxY = Math.max(maxY, Math.max(y1, y2) + outset);
  }
  boxWidth = Math.max(boxWidth, 2 * Math.max(Math.abs(minX), Math.abs(maxX)));
  boxHeight = Math.max(boxHeight, 2 * Math.max(Math.abs(minY), Math.abs(maxY)));

  return {
    glyphs,
    boxWidth,
    boxHeight,
    missing: [...missing],
    boldStroke: o.fontWeight >= 600 && sf.syntheticBold ? syntheticBoldStroke(o.fontSize) : 0,
    markCount,
    unmatchedAdjustments: o.marks.filter((m) => !matched.has(m.at)).length,
  };
}
