import { Check, X } from "lucide-react";
import { fontService } from "@/editor/fonts";
import type { Editor } from "@/editor/useEditor";
import { FontUploadButton, useFonts } from "./FontPicker";

const SECTIONS = [
  { src: "bundled", label: "خطوط مرفقة (رخصة مفتوحة)" },
  { src: "uploaded", label: "خطوط مرفوعة" },
  { src: "system", label: "خطوط الجهاز" },
] as const;

/** Font list: picking a font applies it to the selected text, or adds new text in that font. */
export function FontsLibrary({ editor, onAddText }: { editor: Editor; onAddText: (family: string) => void }) {
  const fonts = useFonts();
  const sel = editor.selected?.type === "text" ? editor.selected : null;
  const sample = (sel?.text.split("\n")[0] || "بسم الله الرحمن الرحيم").slice(0, 28);
  const pick = (family: string) => {
    if (sel) editor.updateObject(sel.id, { fontFamily: family });
    else onAddText(family);
  };
  return (
    <div className="flex max-h-[min(70vh,560px)] flex-col" dir="rtl">
      <div className="border-b px-3 py-2">
        <div className="text-sm font-semibold">الخطوط</div>
        <p className="text-[11px] text-muted-foreground">{sel ? "اضغط على خط لتطبيقه على النص المحدد." : "اضغط على خط لإضافة نص جديد به."}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {SECTIONS.map(({ src, label }) => {
          const list = fonts.filter((f) => f.source === src);
          if (!list.length && src !== "uploaded") return null;
          return (
            <div key={src} className="mb-2">
              <div className="panel-label px-2 py-1">{label}</div>
              {!list.length && <p className="px-2 text-xs text-muted-foreground">لا توجد خطوط مرفوعة بعد.</p>}
              {list.map((f) => (
                <div key={f.family} className="group flex items-center gap-1 rounded-md hover:bg-accent">
                  <button
                    disabled={f.status === "error"}
                    onClick={() => pick(f.family)}
                    title={f.error}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-start disabled:opacity-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] text-muted-foreground" dir="ltr">
                        {f.label}
                        {f.style && f.style !== f.label ? ` · ${f.style}` : ""}
                        {f.status === "loading" ? " · …" : ""}
                        {f.status === "error" ? ` · ${f.error}` : ""}
                      </div>
                      <div className="truncate text-xl leading-relaxed" style={{ fontFamily: `"${f.family}", serif` }}>{sample}</div>
                    </div>
                    {sel?.fontFamily === f.family && <Check className="size-4 shrink-0 text-primary" />}
                  </button>
                  {src === "uploaded" && (
                    <button aria-label={`Remove ${f.label}`} className="me-1 p-1 text-muted-foreground hover:text-destructive" onClick={() => fontService.remove(f.family)}>
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="border-t p-2">
        <FontUploadButton onUploaded={(f) => pick(f.family)} />
      </div>
    </div>
  );
}
