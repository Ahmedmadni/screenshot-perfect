import { describe, expect, it } from "vitest";
import { CALLIGRAPHIC_MARKS, createCalligraphicMark } from "../calligraphy/decorationMarks";
import { contoursBounds } from "../paths/geometry";
import { createProject } from "../model";
import { parseProjectFile } from "../storage";
import { buildScene, sceneToSvg } from "../glyphs/scene";

describe("independent calligraphic marks", () => {
  it.each(CALLIGRAPHIC_MARKS)("creates an editable, centered $id at the requested size", ({ id }) => {
    const mark = createCalligraphicMark(id, 320, 240, 64, "#123456");
    expect(mark?.type).toBe("path");
    if (!mark) throw new Error("Missing mark");
    const b = contoursBounds(mark.contours);
    if (!b) throw new Error("Missing geometry");
    expect(Math.max(b.maxX - b.minX, b.maxY - b.minY)).toBeCloseTo(64, 2);
    expect(mark.x).toBeCloseTo(320, 2);
    expect(mark.y).toBeCloseTo(240, 2);
    expect(mark.fill).toBe("#123456");
    expect(mark.contours.every((c) => c.closed)).toBe(true);
  });

  it("round-trips mark placement and edits without requiring a font", async () => {
    const mark = createCalligraphicMark("shadda-damma", 200, 150, 80, "#123456");
    if (!mark) throw new Error("Missing mark");
    const project = createProject({ objects: [{ ...mark, rotation: 37, opacity: 0.6 }] });
    const reopened = parseProjectFile(JSON.stringify({ project, fonts: [] })).project;
    expect(reopened.objects[0]).toEqual(project.objects[0]);
    const scene = buildScene(reopened, () => { throw new Error("Marks must not require font layout"); });
    expect(scene.objects).toHaveLength(1);
    expect(scene.objects[0]?.paths[0]?.fill).toBe("#123456");
    expect(scene.objects[0]?.opacity).toBe(0.6);
    expect(sceneToSvg(scene, reopened.name)).not.toContain("<text");
  });

  it("rejects unknown marks and invalid sizes", () => {
    expect(createCalligraphicMark("unknown", 0, 0, 64, "#123456")).toBeNull();
    expect(createCalligraphicMark("fatha", 0, 0, -1, "#123456")).toBeNull();
  });
});