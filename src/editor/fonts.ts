/**
 * Font management service. Three sources are kept distinct:
 *  - bundled: open-licensed (OFL) Arabic web fonts served from Google Fonts
 *  - uploaded: user font files, stored locally in IndexedDB
 *  - system: fonts detected on this device (availability varies per device)
 */
import { idbAll, idbDelete, idbPut } from "./idb";

export type FontSource = "bundled" | "uploaded" | "system";
export type FontFormat = "woff2" | "woff" | "ttf" | "otf";

export interface FontEntry {
  family: string;
  label: string;
  source: FontSource;
  style?: string;
  status: "loading" | "ready" | "error";
  error?: string;
  format?: FontFormat;
  fileName?: string;
  size?: number;
  supportsArabic?: boolean;
}

export const BUNDLED_FONTS: { family: string; style: string }[] = [
  { family: "Amiri", style: "Naskh" },
  { family: "Noto Naskh Arabic", style: "Naskh" },
  { family: "Scheherazade New", style: "Naskh" },
  { family: "Lateef", style: "Naskh" },
  { family: "Markazi Text", style: "Naskh" },
  { family: "Aref Ruqaa", style: "Ruqʿah" },
  { family: "Reem Kufi", style: "Kufi" },
  { family: "Noto Kufi Arabic", style: "Kufi" },
  { family: "Noto Sans Arabic", style: "Modern Naskh / Sans" },
  { family: "IBM Plex Sans Arabic", style: "Professional Sans" },
  { family: "Rakkas", style: "Display" },
];

export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?" +
  [
    "Amiri:wght@400;700",
    "Noto+Naskh+Arabic:wght@400;700",
    "Scheherazade+New:wght@400;700",
    "Lateef:wght@400;700",
    "Markazi+Text:wght@400;700",
    "Aref+Ruqaa:wght@400;700",
    "Reem+Kufi:wght@400;700",
    "Noto+Kufi+Arabic:wght@400;700",
    "Noto+Sans+Arabic:wght@400;500;600;700",
    "IBM+Plex+Sans+Arabic:wght@400;500;600;700",
    "Rakkas",
    "IBM+Plex+Sans+Arabic:wght@400;500;600",
  ]
    .map((f) => `family=${f}`)
    .join("&") +
  "&display=swap";

const SYSTEM_CANDIDATES = ["Arial", "Tahoma", "Times New Roman", "Segoe UI", "Geeza Pro", "Baghdad", "Damascus", "Al Nile", "Noto Sans Arabic", "Traditional Arabic", "Simplified Arabic", "Sakkal Majalla"];

export const MAX_FONT_BYTES = 15 * 1024 * 1024;
export const ACCEPTED_FONT_EXT = [".woff2", ".woff", ".ttf", ".otf"];

/** Detects a font format from its file signature (magic bytes). */
export function detectFontFormat(buf: ArrayBuffer): FontFormat | null {
  if (buf.byteLength < 12) return null;
  const tag = new DataView(buf).getUint32(0);
  if (tag === 0x774f4632) return "woff2"; // 'wOF2'
  if (tag === 0x774f4646) return "woff"; // 'wOFF'
  if (tag === 0x00010000 || tag === 0x74727565) return "ttf"; // 1.0 / 'true'
  if (tag === 0x4f54544f) return "otf"; // 'OTTO'
  return null;
}

export function validateFontFile(name: string, buf: ArrayBuffer): { ok: true; format: FontFormat } | { ok: false; error: string } {
  const ext = name.toLowerCase().slice(name.lastIndexOf("."));
  if (!ACCEPTED_FONT_EXT.includes(ext)) return { ok: false, error: `"${name}" is not a supported font file. Use WOFF2, WOFF, TTF or OTF.` };
  if (buf.byteLength > MAX_FONT_BYTES) return { ok: false, error: `"${name}" is larger than 15 MB.` };
  const format = detectFontFormat(buf);
  if (!format) return { ok: false, error: `"${name}" does not contain valid font data.` };
  return { ok: true, format };
}

interface StoredFont {
  family: string;
  fileName: string;
  format: FontFormat;
  data: ArrayBuffer;
}

const ARABIC_PROBE = "بسم الله الرحمن";

function supportsArabic(family: string): boolean {
  const ctx = document.createElement("canvas").getContext("2d")!;
  return ["monospace", "serif"].some((fb) => {
    ctx.font = `40px ${fb}`;
    const a = ctx.measureText(ARABIC_PROBE).width;
    ctx.font = `40px "${family}", ${fb}`;
    return Math.abs(ctx.measureText(ARABIC_PROBE).width - a) > 0.5;
  });
}

function systemFontAvailable(family: string): boolean {
  const ctx = document.createElement("canvas").getContext("2d")!;
  const probe = "mmmwwwlli " + ARABIC_PROBE;
  return ["monospace", "serif", "sans-serif"].some((fb) => {
    ctx.font = `40px ${fb}`;
    const a = ctx.measureText(probe).width;
    ctx.font = `40px "${family}", ${fb}`;
    return Math.abs(ctx.measureText(probe).width - a) > 0.5;
  });
}

