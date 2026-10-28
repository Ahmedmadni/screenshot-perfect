import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { commit, createHistory, redo, replace, undo, type History } from "./history";
import type { EditorObject, ProjectDoc } from "./model";

interface State {
  h: History<ProjectDoc>;
  lastKey?: string | undefined;
  lastAt: number;
}

type Action =
  | { type: "commit"; doc: ProjectDoc; key?: string | undefined }
  | { type: "replace"; doc: ProjectDoc }
  | { type: "commitFrom"; base: ProjectDoc }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; doc: ProjectDoc };

const COALESCE_MS = 700;

function reducer(s: State, a: Action): State {
  const now = Date.now();
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

/** Diacritic editing mode: which text object, and which mark (original text index) is selected. */
export interface MarkEdit {
  objectId: string;
  at: number | null;
}

const touch = (d: ProjectDoc): ProjectDoc => ({ ...d, updatedAt: new Date().toISOString() });

export function useEditor(initial: ProjectDoc) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({ h: createHistory(initial), lastAt: 0 }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savedDoc, setSavedDoc] = useState<ProjectDoc | null>(null);
  const [markEdit, setMarkEdit] = useState<MarkEdit | null>(null);
  const doc = state.h.present;

  // Leaving the object (selection change, deletion, undo past its creation) ends diacritic editing.
  const markObjectAlive = !!markEdit && doc.objects.some((o) => o.id === markEdit.objectId && o.type === "text" && !o.hidden);
  useEffect(() => {
    if (markEdit && (markEdit.objectId !== selectedId || !markObjectAlive)) setMarkEdit(null);
  }, [markEdit, selectedId, markObjectAlive]);

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
  }, []);

  const selected = useMemo(() => doc.objects.find((o) => o.id === selectedId) ?? null, [doc, selectedId]);

  return {
    doc,
    selected,
    selectedId,
    setSelectedId,
    markEdit,
    setMarkEdit,
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
