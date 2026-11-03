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
import { applyMat, invertMat, mulMat, type Mat } from "./affine";

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
  /** Outline in font units, y up. Drawn with `m` into object-local px. */
  d: string;
  /** Font-unit → px factor (includes diacritic scaling). */
  k: number;
  /** Translation part of `m` (kept for convenience). */
  tx: number;
  ty: number;
  /** Full affine placement: font units → object-local px (includes per-glyph scale and rotation). */
  m: Mat;
  /** Outline extents in font units (x, y = bearing; h is negative, y up). Null for empty glyphs. */
  fext: Box | null;
  mark?: { at: number; ch: string; adjusted: boolean; box: Box };
  /** Original text index used to address this glyph for editing (-1 = not editable). */
  editAt: number;
  sx: number;
  sy: number;
  rotation: number;
  /** Added outline in px. */
  thickness: number;
}

/** Outline stroke (px) a glyph is drawn with: the widest of synthetic bold, text outline and glyph thickness. */
export function glyphStrokePx(o: Pick<TextObject, "strokeWidth">, layout: Pick<TextLayout, "boldStroke">, g: Pick<PlacedGlyph, "thickness">): number {
  return Math.max(layout.boldStroke, o.strokeWidth, g.thickness, 0);
}

/** Matrix that places a glyph with a given centre (object px), scale and rotation. */
export function glyphMatrix(k: number, cx: number, cy: number, centre: [number, number], sx: number, sy: number, rotationDeg: number): Mat {
  const r = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const a = k * sx;
  const d = -k * sy;
  const l: [number, number, number, number] = [a * cos, a * sin, -d * sin, d * cos];
  return [l[0], l[1], l[2], l[3], centre[0] - (l[0] * cx + l[2] * cy), centre[1] - (l[1] * cx + l[3] * cy)];
}

