// @vitest-environment node
/**
 * Shaping tests against a real Arabic font (Amiri, from the pinned Google Fonts
 * repository commit; cached under node_modules/.cache after the first run).
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { layoutText, type HbModule, type ShapingFont } from "../glyphs/layout";
import { bundledFontUrl } from "../glyphs/fontSources";
import { createProject, createText, type TextObject } from "../model";

let sf: ShapingFont;
let hb: HbModule;

async function fontFile(): Promise<Buffer> {
  const dir = path.resolve("node_modules/.cache/acs-fonts");
  const file = path.join(dir, "Amiri-Regular.ttf");
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const res = await fetch(bundledFontUrl("Amiri", 400)!.url);
  if (!res.ok) throw new Error(`Font download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, buf);
  return buf;
}

beforeAll(async () => {
  hb = await import("harfbuzzjs");
  const face = new hb.Face(new hb.Blob(new Uint8Array(await fontFile())), 0);
  const font = new hb.Font(face);
  const ext = font.hExtents();
  sf = { hb, face, font, upem: face.upem, ascender: ext.ascender, descender: ext.descender, syntheticBold: false, glyphPath: (g) => font.glyphToPath(g) };
}, 60_000);

const doc = createProject();
const text = (t: string, p: Partial<TextObject> = {}) => createText(doc, { text: t, fontSize: 100, ...p });
const BISMILLAH = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";

describe("glyph layout with HarfBuzz", () => {
  it("finds every diacritic of densely vocalised text and links it to its own character", () => {
    const l = layoutText(sf, text(BISMILLAH));
    const markChars = [...BISMILLAH].map((c, i) => ({ c, i })).filter(({ c }) => /\p{M}/u.test(c));
    const found = l.glyphs.filter((g) => g.mark).map((g) => g.mark!.at);
    expect(l.missing).toEqual([]);
    expect(new Set(found).size).toBe(found.length);
    for (const at of found) expect(/\p{M}/u.test(BISMILLAH[at]!)).toBe(true);
    // Composed shadda+vowel glyphs may cover two characters; everything else is 1:1.
    expect(found.length).toBeGreaterThanOrEqual(markChars.length - 4);
  });

  it("moving one diacritic moves only that glyph", () => {
    const base = layoutText(sf, text(BISMILLAH));
    const target = base.glyphs.find((g) => g.mark)!.mark!;
    const moved = layoutText(sf, text(BISMILLAH, { marks: [{ at: target.at, ch: target.ch, dx: 0.2, dy: -0.1, scale: 1 }] }));
    const changed = moved.glyphs.filter((g, i) => g.tx !== base.glyphs[i]!.tx || g.ty !== base.glyphs[i]!.ty);
    expect(changed).toHaveLength(1);
    expect(changed[0]!.mark!.at).toBe(target.at);
    expect(changed[0]!.tx - base.glyphs[moved.glyphs.indexOf(changed[0]!)]!.tx).toBeCloseTo(20);
  });

  it("tatweel elongation widens the word using real tatweel glyphs", () => {
    const plain = layoutText(sf, text("بسم"));
    const long = layoutText(sf, text("بسم", { kashida: [{ at: 1, count: 4 }] }));
    expect(long.boxWidth).toBeGreaterThan(plain.boxWidth + 50);
    expect(long.glyphs.filter((g) => g.src === -1)).toHaveLength(4);
    expect(long.missing).toEqual([]);
  });

  it("places mixed Arabic and Latin in correct visual order", () => {
    const l = layoutText(sf, text("سلام Hello 2026"));
    const x = (i: number) => l.glyphs.find((g) => g.src === i)!.tx;
    // Latin reads left to right; the Arabic word sits to the right in an RTL paragraph.
    expect(x(5)).toBeLessThan(x(9)); // H before o
    expect(x(11)).toBeLessThan(x(14)); // 2 before 6
    expect(x(0)).toBeGreaterThan(x(9)); // س right of Latin
  });

  it("applies a font's stylistic set only when enabled", () => {
    const gids = (o: TextObject) => layoutText(sf, o).glyphs.map((g) => g.gid).join(",");
    const tags = sf.face.getTableFeatureTags("GSUB");
    expect(tags).toContain("ss01");
    expect(tags).not.toContain("dlig");
    // Disabling standard ligatures must change lam-alef shaping in Amiri? Not guaranteed; check a feature that exists.
    const t = "كمل الكلام";
    const variants = ["ss01", "ss02", "ss03", "ss04", "ss05", "ss06", "ss07", "ss08"].map((ss) => gids(text(t, { features: { [ss]: 1 } })));
    expect(variants.some((v) => v !== gids(text(t)))).toBe(true);
  });
});
