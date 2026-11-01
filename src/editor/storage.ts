/** Project serialization and local persistence (browser storage + downloadable .acs.json files). */
import { z } from "zod";
import { PROJECT_VERSION, type ProjectDoc } from "./model";

const base = {
  id: z.string(),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  opacity: z.number().min(0).max(1),
  hidden: z.boolean(),
  locked: z.boolean(),
};

const textSchema = z.object({
  ...base,
  type: z.literal("text"),
  text: z.string(),
  fontFamily: z.string(),
  fontSize: z.number().positive(),
  scaleX: z.number().positive().default(1),
  scaleY: z.number().positive().default(1),
  strokeWidth: z.number().min(0).max(100).default(0),
  fontWeight: z.union([z.literal(400), z.literal(700)]),
  color: z.string(),
  align: z.enum(["start", "center", "end"]),
  direction: z.enum(["rtl", "ltr"]),
  letterSpacing: z.number(),
  wordSpacing: z.number(),
  lineHeight: z.number().positive(),
  // Added in project format v2; v1 files get safe defaults.
  kashida: z.array(z.object({ at: z.number().int().min(0), count: z.number().int().min(0).max(50) })).default([]),
  features: z.record(z.number().int().min(0).max(99)).default({}),
  glyphs: z.array(z.object({ at: z.number().int().min(0), gid: z.number().int().min(0), dx: z.number(), dy: z.number(), scaleX: z.number().positive(), scaleY: z.number().positive(), thickness: z.number().min(0).max(100) })).default([]),
  marks: z
    .array(z.object({ at: z.number().int().min(0), ch: z.string(), dx: z.number(), dy: z.number(), scale: z.number().positive() }))
    .default([]),
});

const shapeSchema = z.object({
  ...base,
  type: z.literal("shape"),
  shape: z.enum(["rect", "ellipse", "diamond", "star8", "arch"]),
  width: z.number().positive(),
  height: z.number().positive(),
  fill: z.string(),
  stroke: z.string(),
  strokeWidth: z.number().min(0),
  cornerRadius: z.number().min(0),
});

/** Coordinates must be finite and within a sane range; malformed paths are rejected, never "repaired". */
const coord = z.number().finite().min(-1e6).max(1e6);
const vec = z.tuple([coord, coord]);
export const pathNodeSchema = z.object({ x: coord, y: coord, in: vec, out: vec, type: z.enum(["corner", "smooth", "symmetric"]) });
const contourSchema = z
  .object({ nodes: z.array(pathNodeSchema).min(1).max(20000), closed: z.boolean() })
  .refine((c) => !c.closed || c.nodes.length >= 2, "A closed contour needs at least two nodes.");

// Added in project format v3.
const pathSchema = z.object({
  ...base,
  type: z.literal("path"),
  contours: z.array(contourSchema).min(1).max(5000),
  fill: z.string(),
  stroke: z.string(),
  strokeWidth: z.number().finite().min(0).max(1000),
  fillRule: z.enum(["nonzero", "evenodd"]).default("nonzero"),
  lineCap: z.enum(["butt", "round", "square"]).default("round"),
  lineJoin: z.enum(["miter", "round", "bevel"]).default("round"),
});

const projectSchemaRaw = z.object({
  format: z.literal("acs-project"),
  version: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  id: z.string(),
  name: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  background: z.string(),
  transparentBackground: z.boolean(),
  objects: z.array(z.discriminatedUnion("type", [textSchema, shapeSchema, pathSchema])),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Accepts v1–v5 projects and migrates them to the current version without dropping data. */
export const projectSchema = projectSchemaRaw.transform((p) => ({ ...p, version: PROJECT_VERSION }) as ProjectDoc);

const fileSchema = z.object({
  project: projectSchema,
  fonts: z
    .array(z.object({ family: z.string(), fileName: z.string(), format: z.enum(["woff2", "woff", "ttf", "otf"]), data: z.string() }))
    .default([]),
});

export type ProjectFile = { project: ProjectDoc; fonts: z.infer<typeof fileSchema>["fonts"] };

export function parseProjectFile(text: string): ProjectFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("This file is not a valid project file (invalid JSON).");
  }
  const asFile = fileSchema.safeParse(json);
  if (asFile.success) return asFile.data;
  const asDoc = projectSchema.safeParse(json);
  if (asDoc.success) return { project: asDoc.data, fonts: [] };
  throw new Error("This file is not a valid Arabic Calligraphy Studio project.");
}

const INDEX_KEY = "acs:projects:v1";
const LAST_KEY = "acs:last";
const docKey = (id: string) => `acs:project:${id}`;

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: string;
}

export function listProjects(): ProjectMeta[] {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveProjectLocal(doc: ProjectDoc): { ok: true } | { ok: false; error: string } {
  try {
    localStorage.setItem(docKey(doc.id), JSON.stringify(doc));
    const index = listProjects().filter((p) => p.id !== doc.id);
    index.unshift({ id: doc.id, name: doc.name, updatedAt: doc.updatedAt });
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    localStorage.setItem(LAST_KEY, doc.id);
    return { ok: true };
  } catch (e) {
    const quota = e instanceof DOMException && e.name === "QuotaExceededError";
    return { ok: false, error: quota ? "Browser storage is full. Download the project file instead." : "Could not write to browser storage." };
  }
}

export function loadProjectLocal(id: string): ProjectDoc | null {
  try {
    const raw = localStorage.getItem(docKey(id));
    if (!raw) return null;
    const r = projectSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export function lastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function setLastProject(id: string) {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    /* ignore */
  }
}

export function deleteProjectLocal(id: string) {
  localStorage.removeItem(docKey(id));
  localStorage.setItem(INDEX_KEY, JSON.stringify(listProjects().filter((p) => p.id !== id)));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "").trim() || "project";
