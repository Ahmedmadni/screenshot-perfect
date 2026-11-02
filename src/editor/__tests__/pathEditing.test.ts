import { describe, expect, it } from "vitest";
import type { Contour, PathNode, ProjectDoc } from "../model";
import { createProject } from "../model";
import { convertNode, convertNodes, createPathObject, deleteNodes, deleteSelectedNodes, moveHandle, moveHandles, moveNodes } from "../paths/edit";
import { len } from "../paths/geometry";
import { editorReducer, type EditorState } from "../useEditor";
import { createHistory } from "../history";

const node = (x: number, y: number, inV: [number, number], out: [number, number], type: PathNode["type"]): PathNode => ({ x, y, in: inV, out, type });

/** Freezes deeply so any in-place mutation by an edit operation throws. */
function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object") {
    Object.values(v as object).forEach(deepFreeze);
    Object.freeze(v);
  }
  return v;
}

const cross = (a: [number, number], b: [number, number]) => a[0] * b[1] - a[1] * b[0];

function fixture(): Contour[] {
  return deepFreeze([
    {
      nodes: [node(0, 0, [-20, 0], [20, 0], "smooth"), node(100, 0, [-30, 10], [30, -10], "symmetric"), node(200, 50, [-10, -10], [5, 25], "corner")],
      closed: false,
    },
    {
      nodes: [node(0, 100, [0, 0], [40, 0], "smooth"), node(80, 140, [-15, 0], [15, 0], "smooth"), node(160, 100, [-40, 0], [0, 0], "corner")],
      closed: true,
    },
  ]);
}

describe("Bézier editing: multi-node selection", () => {
  it("moves every selected node by the same delta and keeps their handle offsets", () => {
    const src = fixture();
    const out = moveNodes(src, [[0, 0], [0, 2], [1, 1]], [5, -7]);
    expect([out[0]!.nodes[0]!.x, out[0]!.nodes[0]!.y]).toEqual([5, -7]);
    expect([out[0]!.nodes[2]!.x, out[0]!.nodes[2]!.y]).toEqual([205, 43]);
    expect([out[1]!.nodes[1]!.x, out[1]!.nodes[1]!.y]).toEqual([85, 133]);
    for (const [c, i] of [[0, 0], [0, 2], [1, 1]] as const) {
      expect(out[c]!.nodes[i]!.in).toEqual(src[c]!.nodes[i]!.in);
      expect(out[c]!.nodes[i]!.out).toEqual(src[c]!.nodes[i]!.out);
    }
  });

  it("leaves unselected nodes untouched when moving nodes or handles", () => {
    const src = fixture();
    const moved = moveNodes(src, [[0, 1]], [10, 10]);
    const handled = moveHandles(src, [[0, 1]], "out", [4, 4]);
    for (const out of [moved, handled]) {
      expect(out[0]!.nodes[0]).toBe(src[0]!.nodes[0]);
      expect(out[0]!.nodes[2]).toBe(src[0]!.nodes[2]);
      out[1]!.nodes.forEach((n, i) => expect(n).toBe(src[1]!.nodes[i]));
    }
  });
});

