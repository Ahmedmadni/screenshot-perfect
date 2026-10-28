import { AlignCenter, AlignLeft, AlignRight, ArrowDownToLine, ArrowUpToLine, Copy, PenLine, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SHAPE_LABELS, uid, type EditorObject, type ShapeKind, type TextAlign } from "@/editor/model";
import type { Editor } from "@/editor/useEditor";
import { FontPicker } from "./FontPicker";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Num({ value, onChange, min, max, step = 1, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; label: string }) {
  return (
    <Field label={label}>
      <input
        type="number"
        dir="ltr"
        value={Number.isFinite(value) ? +value.toFixed(2) : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(min !== undefined ? Math.max(min, max !== undefined ? Math.min(max, n) : n) : n);
        }}
        className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </Field>
  );
}

function Color({ value, onChange, label, allowNone }: { value: string; onChange: (c: string) => void; label: string; allowNone?: boolean }) {
  const none = value === "transparent";
  return (
    <Field label={label}>
      <div className="flex h-8 items-center gap-2 rounded-md border border-input bg-card px-1.5">
        <input type="color" aria-label={label} value={none ? "#000000" : value} onChange={(e) => onChange(e.target.value)} className="h-5 w-7 cursor-pointer border-0 bg-transparent p-0" />
        <span dir="ltr" className="flex-1 text-xs tabular-nums">{none ? "none" : value}</span>
        {allowNone && (
          <button className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => onChange(none ? "#c9a46a" : "transparent")}>
            {none ? "Set" : "None"}
          </button>
        )}
      </div>
    </Field>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5 border-b px-4 py-3">
      <h3 className="panel-label">{title}</h3>
      {children}
    </section>
  );
}

