import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, Spline, Square, Trash2, Type, Unlock } from "lucide-react";
import type { Editor } from "@/editor/useEditor";

/** Layers list. Fonts and ornaments live in their own tool-rail windows. */
export function LeftPanel({ editor }: { editor: Editor }) {
  const { doc, selectedId, setSelectedId, updateObject, moveLayer, removeObject } = editor;
  const layers = [...doc.objects].reverse();
  return (
    <div className="flex h-full flex-col">
      <div className="panel-label px-3 pb-1 pt-3">Layers · الطبقات</div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {!layers.length && <p className="px-2 py-6 text-center text-xs text-muted-foreground">No objects yet. Add text or a shape from the tool rail.</p>}
        <ul className="space-y-0.5">
          {layers.map((o) => (
            <li
              key={o.id}
              onClick={() => setSelectedId(o.id)}
              data-active={o.id === selectedId}
              className="group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent data-[active=true]:bg-accent data-[active=true]:ring-1 data-[active=true]:ring-ring"
            >
              {o.type === "text" ? <Type className="size-3.5 shrink-0 text-muted-foreground" /> : o.type === "path" ? <Spline className="size-3.5 shrink-0 text-muted-foreground" /> : <Square className="size-3.5 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate" dir="auto" style={o.type === "text" ? { fontFamily: `"${o.fontFamily}", serif` } : undefined}>
                {o.type === "text" ? o.text.split("\n")[0] || o.name : o.name}
              </span>
              <LayerBtn label="Move up" onClick={() => moveLayer(o.id, "up")}><ArrowUp /></LayerBtn>
              <LayerBtn label="Move down" onClick={() => moveLayer(o.id, "down")}><ArrowDown /></LayerBtn>
              <LayerBtn label={o.hidden ? "Show" : "Hide"} onClick={() => updateObject(o.id, { hidden: !o.hidden })}>{o.hidden ? <EyeOff /> : <Eye />}</LayerBtn>
              <LayerBtn label={o.locked ? "Unlock" : "Lock"} onClick={() => updateObject(o.id, { locked: !o.locked })}>{o.locked ? <Lock /> : <Unlock />}</LayerBtn>
              <LayerBtn label="Delete" onClick={() => removeObject(o.id)}><Trash2 /></LayerBtn>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
function LayerBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100 group-data-[active=true]:opacity-100 [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}
