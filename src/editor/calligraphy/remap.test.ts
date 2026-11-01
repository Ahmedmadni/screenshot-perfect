import { describe, expect, it } from "vitest";
import { indexRemapper, remapAdjustments } from "./remap";

describe("calligraphy adjustment remapping", () => {
  const mark = { at: 1, ch: "\u0650", dx: 0.1, dy: -0.05, scale: 1.2 };
  const glyph = { at: 2, gid: 91, dx: 0.1, dy: -0.1, scaleX: 1.2, scaleY: 0.9, thickness: 1 };

  it("keeps existing adjustments when text is inserted at the beginning", () => {
    const result = remapAdjustments({ text: "بِسْمِ", kashida: [{ at: 2, count: 2 }], marks: [mark], glyphs: [glyph] }, "ٱبِسْمِ");
    expect(result.marks).toEqual([{ ...mark, at: 2 }]);
    expect(result.kashida).toEqual([{ at: 3, count: 2 }]);
    expect(result.glyphs).toEqual([{ ...glyph, at: 3 }]);
  });

  it("shifts only the suffix when text is inserted in the middle", () => {
    const map = indexRemapper("سلام", "سللام");
    expect([map(0), map(1), map(2), map(3)]).toEqual([0, 1, 3, 4]);
  });

  it("preserves the unchanged prefix and suffix around a replacement", () => {
    const map = indexRemapper("سلام", "سليم");
    expect([map(0), map(1), map(2), map(3)]).toEqual([0, 1, null, 3]);
  });

  it("drops adjustments whose source characters were deleted", () => {
    const result = remapAdjustments({ text: "سلام", kashida: [{ at: 2, count: 2 }], marks: [{ ...mark, at: 3 }], glyphs: [{ ...glyph, at: 3 }] }, "سلا");
    expect(result.kashida).toEqual([]);
    expect(result.marks).toEqual([]);
    expect(result.glyphs).toEqual([]);
  });

  it("uses UTF-16 offsets consistently with HarfBuzz cluster indices", () => {
    const map = indexRemapper("😀سلام", "X😀سلام");
    expect(map(0)).toBe(1);
    expect(map(2)).toBe(3);
    expect(map(4)).toBe(5);
  });

  it("keeps mark adjustments only when the diacritic itself still matches", () => {
    const result = remapAdjustments({ text: "بِسْمِ", kashida: [], marks: [mark], glyphs: [] }, "بَسْمِ");
    expect(result.marks).toEqual([]);
  });
});
