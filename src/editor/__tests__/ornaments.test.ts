import { describe, expect, it } from "vitest";
import { createFloralRosette } from "../ornaments";
import { contoursBounds } from "../paths/geometry";

describe("editable Bézier ornaments", () => {
  it("creates a centered eight-petal rosette with a separate center contour", () => {
    const rosette = createFloralRosette(320, 240, 200);
    expect(rosette.type).toBe("path");
    expect(rosette.name).toContain("Bézier");
    expect(rosette.contours).toHaveLength(9);
    expect(rosette.contours.every((contour) => contour.closed)).toBe(true);
    expect(rosette.contours.every((contour) => contour.nodes.length === 4)).toBe(true);
    expect(rosette.x).toBeCloseTo(320, 2);
    expect(rosette.y).toBeCloseTo(240, 2);
    expect(rosette.contours.flatMap((contour) => contour.nodes).some((node) =>
      node.in.some((v) => Math.abs(v) > 0) && node.out.some((v) => Math.abs(v) > 0),
    )).toBe(true);
  });

  it("keeps its geometry within the requested size", () => {
    const rosette = createFloralRosette(0, 0, 180);
    const bounds = contoursBounds(rosette.contours);
    expect(bounds).not.toBeNull();
    expect(bounds!.maxX - bounds!.minX).toBeLessThanOrEqual(180.1);
    expect(bounds!.maxY - bounds!.minY).toBeLessThanOrEqual(180.1);
  });
});
