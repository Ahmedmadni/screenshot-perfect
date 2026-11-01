/**
 * Keeps calligraphic adjustments attached to the right characters when the
 * original text is edited. Uses the common prefix/suffix of old and new text:
 * entries before the edit keep their index, entries after it shift, entries
 * inside the edited range are dropped.
 */
import type { GlyphAdjust, Kashida, MarkAdjust, TextObject } from "../model";
import { normalizeKashida } from "./kashida";

export function indexRemapper(oldText: string, newText: string): (i: number) => number | null {
  const max = Math.min(oldText.length, newText.length);
  let p = 0;
  while (p < max && oldText[p] === newText[p]) p++;
  let s = 0;
  while (s < max - p && oldText[oldText.length - 1 - s] === newText[newText.length - 1 - s]) s++;
  const delta = newText.length - oldText.length;
  return (i) => (i < p ? i : i >= oldText.length - s ? i + delta : null);
}

export function remapAdjustments(o: Pick<TextObject, "text" | "kashida" | "marks"> & { glyphs?: GlyphAdjust[] }, newText: string): { kashida: Kashida[]; marks: MarkAdjust[]; glyphs: GlyphAdjust[] } {
  const map = indexRemapper(o.text, newText);
  const kashida = normalizeKashida(
    newText,
    o.kashida.flatMap((k) => {
      const at = map(k.at);
      return at === null ? [] : [{ ...k, at }];
    }),
  );
  const marks = o.marks.flatMap((m) => {
    const at = map(m.at);
    return at === null || newText[at] !== m.ch ? [] : [{ ...m, at }];
  });
  const glyphs = (o.glyphs ?? []).flatMap((g) => {
    const at = map(g.at);
    return at === null ? [] : [{ ...g, at }];
  });
  return { kashida, marks, glyphs };
}
