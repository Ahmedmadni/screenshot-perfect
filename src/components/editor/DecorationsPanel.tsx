import { useMemo, useState, type DragEvent } from "react";
import { Search, Sparkles, X } from "lucide-react";

type Decoration = { value: string; label: string; category: string; hint?: string };
const groups: { title: string; items: Decoration[] }[] = [
  { title: "الحركات والتشكيل", items: [
    {value:"◌َ",label:"فتحة",category:"marks"},{value:"◌ُ",label:"ضمة",category:"marks"},{value:"◌ِ",label:"كسرة",category:"marks"},{value:"◌ْ",label:"سكون",category:"marks"},
    {value:"◌ّ",label:"شدة",category:"marks"},{value:"◌ً",label:"تنوين فتح",category:"marks"},{value:"◌ٌ",label:"تنوين ضم",category:"marks"},{value:"◌ٍ",label:"تنوين كسر",category:"marks"},
    {value:"ٰ",label:"ألف خنجرية",category:"marks"},{value:"ٓ",label:"مدة",category:"marks"},{value:"ٔ",label:"همزة فوق",category:"marks"},{value:"ٕ",label:"همزة تحت",category:"marks"},
  ]},
  { title: "رموز قرآنية وإسلامية", items: [
    {value:"۞",label:"نجمة ثمانية",category:"islamic"},{value:"۩",label:"علامة سجدة",category:"islamic"},{value:"۝",label:"علامة آية",category:"islamic"},{value:"﷽",label:"البسملة",category:"islamic"},
    {value:"۞ ۞",label:"زوج نجوم",category:"islamic"},{value:"٭",label:"نجمة زخرفية",category:"islamic"},{value:"۞ ۩ ۞",label:"فاصل قرآني",category:"islamic"},
  ]},
  { title: "زخارف نباتية وهندسية", items: [
    {value:"❁",label:"زهرة",category:"ornaments"},{value:"❀",label:"وردة",category:"ornaments"},{value:"✿",label:"زهرة مزخرفة",category:"ornaments"},{value:"✥",label:"معين هندسي",category:"ornaments"},
    {value:"❧",label:"غصن نباتي",category:"ornaments"},{value:"※",label:"فاصل هندسي",category:"ornaments"},{value:"⁕",label:"نجمة صغيرة",category:"ornaments"},{value:"◆",label:"ماسة ممتلئة",category:"ornaments"},{value:"◇",label:"ماسة مجوفة",category:"ornaments"},
  ]},
  { title: "زخارف متجهية قابلة للتحرير", items: [
    {value:"@vector:rosette",label:"وردة هندسية",category:"vectors"},{value:"@vector:floral",label:"وردة نباتية Bézier",category:"vectors"},{value:"@vector:star8",label:"نجمة ثمانية",category:"vectors"},{value:"@vector:diamond",label:"معين",category:"vectors"},{value:"@vector:ellipse",label:"إطار دائري",category:"vectors"},{value:"@vector:arch",label:"قوس",category:"vectors"},{value:"@vector:frame",label:"إطار",category:"vectors"},
  ]},
  { title: "فواصل وامتدادات", items: [
    {value:"ــــــــــــ",label:"كشيدة طويلة",category:"dividers"},{value:"༺",label:"قوس أيسر",category:"dividers"},{value:"༻",label:"قوس أيمن",category:"dividers"},{value:"༺ ❁ ༻",label:"فاصل مزخرف",category:"dividers"},
    {value:"۞ ــــــــــ ۞",label:"فاصل نجمي",category:"dividers"},{value:"◆ ◇ ◆",label:"فاصل ماسي",category:"dividers"},
  ]},
];
const filters = [{id:"all",label:"الكل"},{id:"marks",label:"التشكيل"},{id:"islamic",label:"إسلامي"},{id:"ornaments",label:"زخارف"},{id:"dividers",label:"فواصل"},{id:"vectors",label:"Vector"}];

export function DecorationsPanel({ onInsert }: { onInsert: (value: string) => void }) {
  const [query,setQuery] = useState("");
  const [filter,setFilter] = useState("all");
  const items = useMemo(() => groups.flatMap((g)=>g.items).filter((item)=>
    (filter==="all" || item.category===filter) && (!query.trim() || (item.label+" "+item.value).toLowerCase().includes(query.trim().toLowerCase()))
  ),[filter,query]);
  const startDrag = (e: DragEvent<HTMLButtonElement>, value: string) => {
    e.dataTransfer.setData("application/x-acs-decoration", value);
    e.dataTransfer.effectAllowed = "copy";
  };
  return <div className="flex h-full min-h-0 flex-col px-3 pb-3">
    <div className="mb-3 flex items-center gap-2 pt-2">
      <Sparkles className="size-4 shrink-0 text-primary" />
      <div className="min-w-0"><div className="text-sm font-semibold">مكتبة التشكيل والزخارف</div><p className="text-[10px] text-muted-foreground">اسحب إلى اللوحة أو اضغط للإضافة</p></div>
    </div>
    <div className="relative mb-2">
      <Search className="absolute right-2.5 top-2.5 size-3.5 text-muted-foreground" />
      <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="ابحث عن حركة أو زخرفة..." aria-label="البحث في مكتبة الزخارف" className="h-9 w-full rounded-md border border-input bg-card pr-8 pl-8 text-xs outline-none focus:ring-1 focus:ring-ring" />
      {query && <button onClick={()=>setQuery("")} aria-label="مسح البحث" className="absolute left-2.5 top-2.5 text-muted-foreground"><X className="size-3.5"/></button>}
    </div>
    <div className="mb-3 flex flex-wrap gap-1">
      {filters.map((f)=><button key={f.id} onClick={()=>setFilter(f.id)} data-active={filter===f.id} className="rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent data-[active=true]:border-primary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground">{f.label}</button>)}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto">
      {groups.map((group)=>
        <section key={group.title} className="mb-4">
          {(filter==="all" && !query) && <h3 className="panel-label mb-2">{group.title}</h3>}
          <div className="grid grid-cols-3 gap-1.5">
            {items.filter((item)=>group.items.includes(item)).map((item,i)=><button key={group.title+i+item.label} type="button" draggable
              onDragStart={(e)=>startDrag(e,item.value)} onClick={()=>onInsert(item.value)} title={item.label} aria-label={item.label}
              className="flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-md border border-border bg-card p-1.5 transition hover:border-primary hover:bg-accent active:scale-95">
              <span dir="rtl" className="max-w-full truncate text-2xl leading-8 text-foreground">{item.value}</span>
              <span className="max-w-full truncate text-[9px] text-muted-foreground">{item.label}</span>
            </button>)}
          </div>
        </section>
      )}
      {items.length===0 && <p className="py-8 text-center text-xs text-muted-foreground">لا توجد نتائج مطابقة. جرّب كلمة بحث أخرى.</p>}
    </div>
    <div className="mt-2 rounded-md bg-muted/60 p-2 text-[10px] leading-relaxed text-muted-foreground">تُضاف العناصر كطبقات نصية مستقلة. حدّد العنصر لتغيير حجمه ولونه ودورانه وشفافيته، أو لنسخه وحذفه.</div>
  </div>;
}
