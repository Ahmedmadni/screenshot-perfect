import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { TextObject } from "@/editor/model";

const GROUPS: { title: string; marks: { ch: string; label: string; sample?: string }[] }[] = [
  { title: "التشكيل الأساسي", marks: [
    { ch: "\u064E", label: "فتحة", sample: "بَ" }, { ch: "\u064F", label: "ضمة", sample: "بُ" },
    { ch: "\u0650", label: "كسرة", sample: "بِ" }, { ch: "\u0652", label: "سكون", sample: "بْ" },
    { ch: "\u0651", label: "شدة", sample: "بّ" }, { ch: "\u0653", label: "مدة", sample: "بٓ" },
    { ch: "\u064B", label: "تنوين فتح", sample: "بً" }, { ch: "\u064C", label: "تنوين ضم", sample: "بٌ" },
    { ch: "\u064D", label: "تنوين كسر", sample: "بٍ" }, { ch: "\u0670", label: "ألف خنجرية", sample: "بٰ" },
  ]},
  { title: "علامات قرآنية", marks: [
    { ch: "\u06DF", label: "سجدة/علامة" }, { ch: "\u06E0", label: "مدّة صغيرة" },
    { ch: "\u06E5", label: "واو صغيرة" }, { ch: "\u06E6", label: "ياء صغيرة" },
    { ch: "\u06ED", label: "علامة نهاية آية" },
  ]},
  { title: "حروف وهمزات", marks: [
    { ch: "ء", label: "همزة" }, { ch: "أ", label: "ألف بهمزة" }, { ch: "إ", label: "ألف مكسورة" },
    { ch: "آ", label: "ألف ممدودة" }, { ch: "ؤ", label: "واو بهمزة" }, { ch: "ئ", label: "ياء بهمزة" },
    { ch: "ة", label: "تاء مربوطة" }, { ch: "ى", label: "ألف مقصورة" }, { ch: "ـ", label: "كشيدة" },
  ]},
  { title: "ترقيم وفواصل", marks: [
    { ch: "،", label: "فاصلة عربية" }, { ch: "؛", label: "فاصلة منقوطة" },
    { ch: "؟", label: "استفهام" }, { ch: "ـ", label: "امتداد" }, { ch: "۞", label: "علامة زخرفية" },
  ]},
];

export function TextEditorDialog({ obj, onClose, onSave }: { obj: TextObject | null; onClose: () => void; onSave: (text: string) => void }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (obj) setText(obj.text); }, [obj]);

  const insert = (value: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = text.slice(0, start) + value + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + value.length, start + value.length);
    });
  };

  const removeDiacritics = () => {
    setText((value) => value.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, ""));
    ref.current?.focus();
  };
  const addTatweel = () => insert("ـ");
  const clearText = () => { setText(""); ref.current?.focus(); };

  return (
    <Dialog open={!!obj} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>محرر النص العربي</DialogTitle>
          <DialogDescription>اكتب أو الصق النص، ثم أدرج التشكيل والعلامات من اللوحة. يتم الإدراج عند موضع المؤشر أو باستبدال التحديد.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={addTatweel}>إدراج كشيدة ـ</Button>
          <Button type="button" size="sm" variant="outline" onClick={removeDiacritics}>إزالة التشكيل</Button>
          <Button type="button" size="sm" variant="outline" onClick={clearText}>مسح النص</Button>
          <span className="ms-auto self-center text-xs text-muted-foreground">{[...text].length} حرف</span>
        </div>
        <textarea
          ref={ref} value={text} onChange={(e) => setText(e.target.value)}
          dir={obj?.direction ?? "rtl"} rows={6} aria-label="محتوى النص"
          className="w-full resize-y rounded-md border border-input bg-card p-4 text-3xl leading-[2.2] focus:outline-none focus:ring-1 focus:ring-ring"
          style={{ fontFamily: obj ? `"${obj.fontFamily}", serif` : undefined }}
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) onSave(text); }}
        />
        <div className="space-y-3">
          {GROUPS.map((group) => (
            <section key={group.title} className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground">{group.title}</h3>
              <div className="flex flex-wrap gap-1.5" dir="rtl">
                {group.marks.map((mark, index) => (
                  <button key={`${group.title}-${index}`} type="button" onClick={() => insert(mark.ch)}
                    title={mark.label} aria-label={`إدراج ${mark.label}`}
                    className="min-w-10 h-10 rounded-md border border-input bg-card px-2 text-xl hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{ fontFamily: obj ? `"${obj.fontFamily}", serif` : undefined }}>
                    {mark.sample ?? mark.ch}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => onSave(text)} disabled={!text.trim()}>تطبيق النص · Ctrl+Enter</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
