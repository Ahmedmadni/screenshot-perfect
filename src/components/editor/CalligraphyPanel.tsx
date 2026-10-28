import { useState } from "react";
import { ChevronDown, Move, RotateCcw, Sparkles } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { buildFeaturePanel, featureLabel, setFeature } from "@/editor/calligraphy/features";
import { getMarkAdjust, MARK_SCALE_MAX, MARK_SCALE_MIN, markName, resetMarkAdjust, setMarkAdjust } from "@/editor/calligraphy/marks";
import { kashidaSlots } from "@/editor/calligraphy/kashida";
import { glyphEngine } from "@/editor/glyphs/engine";
import { useEngineStatus } from "@/editor/glyphs/useGlyphEngine";
import type { TextObject } from "@/editor/model";
import type { Editor } from "@/editor/useEditor";
import { KashidaDialog } from "./KashidaDialog";

function Group({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t first:border-t-0">
      <CollapsibleTrigger className="flex w-full items-center justify-between py-2 text-start text-xs font-medium">
        {title}
        <ChevronDown className="size-3.5 text-muted-foreground transition-transform data-[open=true]:rotate-180" data-open={open} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pb-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function SmallNum({ label, value, onChange, step = 1, min, max, suffix }: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; suffix?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex h-8 items-center rounded-md border border-input bg-card pe-2 focus-within:ring-1 focus-within:ring-ring">
        <input
          type="number"
          dir="ltr"
          aria-label={label}
          value={+value.toFixed(1)}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          className="h-full w-full min-w-0 bg-transparent px-2 text-sm tabular-nums focus:outline-none"
        />
        {suffix && <span className="text-[11px] text-muted-foreground">{suffix}</span>}
      </div>
    </label>
  );
}

/** Advanced Arabic calligraphy controls for the selected text object. */
export function CalligraphyPanel({ editor, o }: { editor: Editor; o: TextObject }) {
  const { updateObject, markEdit, setMarkEdit } = editor;
  const [kashidaOpen, setKashidaOpen] = useState(false);
  const [open, setOpen] = useState(true);
  const status = useEngineStatus(o.fontFamily, o.fontWeight);
  const up = (patch: Partial<TextObject>, key?: string) => updateObject(o.id, patch, key);

  const slots = kashidaSlots(o.text);
  const tatweelTotal = o.kashida.reduce((n, k) => n + k.count, 0);

  const font = status.state === "ready" ? status.font : null;
  const panel = font ? buildFeaturePanel(font.featureTags, o.features) : null;

  const layout = font ? glyphEngine.layout(o) : null;
  const editingMarks = markEdit?.objectId === o.id;
  const at = editingMarks ? markEdit.at : null;
  const markGlyph = at !== null && layout ? layout.glyphs.find((g) => g.mark?.at === at)?.mark : undefined;
  const adj = at !== null ? getMarkAdjust(o.marks, at) : undefined;
  const ch = markGlyph?.ch ?? adj?.ch ?? (at !== null ? o.text[at] : undefined);
  const setMark = (patch: Parameters<typeof setMarkAdjust>[3], key: string) => {
    if (at === null || !ch) return;
    up({ marks: setMarkAdjust(o.marks, at, ch, patch) }, `mark:${at}:${key}`);
  };

  const engineNote =
    status.state === "loading" ? (
      <p className="text-[11px] text-muted-foreground">Reading the font file…</p>
    ) : status.state === "error" ? (
      <p className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px] leading-relaxed">{status.error}</p>
    ) : null;

  return (
    <section className="border-b px-4 py-3">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between text-start">
          <h3 className="panel-label flex items-center gap-1.5"><Sparkles className="size-3" /> Calligraphy · الخط</h3>
          <ChevronDown className="size-3.5 text-muted-foreground transition-transform data-[open=true]:rotate-180" data-open={open} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <Group title="Tatweel · التطويل">
            <p className="text-[11px] text-muted-foreground">
              {tatweelTotal ? `${tatweelTotal} tatweel in ${o.kashida.length} join${o.kashida.length === 1 ? "" : "s"}.` : slots.length ? `${slots.length} joins can be stretched.` : "No join in this text can be stretched."}
            </p>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setKashidaOpen(true)}>Elongate letters…</Button>
              <Button size="sm" variant="ghost" disabled={!o.kashida.length} onClick={() => up({ kashida: [] })}>Remove</Button>
            </div>
          </Group>

          <Group title="OpenType features · خصائص الخط">
            {engineNote}
            {panel && (
              <>
                {!panel.toggles.length && <p className="text-[11px] text-muted-foreground">{o.fontFamily} has no optional features to switch. Its Arabic forms are applied automatically.</p>}
                <div className="space-y-1.5">
                  {panel.toggles.map((t) => (
                    <label key={t.tag} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0">
                        <span className="block truncate">{featureLabel(t.tag, font!.featureLabels)}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{t.tag}{t.overridden ? " · changed" : ""}</span>
                      </span>
                      <Switch aria-label={`Feature ${t.tag}`} checked={t.on} onCheckedChange={(v) => up({ features: setFeature(o.features, t.tag, v) })} />
                    </label>
                  ))}
                </div>
                {panel.toggles.length > 0 && (
                  <Button size="sm" variant="ghost" className="w-full" disabled={!Object.keys(o.features).length} onClick={() => up({ features: {} })}>
                    <RotateCcw /> Reset to font defaults
                  </Button>
                )}
                {panel.missingCommon.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">Not in this font: <span className="font-mono">{panel.missingCommon.join(", ")}</span></p>
                )}
                {panel.required.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">Always applied for Arabic: <span className="font-mono">{panel.required.join(", ")}</span></p>
                )}
                <p className="text-[11px] text-muted-foreground">Changes appear on the canvas immediately; Undo or Reset returns to the font's defaults.</p>
              </>
            )}
          </Group>

          <Group title="Diacritics · التشكيل">
            {engineNote}
            {font && (
              <>
                <p className="text-[11px] text-muted-foreground">
                  {layout ? `${layout.markCount} diacritic${layout.markCount === 1 ? "" : "s"} · ${o.marks.length} adjusted` : ""}
                </p>
                {layout && layout.unmatchedAdjustments > 0 && (
                  <p className="text-[11px] text-warning">{layout.unmatchedAdjustments} saved adjustment(s) no longer match a diacritic in the text and are ignored.</p>
                )}
                <Button
                  size="sm"
                  variant={editingMarks ? "default" : "outline"}
                  className="w-full"
                  disabled={!layout?.markCount}
                  onClick={() => setMarkEdit(editingMarks ? null : { objectId: o.id, at: null })}
                >
                  <Move /> {editingMarks ? "Done editing diacritics" : "Edit diacritics on canvas"}
                </Button>
                {editingMarks && at === null && <p className="text-[11px] text-muted-foreground">Click a diacritic on the canvas, then drag it or use the arrow keys (Shift = 10 px).</p>}
                {editingMarks && at !== null && ch && (
                  <div className="space-y-2 rounded-md border bg-card p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs">{markName(ch)}</span>
                      <span className="rounded bg-muted px-1.5 text-xl leading-8" style={{ fontFamily: `"${o.fontFamily}", serif` }}>{`\u25CC${ch}`}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <SmallNum label="Move X" suffix="px" value={(adj?.dx ?? 0) * o.fontSize} onChange={(n) => setMark({ dx: n / o.fontSize }, "dx")} />
                      <SmallNum label="Move Y" suffix="px" value={(adj?.dy ?? 0) * o.fontSize} onChange={(n) => setMark({ dy: n / o.fontSize }, "dy")} />
                      <SmallNum label="Scale" suffix="%" step={5} min={MARK_SCALE_MIN * 100} max={MARK_SCALE_MAX * 100} value={(adj?.scale ?? 1) * 100} onChange={(n) => setMark({ scale: n / 100 }, "scale")} />
                    </div>
                    <Button size="sm" variant="ghost" className="w-full" disabled={!adj} onClick={() => up({ marks: resetMarkAdjust(o.marks, at) })}>
                      <RotateCcw /> Reset this diacritic
                    </Button>
                  </div>
                )}
                <Button size="sm" variant="ghost" className="w-full" disabled={!o.marks.length} onClick={() => up({ marks: [] })}>
                  <RotateCcw /> Reset all diacritics
                </Button>
              </>
            )}
          </Group>
        </CollapsibleContent>
      </Collapsible>
      <KashidaDialog
        obj={o}
        open={kashidaOpen}
        onClose={() => setKashidaOpen(false)}
        onApply={(k) => {
          up({ kashida: k });
          setKashidaOpen(false);
        }}
      />
    </section>
  );
}
