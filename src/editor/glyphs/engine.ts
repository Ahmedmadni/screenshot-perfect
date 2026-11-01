/**
 * Glyph engine service (browser only). Loads HarfBuzz (WASM) lazily, resolves
 * font binaries (bundled TTFs, uploaded TTF/OTF/WOFF) and caches layouts.
 * Plain text never goes through here; it keeps the browser's live text renderer.
 */
import { fontService } from "../fonts";
import { setGlyphSizeProvider, type TextObject } from "../model";
import { bundledFontUrl } from "./fontSources";
import { layoutText, type HbModule, type ShapingFont, type TextLayout } from "./layout";
import { woffToSfnt } from "./woff";

export interface EngineFont extends ShapingFont {
  key: string;
  family: string;
  weight: number;
  featureTags: string[];
  featureLabels: Record<string, string>;
  hasTatweel: boolean;
  sourceLabel: string;
}

export type EngineStatus =
  | { state: "loading" }
  | { state: "ready"; font: EngineFont }
  | { state: "error"; error: string; retryable?: boolean };

export const WOFF2_LIMITATION =
  "WOFF2 files work for normal text, but the browser cannot hand their glyph data to the glyph engine. Upload the TTF or OTF version of this font to use OpenType controls, diacritic editing and outline export.";

let hbPromise: Promise<HbModule> | null = null;
function loadHarfBuzz(): Promise<HbModule> {
  if (typeof window === "undefined") return Promise.reject(new Error("The glyph engine runs in the browser only."));
  return (hbPromise ??= import.meta.env.SSR ? Promise.reject(new Error("browser only")) : import("harfbuzzjs"));
}

class EngineError extends Error {
  constructor(message: string, readonly retryable = false) {
    super(message);
  }
}

async function fontBytes(family: string, weight: number): Promise<{ data: ArrayBuffer; label: string; realBold: boolean }> {
  const b = bundledFontUrl(family, weight);
  if (b) {
    let res: Response;
    try {
      res = await fetch(b.url);
    } catch {
      throw new EngineError(`Could not download the original font file for ${family}. Check your connection.`, true);
    }
    if (!res.ok) throw new EngineError(`The font file for ${family} could not be downloaded (HTTP ${res.status}).`, true);
    return { data: await res.arrayBuffer(), label: `${b.file} · ${b.local ? "bundled with the studio" : "Google Fonts repository"}`, realBold: b.hasRealBold };
  }
  const up = fontService.getUploadedData(family);
  if (up) {
    if (up.format === "woff2") throw new EngineError(WOFF2_LIMITATION);
    const data = up.format === "woff" ? await woffToSfnt(up.data) : up.data;
    return { data, label: `${up.fileName} · uploaded`, realBold: false };
  }
  const entry = fontService.getSnapshot().find((e) => e.family === family);
  if (entry?.source === "system")
    throw new EngineError("System fonts are drawn by your device and their files cannot be read by the browser. Choose a bundled or uploaded font to use these controls.");
  if (entry?.source === "uploaded") throw new EngineError("This uploaded font is still loading.", true);
  throw new EngineError(`The font "${family}" is not available on this device.`, true);
}

