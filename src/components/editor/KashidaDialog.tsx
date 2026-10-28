import { useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { applyKashida, KASHIDA_PRESETS, kashidaSlots, MAX_KASHIDA, setKashida, TATWEEL, type KashidaPreset } from "@/editor/calligraphy/kashida";
import { featureCss } from "@/editor/calligraphy/features";
import type { Kashida, TextObject } from "@/editor/model";
import { useEngineStatus } from "@/editor/glyphs/useGlyphEngine";

const PRESET_LABELS: Record<KashidaPreset, string> = { short: "Short · قصير", medium: "Medium · متوسط", long: "Long · طويل" };

/**
 * Tatweel elongation with a live preview. Nothing changes in the project until
 * "Apply", which records a single undo step.
 */
export function KashidaDialog({ obj, open, onClose, onApply }: { obj: TextObject; open: boolean; onClose: () => void; onApply: (k: Kashida[]) => void }) {
  const [draft, setDraft] = useState<Kashida[]>(obj.kashida);
  const [active, setActive] = useState<number | null>(null);
  const slots = useMemo(() => kashidaSlots(obj.text), [obj.text]);
  const status = useEngineStatus(obj.fontFamily, obj.fontWeight);
  const noTatweel = status.state === "ready" && !status.font.hasTatweel;

  useEffect(() => {
    if (open) {
      setDraft(obj.kashida);
      const firstLast = slots.find((s) => s.lastInWord);
      setActive(firstLast?.at ?? slots[0]?.at ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const count = (at: number) => draft.find((k) => k.at === at)?.count ?? 0;
  const set = (at: number, n: number) => setDraft((d) => setKashida(obj.text, d, at, Math.max(0, Math.min(MAX_KASHIDA, n))));
  const presetAll = (p: KashidaPreset) => setDraft(slots.filter((s) => s.lastInWord).map((s) => ({ at: s.at, count: KASHIDA_PRESETS[p] })));
  const words = useMemo(() => {
    const m = new Map<number, typeof slots>();
    slots.forEach((s) => m.set(s.word, [...(m.get(s.word) ?? []), s]));
    return [...m.values()];
  }, [slots]);
  const preview = applyKashida(obj.text, draft).text;
  const changed = JSON.stringify(draft) !== JSON.stringify(obj.kashida);
  const fontStyle = { fontFamily: `"${obj.fontFamily}", serif`, fontWeight: obj.fontWeight, fontFeatureSettings: featureCss(obj.features) };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tatweel elongation · المدّ بالتطويل</DialogTitle>
          <DialogDescription>
            Choose where letters are stretched. Only joins that stay connected are offered; your original text is not changed.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-card px-4 py-3 text-center text-4xl leading-[1.9]" dir={obj.direction} style={fontStyle} aria-label="Elongation preview" data-kashida-preview="">
          {preview.split("\n").map((l, i) => (
            <div key={i}>{l || "\u00a0"}</div>
          ))}
        </div>

        {noTatweel && (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            {obj.fontFamily} has no tatweel glyph, so elongation would show as empty boxes. Choose another font to elongate letters.
          </p>
        )}
        {status.state === "error" && (
          <p className="text-[11px] text-muted-foreground">The font file could not be checked for a tatweel glyph ({status.error}) Check the preview before applying.</p>
        )}

        {!slots.length ? (
          <p className="py-2 text-sm text-muted-foreground">No letter in this text can be stretched without breaking a join (for example after ا د ذ ر ز و, or inside لا and الله).</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <div className="panel-label">Quick presets · one stretch per word</div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(KASHIDA_PRESETS) as KashidaPreset[]).map((p) => (
                  <Button key={p} variant="outline" size="sm" disabled={noTatweel} onClick={() => presetAll(p)}>
                    {PRESET_LABELS[p]}
                  </Button>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setDraft([])} disabled={!draft.length}>Clear all</Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="panel-label">Joins · نقاط الوصل</div>
              <div className="flex flex-wrap gap-x-4 gap-y-2" dir="rtl">
                {words.map((w, wi) => (
                  <div key={wi} className="flex flex-wrap gap-1">
                    {w.map((s) => {
                      const n = count(s.at);
                      return (
                        <button
                          key={s.at}
                          type="button"
                          onClick={() => setActive(s.at)}
                          data-active={active === s.at}
                          aria-label={`Join ${s.before} to ${s.after}${n ? `, ${n} tatweel` : ""}`}
                          className="relative min-w-12 rounded-md border border-input bg-card px-2 py-0.5 text-2xl leading-[1.7] hover:bg-accent data-[active=true]:border-selection data-[active=true]:ring-1 data-[active=true]:ring-selection"
                          style={fontStyle}
                        >
                          {s.before}
                          {TATWEEL.repeat(Math.max(1, Math.min(n, 4)))}
                          {s.after}
                          {n > 0 && <span className="absolute -top-1.5 -start-1.5 rounded-full bg-primary px-1.5 font-sans text-[10px] leading-4 text-primary-foreground">{n}</span>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {active !== null && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <span className="text-xs text-muted-foreground">Selected join</span>
                <Button size="icon" variant="outline" className="size-8" aria-label="Shorter" onClick={() => set(active, count(active) - 1)} disabled={!count(active)}><Minus /></Button>
                <span className="w-8 text-center text-sm tabular-nums" aria-label="Tatweel count">{count(active)}</span>
                <Button size="icon" variant="outline" className="size-8" aria-label="Longer" onClick={() => set(active, count(active) + 1)} disabled={noTatweel || count(active) >= MAX_KASHIDA}><Plus /></Button>
                <div className="flex gap-1">
                  {(Object.keys(KASHIDA_PRESETS) as KashidaPreset[]).map((p) => (
                    <Button key={p} size="sm" variant="ghost" disabled={noTatweel} onClick={() => set(active, KASHIDA_PRESETS[p])}>{p}</Button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onApply(draft)} disabled={!changed || (noTatweel && draft.length > 0)}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
