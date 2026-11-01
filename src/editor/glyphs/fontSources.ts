/**
 * Original TrueType files for the bundled fonts, used by the glyph engine
 * (Google Fonts' CSS API only serves WOFF2, which HarfBuzz cannot read).
 * Pinned to one commit of the google/fonts repository so outlines are reproducible.
 */
const COMMIT = "9b59ea9f333c5b8a99fa44e2a698496d6cde5b8e";
const BASE = `https://raw.githubusercontent.com/google/fonts/${COMMIT}/ofl/`;

export interface BundledSource {
  regular: string;
  bold?: string;
  /** Variable font with a wght axis covering 400–700. */
  variable?: boolean;
}

/** Paths starting with "/" are served from this app's own public folder. */
export const BUNDLED_SOURCES: Record<string, BundledSource> = {
  "Kelk Thuluth": { regular: "/fonts/KelkThuluth.ttf" },
  Amiri: { regular: "amiri/Amiri-Regular.ttf", bold: "amiri/Amiri-Bold.ttf" },
  "Noto Naskh Arabic": { regular: "notonaskharabic/NotoNaskhArabic%5Bwght%5D.ttf", variable: true },
  "Scheherazade New": { regular: "scheherazadenew/ScheherazadeNew-Regular.ttf", bold: "scheherazadenew/ScheherazadeNew-Bold.ttf" },
  Lateef: { regular: "lateef/Lateef-Regular.ttf", bold: "lateef/Lateef-Bold.ttf" },
  "Markazi Text": { regular: "markazitext/MarkaziText%5Bwght%5D.ttf", variable: true },
  "Aref Ruqaa": { regular: "arefruqaa/ArefRuqaa-Regular.ttf", bold: "arefruqaa/ArefRuqaa-Bold.ttf" },
  Katibeh: { regular: "katibeh/Katibeh-Regular.ttf" },
  Harmattan: { regular: "harmattan/Harmattan-Regular.ttf", bold: "harmattan/Harmattan-Bold.ttf" },
  Cairo: { regular: "cairo/Cairo%5Bslnt%2Cwght%5D.ttf", variable: true },
  "Reem Kufi": { regular: "reemkufi/ReemKufi%5Bwght%5D.ttf", variable: true },
  "Noto Kufi Arabic": { regular: "notokufiarabic/NotoKufiArabic%5Bwght%5D.ttf", variable: true },
  "Noto Sans Arabic": { regular: "notosansarabic/NotoSansArabic%5Bwdth%2Cwght%5D.ttf", variable: true },
  "IBM Plex Sans Arabic": { regular: "ibmplexsansarabic/IBMPlexSansArabic-Regular.ttf", bold: "ibmplexsansarabic/IBMPlexSansArabic-Bold.ttf" },
  Rakkas: { regular: "rakkas/Rakkas-Regular.ttf" },
};

export function bundledFontUrl(family: string, weight: number): { url: string; file: string; needsVariation: boolean; hasRealBold: boolean; local: boolean } | null {
  const s = BUNDLED_SOURCES[family];
  if (!s) return null;
  const bold = weight >= 600;
  const path = bold && s.bold ? s.bold : s.regular;
  return {
    url: path.startsWith("/") ? (typeof location !== "undefined" ? location.origin : "") + path : BASE + path,
    file: decodeURIComponent(path.split("/").pop()!),
    needsVariation: !!s.variable,
    hasRealBold: !!s.bold || !!s.variable,
    local: path.startsWith("/"),
  };
}
