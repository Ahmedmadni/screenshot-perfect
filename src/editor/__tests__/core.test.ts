import { describe, expect, it } from "vitest";
import { commit, createHistory, redo, replace, undo } from "../history";
import { detectFontFormat, validateFontFile } from "../fonts";
import { parseProjectFile } from "../storage";
import { createSampleProject, createText, createProject, objectSize } from "../model";

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


describe("independent text morph controls", () => {
  it("creates text with neutral width, height and thickness defaults", () => {
    const text = createText(createProject());
    expect(text.scaleX).toBe(1);
    expect(text.scaleY).toBe(1);
    expect(text.strokeWidth).toBe(0);
  });
  it("preserves morph controls when serializing and loading project files", () => {
    const doc = createSampleProject();
    const item = doc.objects.find((o) => o.type === "text");
    if (!item || item.type !== "text") throw new Error("Sample text is missing");
    item.scaleX = 1.35;
    item.scaleY = 0.82;
    item.strokeWidth = 2.5;
    const loaded = parseProjectFile(JSON.stringify({ project: doc, fonts: [] })).project;
    const restored = loaded.objects.find((o) => o.type === "text");
    expect(restored && restored.type === "text" ? [restored.scaleX, restored.scaleY, restored.strokeWidth] : null).toEqual([1.35, 0.82, 2.5]);
  });
  it("migrates older text objects with neutral morph defaults", () => {
    const doc = createSampleProject();
    const legacy = { ...doc, version: 3, objects: doc.objects.map((o) => o.type === "text" ? (({ scaleX, scaleY, strokeWidth, ...rest }) => rest)(o) : o) };
    const loaded = parseProjectFile(JSON.stringify(legacy)).project;
    const restored = loaded.objects.find((o) => o.type === "text");
    expect(restored && restored.type === "text" ? [restored.scaleX, restored.scaleY, restored.strokeWidth] : null).toEqual([1, 1, 0]);
  });
});
