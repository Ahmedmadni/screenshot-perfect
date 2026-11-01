import type { DragEvent } from "react";
import { Sparkles } from "lucide-react";

const groups = [
  { title: "الحركات والتشكيل", items: [
    ["◌َ", "فتحة"], ["◌ُ", "ضمة"], ["◌ِ", "كسرة"], ["◌ْ", "سكون"],
    ["◌ّ", "شدة"], ["◌ً", "تنوين فتح"], ["◌ٌ", "تنوين ضم"], ["◌ٍ", "تنوين كسر"],
    ["ٰ", "ألف خنجرية"], ["ٓ", "مدة"], ["ٔ", "همزة فوق"], ["ٕ", "همزة تحت"],
  ]},
  { title: "زخارف إسلامية", items: [
    ["۞", "نجمة ثمانية"], ["۩", "علامة سجدة"], ["۝", "علامة آية"], ["﷽", "البسملة"],
    ["٭", "نجمة زخرفية"], ["۞ ۞", "إطار نجوم"], ["❁", "زهرة"], ["✥", "زخرفة هندسية"],
    ["❀", "وردة"], ["✿", "زهرة مزخرفة"], ["۞", "خاتم"], ["※", "فاصل زخرفي"],
  ]},
  { title: "فواصل وامتدادات", items: [
    ["ــــــــــــ", "كشيدة طويلة"], ["❧", "فاصل نباتي"], ["༺", "قوس زخرفي"], ["༻", "قوس زخرفي"],
    ["◆", "ماسة"], ["◇", "ماسة مجوفة"], ["•", "نقطة"], ["⁕", "نجمة صغيرة"],
  ]},
] as const;

export function DecorationsPanel({ onInsert }: { onInsert: (value: string) => void }) {
  const startDrag = (e: DragEvent<HTMLButtonElement>, value: string) => {
    e.dataTransfer.setData("application/x-acs-decoration", value);
    e.dataTransfer.effectAllowed = "copy";
  };
  return <div className="h-full overflow-y-auto px-3 pb-4">
    <div className="mb-3 flex items-center gap-2 pt-2">
      <Sparkles className="size-4 text-primary" />
      <div><div className="text-sm font-semibold">مكتبة التشكيل والزخارف</div><p className="text-[10px] text-muted-foreground">اسحب العنصر إلى اللوحة أو اضغط لإضافته</p></div>
    </div>
    {groups.map((group) => <section key={group.title} className="mb-4">
      <h3 className="panel-label mb-2">{group.title}</h3>
      <div className="grid grid-cols-4 gap-1.5">
        {group.items.map(([value,label],i) => <button key={group.title+i} type="button" draggable
          onDragStart={(e)=>startDrag(e,value)} onClick={()=>onInsert(value)} title={label} aria-label={label}
          className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-md border border-border bg-card p-1 hover:border-primary hover:bg-accent active:scale-95">
          <span dir="rtl" className="text-2xl leading-8 text-foreground">{value}</span>
          <span className="max-w-full truncate text-[9px] text-muted-foreground">{label}</span>
        </button>)}
      </div>
    </section>)}
    <p className="rounded-md bg-muted/60 p-2 text-[10px] leading-relaxed text-muted-foreground">بعد الإضافة يمكنك تحديد العنصر من اللوحة وتغيير الحجم واللون والشفافية والدوران والموقع من لوحة الخصائص. كل عنصر مستقل ويمكن نسخه أو حذفه أو تقديمه وتأخيره.</p>
  </div>;
}
