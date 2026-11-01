import { describe, expect, it } from "vitest";
import { createProject, createShape, createText, type PathObject, type ShapeObject } from "../model";
import { createPathObject } from "../paths/edit";
import { quickSize, resizePatch } from "../transform";
import { BUNDLED_FONTS } from "../fonts";
import { bundledFontUrl } from "../glyphs/fontSources";

const doc = createProject();

describe("quick resize", () => {
  it("sets the font size of text directly", () => {
    const t = createText(doc, { fontSize: 72 });
    expect(resizePatch(t, 150)).toEqual({ fontSize: 150 });
  });
  it("scales shapes proportionally so the longer side matches", () => {
    const s = createShape(doc, "arch", { width: 100, height: 200 });
    const next = { ...s, ...resizePatch(s, 400) } as ShapeObject;
    expect(next.height).toBe(400);
    expect(next.width).toBe(200);
  });
  it("scales path contours proportionally", () => {
    const p = createPathObject([
      { closed: true, nodes: [
        { x: -50, y: -25, in: [0, 0], out: [0, 0], type: "corner" },
        { x: 50, y: -25, in: [0, 0], out: [0, 0], type: "corner" },
        { x: 50, y: 25, in: [0, 0], out: [0, 0], type: "corner" },
      ] },
    ]);
    const before = quickSize(p);
    const next = { ...p, ...resizePatch(p, before * 2) } as PathObject;
    expect(quickSize(next)).toBeCloseTo(before * 2, 5);
  });
});

describe("Thuluth font", () => {
  it("is bundled with its own font file for the glyph engine", () => {
    const f = BUNDLED_FONTS.find((b) => b.style === "Thuluth");
    expect(f?.url).toBe("/fonts/KelkThuluth.ttf");
    expect(bundledFontUrl(f!.family, 400)?.local).toBe(true);
  });
});
