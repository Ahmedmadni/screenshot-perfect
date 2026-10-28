import { describe, expect, it } from "vitest";
import { commit, createHistory, redo, replace, undo } from "../history";
import { detectFontFormat, validateFontFile } from "../fonts";
import { parseProjectFile } from "../storage";
import { createSampleProject } from "../model";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(12).fill(0)]).buffer;

describe("history", () => {
  it("undo restores previous state and redo re-applies it", () => {
    let h = createHistory(1);
    h = commit(h, 2);
    h = undo(h);
    expect(h.present).toBe(1);
    h = redo(h);
    expect(h.present).toBe(2);
  });
  it("a drag (replace steps then commit from base) is one undo step", () => {
    let h = createHistory(0);
    h = replace(h, 1);
    h = replace(h, 2);
    h = commit(h, h.present, 0);
    expect(undo(h).present).toBe(0);
  });
});

describe("font validation", () => {
  it("detects formats by signature", () => {
    expect(detectFontFormat(bytes(0x77, 0x4f, 0x46, 0x32))).toBe("woff2");
    expect(detectFontFormat(bytes(0x4f, 0x54, 0x54, 0x4f))).toBe("otf");
    expect(detectFontFormat(bytes(0x00, 0x01, 0x00, 0x00))).toBe("ttf");
  });
  it("rejects a text file renamed to .ttf", () => {
    const r = validateFontFile("fake.ttf", new TextEncoder().encode("hello world, not a font").buffer);
    expect(r.ok).toBe(false);
  });
  it("rejects unsupported extensions", () => {
    expect(validateFontFile("font.exe", bytes(0x77, 0x4f, 0x46, 0x32)).ok).toBe(false);
  });
});

describe("project files", () => {
  it("round-trips Arabic text with diacritics exactly", () => {
    const doc = createSampleProject();
    const { project } = parseProjectFile(JSON.stringify({ project: doc, fonts: [] }));
    const t = project.objects.find((o) => o.type === "text");
    expect(t && t.type === "text" && t.text).toBe("بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ");
  });
  it("rejects invalid files", () => {
    expect(() => parseProjectFile("{\"foo\":1}")).toThrow();
    expect(() => parseProjectFile("not json")).toThrow();
  });
});
