import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { commit, createHistory, redo, replace, undo, type History } from "./history";
import type { EditorObject, PathNode, ProjectDoc } from "./model";
import type { CurvePoint } from "./paths/fit";
import type { NodeRef } from "./paths/edit";

export interface EditorState {
  h: History<ProjectDoc>;
  lastKey?: string | undefined;
  lastAt: number;
}

export type EditorAction =
  | { type: "commit"; doc: ProjectDoc; key?: string | undefined }
  | { type: "replace"; doc: ProjectDoc }
  | { type: "commitFrom"; base: ProjectDoc }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; doc: ProjectDoc };

const COALESCE_MS = 700;

export function editorReducer(s: EditorState, a: EditorAction, now = Date.now()): EditorState {
  switch (a.type) {
    case "commit":
      // Rapid edits of the same field (e.g. dragging a color picker) form one undo step.
      if (a.key && a.key === s.lastKey && now - s.lastAt < COALESCE_MS) return { ...s, h: replace(s.h, a.doc), lastAt: now };
      return { h: commit(s.h, a.doc), lastKey: a.key, lastAt: now };
    case "replace":
      return { ...s, h: replace(s.h, a.doc) };
    case "commitFrom":
      return { h: commit(s.h, s.h.present, a.base), lastKey: undefined, lastAt: now };
    case "undo":
      return { h: undo(s.h), lastKey: undefined, lastAt: 0 };
    case "redo":
      return { h: redo(s.h), lastKey: undefined, lastAt: 0 };
    case "reset":
      return { h: createHistory(a.doc), lastAt: 0 };
  }
}

const reducer = (s: EditorState, a: EditorAction) => editorReducer(s, a);

/** Diacritic editing mode: which text object, and which mark (original text index) is selected. */
export interface GlyphEdit { objectId: string; at: number; gid: number; }

export interface MarkEdit {
  objectId: string;
  at: number | null;
}

/**
 * select: move/rotate/resize objects · node: edit Bézier nodes of the selected path ·
 * pen / curvature / freehand: create new paths.
 */
export type Tool = "select" | "node" | "pen" | "curvature" | "freehand";
export const CREATION_TOOLS: Tool[] = ["pen", "curvature", "freehand"];

/** An unfinished path being drawn (document coordinates). Not part of the undo history until finished. */
export type PathDraft = { kind: "pen"; nodes: PathNode[] } | { kind: "curvature"; pts: CurvePoint[] } | { kind: "freehand"; points: [number, number][] };

const touch = (d: ProjectDoc): ProjectDoc => ({ ...d, updatedAt: new Date().toISOString() });

export function useEditor(initial: ProjectDoc) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({ h: createHistory(initial), lastAt: 0 }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savedDoc, setSavedDoc] = useState<ProjectDoc | null>(null);
  const [markEdit, setMarkEdit] = useState<MarkEdit | null>(null);
  const [glyphEdit, setGlyphEdit] = useState<GlyphEdit | null>(null);
  const [tool, setToolRaw] = useState<Tool>("select");
  const [nodeSel, setNodeSel] = useState<NodeRef[]>([]);
  const [draft, setDraft] = useState<PathDraft | null>(null);
  /** Freehand smoothing tolerance in screen pixels. */
  const [smoothing, setSmoothing] = useState(3);
  const doc = state.h.present;

  // Leaving the object (selection change, deletion, undo past its creation) ends diacritic editing.
  const markObjectAlive = !!markEdit && doc.objects.some((o) => o.id === markEdit.objectId && o.type === "text" && !o.hidden);
  useEffect(() => {
    if (markEdit && (markEdit.objectId !== selectedId || !markObjectAlive)) setMarkEdit(null);
  }, [markEdit, selectedId, markObjectAlive]);

  // Node editing needs a visible, unlocked path; otherwise fall back to the selection tool.
  const selectedObj = doc.objects.find((o) => o.id === selectedId);
  const nodeTarget = selectedObj?.type === "path" && !selectedObj.hidden ? selectedObj : null;
  useEffect(() => {
    if (tool === "node" && !nodeTarget) setToolRaw("select");
  }, [tool, nodeTarget]);
  // Drop node references that no longer exist (after undo, deletion, etc.).
  useEffect(() => {
    if (!nodeSel.length) return;
    const valid = nodeTarget ? nodeSel.filter(([c, i]) => !!nodeTarget.contours[c]?.nodes[i]) : [];
    if (valid.length !== nodeSel.length) setNodeSel(valid);
  }, [nodeSel, nodeTarget]);
  useEffect(() => setNodeSel([]), [selectedId]);

  const setTool = useCallback((t: Tool) => {
    setToolRaw(t);
    setDraft(null);
    setNodeSel([]);
    setMarkEdit(null);
    setGlyphEdit(null);
  }, []);

  const setDoc = useCallback((next: ProjectDoc, key?: string) => dispatch({ type: "commit", doc: touch(next), key }), []);
  const replaceDoc = useCallback((next: ProjectDoc) => dispatch({ type: "replace", doc: next }), []);
  const commitFrom = useCallback((base: ProjectDoc) => dispatch({ type: "commitFrom", base }), []);

  const updateObject = useCallback(
    (id: string, patch: Partial<EditorObject>, key?: string) => {
      setDoc({ ...doc, objects: doc.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as EditorObject) : o)) }, key ? `${id}:${key}` : undefined);
    },
    [doc, setDoc],
  );

  const addObject = useCallback(
    (o: EditorObject) => {
      setDoc({ ...doc, objects: [...doc.objects, o] });
      setSelectedId(o.id);
    },
    [doc, setDoc],
  );

  const removeObject = useCallback(
    (id: string) => {
      setDoc({ ...doc, objects: doc.objects.filter((o) => o.id !== id) });
      setSelectedId((s) => (s === id ? null : s));
    },
    [doc, setDoc],
  );

  const moveLayer = useCallback(
    (id: string, to: "up" | "down" | "top" | "bottom") => {
      const objs = [...doc.objects];
      const i = objs.findIndex((o) => o.id === id);
      if (i < 0) return;
      const o = objs.splice(i, 1)[0] as EditorObject;
      const j = to === "top" ? objs.length : to === "bottom" ? 0 : to === "up" ? Math.min(objs.length, i + 1) : Math.max(0, i - 1);
      objs.splice(j, 0, o);
      if (j !== i) setDoc({ ...doc, objects: objs });
    },
    [doc, setDoc],
  );

  const loadDoc = useCallback((d: ProjectDoc, saved: boolean) => {
    dispatch({ type: "reset", doc: d });
    setSelectedId(null);
    setSavedDoc(saved ? d : null);
    setToolRaw("select");
    setDraft(null);
  }, []);

  const selected = useMemo(() => doc.objects.find((o) => o.id === selectedId) ?? null, [doc, selectedId]);

  return {
    doc,
    selected,
    selectedId,
    setSelectedId,
    markEdit,
    setMarkEdit,
    glyphEdit,
    setGlyphEdit,
    tool,
    setTool,
    nodeSel,
    setNodeSel,
    draft,
    setDraft,
    smoothing,
    setSmoothing,
    setDoc,
    replaceDoc,
    commitFrom,
    updateObject,
    addObject,
    removeObject,
    moveLayer,
    loadDoc,
    undo: () => dispatch({ type: "undo" }),
    redo: () => dispatch({ type: "redo" }),
    canUndo: state.h.past.length > 0,
    canRedo: state.h.future.length > 0,
    isSaved: savedDoc === doc,
    markSaved: () => setSavedDoc(doc),
  };
}

export type Editor = ReturnType<typeof useEditor>;
