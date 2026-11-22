import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CALLIGRAPHIC_MARKS } from "@/editor/calligraphy/decorationMarks";
import { contoursBounds } from "@/editor/paths/geometry";
import { segsToContours } from "@/editor/paths/convert";
import { parsePath } from "@/editor/glyphs/svgpath";

type Decoration = { value: string; label: string; category: string; hint?: string; d?: string };
const groups: { title: string; items: Decoration[] }[] = [
  { title: "حركات خطية مستقلة", items: CALLIGRAPHIC_MARKS.filter((m) => m.category === "vowels").map((m) => ({ value: `@mark:${m.id}`, label: m.label, category: "calligraphic", d: m.d })) },
  { title: "حركات مركبة", items: CALLIGRAPHIC_MARKS.filter((m) => m.category === "combined").map((m) => ({ value: `@mark:${m.id}`, label: m.label, category: "combined", d: m.d })) },
  { title: "تشكيلات وملء الفراغات", items: CALLIGRAPHIC_MARKS.filter((m) => m.category === "fillers").map((m) => ({ value: `@mark:${m.id}`, label: m.label, category: "fillers", d: m.d })) },
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
const filters = [{id:"all",label:"الكل"},{id:"calligraphic",label:"حركات خطية"},{id:"combined",label:"مركبة"},{id:"fillers",label:"تشكيلات"},{id:"marks",label:"حركات نصية"},{id:"islamic",label:"إسلامي"},{id:"ornaments",label:"زخارف"},{id:"dividers",label:"فواصل"},{id:"vectors",label:"متجهات"}];

export function DecorationsPanel({ onInsert, footer }: { onInsert: (value: string) => void; footer?: ReactNode }) {
  const [query,setQuery] = useState("");
  const [filter,setFilter] = useState("all");
  const items = useMemo(() => groups.flatMap((g)=>g.items).filter((item)=>
    (filter==="all" || item.category===filter) && (!query.trim() || (item.label+" "+item.value).toLowerCase().includes(query.trim().toLowerCase()))
  ),[filter,query]);
  const startDrag = (e: DragEvent<HTMLButtonElement>, value: string) => {
    e.dataTransfer.setData("application/x-acs-decoration", value);
    e.dataTransfer.effectAllowed = "copy";
  };
  return <div className="flex h-full min-h-0 flex-col" dir="rtl">
    <div className="flex min-h-0 flex-1 flex-col px-3 pt-2">
    <div className="relative mb-2">
      <Search className="absolute right-2.5 top-2.5 size-3.5 text-muted-foreground" />
      <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="ابحث عن حركة أو زخرفة..." aria-label="البحث في مكتبة الزخارف" className="h-9 w-full rounded-md border border-input bg-card pr-8 pl-8 text-xs outline-none focus:ring-1 focus:ring-ring" />
      {query && <Button variant="ghost" size="icon" onClick={()=>setQuery("")} aria-label="مسح البحث" className="absolute left-1 top-1 size-7 text-muted-foreground"><X className="size-3.5"/></Button>}
    </div>
    <div className="mb-3 flex flex-wrap gap-1">
      {filters.map((f)=><Button variant="outline" size="sm" key={f.id} onClick={()=>setFilter(f.id)} data-active={filter===f.id} className="h-7 px-2 text-[10px] text-muted-foreground data-[active=true]:border-primary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground">{f.label}</Button>)}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto">
      {groups.map((group)=>
        <section key={group.title} className="mb-4">
          {(filter==="all" && !query) && <h3 className="panel-label mb-2">{group.title}</h3>}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
            {items.filter((item)=>group.items.includes(item)).map((item,i)=><Button variant="outline" key={group.title+i+item.label} type="button" draggable
              onDragStart={(e)=>startDrag(e,item.value)} onClick={()=>onInsert(item.value)} title={item.label} aria-label={item.label}
              className="h-24 min-w-0 items-center justify-center border-border bg-card p-2 hover:border-primary active:scale-95">
              {item.d ? <MarkPreview d={item.d} /> : <span dir="rtl" className="max-w-full truncate text-4xl leading-none text-foreground" style={{ fontFamily: item.category === "marks" ? "\"Amiri\", serif" : undefined }}>{item.category === "vectors" ? "◈" : item.value}</span>}
            </Button>)}
          </div>
        </section>
      )}
      {items.length===0 && <p className="py-8 text-center text-xs text-muted-foreground">لا توجد نتائج مطابقة. جرّب كلمة بحث أخرى.</p>}
    </div>
    </div>
    {footer}
  </div>;
}

function MarkPreview({ d }: { d: string }) {
  const b = useMemo(() => contoursBounds(segsToContours(parsePath(d))), [d]);
  const viewBox = b ? `${b.minX - 8} ${b.minY - 8} ${b.maxX - b.minX + 16} ${b.maxY - b.minY + 16}` : "0 0 100 100";
  return <svg viewBox={viewBox} className="h-16 w-full text-foreground" aria-hidden="true">
    <path d={d} fill="currentColor" fillRule="evenodd" />
  </svg>;
}