async function createEngineFont(family: string, weight: number): Promise<EngineFont> {
  const [hb, src] = await Promise.all([loadHarfBuzz(), fontBytes(family, weight)]);
  let face: InstanceType<HbModule["Face"]>;
  let font: InstanceType<HbModule["Font"]>;
  try {
    face = new hb.Face(new hb.Blob(src.data), 0);
    font = new hb.Font(face);
  } catch {
    throw new EngineError(`The glyph engine could not read ${src.label}.`);
  }
  if (!face.upem) throw new EngineError(`The glyph engine could not read ${src.label}.`);
  const axes = face.getAxisInfos();
  let synthetic = weight >= 600 && !src.realBold;
  const wght = axes["wght"];
  if (wght) {
    font.setVariations([new hb.Variation("wght", Math.max(wght.min, Math.min(wght.max, weight)))]);
    if (weight >= 600 && wght.max >= 600) synthetic = false;
  }
  const ext = font.hExtents();
  const gsub = face.getTableFeatureTags("GSUB");
  const gpos = face.getTableFeatureTags("GPOS");
  const featureLabels: Record<string, string> = {};
  gsub.forEach((tag, i) => {
    if (!/^(ss|cv)\d\d$/.test(tag) || featureLabels[tag]) return;
    const ids = face.getFeatureNameIds("GSUB", i);
    const name = ids?.uiLabelNameId ? face.getName(ids.uiLabelNameId, "en") : "";
    if (name) featureLabels[tag] = name;
  });
  const paths = new Map<number, string>();
  const tatweel = font.nominalGlyph(0x0640);
  return {
    key: `${family}|${weight}`,
    family,
    weight,
    hb,
    face,
    font,
    upem: face.upem,
    ascender: ext.ascender,
    descender: ext.descender,
    syntheticBold: synthetic,
    featureTags: [...new Set([...gsub, ...gpos])],
    featureLabels,
    hasTatweel: !!tatweel,
    sourceLabel: src.label,
    glyphPath(gid) {
      let d = paths.get(gid);
      if (d === undefined) {
        d = font.glyphToPath(gid);
        paths.set(gid, d);
      }
      return d;
    },
  };
}

class GlyphEngine {
  private statuses = new Map<string, EngineStatus>();
  private pending = new Map<string, Promise<EngineFont>>();
  private layouts = new WeakMap<TextObject, { key: string; layout: TextLayout }>();
  private listeners = new Set<() => void>();
  version = 0;

  constructor() {
    // Uploaded fonts register asynchronously; retry fonts that were not ready yet.
    fontService.subscribe(() => {
      let changed = false;
      for (const [k, s] of this.statuses) {
        if (s.state === "error" && s.retryable) {
          this.statuses.delete(k);
          changed = true;
        }
      }
      if (changed) this.emit();
    });
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  status(family: string, weight: number): EngineStatus {
    const key = `${family}|${weight}`;
    const s = this.statuses.get(key);
    if (s) return s;
    if (typeof window === "undefined") return { state: "loading" };
    this.ensure(family, weight).catch(() => {});
    return this.statuses.get(key) ?? { state: "loading" };
  }

  ensure(family: string, weight: number): Promise<EngineFont> {
    const key = `${family}|${weight}`;
    const s = this.statuses.get(key);
    if (s?.state === "ready") return Promise.resolve(s.font);
    if (s?.state === "error" && !s.retryable) return Promise.reject(new Error(s.error));
    let p = this.pending.get(key);
    if (!p) {
      this.statuses.set(key, { state: "loading" });
      p = createEngineFont(family, weight)
        .then((font) => {
          this.statuses.set(key, { state: "ready", font });
          return font;
        })
        .catch((e: unknown) => {
          const err = e instanceof EngineError ? e : new EngineError(e instanceof Error ? e.message : "The glyph engine failed to start.", true);
          this.statuses.set(key, { state: "error", error: err.message, retryable: err.retryable });
          throw err;
        })
        .finally(() => {
          this.pending.delete(key);
          this.emit();
        });
      this.pending.set(key, p);
    }
    return p;
  }

  /** Synchronous layout when the font is ready, otherwise null (and loading starts). */
  layout(o: TextObject): TextLayout | null {
    const s = this.status(o.fontFamily, o.fontWeight);
    if (s.state !== "ready") return null;
    const hit = this.layouts.get(o);
    if (hit && hit.key === s.font.key) return hit.layout;
    const layout = layoutText(s.font, o);
    this.layouts.set(o, { key: s.font.key, layout });
    return layout;
  }

  async layoutAsync(o: TextObject): Promise<TextLayout> {
    await this.ensure(o.fontFamily, o.fontWeight);
    return this.layout(o)!;
  }
}

export const glyphEngine = new GlyphEngine();

setGlyphSizeProvider((o) => {
  const l = glyphEngine.layout(o);
  return l ? { width: l.boxWidth, height: l.boxHeight } : null;
});
