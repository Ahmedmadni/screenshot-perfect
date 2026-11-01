/** Proportional resizing shared by quick size controls. */
import { objectSize, type EditorObject } from "./model";
import { scaleContours } from "./paths/edit";

/** The "size" a quick control shows: font size for text, the longer side for shapes and paths. */
export function quickSize(o: EditorObject): number {
  if (o.type === "text") return o.fontSize;
  const s = objectSize(o);
  return Math.max(s.width, s.height);
}

/** Returns the property patch that scales an object uniformly so its quick size becomes `size`. */
export function resizePatch(o: EditorObject, size: number): Partial<EditorObject> {
  const target = Math.max(1, size);
  if (o.type === "text") return { fontSize: Math.round(target * 10) / 10 };
  const current = quickSize(o);
  if (!(current > 0)) return {};
  const f = target / current;
  if (o.type === "shape") return { width: Math.max(1, o.width * f), height: Math.max(1, o.height * f) };
  return { contours: scaleContours(o.contours, f, f) };
}
