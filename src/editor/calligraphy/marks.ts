/** Diacritic adjustment helpers. Adjustments are stored apart from the text. */
import type { MarkAdjust } from "../model";

export const MARK_NAMES: Record<string, string> = {
  "\u064B": "Tanwin fath · تنوين فتح",
  "\u064C": "Tanwin damm · تنوين ضم",
  "\u064D": "Tanwin kasr · تنوين كسر",
  "\u064E": "Fatha · فتحة",
  "\u064F": "Damma · ضمة",
  "\u0650": "Kasra · كسرة",
  "\u0651": "Shadda · شدة",
  "\u0652": "Sukun · سكون",
  "\u0653": "Madda · مدة",
  "\u0654": "Hamza above · همزة",
  "\u0655": "Hamza below · همزة",
  "\u0670": "Dagger alif · ألف خنجرية",
};
export const markName = (ch: string) => MARK_NAMES[ch] ?? `Mark U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;

export const MARK_SCALE_MIN = 0.25;
export const MARK_SCALE_MAX = 4;

const isIdentity = (m: MarkAdjust) => Math.abs(m.dx) < 1e-6 && Math.abs(m.dy) < 1e-6 && Math.abs(m.scale - 1) < 1e-6;

export function getMarkAdjust(marks: MarkAdjust[], at: number): MarkAdjust | undefined {
  return marks.find((m) => m.at === at);
}

/** Returns a new list with the adjustment for mark `at` updated (identity entries are removed). */
export function setMarkAdjust(marks: MarkAdjust[], at: number, ch: string, patch: Partial<Pick<MarkAdjust, "dx" | "dy" | "scale">>): MarkAdjust[] {
  const cur = getMarkAdjust(marks, at) ?? { at, ch, dx: 0, dy: 0, scale: 1 };
  const next: MarkAdjust = { ...cur, ...patch, ch };
  next.scale = Math.max(MARK_SCALE_MIN, Math.min(MARK_SCALE_MAX, next.scale));
  const rest = marks.filter((m) => m.at !== at);
  return isIdentity(next) ? rest : [...rest, next].sort((a, b) => a.at - b.at);
}

export function resetMarkAdjust(marks: MarkAdjust[], at: number): MarkAdjust[] {
  return marks.filter((m) => m.at !== at);
}
