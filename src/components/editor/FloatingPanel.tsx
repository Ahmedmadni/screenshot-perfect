import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { GripHorizontal, X } from "lucide-react";

type Rect = { x: number; y: number; w: number; h: number };
const MIN_W = 240;
const MIN_H = 260;

function clampRect(r: Rect): Rect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(Math.max(MIN_W, r.w), vw - 16);
  const h = Math.min(Math.max(MIN_H, r.h), vh - 16);
  return { w, h, x: Math.min(Math.max(8, r.x), vw - w - 8), y: Math.min(Math.max(8, r.y), vh - h - 8) };
}

function loadRect(key: string, fallback: () => Rect): Rect {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const r = JSON.parse(raw) as Rect;
      if ([r.x, r.y, r.w, r.h].every((n) => typeof n === "number" && Number.isFinite(n))) return clampRect(r);
    }
  } catch {
    /* ignore */
  }
  return clampRect(fallback());
}

/** A window that floats over the studio: drag it by its title bar, resize it from the corner. */
export function FloatingPanel({ storageKey, title, icon, onClose, initial, children }: {
  storageKey: string;
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  initial: () => Rect;
  children: ReactNode;
}) {
  const [rect, setRect] = useState<Rect>(() => loadRect(storageKey, initial));
  const drag = useRef<{ mode: "move" | "resize"; sx: number; sy: number; start: Rect } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(rect));
    } catch {
      /* ignore */
    }
  }, [rect, storageKey]);

  useEffect(() => {
    const onResize = () => setRect((r) => clampRect(r));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const begin = (mode: "move" | "resize") => (e: RPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    if (mode === "move" && (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: rect };
  };
  const onMove = (e: RPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    setRect(clampRect(d.mode === "move" ? { ...d.start, x: d.start.x + dx, y: d.start.y + dy } : { ...d.start, w: d.start.w + dx, h: d.start.h + dy }));
  };
  const end = () => {
    drag.current = null;
  };

  return (
    <section
      role="region"
      aria-label={title}
      className="fixed z-40 flex flex-col overflow-hidden rounded-lg border bg-panel shadow-2xl"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <header
        className="flex h-9 shrink-0 cursor-move touch-none select-none items-center gap-2 border-b bg-muted/60 px-2"
        onPointerDown={begin("move")}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
        title="اسحب لتحريك النافذة"
      >
        <GripHorizontal className="size-4 text-muted-foreground" />
        {icon}
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{title}</span>
        <button onClick={onClose} aria-label="إغلاق" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
      <div
        aria-label="تغيير حجم النافذة"
        title="اسحب لتغيير الحجم"
        className="absolute bottom-0 right-0 size-4 cursor-nwse-resize touch-none"
        onPointerDown={begin("resize")}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <svg viewBox="0 0 16 16" className="size-4 text-muted-foreground" aria-hidden>
          <path d="M14 6v8H6M14 10v4h-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
    </section>
  );
}