describe("Bézier editing: handle constraints", () => {
  it("smooth: keeps the opposite handle collinear and its length unchanged", () => {
    const n = node(0, 0, [-20, 0], [20, 0], "smooth");
    const m = moveHandle(n, "out", [30, 40]);
    expect(m.out).toEqual([30, 40]);
    expect(len(m.in)).toBeCloseTo(20, 8);
    expect(cross(m.in, m.out)).toBeCloseTo(0, 6);
    expect(m.in[0] * m.out[0] + m.in[1] * m.out[1]).toBeLessThan(0);
  });

  it("symmetric: mirrors the opposite handle with equal length", () => {
    const n = node(0, 0, [-10, 0], [10, 0], "symmetric");
    const m = moveHandle(n, "in", [-6, 8]);
    expect(m.in).toEqual([-6, 8]);
    expect(m.out).toEqual([6, -8]);
  });

  it("independent (Alt): moves only the dragged handle on smooth and symmetric nodes", () => {
    for (const type of ["smooth", "symmetric"] as const) {
      const n = node(0, 0, [-10, 0], [10, 0], type);
      const m = moveHandle(n, "out", [0, 25], true);
      expect(m.out).toEqual([0, 25]);
      expect(m.in).toEqual([-10, 0]);
      expect(m.type).toBe(type);
    }
  });

  it("corner: never changes the opposite handle", () => {
    const n = node(0, 0, [-10, 3], [10, 0], "corner");
    expect(moveHandle(n, "out", [1, 50]).in).toEqual([-10, 3]);
  });

  it("applies constraints per node when handles of several contours move together", () => {
    const src = fixture();
    const out = moveHandles(src, [[0, 0], [0, 1], [1, 1]], "out", [0, 10]);
    const smooth = out[0]!.nodes[0]!;
    expect(smooth.out).toEqual([20, 10]);
    expect(len(smooth.in)).toBeCloseTo(20, 8);
    expect(cross(smooth.in, smooth.out)).toBeCloseTo(0, 6);
    const sym = out[0]!.nodes[1]!;
    expect(sym.out).toEqual([30, 0]);
    expect(sym.in).toEqual([-30, -0]);
    const smooth2 = out[1]!.nodes[1]!;
    expect(smooth2.out).toEqual([15, 10]);
    expect(len(smooth2.in)).toBeCloseTo(15, 8);
  });

  it("independent multi-handle move leaves every opposite handle unchanged", () => {
    const src = fixture();
    const out = moveHandles(src, [[0, 0], [0, 1]], "out", [0, 10], true);
    expect(out[0]!.nodes[0]!.in).toEqual([-20, 0]);
    expect(out[0]!.nodes[1]!.in).toEqual([-30, 10]);
  });
});

describe("Bézier editing: zero-length handles", () => {
  it("does not grow a retracted handle during a group handle drag", () => {
    const src = fixture();
    // Node [1,0] has a zero `in` handle; node [1,2] has a zero `out` handle.
    const out = moveHandles(src, [[1, 0], [1, 2]], "in", [5, 5]);
    expect(out[1]!.nodes[0]).toBe(src[1]!.nodes[0]);
    expect(out[1]!.nodes[2]!.in).toEqual([-35, 5]);
    expect(out[1]!.nodes[2]!.out).toEqual([0, 0]);
  });

  it("smooth node with a zero opposite handle keeps it at zero", () => {
    const n = node(0, 0, [0, 0], [40, 0], "smooth");
    const m = moveHandle(n, "out", [10, 30]);
    expect(m.in).toEqual([0, 0]);
    expect(Number.isFinite(m.out[0]) && Number.isFinite(m.out[1])).toBe(true);
  });
});

describe("Bézier editing: node type conversion", () => {
  it("corner conversion keeps the existing handles and only changes the type", () => {
    const src = fixture();
    const out = convertNode(src[0]!, 1, "corner").nodes[1]!;
    expect(out.type).toBe("corner");
    expect(out.in).toEqual([-30, 10]);
    expect(out.out).toEqual([30, -10]);
  });

  it("smooth conversion makes handles collinear and keeps their lengths", () => {
    const src = fixture();
    const before = src[0]!.nodes[2]!;
    const out = convertNode(src[0]!, 2, "smooth").nodes[2]!;
    expect(out.type).toBe("smooth");
    expect(cross(out.in, out.out)).toBeCloseTo(0, 6);
    expect(len(out.in)).toBeCloseTo(len(before.in), 6);
    expect(len(out.out)).toBeCloseTo(len(before.out), 6);
  });

  it("smooth/symmetric conversion grows handles for a retracted corner node", () => {
    const ct: Contour = { nodes: [node(0, 0, [0, 0], [0, 0], "corner"), node(90, 0, [0, 0], [0, 0], "corner"), node(180, 0, [0, 0], [0, 0], "corner")], closed: false };
    for (const type of ["smooth", "symmetric"] as const) {
      const out = convertNode(ct, 1, type).nodes[1]!;
      expect(len(out.in)).toBeGreaterThan(0);
      expect(len(out.out)).toBeGreaterThan(0);
      expect(cross(out.in, out.out)).toBeCloseTo(0, 6);
    }
  });

  it("converts only the selected nodes of a multi-contour selection", () => {
    const src = fixture();
    const out = convertNodes(src, [[0, 2], [1, 2]], "symmetric");
    expect(out[0]!.nodes[2]!.type).toBe("symmetric");
    expect(out[1]!.nodes[2]!.type).toBe("symmetric");
    expect(out[0]!.nodes[0]).toBe(src[0]!.nodes[0]);
    expect(out[1]!.nodes[1]).toBe(src[1]!.nodes[1]);
  });
});