/** Object-local polygon (4 corners) of a glyph's outline box, after its full transform. */
export function glyphCorners(g: Pick<PlacedGlyph, "m" | "fext">): [number, number][] | null {
  const e = g.fext;
  if (!e) return null;
  return [
    applyMat(g.m, e.x, e.y),
    applyMat(g.m, e.x + e.w, e.y),
    applyMat(g.m, e.x + e.w, e.y + e.h),
    applyMat(g.m, e.x, e.y + e.h),
  ];
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
          const src = map[lineStart + g.cluster] ?? -1;
          const ext = font.glyphExtents(gid);
          const fext = ext && (ext.width || ext.height) ? { x: ext.xBearing, y: ext.yBearing, w: ext.width, h: ext.height } : null;
          const cx = fext ? fext.x + fext.w / 2 : 0;
          const cy = fext ? fext.y + fext.h / 2 : 0;
          const pg: PlacedGlyph = {
            gid, src, d: sf.glyphPath(gid), k,
            tx: (pen + (g.xOffset ?? 0)) * k, ty: -(g.yOffset ?? 0) * k,
            m: [k, 0, 0, -k, 0, 0], fext,
            editAt: src, sx: 1, sy: 1, rotation: 0, thickness: 0,
          };
          const li = markOf.get(gi);
          if (li !== undefined) {
            markCount++;
            const orig = map[lineStart + li] ?? -1;
            const adj = orig >= 0 ? adjustments.get(orig) : undefined;
            const ok = !!adj && adj.ch === line[li];
            if (ok) matched.add(orig);
            const e = fext ?? { x: 0, y: 0, w: 0, h: 0 };
            const s = ok ? adj!.scale : 1;
            const km = k * s;
            pg.tx += k * cx * (1 - s) + (ok ? adj!.dx * o.fontSize : 0);
            pg.ty += -k * cy * (1 - s) + (ok ? adj!.dy * o.fontSize : 0);
            pg.k = km;
            pg.m = [km, 0, 0, -km, pg.tx, pg.ty];
            pg.mark = { at: orig, ch: line[li]!, adjusted: ok, box: { x: pg.tx + km * e.x, y: pg.ty - km * e.y, w: km * e.w, h: -km * e.h } };
          } else {
            pg.m = [k, 0, 0, -k, pg.tx, pg.ty];
            const edit = src >= 0 ? glyphAdjustments.get(`${src}:${gid}`) : undefined;
            if (edit) {
              // Scale and rotate about the outline centre so the glyph does not
              // drift along the baseline; the translation moves that centre.
              const unedited = pg.m;
              const centre: [number, number] = [pg.tx + k * cx + edit.dx * o.fontSize, pg.ty - k * cy + edit.dy * o.fontSize];
              pg.m = glyphMatrix(k, cx, cy, centre, edit.scaleX, edit.scaleY, edit.rotation ?? 0);
              pg.tx = pg.m[4];
              pg.ty = pg.m[5];
              pg.sx = edit.scaleX;
              pg.sy = edit.scaleY;
              pg.rotation = edit.rotation ?? 0;
              pg.thickness = edit.thickness;
              baseEdits.set(pg, mulMat(pg.m, invertMat(unedited)));
            }
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
    attachMarksToEditedBases(o.text, placed, baseEdits);
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
      g.m = [g.m[0], g.m[1], g.m[2], g.m[3], g.tx, g.ty];
      if (g.mark) {
        g.mark.box.x += x0;
        g.mark.box.y += y;
      }
      glyphs.push(g);
    }
  });

  // Expand the centred object bounds to include every transformed outline
  // (rotation included) plus its outline stroke.
  let minX = -boxWidth / 2;
  let maxX = boxWidth / 2;
  let minY = -boxHeight / 2;
  let maxY = boxHeight / 2;
  const boldStroke = o.fontWeight >= 600 && sf.syntheticBold ? syntheticBoldStroke(o.fontSize) : 0;
  for (const g of glyphs) {
    const corners = glyphCorners(g);
    if (!corners) continue;
    const outset = glyphStrokePx(o, { boldStroke }, g) / 2;
    for (const [x, y] of corners) {
      minX = Math.min(minX, x - outset);
      maxX = Math.max(maxX, x + outset);
      minY = Math.min(minY, y - outset);
      maxY = Math.max(maxY, y + outset);
    }
  }
  boxWidth = Math.max(boxWidth, 2 * Math.max(Math.abs(minX), Math.abs(maxX)));
  boxHeight = Math.max(boxHeight, 2 * Math.max(Math.abs(minY), Math.abs(maxY)));

  return {
    glyphs,
    boxWidth,
    boxHeight,
    missing: [...missing],
    boldStroke,
    markCount,
    unmatchedAdjustments: o.marks.filter((m) => !matched.has(m.at)).length,
  };
}

/**
 * Keeps diacritics attached to their letter: when the base glyph was moved,
 * scaled or rotated, the mark's centre follows the same transform (the mark
 * itself keeps its own size and orientation, plus any independent adjustment).
 */
function attachMarksToEditedBases(text: string, placed: PlacedGlyph[], edits: Map<PlacedGlyph, Mat>) {
  if (!edits.size) return;
  const bases = placed.filter((g) => !g.mark && g.editAt >= 0);
  for (const g of placed) {
    if (!g.mark || g.mark.at < 0) continue;
    let baseAt = g.mark.at - 1;
    while (baseAt >= 0 && isMarkChar(text[baseAt] ?? "")) baseAt--;
    if (baseAt < 0) continue;
    // Exact letter, else the ligature/cluster glyph that covers it (nearest preceding start).
    let base: PlacedGlyph | undefined;
    for (const b of bases) if (b.editAt <= baseAt && (!base || b.editAt > base.editAt)) base = b;
    const delta = base ? edits.get(base) : undefined;
    if (!delta) continue;
    const e = g.fext ?? { x: 0, y: 0, w: 0, h: 0 };
    const [px, py] = applyMat(g.m, e.x + e.w / 2, e.y + e.h / 2);
    const [qx, qy] = applyMat(delta, px, py);
    g.tx += qx - px;
    g.ty += qy - py;
    g.m = [g.m[0], g.m[1], g.m[2], g.m[3], g.tx, g.ty];
    g.mark.box.x += qx - px;
    g.mark.box.y += qy - py;
  }
}
