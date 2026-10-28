/**
 * OpenType feature catalogue. Which features exist is read from the font's own
 * GSUB/GPOS feature lists by the glyph engine; nothing is shown as available
 * unless the font actually contains it.
 */

export interface FeatureInfo {
  label: string;
  /** Whether HarfBuzz (and browsers) apply it by default for Arabic text. */
  defaultOn: boolean;
}

export const OPTIONAL_FEATURES: Record<string, FeatureInfo> = {
  calt: { label: "Contextual alternates", defaultOn: true },
  liga: { label: "Standard ligatures", defaultOn: true },
  clig: { label: "Contextual ligatures", defaultOn: true },
  dlig: { label: "Discretionary ligatures", defaultOn: false },
  hlig: { label: "Historical ligatures", defaultOn: false },
  salt: { label: "Stylistic alternates", defaultOn: false },
  swsh: { label: "Swash forms", defaultOn: false },
  cswh: { label: "Contextual swash", defaultOn: false },
  jalt: { label: "Justification alternates", defaultOn: false },
  mset: { label: "Mark positioning via substitution", defaultOn: true },
  kern: { label: "Kerning", defaultOn: true },
};

/** Applied by the Arabic shaper and not meaningful to switch off. */
export const REQUIRED_FEATURES = ["ccmp", "locl", "isol", "init", "medi", "fina", "med2", "fin2", "fin3", "rlig", "rclt", "curs", "mark", "mkmk", "rtlm", "stch"];

/** Common calligraphy features listed as "not in this font" when absent. */
export const COMMON_FEATURES = ["calt", "liga", "dlig", "salt", "swsh"];

export const isStylisticSet = (tag: string) => /^ss(0[1-9]|1\d|20)$/.test(tag);
export const isCharacterVariant = (tag: string) => /^cv\d\d$/.test(tag);

export function featureDefault(tag: string): boolean {
  return OPTIONAL_FEATURES[tag]?.defaultOn ?? false;
}

export function featureLabel(tag: string, fontLabels: Record<string, string> = {}): string {
  if (fontLabels[tag]) return fontLabels[tag]!;
  if (OPTIONAL_FEATURES[tag]) return OPTIONAL_FEATURES[tag]!.label;
  if (isStylisticSet(tag)) return `Stylistic set ${+tag.slice(2)}`;
  if (isCharacterVariant(tag)) return `Character variant ${+tag.slice(2)}`;
  return tag;
}

export interface FeaturePanelModel {
  toggles: { tag: string; on: boolean; defaultOn: boolean; overridden: boolean }[];
  required: string[];
  missingCommon: string[];
}

/** Builds the list of switchable features from the font's real feature tags. */
export function buildFeaturePanel(fontTags: string[], current: Record<string, number>): FeaturePanelModel {
  const tags = [...new Set(fontTags)];
  const switchable = tags.filter((t) => OPTIONAL_FEATURES[t] || isStylisticSet(t) || isCharacterVariant(t)).sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  return {
    toggles: switchable.map((tag) => {
      const defaultOn = featureDefault(tag);
      const overridden = tag in current;
      return { tag, defaultOn, overridden, on: overridden ? current[tag]! > 0 : defaultOn };
    }),
    required: tags.filter((t) => REQUIRED_FEATURES.includes(t)),
    missingCommon: COMMON_FEATURES.filter((t) => !tags.includes(t)),
  };
}
const order = (t: string) => (OPTIONAL_FEATURES[t] ? 0 : isStylisticSet(t) ? 1 : 2);

/** Sets a feature; storing only values that differ from the default. */
export function setFeature(features: Record<string, number>, tag: string, on: boolean): Record<string, number> {
  const next = { ...features };
  if (on === featureDefault(tag)) delete next[tag];
  else next[tag] = on ? 1 : 0;
  return next;
}

/** HarfBuzz feature strings ("dlig=1"). */
export const featureStrings = (f: Record<string, number>) => Object.entries(f).map(([t, v]) => `${t}=${v}`);

/** CSS font-feature-settings value for live text. */
export const featureCss = (f: Record<string, number>) => {
  const e = Object.entries(f);
  return e.length ? e.map(([t, v]) => `"${t}" ${v}`).join(", ") : undefined;
};