describe("Bézier editing: deleting nodes", () => {
  it("removes a middle node and keeps the neighbouring anchors in place", () => {
    const src = fixture();
    const out = deleteNodes(src[0]!, [1])!;
    expect(out.nodes).toHaveLength(2);
    expect([out.nodes[0]!.x, out.nodes[0]!.y]).toEqual([0, 0]);
    expect([out.nodes[1]!.x, out.nodes[1]!.y]).toEqual([200, 50]);
  });

  it("deletes a selection across contours and keeps other nodes at the same canvas position", () => {
    const path = createPathObject(fixture().map((c) => ({ ...c, nodes: [...c.nodes] })));
    const abs = (o: typeof path, c: number, i: number) => [o.x + o.contours[c]!.nodes[i]!.x, o.y + o.contours[c]!.nodes[i]!.y];
    const keep = abs(path, 1, 0);
    const out = deleteSelectedNodes(path, [[0, 0], [0, 1], [1, 1]]);
    // Contour 0 would be left with one node, so it is dropped entirely.
    expect(out.contours).toHaveLength(1);
    expect(out.contours[0]!.nodes).toHaveLength(2);
    const now = abs(out, 0, 0);
    expect(now[0]).toBeCloseTo(keep[0]!, 2);
    expect(now[1]).toBeCloseTo(keep[1]!, 2);
  });

  it("clears the dangling outer handle when an open contour's end node is deleted", () => {
    const src = fixture();
    const out = deleteNodes(src[0]!, [0])!;
    expect(out.nodes[0]!.in).toEqual([0, 0]);
  });
});

describe("Bézier editing: undo and redo", () => {
  const withPath = (contours: Contour[]): ProjectDoc => {
    const p = createPathObject(contours);
    return createProject({ objects: [{ ...p, id: "p1" }] });
  };
  const contoursOf = (d: ProjectDoc) => {
    const o = d.objects[0];
    if (o?.type !== "path") throw new Error("missing path");
    return o.contours;
  };
  const edit = (d: ProjectDoc, fn: (c: Contour[]) => Contour[]): ProjectDoc => ({
    ...d,
    objects: d.objects.map((o) => (o.type === "path" ? { ...o, contours: fn(o.contours) } : o)),
  });

  it("restores exact path data after a drag (replace… then commitFrom) and redoes it", () => {
    const base = withPath(fixture());
    const original = JSON.parse(JSON.stringify(contoursOf(base)));
    let s: EditorState = { h: createHistory(base), lastAt: 0 };
    // A drag is many replaces followed by one commitFrom at pointer-up.
    let cur = base;
    for (let k = 1; k <= 5; k++) {
      cur = edit(base, (c) => moveNodes(c, [[0, 1], [1, 2]], [k, k]));
      s = editorReducer(s, { type: "replace", doc: cur });
    }
    s = editorReducer(s, { type: "commitFrom", base });
    expect(s.h.past).toHaveLength(1);
    const edited = JSON.parse(JSON.stringify(contoursOf(s.h.present)));

    s = editorReducer(s, { type: "undo" });
    expect(contoursOf(s.h.present)).toEqual(original);
    s = editorReducer(s, { type: "redo" });
    expect(contoursOf(s.h.present)).toEqual(edited);
  });

  it("walks back through handle move, conversion and deletion one step at a time", () => {
    const d0 = withPath(fixture());
    const d1 = edit(d0, (c) => moveHandles(c, [[0, 0]], "out", [0, 15]));
    const d2 = edit(d1, (c) => convertNodes(c, [[0, 2]], "smooth"));
    const d3 = { ...d2, objects: d2.objects.map((o) => (o.type === "path" ? deleteSelectedNodes(o, [[1, 1]]) : o)) };
    let s: EditorState = { h: createHistory(d0), lastAt: 0 };
    for (const d of [d1, d2, d3]) s = editorReducer(s, { type: "commit", doc: d }, 0);
    expect(s.h.present).toBe(d3);
    s = editorReducer(s, { type: "undo" });
    expect(s.h.present).toBe(d2);
    s = editorReducer(s, { type: "undo" });
    expect(s.h.present).toBe(d1);
    s = editorReducer(s, { type: "undo" });
    expect(s.h.present).toBe(d0);
    expect(contoursOf(d0)).toEqual(contoursOf(withPath(fixture())));
    s = editorReducer(s, { type: "redo" });
    s = editorReducer(s, { type: "redo" });
    s = editorReducer(s, { type: "redo" });
    expect(s.h.present).toBe(d3);
  });
});
