import { useRef, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, Upload, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fontService, ACCEPTED_FONT_EXT, type FontEntry, type FontSource } from "@/editor/fonts";

export function useFonts() {
  return useSyncExternalStore(fontService.subscribe, fontService.getSnapshot, fontService.getSnapshot);
}

const GROUPS: { source: FontSource; label: string }[] = [
  { source: "bundled", label: "Bundled · open licence" },
  { source: "uploaded", label: "Uploaded" },
  { source: "system", label: "System · this device only" },
];

export function FontUploadButton({ onUploaded }: { onUploaded?: (f: FontEntry) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={ACCEPTED_FONT_EXT.join(",")}
        className="hidden"
        aria-label="Upload font file"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            const f = await fontService.upload(file);
            toast.success(`Font "${f.label}" added${f.supportsArabic ? "" : " — it may not contain Arabic glyphs"}`);
            onUploaded?.(f);
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-input px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
        Upload font (WOFF2, WOFF, TTF, OTF)
      </button>
    </>
  );
}

export function FontPicker({ value, preview, onChange }: { value: string; preview: string; onChange: (family: string) => void }) {
  const fonts = useFonts();
  const [open, setOpen] = useState(false);
  const sample = (preview.split("\n")[0] || "بسم الله").slice(0, 24);
  const current = fonts.find((f) => f.family === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 text-sm hover:bg-accent" aria-label="Font family">
          <span className="truncate">{current?.label ?? value}</span>
          <ChevronDown className="size-4 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="max-h-96 overflow-y-auto p-2">
          {GROUPS.map((g) => {
            const list = fonts.filter((f) => f.source === g.source);
            if (!list.length) return null;
            return (
              <div key={g.source} className="mb-2">
                <div className="panel-label px-2 py-1">{g.label}</div>
                {list.map((f) => (
                  <button
                    key={f.family}
                    disabled={f.status === "error"}
                    onClick={() => {
                      onChange(f.family);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start hover:bg-accent disabled:opacity-50"
                    title={f.error}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {f.label}
                        {f.style && <span>· {f.style}</span>}
                        {f.status === "loading" && <Loader2 className="size-3 animate-spin" />}
                        {(f.status === "error" || f.supportsArabic === false) && <AlertTriangle className="size-3 text-warning" />}
                      </div>
                      <div dir="rtl" className="truncate text-xl leading-relaxed" style={{ fontFamily: `"${f.family}", serif` }}>
                        {sample}
                      </div>
                    </div>
                    {f.family === value && <Check className="size-4 shrink-0" />}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
        <div className="border-t p-2 space-y-2">
          <p className="text-[11px] leading-relaxed text-muted-foreground">خط الثلث متوفر باسم LaylaThuluth. للخطوط الأخرى مثل الديواني وجلي الديواني، ارفع ملف الخط المرخّص بصيغة OTF أو TTF أو WOFF2.</p>
          <FontUploadButton onUploaded={(f) => onChange(f.family)} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
