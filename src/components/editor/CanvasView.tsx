import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { displayText, lineAnchorX, lineOffsets, needsGlyphEngine, objectSize, shapePath, svgTextAnchor, type Contour, type EditorObject, type GlyphAdjust, type PathNode, type ProjectDoc, type TextObject } from "@/editor/model";
import { featureCss } from "@/editor/calligraphy/features";
import { getMarkAdjust, setMarkAdjust } from "@/editor/calligraphy/marks";
import { glyphEngine } from "@/editor/glyphs/engine";
import { glyphCorners, type PlacedGlyph, type TextLayout } from "@/editor/glyphs/layout";
import { applyMat, invertMat } from "@/editor/glyphs/affine";
import { objectMatrix } from "@/editor/glyphs/scene";
import { getGlyphAdjust, moveGlyphs, neutralAdjust, patchGlyphs, sameRef, toggleRef, type GlyphRef } from "@/editor/glyphs/glyphEdit";
import { useGlyphEngineVersion } from "@/editor/glyphs/useGlyphEngine";
import type { Editor } from "@/editor/useEditor";
import { GlyphText } from "./GlyphText";
import { contoursToD, dist, nearestOnPath } from "@/editor/paths/geometry";
import { createPathObject, deleteSelectedNodes, insertNode, moveHandles, moveNodes, normalizePath, scaleContours, toLocalPoint, toLocalVec, type HandleSide, type NodeRef } from "@/editor/paths/edit";
import { curvatureNodes, fitCurve, cubicsToNodes } from "@/editor/paths/fit";

/** Doc point → object-local px (inverse of translate · rotate · scale). */
const docToLocal = (o: TextObject, p: { x: number; y: number }): [number, number] => applyMat(invertMat(objectMatrix(o)), p.x, p.y);

/** Placed glyph (base letters only) addressed by a reference. */
const findGlyph = (layout: TextLayout, r: GlyphRef): PlacedGlyph | undefined => layout.glyphs.find((g) => !g.mark && g.editAt === r.at && g.gid === r.gid);

interface Props {
  editor: Editor;
  zoom: number;
  onZoom: (z: number) => void;
  showChecker: boolean;
  showBounds: boolean;
  fontsVersion: number;
  onEditText: (id: string) => void;
  onDropDecoration: (value: string, x: number, y: number) => void;
}

type Gesture =
  | { mode: "move"; id: string; start: { x: number; y: number }; base: ProjectDoc; obj: EditorObject }
  | { mode: "resize" | "rotate"; id: string; start: { x: number; y: number }; base: ProjectDoc; obj: EditorObject }
  | { mode: "glyph"; id: string; start: { x: number; y: number }; base: ProjectDoc; obj: TextObject; refs: GlyphRef[] }
  /** Corner drag (width/height) or rotation of the primary glyph, about its centre in object-local px. */
  | { mode: "glyph-scale" | "glyph-rotate"; id: string; base: ProjectDoc; obj: TextObject; ref: GlyphRef; centre: [number, number]; startLocal: [number, number]; adj: GlyphAdjust }
  | { mode: "mark"; id: string; start: { x: number; y: number }; base: ProjectDoc; obj: TextObject; at: number; ch: string; dx: number; dy: number }
  | { mode: "pan"; sx: number; sy: number; left: number; top: number }
  | { mode: "draft-handle"; start: { x: number; y: number }; index: number; kind: "pen" | "curvature" }
  | { mode: "freehand"; points: [number, number][] }
  | { mode: "path-node"; id: string; start: { x: number; y: number }; startLocal: [number, number]; base: ProjectDoc; obj: import("@/editor/model").PathObject; refs: NodeRef[] }
  | { mode: "path-handle"; id: string; start: { x: number; y: number }; startLocal: [number, number]; base: ProjectDoc; obj: import("@/editor/model").PathObject; refs: NodeRef[]; side: HandleSide };

/** Layout for objects drawn from glyph outlines; null means "use live browser text". */
function glyphLayoutFor(o: TextObject, force: boolean): TextLayout | null {
  if (!force && !needsGlyphEngine(o)) return null;
  return glyphEngine.layout(o);
}

