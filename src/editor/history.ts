/** Pure, immutable undo/redo history. */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export const HISTORY_LIMIT = 100;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/** Records `base` (defaults to current present) as an undo step and moves to `next`. */
export function commit<T>(h: History<T>, next: T, base: T = h.present): History<T> {
  if (next === base) return h.present === next ? h : { ...h, present: next };
  return { past: [...h.past, base].slice(-HISTORY_LIMIT), present: next, future: [] };
}

/** Changes present without creating an undo step (used during drags). */
export function replace<T>(h: History<T>, next: T): History<T> {
  return { ...h, present: next };
}

export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  const prev = h.past[h.past.length - 1] as T;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  const next = h.future[0] as T;
  const rest = h.future.slice(1);
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: rest };
}
