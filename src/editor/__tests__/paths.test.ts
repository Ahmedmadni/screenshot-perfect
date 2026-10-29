import { describe, expect, it } from "vitest";
import { createProject } from "../model";
import { parseProjectFile } from "../storage";
import { createPathObject, convertNode, insertNode, moveHandle, setClosed } from "../paths/edit";
import { contourToD, cubicAt, segment, splitCubic } from "../paths/geometry";

const curved = {
  nodes: [
    { x: 0, y: 0, in: [0, 0] as [number, number], out: [0, 60] as [number, number], type: "smooth" as const },
    { x: 100, y: 0, in: [0, 60] as [number, number], out: [0, 0] as [number, number], type: "smooth" as const },
  ],
  closed: false,
};

describe("Bézier path geometry", () => {
  it("evaluates cubic endpoints and midpoint", () => {
    const c: [[number, number], [number, number], [number, number], [number, number]] = [[0, 0], [0, 100], [100, 100], [100, 0]];
    expect(cubicAt(c, 0)).toEqual([0, 0]);
    expect(cubicAt(c, 1)).toEqual([100, 0]);
    expect(cubicAt(c, 0.5)).toEqual([50, 75]);
  });

  it("splits a cubic without changing the curve at the split point", () => {
    const c = segment(curved, 0);
    const [left, right] = splitCubic(c, 0.37);
    const point = cubicAt(c, 0.37);
    expect(left[3][0]).toBeCloseTo(point[0], 8);
    expect(left[3][1]).toBeCloseTo(point[1], 8);
    expect(right[0][0]).toBeCloseTo(point[0], 8);
    expect(right[0][1]).toBeCloseTo(point[1], 8);
  });

  it("inserts a node while preserving the original curve split", () => {
    const original = segment(curved, 0);
    const result = insertNode(curved, 0, 0.4);
    expect(result.contour.nodes).toHaveLength(3);
    const inserted = result.contour.nodes[result.index]!;
    const point = cubicAt(original, 0.4);
    expect(inserted.x).toBeCloseTo(point[0], 8);
    expect(inserted.y).toBeCloseTo(point[1], 8);
    expect(result.contour.nodes[0]!.out.some((n) => Math.abs(n) > 0)).toBe(true);
  });

  it("converts nodes to symmetric handles", () => {
    const contour = { ...curved, nodes: [{ ...curved.nodes[0]!, in: [-10, 0] as [number, number], out: [0, 20] as [number, number] }, curved.nodes[1]!] };
    const result = convertNode(contour, 0, "symmetric").nodes[0]!;
    expect(Math.hypot(...result.in)).toBeCloseTo(Math.hypot(...result.out), 8);
    expect(result.in[0]).toBeCloseTo(-result.out[0], 8);
    expect(result.in[1]).toBeCloseTo(-result.out[1], 8);
  });

  it("keeps smooth handles collinear when a handle moves", () => {
    const node = { ...curved.nodes[0]!, in: [-20, 0] as [number, number], out: [20, 0] as [number, number], type: "smooth" as const };
    const moved = moveHandle(node, "out", [0, 30]);
    expect(moved.out).toEqual([0, 30]);
    expect(moved.in[0]).toBeCloseTo(0, 8);
    expect(moved.in[1]).toBeLessThan(0);
  });

  it("closes and reopens contours safely", () => {
    expect(setClosed(curved, true).closed).toBe(true);
    expect(setClosed({ ...curved, nodes: [curved.nodes[0]!] }, true).closed).toBe(false);
  });

  it("serializes editable path nodes and style through a project round trip", () => {
    const path = createPathObject([curved], { name: "Decorative curve", stroke: "#123456", strokeWidth: 7 });
    const doc = createProject({ objects: [path] });
    const restored = parseProjectFile(JSON.stringify({ project: doc, fonts: [] })).project;
    const result = restored.objects[0];
    expect(result?.type).toBe("path");
    if (result?.type !== "path") throw new Error("Path object was not restored");
    expect(result.name).toBe("Decorative curve");
    expect(result.stroke).toBe("#123456");
    expect(result.strokeWidth).toBe(7);
    expect(result.contours[0]?.nodes).toHaveLength(2);
  });

  it("writes editable cubic SVG path commands", () => {
    expect(contourToD(curved)).toContain("C");
    expect(contourToD({ ...curved, closed: true })).toContain("Z");
  });
});
