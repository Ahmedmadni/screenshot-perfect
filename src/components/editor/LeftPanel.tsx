import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, Square, Trash2, Type, Unlock, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fontService } from "@/editor/fonts";
import type { Editor } from "@/editor/useEditor";
import { FontUploadButton, useFonts } from "./FontPicker";
import { DecorationsPanel } from "./DecorationsPanel";

export function LeftPanel({ editor, onInsertDecoration }: { editor: Editor; onInsertDecoration: (value: string) => void }) {
  const { doc, selectedId, setSelectedId, updateObject, moveLayer, removeObject } = editor;
  const fonts = useFonts();
  const layers = [...doc.objects].reverse();
  return (
    <Tabs defaultValue="layers" className="flex h-full flex-col">
      <TabsList className="m-2 grid grid-cols-3">
        <TabsTrigger value="layers">Layers</TabsTrigger>
        <TabsTrigger value="assets">Fonts</TabsTrigger>
      <TabsTrigger value="decor">زخارف</TabsTrigger>
      </TabsList>
      <TabsContent value="layers" className="mt-0 flex-1 overflow-y-auto px-2 pb-2">
        {!layers.length && <p className="px-2 py-6 text-center text-xs text-muted-foreground">No objects yet. Add text or a shape from the tool rail.</p>}
        <ul className="space-y-0.5">
          {layers.map((o) => (
            <li
              key={o.id}
              onClick={() => setSelectedId(o.id)}
              data-active={o.id === selectedId}
              className="group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent data-[active=true]:bg-accent data-[active=true]:ring-1 data-[active=true]:ring-ring"
            >
              {o.type === "text" ? <Type className="size-3.5 shrink-0 text-muted-foreground" /> : <Square className="size-3.5 shrink-0 text-muted-foreground" />}
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
      </TabsContent>
      <TabsContent value="decor" className="mt-0 min-h-0 flex-1"><DecorationsPanel onInsert={onInsertDecoration} /></TabsContent>
      <TabsContent value="assets" className="mt-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
        <FontUploadButton />
        {(["bundled", "uploaded", "system"] as const).map((src) => {
          const list = fonts.filter((f) => f.source === src);
          return (
            <div key={src}>
              <div className="panel-label mb-1">{src === "bundled" ? "Bundled (OFL)" : src === "uploaded" ? "Uploaded" : "System (this device)"}</div>
              {!list.length && <p className="text-xs text-muted-foreground">{src === "uploaded" ? "No uploaded fonts." : "None detected."}</p>}
              {list.map((f) => (
                <div key={f.family} className="flex items-center gap-2 border-b border-border/60 py-1.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{f.label}</div>
                    <div className="text-muted-foreground">
                      {f.status === "error" ? <span className="text-destructive">{f.error}</span> : f.status === "loading" ? "Loading…" : [f.style, f.format?.toUpperCase(), f.size ? `${Math.round(f.size / 1024)} KB` : null, f.supportsArabic === false ? "no Arabic glyphs detected" : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <span dir="rtl" className="text-lg" style={{ fontFamily: `"${f.family}", serif` }}>خط</span>
                  {src === "uploaded" && (
                    <button aria-label={`Remove ${f.label}`} className="text-muted-foreground hover:text-destructive" onClick={() => fontService.remove(f.family)}>
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </TabsContent>
    </Tabs>
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
