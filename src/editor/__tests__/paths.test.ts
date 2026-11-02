import { describe, expect, it } from "vitest";
import { createProject, createText, type Contour } from "../model";
import { glyphsToPaths } from "../paths/convert";
import { parseProjectFile } from "../storage";
import {
  createPathObject,
  convertNode,
  convertNodes,
  insertNode,
  moveHandle,
  moveHandles,
  moveNodes,
  setClosed,
} from "../paths/edit";
import { contourToD, cubicAt, segment, splitCubic } from "../paths/geometry";
import { curvatureNodes, cubicsToNodes, fitCurve } from "../paths/fit";

const curved = {
  nodes: [
    {
      x: 0,
      y: 0,
      in: [0, 0] as [number, number],
      out: [0, 60] as [number, number],
      type: "smooth" as const,
    },
    {
      x: 100,
      y: 0,
      in: [0, 60] as [number, number],
      out: [0, 0] as [number, number],
      type: "smooth" as const,
    },
  ],
  closed: false,
};

describe("Bézier path geometry", () => {
  it("converts shaped glyphs into separate editable paths while keeping glyph contours together", () => {
    const doc = createProject();
    const text = createText(doc, {
      text: "اب",
      x: 240,
      y: 180,
      scaleX: 1.2,
      scaleY: 0.8,
      strokeWidth: 2,
    });
    const layout = {
      glyphs: [
        {
          gid: 10,
          src: 0,
          editAt: 0,
          d: "M0 0L20 0L20 20Z M5 5L5 10L10 10Z",
          k: 1,
          tx: -30,
          ty: 0,
          sx: 1,
          sy: 1,
          thickness: 0,
        },
        {
          gid: 11,
          src: 1,
          editAt: 1,
          d: "M0 0L12 0L12 18Z",
          k: 1,
          tx: 10,
          ty: 0,
          sx: 1.1,
          sy: 0.9,
          thickness: 1,
        },
      ],
      boxWidth: 80,
      boxHeight: 40,
      missing: [],
      boldStroke: 0,
      markCount: 0,
      unmatchedAdjustments: 0,
    };
    const paths = glyphsToPaths(text, layout);
    expect(paths).toHaveLength(2);
    expect(paths[0]?.type).toBe("path");
    expect(paths[0]?.contours).toHaveLength(2);
    expect(paths[1]?.contours).toHaveLength(1);
    expect(paths[0]?.x).not.toBeCloseTo(paths[1]?.x ?? 0);
    expect(paths[1]?.strokeWidth).toBeCloseTo(2);
    expect(paths[1]?.stroke).toBe(text.color);
    expect(paths[1]?.fillRule).toBe("nonzero");
  });

  it("does not add an outline stroke to regular glyphs without synthetic or requested thickness", () => {
    const doc = createProject();
    const text = createText(doc, { text: "ب", x: 100, y: 100 });
    const layout = {
      glyphs: [
        {
          gid: 4,
          src: 0,
          editAt: 0,
          d: "M0 0L10 0L10 10Z",
          k: 2,
          tx: 0,
          ty: 0,
          sx: 1,
          sy: 1,
          thickness: 0,
        },
      ],
      boxWidth: 10,
      boxHeight: 10,
      missing: [],
      boldStroke: 0,
      markCount: 0,
      unmatchedAdjustments: 0,
    };
    const [path] = glyphsToPaths(text, layout);
    expect(path?.stroke).toBe("transparent");
    expect(path?.strokeWidth).toBe(0);
  });

  it("evaluates cubic endpoints and midpoint", () => {
    const c: [[number, number], [number, number], [number, number], [number, number]] = [
      [0, 0],
      [0, 100],
      [100, 100],
      [100, 0],
    ];
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

  it("moves multiple selected nodes across contours without changing their handles", () => {
    const second: Contour = {
      nodes: [{ x: 20, y: 30, in: [-2, 0], out: [3, 0], type: "smooth" }],
      closed: false,
    };
    const source = [curved, second];
    const moved = moveNodes(
      source,
      [
        [0, 1],
        [1, 0],
      ],
      [7, -4],
    );
    expect(moved[0]?.nodes[0]?.x).toBe(0);
    expect(moved[0]?.nodes[1]?.x).toBe(107);
    expect(moved[0]?.nodes[1]?.y).toBe(-4);
    expect(moved[0]?.nodes[1]?.in).toEqual(curved.nodes[1]?.in);
    expect(moved[1]?.nodes[0]?.x).toBe(27);
    expect(moved[1]?.nodes[0]?.y).toBe(26);
    expect(moved[1]?.nodes[0]?.out).toEqual([3, 0]);
  });

  it("converts a multi-contour node selection to one shared handle type", () => {
    const second: Contour = {
      nodes: [{ x: 20, y: 30, in: [-4, 0], out: [0, 8], type: "corner" }],
      closed: false,
    };
    const result = convertNodes(
      [curved, second],
      [
        [0, 0],
        [1, 0],
      ],
      "symmetric",
    );
    for (const contour of result) {
      const node = contour.nodes[0]!;
      expect(node.type).toBe("symmetric");
      expect(Math.hypot(...node.in)).toBeCloseTo(Math.hypot(...node.out), 8);
      expect(node.in[0]).toBeCloseTo(-node.out[0], 8);
      expect(node.in[1]).toBeCloseTo(-node.out[1], 8);
    }
  });

  it("converts nodes to symmetric handles", () => {
    const contour = {
      ...curved,
      nodes: [
        { ...curved.nodes[0]!, in: [-10, 0] as [number, number], out: [0, 20] as [number, number] },
        curved.nodes[1]!,
      ],
    };
    const result = convertNode(contour, 0, "symmetric").nodes[0]!;
    expect(Math.hypot(...result.in)).toBeCloseTo(Math.hypot(...result.out), 8);
    expect(result.in[0]).toBeCloseTo(-result.out[0], 8);
    expect(result.in[1]).toBeCloseTo(-result.out[1], 8);
  });

  it("moves matching handles across selected nodes and preserves node constraints", () => {
    const second: Contour = {
      nodes: [{ x: 20, y: 30, in: [-10, 0], out: [10, 0], type: "symmetric" }],
      closed: false,
    };
    // Contour 0 holds a selected smooth node followed by an unselected node,
    // so the test can prove that only the selected node's handles move.
    const first: Contour = {
      nodes: [{ x: 0, y: 0, in: [0, -60], out: [0, 60], type: "smooth" }, curved.nodes[1]!],
      closed: false,
    };
    const result = moveHandles(
      [first, second],
      [
        [0, 0],
        [1, 0],
      ],
      "out",
      [0, 12],
    );
    expect(result[0]?.nodes[0]?.out).toEqual([0, 72]);
    expect(result[0]?.nodes[0]?.in[0]).toBeCloseTo(0, 8);
    expect(result[0]?.nodes[0]?.in[1]).toBeCloseTo(-60, 8);
    expect(result[1]?.nodes[0]?.out).toEqual([10, 12]);
    expect(result[1]?.nodes[0]?.in).toEqual([-10, -12]);
    expect(result[0]?.nodes[1]).toEqual(curved.nodes[1]);
  });

  it("collapses the opposite smooth handle when the moved handle reaches zero", () => {
    const node = {
      ...curved.nodes[0]!,
      in: [-20, 0] as [number, number],
      out: [20, 0] as [number, number],
      type: "smooth" as const,
    };
    const moved = moveHandle(node, "out", [0, 0]);
    expect(moved.out).toEqual([0, 0]);
    expect(moved.in).toEqual([0, 0]);
  });

  it("keeps smooth handles collinear when a handle moves", () => {
    const node = {
      ...curved.nodes[0]!,
      in: [-20, 0] as [number, number],
      out: [20, 0] as [number, number],
      type: "smooth" as const,
    };
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
    const path = createPathObject([curved], {
      name: "Decorative curve",
      stroke: "#123456",
      strokeWidth: 7,
    });
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

  it("creates smooth curvature nodes through user points", () => {
    const nodes = curvatureNodes(
      [
        { x: 0, y: 0 },
        { x: 40, y: 50 },
        { x: 100, y: 0 },
      ],
      false,
    );
    expect(nodes).toHaveLength(3);
    expect(nodes[1]?.type).toBe("smooth");
    expect(nodes[1]?.in.some((v) => Math.abs(v) > 0)).toBe(true);
    expect(nodes[1]?.out.some((v) => Math.abs(v) > 0)).toBe(true);
  });

  it("fits freehand samples into editable cubic nodes", () => {
    const cubics = fitCurve(
      [
        [0, 0],
        [10, 15],
        [20, 25],
        [30, 15],
        [40, 0],
      ],
      2,
    );
    const nodes = cubicsToNodes(cubics);
    expect(cubics.length).toBeGreaterThan(0);
    expect(nodes.length).toBeGreaterThanOrEqual(2);
    expect(nodes[0]?.x).toBe(0);
    expect(nodes[nodes.length - 1]?.x).toBe(40);
  });

  it("writes editable cubic SVG path commands", () => {
    expect(contourToD(curved)).toContain("C");
    expect(contourToD({ ...curved, closed: true })).toContain("Z");
  });
});
