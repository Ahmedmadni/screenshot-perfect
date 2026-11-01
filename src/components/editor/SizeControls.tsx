import { Slider } from "@/components/ui/slider";
import { objectSize } from "@/editor/model";
import { quickSize, resizePatch } from "@/editor/transform";
import type { Editor } from "@/editor/useEditor";

/** Insert size for new ornaments plus a proportional size control for the selected element. */
export function SizeControls({ editor, insertSize, onInsertSize }: { editor: Editor; insertSize: number; onInsertSize: (n: number) => void }) {
  const o = editor.selected;
  const size = o ? Math.round(quickSize(o)) : 0;
  const dims = o ? objectSize(o) : null;
  const max = Math.max(800, Math.round(size * 2));
  return (
    <div className="space-y-3 border-t bg-muted/40 p-3" dir="rtl">
      <div>
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="font-semibold">حجم الإدراج</span>
          <span className="tabular-nums text-muted-foreground">{insertSize} px</span>
        </div>
        <Slider dir="rtl" min={16} max={400} step={2} value={[insertSize]} onValueChange={([n]) => onInsertSize(n)} aria-label="حجم الإدراج" />
      </div>
      {o ? (
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px]">
            <span className="min-w-0 truncate font-semibold">حجم العنصر المحدد</span>
            <span className="tabular-nums text-muted-foreground" dir="ltr">{dims ? `${Math.round(dims.width)} × ${Math.round(dims.height)}` : ""}</span>
          </div>
          <div className="flex items-center gap-2">
            <Slider
              dir="rtl"
              className="flex-1"
              min={4}
              max={max}
              step={1}
              disabled={o.locked}
              value={[size]}
              onValueChange={([n]) => editor.updateObject(o.id, resizePatch(o, n), "quick-size")}
              aria-label="حجم العنصر المحدد"
            />
            <input
              type="number"
              min={4}
              value={size}
              disabled={o.locked}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 4) editor.updateObject(o.id, resizePatch(o, n), "quick-size");
              }}
              className="h-7 w-16 rounded border border-input bg-card px-1.5 text-xs tabular-nums"
              aria-label="الحجم بالبكسل"
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">{o.type === "text" ? "حجم الخط" : "الضلع الأطول"} · يتغير الحجم مع الحفاظ على النسبة. للتحكم الحر اسحب مقابض التحديد على اللوحة.</p>
        </div>
      ) : (
        <p className="text-[10px] leading-relaxed text-muted-foreground">اسحب أي عنصر إلى اللوحة أو اضغط عليه للإضافة، ثم حدّده لتغيير حجمه من هنا.</p>
      )}
    </div>
  );
}
