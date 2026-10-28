/**
 * Project data model. The original Unicode text and all editable properties
 * are stored here, independently of any rendered output.
 */

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export interface BaseObject {
  id: string;
  name: string;
  /** Center position in document units (px). */
  x: number;
  y: number;
  /** Degrees, clockwise. */
  rotation: number;
  opacity: number;
  hidden: boolean;
  locked: boolean;
}

export type TextAlign = "start" | "center" | "end";
export type TextDirection = "rtl" | "ltr";

/** Tatweel elongation after the base letter at UTF-16 index `at` of the original text. */
export interface Kashida {
  at: number;
  count: number;
}

/**
 * Independent placement of one diacritic. `at` is the UTF-16 index of the mark
 * character in the original text, `ch` the mark itself (used to detect stale
 * entries after the text is edited). Offsets are in em (fractions of font size),
 * y grows downward.
 */
export interface MarkAdjust {
  at: number;
  ch: string;
  dx: number;
  dy: number;
  scale: number;
}

export interface TextObject extends BaseObject {
  type: "text";
  /** Original Unicode text, never modified by calligraphic adjustments. */
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: 400 | 700;
  color: string;
  align: TextAlign;
  direction: TextDirection;
  letterSpacing: number;
  wordSpacing: number;
  lineHeight: number;
  kashida: Kashida[];
  /** OpenType feature overrides (tag → value). Only non-default settings are stored. */
  features: Record<string, number>;
  marks: MarkAdjust[];
}

export type ShapeKind = "rect" | "ellipse" | "diamond" | "star8" | "arch";

export interface ShapeObject extends BaseObject {
  type: "shape";
  shape: ShapeKind;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
}

export type EditorObject = TextObject | ShapeObject;

/** Current project format version. v1 files are migrated on load (see storage.ts). */
export const PROJECT_VERSION = 2;

