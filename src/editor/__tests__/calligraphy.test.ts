import { describe, expect, it } from "vitest";
import { applyKashida, kashidaSlots, setKashida, TATWEEL } from "../calligraphy/kashida";
import { remapAdjustments } from "../calligraphy/remap";
import { buildFeaturePanel, setFeature } from "../calligraphy/features";
import { resetMarkAdjust, setMarkAdjust } from "../calligraphy/marks";
import { parseProjectFile } from "../storage";
import { createSampleProject, createText, createProject } from "../model";
import { parsePath } from "../glyphs/svgpath";
import { sceneToPdf, pageLayout } from "../glyphs/pdf";
import { visualRunOrder } from "../glyphs/layout";

describe("tatweel elongation", () => {
  it("inserts tatweel after the letter's diacritics, leaving the original text unchanged", () => {
    const text = "بِسْمِ";
    const slots = kashidaSlots(text);
    expect(slots.map((s) => s.at)).toEqual([0, 2]); // ب→س, س→م
    const out = applyKashida(text, [{ at: 2, count: 3 }]);
    expect(out.text).toBe("بِسْ" + TATWEEL.repeat(3) + "مِ");
    expect(text).toBe("بِسْمِ");
    expect(out.map.filter((i) => i === -1)).toHaveLength(3);
  });
  it("never elongates after a non-forward-joining letter (alef, dal, waw, ra)", () => {
    expect(kashidaSlots("دار ورد")).toEqual([]);
  });
  it("refuses lam-alef and the lam-lam-heh of the divine name", () => {
    expect(kashidaSlots("لا").length).toBe(0);
    expect(kashidaSlots("ٱللَّهِ").length).toBe(0);
  });
  it("ignores stored elongation at positions that are not valid joins", () => {
    expect(applyKashida("دار", [{ at: 0, count: 4 }]).text).toBe("دار");
  });
  it("setting a count of 0 removes the elongation", () => {
    const k = setKashida("بسم", [{ at: 0, count: 2 }], 0, 0);
    expect(k).toEqual([]);
  });
});

describe("adjustments follow text edits", () => {
  it("shifts entries after an edit and drops entries inside it", () => {
    const o = { text: "بِسْمِ", kashida: [{ at: 2, count: 2 }], marks: [{ at: 1, ch: "\u0650", dx: 0.1, dy: 0, scale: 1 }] };
    const r = remapAdjustments(o, "ٱ" + o.text);
    expect(r.kashida).toEqual([{ at: 3, count: 2 }]);
    expect(r.marks[0]!.at).toBe(2);
    const removed = remapAdjustments(o, "بسم");
    expect(removed.marks).toEqual([]);
  });
});

describe("diacritic adjustments", () => {
  it("are stored separately and removed on reset", () => {
    let m = setMarkAdjust([], 3, "\u0652", { dx: 0.05, dy: -0.1 });
    expect(m).toEqual([{ at: 3, ch: "\u0652", dx: 0.05, dy: -0.1, scale: 1 }]);
    m = setMarkAdjust(m, 3, "\u0652", { scale: 9 });
    expect(m[0]!.scale).toBe(4);
    expect(resetMarkAdjust(m, 3)).toEqual([]);
  });
});

describe("OpenType features", () => {
  it("only offers features the font actually contains", () => {
    const p = buildFeaturePanel(["ccmp", "init", "liga", "ss01", "kern"], {});
    expect(p.toggles.map((t) => t.tag)).toEqual(["kern", "liga", "ss01"]);
    expect(p.missingCommon).toEqual(["calt", "dlig", "salt", "swsh"]);
    expect(p.required).toEqual(["ccmp", "init"]);
  });
  it("stores only non-default settings", () => {
    expect(setFeature({}, "liga", true)).toEqual({});
    expect(setFeature({}, "liga", false)).toEqual({ liga: 0 });
    expect(setFeature({ dlig: 1 }, "dlig", false)).toEqual({});
  });
});

describe("project compatibility", () => {
  it("opens a v1 project and migrates it to v2 with empty calligraphy data", () => {
    const v1 = createSampleProject() as unknown as Record<string, unknown>;
    v1["version"] = 1;
    v1["objects"] = (v1["objects"] as Record<string, unknown>[]).map(({ kashida: _k, features: _f, marks: _m, ...rest }) => rest);
    const { project } = parseProjectFile(JSON.stringify({ project: v1, fonts: [] }));
    expect(project.version).toBe(2);
    const t = project.objects.find((o) => o.type === "text");
    expect(t && t.type === "text" && [t.kashida, t.features, t.marks]).toEqual([[], {}, []]);
  });
  it("round-trips elongation, features and diacritic positions", () => {
    const doc = createProject();
    doc.objects = [createText(doc, { text: "بِسْمِ", kashida: [{ at: 2, count: 3 }], features: { ss01: 1 }, marks: [{ at: 1, ch: "\u0650", dx: 0.1, dy: 0.2, scale: 1.5 }] })];
    const { project } = parseProjectFile(JSON.stringify({ project: doc, fonts: [] }));
    expect(project.objects[0]).toEqual(doc.objects[0]);
  });
});

describe("vector export", () => {
  it("converts arcs and quadratics to cubic curves", () => {
    const segs = parsePath("M0 0Q10 10 20 0A5 5 0 0 1 30 0Z");
    expect(segs.map((s) => s.op)).toEqual(["M", "C", "C", "C", "Z"]);
  });
  it("orders mixed-direction runs visually (UBA L2)", () => {
    // RTL paragraph: Arabic(1) Latin(2) Arabic(1) → reversed order
    expect(visualRunOrder([1, 2, 1])).toEqual([2, 1, 0]);
    expect(visualRunOrder([0, 1, 0])).toEqual([0, 1, 2]);
  });
  it("sizes PDF pages: canvas at 96 dpi, paper fitted and centred", () => {
    expect(pageLayout(1200, 800, "canvas")).toMatchObject({ pw: 900, ph: 600 });
    const a4 = pageLayout(1200, 800, "a4");
    expect(a4.pw).toBeCloseTo(841.89);
    expect(a4.ph).toBeCloseTo(595.28);
  });
  it("writes a structurally valid PDF with a correct xref table", async () => {
    const bytes = await sceneToPdf(
      { width: 100, height: 50, background: "#ffeedd", objects: [{ id: "a", name: "r", m: [1, 0, 0, 1, 50, 25], opacity: 0.5, paths: [{ d: "M-10 -10H10V10H-10Z", m: [1, 0, 0, 1, 0, 0], fill: "#ff0000", stroke: null, strokeWidth: 0 }] }] },
      { page: "canvas", background: "canvas", title: "بسملة" },
    );
    const s = new TextDecoder("latin1").decode(bytes);
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    const startxref = +s.match(/startxref\n(\d+)/)![1]!;
    expect(s.slice(startxref, startxref + 4)).toBe("xref");
    const offsets = [...s.slice(startxref).matchAll(/(\d{10}) 00000 n/g)].map((m) => +m[1]!);
    offsets.forEach((off, i) => expect(s.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(s).toContain("/ca 0.5");
    expect(s).toContain("1 0 0 rg");
  });
});