const toBase64 = (buf: ArrayBuffer) => {
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;

class FontService {
  private entries: FontEntry[] = [];
  private data = new Map<string, StoredFont>();
  private listeners = new Set<() => void>();
  private started = false;
  /** Increments when any font finishes loading, so text can be re-measured. */
  version = 0;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = () => this.entries;
  private emit() {
    this.entries = [...this.entries];
    this.listeners.forEach((l) => l());
  }
  private upsert(e: FontEntry) {
    const i = this.entries.findIndex((x) => x.family === e.family);
    if (i >= 0) this.entries[i] = e;
    else this.entries.push(e);
    this.emit();
  }

  init() {
    if (this.started || typeof document === "undefined") return;
    this.started = true;
    this.entries = BUNDLED_FONTS.map((f) => ({ family: f.family, label: f.family, style: f.style, source: "bundled", status: "loading" }));
    this.emit();
    BUNDLED_FONTS.forEach((f) => {
      document.fonts
        .load(`40px "${f.family}"`, ARABIC_PROBE)
        .then((faces) => {
          const e = this.entries.find((x) => x.family === f.family)!;
          if (faces.length) this.upsert({ ...e, status: "ready", supportsArabic: true });
          else this.upsert({ ...e, status: "error", error: "Font could not be downloaded. Check your connection." });
          this.version++;
        })
        .catch(() => {
          const e = this.entries.find((x) => x.family === f.family)!;
          this.upsert({ ...e, status: "error", error: "Font failed to load." });
        });
    });
    document.fonts.ready.then(() => {
      SYSTEM_CANDIDATES.filter(systemFontAvailable).forEach((family) =>
        this.upsert({ family, label: family, source: "system", status: "ready", supportsArabic: supportsArabic(family) }),
      );
    });
    idbAll<StoredFont>()
      .then((fonts) => fonts.forEach((f) => this.register(f, false)))
      .catch(() => {});
  }

  private async register(f: StoredFont, persist: boolean): Promise<FontEntry> {
    const base: FontEntry = { family: f.family, label: f.fileName.replace(/\.[^.]+$/, ""), source: "uploaded", status: "loading", format: f.format, fileName: f.fileName, size: f.data.byteLength };
    this.upsert(base);
    try {
      const face = new FontFace(f.family, f.data.slice(0));
      await face.load();
      document.fonts.add(face);
      this.data.set(f.family, f);
      if (persist) await idbPut(f.family, f).catch(() => {});
      const entry: FontEntry = { ...base, status: "ready", supportsArabic: supportsArabic(f.family) };
      this.version++;
      this.upsert(entry);
      return entry;
    } catch {
      const entry: FontEntry = { ...base, status: "error", error: "The browser could not decode this font file." };
      this.upsert(entry);
      return entry;
    }
  }

  async upload(file: File): Promise<FontEntry> {
    const buf = await file.arrayBuffer();
    const v = validateFontFile(file.name, buf);
    if (!v.ok) throw new Error(v.error);
    const clean = file.name.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "Font";
    const family = `${clean} (uploaded)`;
    const entry = await this.register({ family, fileName: file.name, format: v.format, data: buf }, true);
    if (entry.status === "error") throw new Error(entry.error);
    return entry;
  }

  async remove(family: string) {
    this.data.delete(family);
    this.entries = this.entries.filter((e) => e.family !== family);
    this.emit();
    await idbDelete(family).catch(() => {});
  }

  getUploadedData(family: string) {
    return this.data.get(family);
  }

  exportUploaded(families: string[]) {
    return families
      .map((f) => this.data.get(f))
      .filter((f): f is StoredFont => !!f)
      .map((f) => ({ family: f.family, fileName: f.fileName, format: f.format, data: toBase64(f.data) }));
  }

  async importEmbedded(fonts: { family: string; fileName: string; format: FontFormat; data: string }[]) {
    for (const f of fonts) {
      if (this.data.has(f.family)) continue;
      await this.register({ ...f, data: fromBase64(f.data) }, true);
    }
  }

  async ensureLoaded(families: string[]) {
    await Promise.all([...new Set(families)].map((f) => document.fonts.load(`40px "${f}"`, ARABIC_PROBE).catch(() => [])));
  }

  /** Builds @font-face CSS with data URIs for SVG embedding. */
  async embedCss(family: string): Promise<string | null> {
    const up = this.data.get(family);
    if (up) {
      const mime = { woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf" }[up.format];
      return `@font-face{font-family:"${family}";src:url(data:${mime};base64,${toBase64(up.data)});}`;
    }
    if (!BUNDLED_FONTS.some((b) => b.family === family)) return null;
    try {
      const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700`)).text();
      const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1] as string))];
      let out = css;
      for (const u of urls) {
        const buf = await (await fetch(u)).arrayBuffer();
        out = out.split(u).join(`data:font/woff2;base64,${toBase64(buf)}`);
      }
      return out;
    } catch {
      return null;
    }
  }
}

export const fontService = new FontService();