export function CanvasView({ editor, zoom, onZoom, showChecker, showBounds, onEditText, onDropDecoration }: Props) {
  const { doc, selectedId, setSelectedId, replaceDoc, commitFrom, markEdit, setMarkEdit, glyphEdit, setGlyphEdit } = editor;
  useGlyphEngineVersion();
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const docRef = useRef(doc);
  docRef.current = doc;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target as HTMLElement).closest("input,textarea,[contenteditable]")) {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpaceDown(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      onZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [zoom, onZoom]);

  const toDoc = (clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };

  const onMove = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    if (g.mode === "pan") {
      const el = scrollRef.current!;
      el.scrollLeft = g.left - (e.clientX - g.sx);
      el.scrollTop = g.top - (e.clientY - g.sy);
      return;
    }
    const p = toDoc(e.clientX, e.clientY);
    if (g.mode === "draft-handle") {
      const dx = p.x - g.start.x;
      const dy = p.y - g.start.y;
      editor.setDraft((draft) => {
        if (g.kind === "pen" && draft?.kind === "pen") {
          return { ...draft, nodes: draft.nodes.map((n, i) => i === g.index ? { ...n, in: [-dx, -dy], out: [dx, dy], type: "smooth" } : n) };
        }
        if (g.kind === "curvature" && draft?.kind === "curvature") {
          return { ...draft, pts: draft.pts.map((pt, i) => i === g.index ? { ...pt, tangent: [dx, dy] } : pt) };
        }
        return draft;
      });
      return;
    }
    if (g.mode === "path-node" || g.mode === "path-handle") {
      const o = g.obj;
      const local = toLocalPoint(o, [p.x, p.y]);
      const contours = g.mode === "path-node"
        ? moveNodes(o.contours, g.refs, [local[0] - g.startLocal[0], local[1] - g.startLocal[1]])
        : moveHandles(o.contours, g.refs, g.side, [local[0] - g.startLocal[0], local[1] - g.startLocal[1]], e.altKey);
      const updated = normalizePath({ ...o, contours });
      const cur = docRef.current;
      replaceDoc({ ...cur, objects: cur.objects.map((x) => x.id === o.id ? updated : x) });
      return;
    }
    if (g.mode === "freehand") {
      const last = g.points[g.points.length - 1];
      if (!last || Math.hypot(p.x - last[0], p.y - last[1]) >= 1 / zoom) {
        g.points.push([p.x, p.y]);
        editor.setDraft({ kind: "freehand", points: [...g.points] });
      }
      return;
    }
    const cur = docRef.current;
    if (g.mode === "glyph") {
      // All selected glyphs move by the same object-local offset.
      const o = g.obj;
      const a = docToLocal(o, g.start);
      const b = docToLocal(o, p);
      const glyphs = moveGlyphs(o.glyphs, g.refs, (b[0] - a[0]) / o.fontSize, (b[1] - a[1]) / o.fontSize);
      replaceDoc({ ...cur, objects: cur.objects.map((x) => (x.id === g.id ? { ...(x as TextObject), glyphs } : x)) });
      return;
    }
    if (g.mode === "glyph-scale" || g.mode === "glyph-rotate") {
      const o = g.obj;
      const [px, py] = docToLocal(o, p);
      const [cx, cy] = g.centre;
      let patch: Partial<GlyphAdjust>;
      if (g.mode === "glyph-rotate") {
        const a0 = Math.atan2(g.startLocal[1] - cy, g.startLocal[0] - cx);
        const a1 = Math.atan2(py - cy, px - cx);
        let rot = g.adj.rotation + ((a1 - a0) * 180) / Math.PI;
        if (e.shiftKey) rot = Math.round(rot / 15) * 15;
        patch = { rotation: rot };
      } else {
        // Measure along the glyph's own (rotated) axes so width and height stay independent.
        const r = (-g.adj.rotation * Math.PI) / 180;
        const toAxes = (x: number, y: number): [number, number] => [Math.abs((x - cx) * Math.cos(r) - (y - cy) * Math.sin(r)), Math.abs((x - cx) * Math.sin(r) + (y - cy) * Math.cos(r))];
        const [x0, y0] = toAxes(g.startLocal[0], g.startLocal[1]);
        const [x1, y1] = toAxes(px, py);
        let fx = x0 > 0.5 ? x1 / x0 : 1;
        let fy = y0 > 0.5 ? y1 / y0 : 1;
        if (e.shiftKey) fx = fy = Math.max(fx, fy);
        patch = { scaleX: g.adj.scaleX * fx, scaleY: g.adj.scaleY * fy };
      }
      const glyphs = patchGlyphs(o.glyphs, [g.ref], patch);
      replaceDoc({ ...cur, objects: cur.objects.map((x) => (x.id === g.id ? { ...(x as TextObject), glyphs } : x)) });
      return;
    }
    if (g.mode === "mark") {
      // Doc-space delta → object-local (undo rotation) → em units.
      const o = g.obj;
      const r = (-o.rotation * Math.PI) / 180;
      const ddx = p.x - g.start.x;
      const ddy = p.y - g.start.y;
      const lx = ddx * Math.cos(r) - ddy * Math.sin(r);
      const ly = ddx * Math.sin(r) + ddy * Math.cos(r);
      const round = (n: number) => Math.round(n * 1000) / 1000;
      const baseObj = g.base.objects.find((x) => x.id === g.id) as TextObject;
      const marks = setMarkAdjust(baseObj.marks, g.at, g.ch, { dx: round(g.dx + lx / (o.fontSize * o.scaleX)), dy: round(g.dy + ly / (o.fontSize * o.scaleY)) });
      replaceDoc({ ...cur, objects: cur.objects.map((x) => (x.id === g.id ? { ...(x as TextObject), marks } : x)) });
      return;
    }
    const o = g.obj;
    let patch: Partial<EditorObject> = {};
    if (g.mode === "move") {
      patch = { x: Math.round(o.x + p.x - g.start.x), y: Math.round(o.y + p.y - g.start.y) };
    } else if (g.mode === "rotate") {
      let a = (Math.atan2(p.y - o.y, p.x - o.x) * 180) / Math.PI + 90;
      if (e.shiftKey) a = Math.round(a / 15) * 15;
      a = ((Math.round(a) % 360) + 360) % 360;
      patch = { rotation: a > 180 ? a - 360 : a };
    } else if (o.type === "text") {
      const d0 = Math.hypot(g.start.x - o.x, g.start.y - o.y) || 1;
      const d1 = Math.hypot(p.x - o.x, p.y - o.y);
      patch = { fontSize: Math.max(6, Math.round(o.fontSize * (d1 / d0))) };
    } else if (o.type === "path") {
      // Scale the Bézier nodes and handles about the path's centre.
      const size = objectSize(o);
      const [lx, ly] = toLocalVec(o, [p.x - o.x, p.y - o.y]).map(Math.abs) as [number, number];
      let sx = size.width > 1 ? lx / (size.width / 2) : 1;
      let sy = size.height > 1 ? ly / (size.height / 2) : 1;
      if (e.shiftKey) sx = sy = Math.max(sx, sy);
      patch = { contours: scaleContours(o.contours, Math.max(0.01, sx), Math.max(0.01, sy)) };
    } else {
      const r = (-o.rotation * Math.PI) / 180;
      const dx = p.x - o.x;
      const dy = p.y - o.y;
      const lx = Math.abs(dx * Math.cos(r) - dy * Math.sin(r));
      const ly = Math.abs(dx * Math.sin(r) + dy * Math.cos(r));
      if (e.shiftKey) {
        const s = Math.max(lx / (o.width / 2), ly / (o.height / 2));
        patch = { width: Math.max(4, Math.round(o.width * s)), height: Math.max(4, Math.round(o.height * s)) };
      } else patch = { width: Math.max(4, Math.round(lx * 2)), height: Math.max(4, Math.round(ly * 2)) };
    }
    replaceDoc({ ...cur, objects: cur.objects.map((x) => (x.id === g.id ? ({ ...x, ...patch } as EditorObject) : x)) });
  };

  const onUp = () => {
    const g = gesture.current;
    gesture.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    if (g?.mode === "freehand") {
      const nodes = cubicsToNodes(fitCurve(g.points, Math.max(0.5, editor.smoothing / zoom)));
      if (nodes.length >= 2) editor.addObject(createPathObject([{ nodes, closed: false }]));
      editor.setTool("select");
      return;
    }
    if (g && g.mode !== "pan" && g.mode !== "draft-handle") commitFrom(g.base);
  };

  const listen = () => {
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const begin = (e: RPointerEvent, mode: "move" | "resize" | "rotate", obj: EditorObject) => {
    e.stopPropagation();
    if (spaceDown) return startPan(e);
    setSelectedId(obj.id);
    if (obj.locked) return;
    gesture.current = { mode, id: obj.id, start: toDoc(e.clientX, e.clientY), base: doc, obj };
    listen();
  };

  const beginPathNode = (e: RPointerEvent, o: import("@/editor/model").PathObject, contour: number, index: number) => {
    e.stopPropagation();
    if (spaceDown) return startPan(e);
    if (o.locked) return;
    const p = toDoc(e.clientX, e.clientY);
    const ref: NodeRef = [contour, index];
    setSelectedId(o.id);
    if (e.shiftKey) {
      editor.setNodeSel((current) =>
        current.some(([c, i]) => c === contour && i === index)
          ? current.filter(([c, i]) => c !== contour || i !== index)
          : [...current, ref],
      );
      return;
    }
    const refs = editor.nodeSel.some(([c, i]) => c === contour && i === index) ? editor.nodeSel : [ref];
    if (refs.length !== editor.nodeSel.length || !editor.nodeSel.some(([c, i]) => c === contour && i === index)) editor.setNodeSel(refs);
    const local = toLocalPoint(o, [p.x, p.y]);
    gesture.current = { mode: "path-node", id: o.id, start: p, startLocal: local, base: doc, obj: o, refs };
    listen();
  };

  const beginPathHandle = (e: RPointerEvent, o: import("@/editor/model").PathObject, contour: number, index: number, side: HandleSide) => {
    e.stopPropagation();
    if (spaceDown) return startPan(e);
    if (o.locked) return;
    const p = toDoc(e.clientX, e.clientY);
    setSelectedId(o.id);
    const clicked = editor.nodeSel.some(([ci, ni]) => ci === contour && ni === index);
    const refs = clicked ? editor.nodeSel : [[contour, index] as NodeRef];
    if (!clicked) editor.setNodeSel(refs);
    const local = toLocalPoint(o, [p.x, p.y]);
    gesture.current = { mode: "path-handle", id: o.id, start: p, startLocal: local, base: doc, obj: o, refs, side };
    listen();
  };

  const beginGlyph = (e: RPointerEvent, obj: TextObject, at: number, gid: number) => {
    e.stopPropagation();
    if (spaceDown) return startPan(e);
    const ref: GlyphRef = { at, gid };
    const current = glyphEdit?.objectId === obj.id ? glyphEdit.refs : [];
    // Shift / Ctrl / Cmd adds or removes a letter from the selection without dragging.
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      setGlyphEdit({ objectId: obj.id, refs: toggleRef(current, ref) });
      return;
    }
    // Dragging a letter that is already selected moves the whole selection.
    const inSel = current.some((r) => sameRef(r, ref));
    const refs = inSel ? [...current.filter((r) => !sameRef(r, ref)), ref] : [ref];
    setGlyphEdit({ objectId: obj.id, refs });
    if (obj.locked) return;
    gesture.current = { mode: "glyph", id: obj.id, start: toDoc(e.clientX, e.clientY), base: doc, obj, refs };
    listen();
  };

  const beginGlyphHandle = (e: RPointerEvent, mode: "glyph-scale" | "glyph-rotate", obj: TextObject, ref: GlyphRef, centre: [number, number]) => {
    e.stopPropagation();
    if (obj.locked) return;
    const adj = getGlyphAdjust(obj.glyphs, ref) ?? neutralAdjust(ref);
    gesture.current = { mode, id: obj.id, base: doc, obj, ref, centre, startLocal: docToLocal(obj, toDoc(e.clientX, e.clientY)), adj };
    listen();
  };

  const beginMark = (e: RPointerEvent, obj: TextObject, at: number, ch: string) => {
    e.stopPropagation();
    if (spaceDown) return startPan(e);
    setMarkEdit({ objectId: obj.id, at });
    if (obj.locked) return;
    const adj = getMarkAdjust(obj.marks, at);
    gesture.current = { mode: "mark", id: obj.id, start: toDoc(e.clientX, e.clientY), base: doc, obj, at, ch, dx: adj?.dx ?? 0, dy: adj?.dy ?? 0 };
    listen();
  };

  const startPan = (e: RPointerEvent) => {
    const el = scrollRef.current!;
    gesture.current = { mode: "pan", sx: e.clientX, sy: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    listen();
  };

  const selected = doc.objects.find((o) => o.id === selectedId && !o.hidden);
  const markObj = markEdit ? (doc.objects.find((o) => o.id === markEdit.objectId && o.type === "text" && !o.hidden) as TextObject | undefined) : undefined;
  const markLayout = markObj ? glyphLayoutFor(markObj, true) : null;
  const glyphObj = glyphEdit ? (doc.objects.find((o) => o.id === glyphEdit.objectId && o.type === "text" && !o.hidden) as TextObject | undefined) : undefined;
  const glyphLayout = glyphObj ? glyphLayoutFor(glyphObj, true) : null;
  const hs = 10 / zoom;
  const pad = 80;

  const finishDraft = (closed = false) => {
    const draft = editor.draft;
    let nodes: PathNode[] = [];
    if (draft?.kind === "pen") nodes = draft.nodes;
    else if (draft?.kind === "curvature") nodes = curvatureNodes(draft.pts, closed);
    else if (draft?.kind === "freehand") nodes = cubicsToNodes(fitCurve(draft.points, Math.max(0.5, editor.smoothing / zoom)));
    const clean: PathNode[] = [];
    for (const node of nodes) {
      const previous = clean[clean.length - 1];
      if (!previous || dist([previous.x, previous.y], [node.x, node.y]) >= 2 / zoom) clean.push(node);
    }
    nodes = clean;
    if (closed && nodes.length > 2 && dist([nodes[0]!.x, nodes[0]!.y], [nodes[nodes.length - 1]!.x, nodes[nodes.length - 1]!.y]) < 8 / zoom) nodes = nodes.slice(0, -1);
    if (nodes.length >= 2) {
      const contour: Contour = { nodes, closed };
      editor.addObject(createPathObject([contour]));
    }
    editor.setTool("select");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='textbox']")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && editor.tool === "node" && editor.nodeSel.length) {
        const active = editor.doc.objects.find((o) => o.id === editor.selectedId);
        if (active?.type === "path" && !active.locked) {
          e.preventDefault();
          e.stopPropagation();
          const updated = deleteSelectedNodes(active, editor.nodeSel);
          if (!updated.contours.length) editor.removeObject(active.id);
          else editor.setDoc({ ...editor.doc, objects: editor.doc.objects.map((o) => o.id === active.id ? updated : o) });
          editor.setNodeSel([]);
        }
        return;
      }
      if (!editor.draft || !["pen", "curvature", "freehand"].includes(editor.tool)) return;
      if (e.key === "Enter" && (editor.tool === "pen" || editor.tool === "curvature")) {
        e.preventDefault();
        finishDraft(false);
      } else if (e.key === "Escape") {
        e.preventDefault();
        gesture.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        editor.setDraft(null);
        editor.setTool("select");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div
      ref={scrollRef}
      className="relative h-full w-full overflow-auto bg-surround"
      style={{ cursor: spaceDown ? "grab" : editor.tool === "select" ? "default" : "crosshair" }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-acs-decoration")) e.preventDefault(); }}
      onDrop={(e) => { const value = e.dataTransfer.getData("application/x-acs-decoration"); if (!value) return; e.preventDefault(); const p = toDoc(e.clientX, e.clientY); onDropDecoration(value, p.x, p.y); }}
      onPointerDown={(e) => {
        if (spaceDown || e.button === 1) return startPan(e);
        if (editor.tool === "pen" || editor.tool === "curvature") {
          const p = toDoc(e.clientX, e.clientY);
          const draft = editor.draft;
          if (editor.tool === "pen") {
            const nodes = draft?.kind === "pen" ? draft.nodes : [];
            if (e.detail > 1 && nodes.length >= 2) {
              finishDraft(false);
              return;
            }
            if (nodes.length >= 3 && dist([nodes[0]!.x, nodes[0]!.y], [p.x, p.y]) <= 12 / zoom) {
              finishDraft(true);
              return;
            }
            const next = [...nodes, { x: p.x, y: p.y, in: [0, 0] as [number, number], out: [0, 0] as [number, number], type: "corner" as const }];
            editor.setDraft({ kind: "pen", nodes: next });
            gesture.current = { mode: "draft-handle", start: p, index: next.length - 1, kind: "pen" };
          } else {
            const pts = draft?.kind === "curvature" ? draft.pts : [];
            if (e.detail > 1 && pts.length >= 2) {
              finishDraft(false);
              return;
            }
            if (pts.length >= 3 && dist([pts[0]!.x, pts[0]!.y], [p.x, p.y]) <= 12 / zoom) {
              finishDraft(true);
              return;
            }
            const next = [...pts, { x: p.x, y: p.y }];
            editor.setDraft({ kind: "curvature", pts: next });
            gesture.current = { mode: "draft-handle", start: p, index: next.length - 1, kind: "curvature" };
          }
          listen();
          return;
        }
        if (editor.tool === "freehand") {
          const p = toDoc(e.clientX, e.clientY);
          gesture.current = { mode: "freehand", points: [[p.x, p.y]] };
          editor.setDraft({ kind: "freehand", points: [[p.x, p.y]] });
          listen();
          return;
        }
        if (editor.tool === "node") return;
        if (markEdit) return setMarkEdit({ ...markEdit, at: null });
        // Letter mode: first click outside clears the picked letters, the next one leaves the mode.
        if (glyphEdit?.refs.length) return setGlyphEdit({ ...glyphEdit, refs: [] });
        if (glyphEdit) setGlyphEdit(null);
        setSelectedId(null);
      }}
      onDoubleClick={(e) => {
        if (editor.tool === "pen" || editor.tool === "curvature") {
          e.preventDefault();
          finishDraft(false);
        }
      }}
    >
      <div className="flex min-h-full min-w-full items-center justify-center" style={{ padding: pad, width: "max-content", height: "max-content" }}>
        <div
          className={showChecker || doc.transparentBackground ? "checkerboard" : ""}
          style={{ width: doc.width * zoom, height: doc.height * zoom, boxShadow: showBounds ? "var(--shadow-page)" : undefined }}
        >
          <svg
            ref={svgRef}
            width={doc.width * zoom}
            height={doc.height * zoom}
            viewBox={`0 0 ${doc.width} ${doc.height}`}
            className="block overflow-visible"
            role="img"
            aria-label="Design canvas"
          >
            {!doc.transparentBackground && <rect width={doc.width} height={doc.height} fill={doc.background} />}
            {doc.objects.map((o) => {
              if (o.hidden) return null;
              const inMarkMode = o.id === markObj?.id;
              const inGlyphMode = o.id === glyphObj?.id;
              return (
                <g
                  key={o.id}
                  transform={`translate(${o.x} ${o.y}) rotate(${o.rotation})${o.type === "text" ? ` scale(${o.scaleX} ${o.scaleY})` : ""}`}
                  opacity={inMarkMode ? Math.max(0.35, o.opacity) : o.opacity}
                  onPointerDown={(e) => {
                    if (editor.tool !== "select" && editor.tool !== "node") return;
                    if (editor.tool === "node") {
                      if (o.type === "path") setSelectedId(o.id);
                      return;
                    }
                    if (inMarkMode) {
                      e.stopPropagation();
                      setMarkEdit({ objectId: o.id, at: null });
                    } else if (inGlyphMode) {
                      // Empty space inside the text (letters handle their own clicks).
                      e.stopPropagation();
                      if (!e.shiftKey && !e.ctrlKey && !e.metaKey) setGlyphEdit({ objectId: o.id, refs: [] });
                    } else begin(e, "move", o);
                  }}
                  onDoubleClick={(e) => {
                    if (editor.tool === "node" && o.type === "path" && !o.locked) {
                      e.stopPropagation();
                      const p = toDoc(e.clientX, e.clientY);
                      const local = toLocalPoint(o, [p.x, p.y]);
                      const hit = nearestOnPath(o.contours, local);
                      if (hit && hit.distance <= 12 / zoom) {
                        const result = insertNode(o.contours[hit.contour]!, hit.seg, hit.t);
                        const contours = o.contours.map((ct, ci) => ci === hit.contour ? result.contour : ct);
                        const updated = normalizePath({ ...o, contours });
                        editor.setDoc({ ...doc, objects: doc.objects.map((item) => item.id === o.id ? updated : item) });
                        editor.setNodeSel([[hit.contour, result.index]]);
                      }
                    } else if (o.type === "text" && !inMarkMode && !inGlyphMode) onEditText(o.id);
                  }}
                  style={{ cursor: inMarkMode || inGlyphMode ? "default" : o.locked ? "not-allowed" : editor.tool === "node" ? "crosshair" : "move" }}
                  data-object-id={o.id}
                >
                  <ObjectShape o={o} forceGlyph={inMarkMode || inGlyphMode} interactiveGlyphs={inGlyphMode} onGlyphPointerDown={beginGlyph} />
                </g>
              );
            })}
            {editor.draft && (
              <g pointerEvents="none">
                {editor.draft.kind === "pen" && editor.draft.nodes.length > 0 && (
                  <>
                    <path d={contoursToD([{ nodes: editor.draft.nodes, closed: false }])} fill="none" stroke="var(--selection)" strokeWidth={2 / zoom} strokeDasharray={`${5 / zoom} ${3 / zoom}`} />
                    {editor.draft.nodes.map((n, i) => <circle key={i} cx={n.x} cy={n.y} r={4 / zoom} fill="var(--card)" stroke="var(--selection)" strokeWidth={1.5 / zoom} />)}
                  </>
                )}
                {editor.draft.kind === "curvature" && editor.draft.pts.length > 0 && (
                  <>
                    <path d={contoursToD([{ nodes: curvatureNodes(editor.draft.pts, false), closed: false }])} fill="none" stroke="var(--selection)" strokeWidth={2 / zoom} strokeDasharray={`${5 / zoom} ${3 / zoom}`} />
                    {editor.draft.pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4 / zoom} fill="var(--card)" stroke="var(--selection)" strokeWidth={1.5 / zoom} />)}
                  </>
                )}
                {editor.draft.kind === "freehand" && editor.draft.points.length > 1 && (
                  <polyline points={editor.draft.points.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--selection)" strokeWidth={2 / zoom} strokeLinecap="round" strokeLinejoin="round" />
                )}
              </g>
            )}
            {showBounds && (
              <rect width={doc.width} height={doc.height} fill="none" stroke="var(--border)" strokeWidth={1 / zoom} pointerEvents="none" />
            )}
            {selected?.type === "path" && editor.tool === "node" && (
              <g transform={`translate(${selected.x} ${selected.y}) rotate(${selected.rotation})`} data-path-nodes="">
                {selected.contours.map((ct, ci) => ct.nodes.map((n, ni) => {
                  const chosen = editor.nodeSel.some(([c, i]) => c === ci && i === ni);
                  const incoming = [n.x + n.in[0], n.y + n.in[1]];
                  const outgoing = [n.x + n.out[0], n.y + n.out[1]];
                  const hasIn = Math.hypot(n.in[0], n.in[1]) > 0.01;
                  const hasOut = Math.hypot(n.out[0], n.out[1]) > 0.01;
                  return (
                    <g key={`${ci}:${ni}`}>
                      {hasIn && <><line x1={n.x} y1={n.y} x2={incoming[0]} y2={incoming[1]} stroke="var(--selection)" strokeWidth={1.2 / zoom} /><circle cx={incoming[0]} cy={incoming[1]} r={3.5 / zoom} fill="var(--card)" stroke="var(--selection)" strokeWidth={1.2 / zoom} style={{ cursor: "crosshair", pointerEvents: "auto" }} onPointerDown={(e) => beginPathHandle(e, selected, ci, ni, "in")} /></>}
                      {hasOut && <><line x1={n.x} y1={n.y} x2={outgoing[0]} y2={outgoing[1]} stroke="var(--selection)" strokeWidth={1.2 / zoom} /><circle cx={outgoing[0]} cy={outgoing[1]} r={3.5 / zoom} fill="var(--card)" stroke="var(--selection)" strokeWidth={1.2 / zoom} style={{ cursor: "crosshair", pointerEvents: "auto" }} onPointerDown={(e) => beginPathHandle(e, selected, ci, ni, "out")} /></>}
                      <circle cx={n.x} cy={n.y} r={(chosen ? 5 : 4) / zoom} fill={chosen ? "var(--selection)" : "var(--card)"} stroke="var(--selection)" strokeWidth={1.5 / zoom} style={{ cursor: "move", pointerEvents: "auto" }} onPointerDown={(e) => beginPathNode(e, selected, ci, ni)} />
                    </g>
                  );
                }))}
              </g>
            )}
            {selected && !markObj && !glyphObj && editor.tool !== "node" && <SelectionBox o={selected} hs={hs} zoom={zoom} onHandle={begin} />}
            {glyphObj && glyphLayout && glyphEdit && (
              <GlyphOverlay o={glyphObj} layout={glyphLayout} refs={glyphEdit.refs} zoom={zoom} onHandle={beginGlyphHandle} />
            )}
            {markObj && markLayout && (
              <MarkOverlay o={markObj} layout={markLayout} selectedAt={markEdit?.at ?? null} zoom={zoom} onPick={beginMark} />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}

/**
 * Letter-mode overlay in document space: a dashed frame around the text, a
 * frame around every picked letter, and — for a single picked letter — corner
 * handles (independent width/height, Shift = proportional) and a rotation
 * handle (Shift = 15° steps).
 */
function GlyphOverlay({ o, layout, refs, zoom, onHandle }: {
  o: TextObject;
  layout: TextLayout;
  refs: GlyphRef[];
  zoom: number;
  onHandle: (e: RPointerEvent, mode: "glyph-scale" | "glyph-rotate", o: TextObject, ref: GlyphRef, centre: [number, number]) => void;
}) {
  const om = objectMatrix(o);
  const toDocPt = (p: [number, number]) => applyMat(om, p[0], p[1]);
  const sw = 1.5 / zoom;
  const hs = 9 / zoom;
  const objCorners = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => toDocPt([(sx * layout.boxWidth) / 2, (sy * layout.boxHeight) / 2]));
  const frames = refs.flatMap((r) => {
    const g = findGlyph(layout, r);
    const corners = g && glyphCorners(g);
    return g && corners ? [{ r, g, corners }] : [];
  });
  const primary = refs.length === 1 ? frames[0] : undefined;
  const poly = (pts: [number, number][]) => pts.map((p) => p.join(",")).join(" ");
  return (
    <g data-glyph-overlay="">
      <polygon points={poly(objCorners)} fill="none" stroke="var(--selection)" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`} pointerEvents="none" />
      {frames.map(({ r, corners }) => (
        <polygon key={`${r.at}:${r.gid}`} points={poly(corners.map(toDocPt))} fill="color-mix(in oklab, var(--selection) 10%, transparent)" stroke="var(--selection)" strokeWidth={sw} pointerEvents="none" data-glyph-frame={`${r.at}:${r.gid}`} />
      ))}
      {primary && !o.locked && (() => {
        const local = primary.corners;
        const c: [number, number] = [(local[0]![0] + local[2]![0]) / 2, (local[0]![1] + local[2]![1]) / 2];
        const d = local.map(toDocPt);
        const cd = toDocPt(c);
        // Top edge = font-units top (y up), i.e. corners 0 and 1.
        const top: [number, number] = [(d[0]![0] + d[1]![0]) / 2, (d[0]![1] + d[1]![1]) / 2];
        const len = Math.hypot(top[0] - cd[0], top[1] - cd[1]) || 1;
        const rot: [number, number] = [top[0] + ((top[0] - cd[0]) / len) * 26 / zoom, top[1] + ((top[1] - cd[1]) / len) * 26 / zoom];
        return (
          <>
            <line x1={top[0]} y1={top[1]} x2={rot[0]} y2={rot[1]} stroke="var(--selection)" strokeWidth={sw} pointerEvents="none" />
            <circle cx={rot[0]} cy={rot[1]} r={hs / 1.5} fill="var(--card)" stroke="var(--selection)" strokeWidth={sw} style={{ cursor: "grab" }}
              onPointerDown={(e) => onHandle(e, "glyph-rotate", o, primary.r, c)} aria-label="Rotate letter" data-glyph-handle="rotate" />
            {d.map((p, i) => (
              <rect key={i} x={p[0] - hs / 2} y={p[1] - hs / 2} width={hs} height={hs} fill="var(--card)" stroke="var(--selection)" strokeWidth={sw} style={{ cursor: "nwse-resize" }}
                onPointerDown={(e) => onHandle(e, "glyph-scale", o, primary.r, c)} aria-label="Resize letter" data-glyph-handle={`corner-${i}`} />
            ))}
          </>
        );
      })()}
    </g>
  );
}

function ObjectShape({ o, forceGlyph, interactiveGlyphs, onGlyphPointerDown }: { o: EditorObject; forceGlyph: boolean; interactiveGlyphs: boolean; onGlyphPointerDown: (e: RPointerEvent, o: TextObject, at: number, gid: number) => void }) {
  if (o.type === "shape") {
    const { width, height } = o;
    return (
      <>
        <rect x={-width / 2} y={-height / 2} width={width} height={height} fill="transparent" />
        <path
          d={shapePath(o.shape, width, height, o.cornerRadius)}
          fill={o.fill === "transparent" ? "none" : o.fill}
          stroke={o.strokeWidth > 0 ? o.stroke : "none"}
          strokeWidth={o.strokeWidth}
          strokeLinejoin="round"
        />
      </>
    );
  }
  if (o.type === "path") {
    const d = contoursToD(o.contours);
    const filled = o.fill !== "transparent";
    return (
      <>
        {/* Wide invisible hit area so thin open strokes stay easy to pick; filled paths are hit inside too. */}
        <path d={d} fill={filled ? "transparent" : "none"} stroke="transparent" strokeWidth={Math.max(o.strokeWidth, 12)} pointerEvents={filled ? "visible" : "visibleStroke"} />
        <path
          d={d}
          fill={filled ? o.fill : "none"}
          fillRule={o.fillRule}
          stroke={o.strokeWidth > 0 && o.stroke !== "transparent" ? o.stroke : "none"}
          strokeWidth={o.strokeWidth}
          strokeLinecap={o.lineCap}
          strokeLinejoin={o.lineJoin}
          pointerEvents="none"
        />
      </>
    );
  }
  const layout = glyphLayoutFor(o, forceGlyph);
  if (layout) return <GlyphText o={o} layout={layout} interactive={interactiveGlyphs} onGlyphPointerDown={onGlyphPointerDown} />;
  // Live browser text (also the fallback while the glyph engine loads or cannot read the font).
  const { width, height } = objectSize(o);
  const ax = lineAnchorX(o, width);
  const offs = lineOffsets(o);
  return (
    <>
      <rect x={-width / 2} y={-height / 2} width={width} height={height} fill="transparent" />
      <text
        direction={o.direction}
        textAnchor={svgTextAnchor(o)}
        dominantBaseline="central"
        fill={o.color}
        stroke={o.strokeWidth > 0 ? o.color : "none"}
        strokeWidth={o.strokeWidth}
        strokeLinejoin="round"
        paintOrder="stroke fill"
        style={{
          fontFamily: `"${o.fontFamily}", serif`,
          fontSize: o.fontSize,
          fontWeight: o.fontWeight,
          letterSpacing: o.letterSpacing,
          wordSpacing: o.wordSpacing,
          fontFeatureSettings: featureCss(o.features),
          whiteSpace: "pre",
          unicodeBidi: "plaintext",
          userSelect: "none",
        }}
      >
        {displayText(o)
          .split("\n")
          .map((line, i) => (
            <tspan key={i} x={ax} y={offs[i]}>
              {line || " "}
            </tspan>
          ))}
      </text>
    </>
  );
}

/** Clickable boxes over every diacritic glyph of the object being edited. */
function MarkOverlay({
  o,
  layout,
  selectedAt,
  zoom,
  onPick,
}: {
  o: TextObject;
  layout: TextLayout;
  selectedAt: number | null;
  zoom: number;
  onPick: (e: RPointerEvent, o: TextObject, at: number, ch: string) => void;
}) {
  const min = 14 / zoom;
  const sw = 1.25 / zoom;
  return (
    <g transform={`translate(${o.x} ${o.y}) rotate(${o.rotation}) scale(${o.scaleX} ${o.scaleY})`} data-mark-overlay="">
      <rect
        x={-layout.boxWidth / 2}
        y={-layout.boxHeight / 2}
        width={layout.boxWidth}
        height={layout.boxHeight}
        fill="none"
        stroke="var(--selection)"
        strokeWidth={sw}
        strokeDasharray={`${4 / zoom} ${3 / zoom}`}
        pointerEvents="none"
      />
      {layout.glyphs.map((g, i) => {
        if (!g.mark || g.mark.at < 0) return null;
        const { box, at, ch, adjusted } = g.mark;
        const w = Math.max(box.w, min);
        const h = Math.max(box.h, min);
        const x = box.x + box.w / 2 - w / 2;
        const y = box.y + box.h / 2 - h / 2;
        const active = at === selectedAt;
        return (
          <g key={i}>
            {active && (
              <path transform={`matrix(${g.k} 0 0 ${-g.k} ${g.tx} ${g.ty})`} d={g.d} fill="var(--selection)" pointerEvents="none" />
            )}
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx={2 / zoom}
              fill={active ? "color-mix(in oklab, var(--selection) 18%, transparent)" : "transparent"}
              stroke="var(--selection)"
              strokeWidth={active ? sw * 1.6 : sw}
              strokeDasharray={adjusted || active ? undefined : `${2 / zoom} ${2 / zoom}`}
              style={{ cursor: o.locked ? "not-allowed" : "move" }}
              onPointerDown={(e) => onPick(e, o, at, ch)}
              role="button"
              aria-label={`Diacritic ${at}`}
              data-mark-at={at}
            />
          </g>
        );
      })}
    </g>
  );
}

function SelectionBox({
  o,
  hs,
  zoom,
  onHandle,
}: {
  o: EditorObject;
  hs: number;
  zoom: number;
  onHandle: (e: RPointerEvent, mode: "move" | "resize" | "rotate", o: EditorObject) => void;
}) {
  const { width, height } = objectSize(o);
  const w = width + 8 / zoom;
  const h = height + 8 / zoom;
  const rotY = -h / 2 - 28 / zoom;
  return (
    <g transform={`translate(${o.x} ${o.y}) rotate(${o.rotation})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="none" stroke="var(--selection)" strokeWidth={1.5 / zoom} strokeDasharray={o.locked ? `${4 / zoom} ${3 / zoom}` : undefined} pointerEvents="none" />
      {!o.locked && (
        <>
          <line x1={0} y1={-h / 2} x2={0} y2={rotY} stroke="var(--selection)" strokeWidth={1.5 / zoom} pointerEvents="none" />
          <circle
            cx={0}
            cy={rotY}
            r={hs / 1.6}
            fill="var(--card)"
            stroke="var(--selection)"
            strokeWidth={1.5 / zoom}
            style={{ cursor: "grab" }}
            onPointerDown={(e) => onHandle(e, "rotate", o)}
            aria-label="Rotate"
          />
          <rect
            x={w / 2 - hs / 2}
            y={h / 2 - hs / 2}
            width={hs}
            height={hs}
            fill="var(--card)"
            stroke="var(--selection)"
            strokeWidth={1.5 / zoom}
            style={{ cursor: "nwse-resize" }}
            onPointerDown={(e) => onHandle(e, "resize", o)}
            aria-label="Resize"
          />
        </>
      )}
    </g>
  );
}
