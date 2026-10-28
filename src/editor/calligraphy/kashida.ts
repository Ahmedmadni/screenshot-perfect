/**
 * Tatweel (kashida) elongation. Elongation is stored separately from the text as
 * { at, count } entries, where `at` is the index of a base letter in the original
 * text. Tatweels are inserted after that letter's trailing diacritics, so marks
 * stay attached to their letter and the Unicode text itself is never modified.
 */
import type { Kashida } from "../model";

export const TATWEEL = "\u0640";
export const MAX_KASHIDA = 24;
export const KASHIDA_PRESETS = { short: 1, medium: 3, long: 6 } as const;
export type KashidaPreset = keyof typeof KASHIDA_PRESETS;

type Joining = "D" | "R" | "C" | "U" | "T";

/** Right-joining letters (join only to the preceding letter). From Unicode ArabicShaping.txt. */
const RIGHT_JOINING: [number, number][] = [
  [0x0622, 0x0625], [0x0627, 0x0627], [0x0629, 0x0629], [0x062f, 0x0632], [0x0648, 0x0648],
  [0x0671, 0x0673], [0x0675, 0x0677], [0x0688, 0x0699], [0x06c0, 0x06c0], [0x06c3, 0x06cb],
  [0x06cd, 0x06cd], [0x06cf, 0x06cf], [0x06d2, 0x06d3], [0x06d5, 0x06d5], [0x06ee, 0x06ef],
  [0x0759, 0x075b], [0x076b, 0x076c], [0x0771, 0x0771], [0x0773, 0x0774], [0x0778, 0x0779],
];
/** Dual-joining letters (join on both sides). */
const DUAL_JOINING: [number, number][] = [
  [0x0626, 0x0626], [0x0628, 0x0628], [0x062a, 0x062e], [0x0633, 0x063f], [0x0641, 0x0647],
  [0x0649, 0x064a], [0x066e, 0x066f], [0x0678, 0x0687], [0x069a, 0x06bf], [0x06c1, 0x06c2],
  [0x06cc, 0x06cc], [0x06ce, 0x06ce], [0x06d0, 0x06d1], [0x06fa, 0x06fc], [0x06ff, 0x06ff],
  [0x0750, 0x0758], [0x075c, 0x076a], [0x076d, 0x0770], [0x0772, 0x0772], [0x0775, 0x0777],
  [0x077a, 0x077f],
];
const inRanges = (cp: number, r: [number, number][]) => r.some(([a, b]) => cp >= a && cp <= b);

export const isMarkChar = (ch: string) => /\p{M}/u.test(ch);

export function joiningType(ch: string): Joining {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp === 0x0640 || cp === 0x200d) return "C";
  if (isMarkChar(ch)) return "T";
  if (inRanges(cp, DUAL_JOINING)) return "D";
  if (inRanges(cp, RIGHT_JOINING)) return "R";
  return "U";
}

const LAM = 0x0644;
const HEH = 0x0647;
const ALEFS = new Set([0x0622, 0x0623, 0x0625, 0x0627, 0x0671, 0x0672, 0x0673, 0x0675]);

export interface JoinSlot {
  /** Index of the base letter after which tatweel can be inserted. */
  at: number;
  before: string;
  after: string;
  /** Word number (0-based), for grouping in the UI. */
  word: number;
  /** True when this is the last valid join in its word (traditional kashida spot). */
  lastInWord: boolean;
}

/** Next non-mark character index after `i`, or -1. */
function nextBase(text: string, i: number): number {
  for (let j = i + 1; j < text.length; j++) if (!isMarkChar(text[j]!)) return j;
  return -1;
}

/**
 * Positions where a tatweel can be inserted without breaking joining:
 * the letter before must join forward (dual-joining) and the letter after must
 * join backward. Lam+alef and the lam-lam-heh of the divine name are excluded,
 * because elongating there breaks mandatory ligatures.
 */
export function kashidaSlots(text: string): JoinSlot[] {
  const slots: JoinSlot[] = [];
  let word = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      word++;
      continue;
    }
    const jt = joiningType(ch);
    if (jt !== "D" && jt !== "C") continue;
    const j = nextBase(text, i);
    if (j < 0) continue;
    const nt = joiningType(text[j]!);
    if (nt !== "D" && nt !== "R" && nt !== "C") continue;
    const cp = ch.codePointAt(0)!;
    const ncp = text.codePointAt(j)!;
    if (cp === LAM && ALEFS.has(ncp)) continue;
    if (isDivineNameJoin(text, i, j)) continue;
    slots.push({ at: i, before: ch, after: text[j]!, word, lastInWord: false });
  }
  for (let k = 0; k < slots.length; k++) {
    const next = slots[k + 1];
    slots[k]!.lastInWord = !next || next.word !== slots[k]!.word;
  }
  return slots;
}

/** Joins inside lam-lam-heh (اللّه / ٱللَّه) are protected. */
function isDivineNameJoin(text: string, i: number, j: number): boolean {
  const cp = text.codePointAt(i)!;
  const ncp = text.codePointAt(j)!;
  if (cp !== LAM || (ncp !== LAM && ncp !== HEH)) return false;
  if (ncp === LAM) {
    const k = nextBase(text, j);
    return k > 0 && text.codePointAt(k) === HEH;
  }
  // lam → heh: protected if preceded by another lam
  for (let p = i - 1; p >= 0; p--) {
    if (isMarkChar(text[p]!)) continue;
    return text.codePointAt(p) === LAM;
  }
  return false;
}

export function isValidSlot(text: string, at: number): boolean {
  return kashidaSlots(text).some((s) => s.at === at);
}

/** Drops invalid or zero entries, merges duplicates and clamps counts. */
export function normalizeKashida(text: string, kashida: Kashida[]): Kashida[] {
  const valid = new Set(kashidaSlots(text).map((s) => s.at));
  const m = new Map<number, number>();
  for (const k of kashida) {
    if (!valid.has(k.at)) continue;
    const c = Math.max(0, Math.min(MAX_KASHIDA, Math.round(k.count)));
    if (c > 0) m.set(k.at, c);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([at, count]) => ({ at, count }));
}

/**
 * Builds the drawn string. `map[i]` gives, for each display index, the original
 * text index, or -1 for an inserted tatweel.
 */
export function applyKashida(text: string, kashida: Kashida[] = []): { text: string; map: number[] } {
  const list = kashida.length ? normalizeKashida(text, kashida) : [];
  if (!list.length) return { text, map: Array.from({ length: text.length }, (_, i) => i) };
  // Insertion point = after the base letter's trailing marks.
  const inserts = new Map<number, number>();
  for (const k of list) {
    let p = k.at + 1;
    while (p < text.length && isMarkChar(text[p]!)) p++;
    inserts.set(p, (inserts.get(p) ?? 0) + k.count);
  }
  let out = "";
  const map: number[] = [];
  for (let i = 0; i <= text.length; i++) {
    const n = inserts.get(i);
    if (n) {
      out += TATWEEL.repeat(n);
      for (let t = 0; t < n; t++) map.push(-1);
    }
    if (i < text.length) {
      out += text[i];
      map.push(i);
    }
  }
  return { text: out, map };
}

export function setKashida(text: string, kashida: Kashida[], at: number, count: number): Kashida[] {
  return normalizeKashida(text, [...kashida.filter((k) => k.at !== at), { at, count }]);
}
