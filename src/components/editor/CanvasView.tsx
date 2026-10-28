import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { displayText, lineAnchorX, lineOffsets, needsGlyphEngine, objectSize, shapePath, svgTextAnchor, type EditorObject, type ProjectDoc, type TextObject } from "@/editor/model";
import { featureCss } from "@/editor/calligraphy/features";
import { getMarkAdjust, setMarkAdjust } from "@/editor/calligraphy/marks";
import { glyphEngine } from "@/editor/glyphs/engine";
import type { TextLayout } from "@/editor/glyphs/layout";
import { useGlyphEngineVersion } from "@/editor/glyphs/useGlyphEngine";
import type { Editor } from "@/editor/useEditor";
import { GlyphText } from "./GlyphText";

interface Props {
  editor: Editor;
  zoom: number;
  onZoom: (z: number) => void;
  showChecker: boolean;
  showBounds: boolean;
  fontsVersion: number;
  onEditText: (id: string) => void;
}

type Gesture =
  | { mode: "move"; id: string; start: { x: number; y: number }; base: ProjectDoc; obj: EditorObject }
  | { mode: "resize" | "rotate"; id: string; start: { x: number; y: number }; base: ProjectDoc; obj: EditorObject }
  | { mode: "mark"; id: string; start: { x: number; y: number }; base: ProjectDoc; obj: TextObject; at: number; ch: string; dx: number; dy: number }
  | { mode: "pan"; sx: number; sy: number; left: number; top: number };

/** Layout for objects drawn from glyph outlines; null means "use live browser text". */
function glyphLayoutFor(o: TextObject, force: boolean): TextLayout | null {
  if (!force && !needsGlyphEngine(o)) return null;
  return glyphEngine.layout(o);
}

export function CanvasView({ editor, zoom, onZoom, showChecker, showBounds, onEditText }: Props) {
  const { doc, selectedId, setSelectedId, replaceDoc, commitFrom, markEdit, setMarkEdit } = editor;
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
    const cur = docRef.current;
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
      const marks = setMarkAdjust(baseObj.marks, g.at, g.ch, { dx: round(g.dx + lx / o.fontSize), dy: round(g.dy + ly / o.fontSize) });
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
    if (g && g.mode !== "pan") commitFrom(g.base);
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
  const hs = 10 / zoom;
  const pad = 80;

  return (
    <div
      ref={scrollRef}
      className="relative h-full w-full overflow-auto bg-surround"
      style={{ cursor: spaceDown ? "grab" : "default" }}
      onPointerDown={(e) => {
        if (spaceDown || e.button === 1) return startPan(e);
        if (markEdit) return setMarkEdit({ ...markEdit, at: null });
        setSelectedId(null);
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
              return (
                <g
                  key={o.id}
                  transform={`translate(${o.x} ${o.y}) rotate(${o.rotation})`}
                  opacity={inMarkMode ? Math.max(0.35, o.opacity) : o.opacity}
                  onPointerDown={(e) => {
                    if (inMarkMode) {
                      e.stopPropagation();
                      setMarkEdit({ objectId: o.id, at: null });
                    } else begin(e, "move", o);
                  }}
                  onDoubleClick={() => o.type === "text" && !inMarkMode && onEditText(o.id)}
                  style={{ cursor: inMarkMode ? "default" : o.locked ? "not-allowed" : "move" }}
                  data-object-id={o.id}
                >
                  <ObjectShape o={o} forceGlyph={inMarkMode} />
                </g>
              );
            })}
            {showBounds && (
              <rect width={doc.width} height={doc.height} fill="none" stroke="var(--border)" strokeWidth={1 / zoom} pointerEvents="none" />
            )}
            {selected && !markObj && <SelectionBox o={selected} hs={hs} zoom={zoom} onHandle={begin} />}
            {markObj && markLayout && (
              <MarkOverlay o={markObj} layout={markLayout} selectedAt={markEdit?.at ?? null} zoom={zoom} onPick={beginMark} />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}

function ObjectShape({ o, forceGlyph }: { o: EditorObject; forceGlyph: boolean }) {
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
  const layout = glyphLayoutFor(o, forceGlyph);
  if (layout) return <GlyphText o={o} layout={layout} />;
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
    <g transform={`translate(${o.x} ${o.y}) rotate(${o.rotation})`} data-mark-overlay="">
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
