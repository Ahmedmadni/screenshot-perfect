/**
 * Per-glyph edit helpers. A glyph is identified by the original-text index of
 * its HarfBuzz cluster (`at`) plus its glyph ID (`gid`). Adjustments are stored
 * apart from the text; neutral entries are removed so projects stay small.
 */
import type { GlyphAdjust } from "../model";

export interface GlyphRef {
  at: number;
  gid: number;
}

export const GLYPH_SCALE_MIN = 0.1;
export const GLYPH_SCALE_MAX = 6;
export const GLYPH_THICKNESS_MAX = 40;

export const sameRef = (a: GlyphRef, b: GlyphRef) => a.at === b.at && a.gid === b.gid;
export const refKey = (r: GlyphRef) => `${r.at}:${r.gid}`;

export function neutralAdjust(ref: GlyphRef): GlyphAdjust {
  return { at: ref.at, gid: ref.gid, dx: 0, dy: 0, scaleX: 1, scaleY: 1, thickness: 0, rotation: 0 };
}

export function isNeutral(a: GlyphAdjust): boolean {
  return Math.abs(a.dx) < 1e-6 && Math.abs(a.dy) < 1e-6 && Math.abs(a.scaleX - 1) < 1e-6 && Math.abs(a.scaleY - 1) < 1e-6 && a.thickness < 1e-6 && Math.abs(a.rotation) < 1e-6;
}

export function getGlyphAdjust(list: GlyphAdjust[], ref: GlyphRef): GlyphAdjust | undefined {
  return list.find((g) => sameRef(g, ref));
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (v: number, step: number) => Math.round(v / step) * step;

/** Normalises ranges and precision (rotation is kept in −180…180). */
export function cleanAdjust(a: GlyphAdjust): GlyphAdjust {
  let rot = ((a.rotation % 360) + 360) % 360;
  if (rot > 180) rot -= 360;
  return {
    at: a.at,
    gid: a.gid,
    dx: round(a.dx, 1e-4),
    dy: round(a.dy, 1e-4),
    scaleX: round(clamp(a.scaleX, GLYPH_SCALE_MIN, GLYPH_SCALE_MAX), 1e-4),
    scaleY: round(clamp(a.scaleY, GLYPH_SCALE_MIN, GLYPH_SCALE_MAX), 1e-4),
    thickness: round(clamp(a.thickness, 0, GLYPH_THICKNESS_MAX), 0.01),
    rotation: round(rot, 0.1),
  };
}

type Patch = Partial<Omit<GlyphAdjust, "at" | "gid">>;

/** Applies a patch (or a function of each glyph's current values) to every referenced glyph. */
export function patchGlyphs(list: GlyphAdjust[], refs: GlyphRef[], patch: Patch | ((cur: GlyphAdjust) => Patch)): GlyphAdjust[] {
  if (!refs.length) return list;
  const rest = list.filter((g) => !refs.some((r) => sameRef(g, r)));
  const changed = refs.map((r) => {
    const cur = getGlyphAdjust(list, r) ?? neutralAdjust(r);
    const p = typeof patch === "function" ? patch(cur) : patch;
    return cleanAdjust({ ...cur, ...p, at: r.at, gid: r.gid });
  });
  return [...rest, ...changed.filter((g) => !isNeutral(g))].sort((a, b) => a.at - b.at || a.gid - b.gid);
}

/** Moves every referenced glyph by the same offset (in em). */
export function moveGlyphs(list: GlyphAdjust[], refs: GlyphRef[], dxEm: number, dyEm: number): GlyphAdjust[] {
  return patchGlyphs(list, refs, (cur) => ({ dx: cur.dx + dxEm, dy: cur.dy + dyEm }));
}

export function resetGlyphs(list: GlyphAdjust[], refs: GlyphRef[]): GlyphAdjust[] {
  return list.filter((g) => !refs.some((r) => sameRef(g, r)));
}

/** Shift/Ctrl-click behaviour: adds the glyph, or removes it if already selected. */
export function toggleRef(refs: GlyphRef[], ref: GlyphRef): GlyphRef[] {
  return refs.some((r) => sameRef(r, ref)) ? refs.filter((r) => !sameRef(r, ref)) : [...refs, ref];
}