export interface ProjectDoc {
  format: "acs-project";
  version: typeof PROJECT_VERSION;
  id: string;
  name: string;
  width: number;
  height: number;
  background: string;
  transparentBackground: boolean;
  objects: EditorObject[];
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_FONT = "Amiri";

export function createProject(partial: Partial<ProjectDoc> = {}): ProjectDoc {
  const now = new Date().toISOString();
  return {
    format: "acs-project",
    version: PROJECT_VERSION,
    id: uid(),
    name: "مشروع جديد",
    width: 1200,
    height: 800,
    background: "#fbf7ef",
    transparentBackground: false,
    objects: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function createText(doc: ProjectDoc, partial: Partial<TextObject> = {}): TextObject {
  return {
    id: uid(),
    type: "text",
    name: "نص",
    x: doc.width / 2,
    y: doc.height / 2,
    rotation: 0,
    opacity: 1,
    hidden: false,
    locked: false,
    text: "خط عربي",
    fontFamily: DEFAULT_FONT,
    fontSize: 96,
    fontWeight: 400,
    color: "#1f1a14",
    align: "center",
    direction: "rtl",
    letterSpacing: 0,
    wordSpacing: 0,
    lineHeight: 1.6,
    kashida: [],
    features: {},
    marks: [],
    ...partial,
  };
}

/** True when the object needs the glyph engine (features or diacritic adjustments). */
export function needsGlyphEngine(o: TextObject): boolean {
  return Object.keys(o.features).length > 0 || o.marks.length > 0;
}

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rect: "Rectangle",
  ellipse: "Ellipse",
  diamond: "Diamond",
  star8: "Eight-point star",
  arch: "Arch",
};

export function createShape(doc: ProjectDoc, shape: ShapeKind, partial: Partial<ShapeObject> = {}): ShapeObject {
  const size = Math.round(Math.min(doc.width, doc.height) * 0.3);
  return {
    id: uid(),
    type: "shape",
    name: SHAPE_LABELS[shape],
    shape,
    x: doc.width / 2,
    y: doc.height / 2,
    width: size,
    height: shape === "arch" ? Math.round(size * 1.3) : size,
    rotation: 0,
    opacity: 1,
    hidden: false,
    locked: false,
    fill: "transparent",
    stroke: "#a0703a",
    strokeWidth: 4,
    cornerRadius: 0,
    ...partial,
  };
}

export function createSampleProject(): ProjectDoc {
  const doc = createProject({ name: "بسملة" });
  const star = createShape(doc, "star8", { width: 640, height: 640, stroke: "#c9a46a", strokeWidth: 3 });
  const text = createText(doc, {
    name: "البسملة",
    text: "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",
    fontSize: 72,
  });
  doc.objects = [star, text];
  return doc;
}

/** Closed SVG path for a shape, centered at the origin. */
export function shapePath(kind: ShapeKind, w: number, h: number, r = 0): string {
  const hw = w / 2;
  const hh = h / 2;
  const f = (n: number) => +n.toFixed(2);
  switch (kind) {
    case "rect": {
      const rr = Math.max(0, Math.min(r, hw, hh));
      if (!rr) return `M${f(-hw)} ${f(-hh)}H${f(hw)}V${f(hh)}H${f(-hw)}Z`;
      return `M${f(-hw + rr)} ${f(-hh)}H${f(hw - rr)}A${rr} ${rr} 0 0 1 ${f(hw)} ${f(-hh + rr)}V${f(hh - rr)}A${rr} ${rr} 0 0 1 ${f(hw - rr)} ${f(hh)}H${f(-hw + rr)}A${rr} ${rr} 0 0 1 ${f(-hw)} ${f(hh - rr)}V${f(-hh + rr)}A${rr} ${rr} 0 0 1 ${f(-hw + rr)} ${f(-hh)}Z`;
    }
    case "ellipse":
      return `M${f(-hw)} 0A${f(hw)} ${f(hh)} 0 1 0 ${f(hw)} 0A${f(hw)} ${f(hh)} 0 1 0 ${f(-hw)} 0Z`;
    case "diamond":
      return `M0 ${f(-hh)}L${f(hw)} 0L0 ${f(hh)}L${f(-hw)} 0Z`;
    case "star8": {
      // Octagram {8/2} (khatam): inner radius ratio cos(45°)/cos(22.5°)
      const inner = Math.cos(Math.PI / 4) / Math.cos(Math.PI / 8);
      const pts: string[] = [];
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8 - Math.PI / 2;
        const rad = i % 2 === 0 ? 1 : inner;
        pts.push(`${f(Math.cos(a) * hw * rad)} ${f(Math.sin(a) * hh * rad)}`);
      }
      return `M${pts.join("L")}Z`;
    }
    case "arch":
      return `M${f(-hw)} ${f(hh)}L${f(-hw)} ${f(-hh / 4)}Q${f(-hw)} ${f(-hh * 0.75)} 0 ${f(-hh)}Q${f(hw)} ${f(-hh * 0.75)} ${f(hw)} ${f(-hh / 4)}L${f(hw)} ${f(hh)}Z`;
  }
}

export function fontCss(o: Pick<TextObject, "fontFamily" | "fontSize" | "fontWeight">) {
  return `${o.fontWeight} ${o.fontSize}px "${o.fontFamily}", serif`;
}

let measureCtx: CanvasRenderingContext2D | null = null;

/** Measures text with the browser's shaping engine (same engine used for rendering). */
export function measureText(o: TextObject): { width: number; height: number } {
  const lines = o.text.split("\n");
  const height = Math.max(1, lines.length) * o.fontSize * o.lineHeight;
  if (typeof document === "undefined") {
    const longest = Math.max(...lines.map((l) => l.length), 1);
    return { width: longest * o.fontSize * 0.5, height };
  }
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  const ctx = measureCtx!;
  ctx.font = fontCss(o);
  ctx.direction = o.direction;
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string; wordSpacing?: string };
  c.letterSpacing = `${o.letterSpacing}px`;
  c.wordSpacing = `${o.wordSpacing}px`;
  const width = Math.max(...lines.map((l) => ctx.measureText(l || " ").width), o.fontSize * 0.3);
  return { width, height };
}

export function objectSize(o: EditorObject): { width: number; height: number } {
  if (o.type === "shape") return { width: o.width, height: o.height };
  const m = measureText(o);
  return { width: m.width + o.fontSize * 0.2, height: m.height };
}

/** X offset of a text line anchor within its box, honoring direction-relative alignment. */
export function lineAnchorX(o: TextObject, boxWidth: number): number {
  if (o.align === "center") return 0;
  const startIsRight = o.direction === "rtl";
  const atRight = o.align === "start" ? startIsRight : !startIsRight;
  return atRight ? boxWidth / 2 : -boxWidth / 2;
}

export function lineOffsets(o: TextObject): number[] {
  const lines = o.text.split("\n");
  const lh = o.fontSize * o.lineHeight;
  return lines.map((_, i) => (i - (lines.length - 1) / 2) * lh);
}

export function svgTextAnchor(o: TextObject): "start" | "middle" | "end" {
  return o.align === "center" ? "middle" : o.align;
}