export function PropertiesPanel({ editor, onEditText }: { editor: Editor; onEditText: (id: string) => void }) {
  const { doc, selected, setDoc, updateObject, moveLayer, removeObject, addObject } = editor;

  if (!selected) {
    return (
      <div>
        <Section title="Canvas · اللوحة">
          <Field label="Project name">
            <input dir="auto" value={doc.name} onChange={(e) => setDoc({ ...doc, name: e.target.value }, "name")} className="h-8 rounded-md border border-input bg-card px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Num label="Width" value={doc.width} min={16} max={8000} onChange={(n) => setDoc({ ...doc, width: Math.round(n) }, "w")} />
            <Num label="Height" value={doc.height} min={16} max={8000} onChange={(n) => setDoc({ ...doc, height: Math.round(n) }, "h")} />
          </div>
          <div className="flex flex-wrap gap-1">
            {[[1200, 800], [1080, 1080], [1080, 1350], [1920, 1080], [2480, 3508]].map(([w, h]) => (
              <button key={`${w}x${h}`} onClick={() => setDoc({ ...doc, width: w, height: h })} className="rounded border border-input px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent">
                {w}×{h}
              </button>
            ))}
          </div>
          <Color label="Background" value={doc.background} onChange={(c) => setDoc({ ...doc, background: c }, "bg")} />
          <label className="flex items-center justify-between text-sm">
            Transparent background
            <Switch checked={doc.transparentBackground} onCheckedChange={(v) => setDoc({ ...doc, transparentBackground: v })} />
          </label>
        </Section>
        <p className="px-4 py-3 text-xs text-muted-foreground">Select an object on the canvas to edit its properties.</p>
      </div>
    );
  }

  const o = selected;
  const up = (patch: Partial<EditorObject>, key?: string) => updateObject(o.id, patch, key);

  return (
    <div>
      {o.type === "text" && (
        <Section title="Text · النص">
          <button onClick={() => onEditText(o.id)} dir={o.direction} className="block w-full rounded-md border border-input bg-card p-2 text-start text-xl leading-relaxed hover:bg-accent" style={{ fontFamily: `"${o.fontFamily}", serif` }}>
            {o.text}
          </button>
          <Button variant="outline" size="sm" className="w-full" onClick={() => onEditText(o.id)}><PenLine /> Edit text</Button>
          <Field label="Font family"><FontPicker value={o.fontFamily} preview={o.text} onChange={(f) => up({ fontFamily: f })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Num label="Size" value={o.fontSize} min={4} max={2000} onChange={(n) => up({ fontSize: n }, "fs")} />
            <Field label="Weight">
              <select value={o.fontWeight} onChange={(e) => up({ fontWeight: +e.target.value as 400 | 700 })} className="h-8 rounded-md border border-input bg-card px-2 text-sm">
                <option value={400}>Regular</option>
                <option value={700}>Bold</option>
              </select>
            </Field>
          </div>
          <Color label="Color" value={o.color} onChange={(c) => up({ color: c }, "color")} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Direction">
              <div className="flex h-8 overflow-hidden rounded-md border border-input">
                {(["rtl", "ltr"] as const).map((d) => (
                  <button key={d} data-active={o.direction === d} onClick={() => up({ direction: d })} className="flex-1 text-xs uppercase data-[active=true]:bg-primary data-[active=true]:text-primary-foreground">{d}</button>
                ))}
              </div>
            </Field>
            <Field label="Alignment">
              <div className="flex h-8 overflow-hidden rounded-md border border-input">
                {(
                  [
                    ["start", o.direction === "rtl" ? AlignRight : AlignLeft],
                    ["center", AlignCenter],
                    ["end", o.direction === "rtl" ? AlignLeft : AlignRight],
                  ] as [TextAlign, typeof AlignCenter][]
                ).map(([a, Icon]) => (
                  <button key={a} aria-label={`Align ${a}`} data-active={o.align === a} onClick={() => up({ align: a })} className="flex flex-1 items-center justify-center data-[active=true]:bg-primary data-[active=true]:text-primary-foreground">
                    <Icon className="size-3.5" />
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Num label="Letter sp." value={o.letterSpacing} step={0.5} onChange={(n) => up({ letterSpacing: n }, "ls")} />
            <Num label="Word sp." value={o.wordSpacing} onChange={(n) => up({ wordSpacing: n }, "ws")} />
            <Num label="Line height" value={o.lineHeight} min={0.5} max={5} step={0.1} onChange={(n) => up({ lineHeight: n }, "lh")} />
          </div>
          {o.letterSpacing !== 0 && <p className="text-[11px] text-warning">Letter spacing can break Arabic letter joining. Use tatweel (ـ) for elongation.</p>}
        </Section>
      )}

      {o.type === "shape" && (
        <Section title="Shape · الشكل">
          <Field label="Kind">
            <select value={o.shape} onChange={(e) => up({ shape: e.target.value as ShapeKind })} className="h-8 rounded-md border border-input bg-card px-2 text-sm">
              {Object.entries(SHAPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Num label="Width" value={o.width} min={1} onChange={(n) => up({ width: n }, "sw")} />
            <Num label="Height" value={o.height} min={1} onChange={(n) => up({ height: n }, "sh")} />
          </div>
          <Color label="Fill" value={o.fill} allowNone onChange={(c) => up({ fill: c }, "fill")} />
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <Color label="Stroke" value={o.stroke} onChange={(c) => up({ stroke: c }, "stroke")} />
            <Num label="Stroke w." value={o.strokeWidth} min={0} max={200} onChange={(n) => up({ strokeWidth: n }, "strokew")} />
          </div>
          {o.shape === "rect" && <Num label="Corner radius" value={o.cornerRadius} min={0} onChange={(n) => up({ cornerRadius: n }, "cr")} />}
        </Section>
      )}

      <Section title="Transform">
        <div className="grid grid-cols-3 gap-2">
          <Num label="X" value={o.x} onChange={(n) => up({ x: n }, "x")} />
          <Num label="Y" value={o.y} onChange={(n) => up({ y: n }, "y")} />
          <Num label="Rotation°" value={o.rotation} min={-180} max={180} onChange={(n) => up({ rotation: n }, "rot")} />
        </div>
        <Field label={`Opacity · ${Math.round(o.opacity * 100)}%`}>
          <input type="range" min={0} max={1} step={0.01} value={o.opacity} onChange={(e) => up({ opacity: +e.target.value }, "op")} className="accent-primary" />
        </Field>
      </Section>

      <Section title="Arrange">
        <div className="grid grid-cols-2 gap-1.5">
          <Button size="sm" variant="outline" onClick={() => moveLayer(o.id, "top")}><ArrowUpToLine /> To front</Button>
          <Button size="sm" variant="outline" onClick={() => moveLayer(o.id, "bottom")}><ArrowDownToLine /> To back</Button>
          <Button size="sm" variant="outline" onClick={() => addObject({ ...o, id: uid(), x: o.x + 20, y: o.y + 20 })}><Copy /> Duplicate</Button>
          <Button size="sm" variant="outline" onClick={() => removeObject(o.id)}><Trash2 /> Delete</Button>
        </div>
      </Section>
    </div>
  );
}
