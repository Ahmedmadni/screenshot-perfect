import { useState } from "react";
import { ChevronDown, Move, RotateCcw, Sparkles } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const { updateObject, markEdit, setMarkEdit, glyphEdit, setGlyphEdit } = editor;
  const [kashidaOpen, setKashidaOpen] = useState(false);
  const [tashkeelOpen, setTashkeelOpen] = useState(false);
  const [open, setOpen] = useState(true);
  const status = useEngineStatus(o.fontFamily, o.fontWeight);
  const up = (patch: Partial<TextObject>, key?: string) => updateObject(o.id, patch, key);

  const slots = kashidaSlots(o.text);
  const tatweelTotal = o.kashida.reduce((n, k) => n + k.count, 0);

  const font = status.state === "ready" ? status.font : null;
  const panel = font ? buildFeaturePanel(font.featureTags, o.features) : null;

  const layout = font ? glyphEngine.layout(o) : null;
  const editingGlyph = glyphEdit?.objectId === o.id;
  const selectedGlyphLayout = editingGlyph ? layout?.glyphs.find((g) => g.editAt === glyphEdit.at && g.gid === glyphEdit.gid) : undefined;
  const glyphAdjustment = editingGlyph ? o.glyphs.find((g) => g.at === glyphEdit.at && g.gid === glyphEdit.gid) : undefined;
  const setGlyph = (patch: Partial<NonNullable<typeof glyphAdjustment>>, key: string) => {
    if (!editingGlyph || !glyphEdit) return;
    const current = glyphAdjustment ?? { at: glyphEdit.at, gid: glyphEdit.gid, dx: 0, dy: 0, scaleX: 1, scaleY: 1, thickness: 0 };
    const next = { ...current, ...patch };
    up({ glyphs: [...o.glyphs.filter((g) => !(g.at === glyphEdit.at && g.gid === glyphEdit.gid)), next] }, `glyph:${glyphEdit.at}:${key}`);
  };
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
          <Group title="Glyph editor · تقسيم الحروف والتحكم الفردي">
            <p className="text-[11px] leading-relaxed text-muted-foreground">اختر وحدة الحرف المتجهية بصورة مستقلة، ثم غيّر موضعها وعرضها وارتفاعها وسُمكها دون التأثير على بقية الكلمة.</p>
            {layout && (
              <div className="grid grid-cols-5 gap-1.5">
                {layout.glyphs.filter((g) => g.editAt >= 0 && !g.mark && g.d).map((g, i) => {
                  const active = editingGlyph && glyphEdit.at === g.editAt && glyphEdit.gid === g.gid;
                  const label = o.text[g.editAt] ?? "؟";
                  return <button key={`${g.editAt}-${g.gid}-${i}`} type="button" onClick={() => { setMarkEdit(null); setGlyphEdit({ objectId: o.id, at: g.editAt, gid: g.gid }); }}
                    data-active={!!active} className="flex h-10 items-center justify-center rounded border border-input bg-card text-xl data-[active=true]:border-primary data-[active=true]:bg-primary/10" title={`الحرف ${label} · وحدة ${g.gid} · موضع ${g.editAt}`}>{label}</button>;
                })}
              </div>
            )}
            {editingGlyph && selectedGlyphLayout ? (
              <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-2">
                <div className="flex items-center justify-between text-xs font-semibold"><span>الحرف المحدد: {o.text[glyphEdit.at] ?? "؟"}</span><Button size="sm" variant="ghost" onClick={() => setGlyphEdit(null)}>إلغاء التحديد</Button></div>
                <SmallNum label="الإزاحة الأفقية" suffix="em" step={0.01} value={glyphAdjustment?.dx ?? 0} onChange={(n) => setGlyph({ dx: n }, "dx")} />
                <SmallNum label="الإزاحة الرأسية" suffix="em" step={0.01} value={glyphAdjustment?.dy ?? 0} onChange={(n) => setGlyph({ dy: n }, "dy")} />
                <SmallNum label="العرض الأفقي" suffix="%" step={1} min={20} max={300} value={(glyphAdjustment?.scaleX ?? 1) * 100} onChange={(n) => setGlyph({ scaleX: n / 100 }, "width")} />
                <SmallNum label="الارتفاع الرأسي" suffix="%" step={1} min={20} max={300} value={(glyphAdjustment?.scaleY ?? 1) * 100} onChange={(n) => setGlyph({ scaleY: n / 100 }, "height")} />
                <SmallNum label="سُمك إضافي" suffix="px" step={0.5} min={0} max={24} value={glyphAdjustment?.thickness ?? 0} onChange={(n) => setGlyph({ thickness: n }, "thickness")} />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => up({ glyphs: o.glyphs.filter((g) => !(g.at === glyphEdit.at && g.gid === glyphEdit.gid)) })}>إعادة ضبط الحرف</Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => { up({ glyphs: [] }); setGlyphEdit(null); }}>إعادة ضبط الكل</Button>
                </div>
              </div>
            ) : <p className="text-[11px] text-muted-foreground">حدد حرفًا من الشبكة أو انقر عليه في مساحة الرسم لإظهار أدوات التحكم.</p>}
          </Group>
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
                <Button size="sm" variant="outline" className="w-full" disabled={!layout?.markCount} onClick={() => setTashkeelOpen(true)}>
                  <Sparkles /> Open dedicated Tashkeel workspace · مساحة التشكيل
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
      <Dialog open={tashkeelOpen} onOpenChange={setTashkeelOpen}>
        <DialogContent className="flex max-h-[88vh] w-[min(96vw,760px)] flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>مساحة التشكيل · Tashkeel Studio</DialogTitle>
            <DialogDescription>اختر أي حركة في النص ثم اضبط موضعها وحجمها بدقة. تبقى الحركات مرتبطة بالنص وقابلة للتحرير.</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[1fr_250px]">
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-4 text-center">
                <p dir={o.direction} className="text-3xl leading-[2.4]" style={{ fontFamily: `"${o.fontFamily}", serif` }}>{o.text}</p>
                <p className="mt-2 text-[10px] text-muted-foreground">معاينة النص · اختر حركة من القائمة لضبطها</p>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold">الحركات الموجودة في النص · {layout?.markCount ?? 0}</div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {(layout?.glyphs.flatMap((g) => g.mark ? [{ at: g.mark.at, ch: g.mark.ch }] : []) ?? []).map((m, i) => {
                    const selected = at === m.at;
                    return (
                      <button key={`${m.at}-${i}`} type="button" onClick={() => setMarkEdit({ objectId: o.id, at: m.at })}
                        data-active={selected} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border border-input bg-card p-2 data-[active=true]:border-primary data-[active=true]:bg-primary/10">
                        <span className="text-2xl" style={{ fontFamily: `"${o.fontFamily}", serif` }}>{`◌${m.ch}`}</span>
                        <span className="text-[9px] text-muted-foreground">{markName(m.ch).split(" · ")[0]}</span>
                        <span className="text-[9px] text-muted-foreground">#{m.at}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <aside className="space-y-3 rounded-lg border p-3">
              <div className="text-xs font-semibold">ضبط الحركة المحددة</div>
              {at !== null && ch ? (
                <>
                  <div className="rounded-md bg-muted/40 p-3 text-center">
                    <div className="text-4xl" style={{ fontFamily: `"${o.fontFamily}", serif` }}>{`◌${ch}`}</div>
                    <div className="mt-1 text-xs">{markName(ch)}</div>
                  </div>
                  <SmallNum label="الإزاحة الأفقية" suffix="px" value={(adj?.dx ?? 0) * o.fontSize} onChange={(n) => setMark({ dx: n / o.fontSize }, "dx")} step={0.5} />
                  <SmallNum label="الإزاحة الرأسية" suffix="px" value={(adj?.dy ?? 0) * o.fontSize} onChange={(n) => setMark({ dy: n / o.fontSize }, "dy")} step={0.5} />
                  <SmallNum label="حجم الحركة" suffix="%" step={5} min={MARK_SCALE_MIN * 100} max={MARK_SCALE_MAX * 100} value={(adj?.scale ?? 1) * 100} onChange={(n) => setMark({ scale: n / 100 }, "scale")} />
                  <Button size="sm" variant="outline" className="w-full" disabled={!adj} onClick={() => up({ marks: resetMarkAdjust(o.marks, at) })}><RotateCcw /> إعادة ضبط الحركة</Button>
                </>
              ) : <p className="text-xs leading-relaxed text-muted-foreground">اختر حركة من الشبكة لعرض أدوات التحكم الخاصة بها.</p>}
              <Button size="sm" variant="ghost" className="w-full" disabled={!o.marks.length} onClick={() => up({ marks: [] })}>إعادة ضبط كل الحركات</Button>
            </aside>
          </div>
          <div className="flex justify-between gap-2 border-t p-3">
            <Button size="sm" variant="outline" onClick={() => setMarkEdit(null)}>إنهاء وضع التحديد</Button>
            <Button size="sm" onClick={() => setTashkeelOpen(false)}>تم</Button>
          </div>
        </DialogContent>
      </Dialog>
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
