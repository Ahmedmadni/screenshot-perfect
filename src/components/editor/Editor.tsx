import { useCallback, useEffect, useRef, useState } from "react";
import {
  Circle,
  Diamond,
  Download,
  FilePlus2,
  FolderOpen,
  Layers,
  Maximize,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  Save,
  Settings2,
  SlidersHorizontal,
  Square,
  Star,
  Trash2,
  Type,
  Undo2,
  DoorClosed,
  Pen,
  Spline,
  Pencil,
  Waypoints,
  Shapes,
  ALargeSmall,
  Sparkles,
  PenTool,
} from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  createProject,
  createSampleProject,
  createShape,
  createText,
  uid,
  type ShapeKind,
  type TextObject,
} from "@/editor/model";
import { fontService } from "@/editor/fonts";
import { exportOutlineSVG, exportPDF, exportPNG, exportSVG } from "@/editor/export";
import { remapAdjustments } from "@/editor/calligraphy/remap";
import { getMarkAdjust, setMarkAdjust } from "@/editor/calligraphy/marks";
import type { PdfBackground, PdfPage } from "@/editor/glyphs/pdf";
import { PdfExportDialog } from "./PdfExportDialog";
import {
  deleteProjectLocal,
  downloadBlob,
  lastProjectId,
  listProjects,
  loadProjectLocal,
  parseProjectFile,
  safeFileName,
  saveProjectLocal,
  setLastProject,
  type ProjectMeta,
} from "@/editor/storage";
import { useEditor } from "@/editor/useEditor";
import { createFloralRosette } from "@/editor/ornaments";
import { CanvasView } from "./CanvasView";
import { LeftPanel } from "./LeftPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { TextEditorDialog } from "./TextEditorDialog";
import { useFonts } from "./FontPicker";
import { FontsLibrary } from "./FontsLibrary";
import { FloatingPanel } from "./FloatingPanel";
import { DecorationsPanel } from "./DecorationsPanel";
import { SizeControls } from "./SizeControls";
import type { Tool } from "@/editor/useEditor";

const DRAW_TOOLS: {
  tool: Exclude<Tool, "select">;
  label: string;
  key: string;
  Icon: typeof Pen;
}[] = [
  { tool: "pen", label: "قلم المنحنيات · Pen", key: "P", Icon: Pen },
  { tool: "curvature", label: "أداة الانحناء · Curvature", key: "C", Icon: Spline },
  { tool: "freehand", label: "رسم حر · Freehand", key: "F", Icon: Pencil },
  { tool: "node", label: "تعديل نقاط المسار · Edit nodes", key: "N", Icon: Waypoints },
];
const SHAPE_TOOLS: { kind: ShapeKind; label: string; Icon: typeof Square }[] = [
  { kind: "rect", label: "مستطيل", Icon: Square },
  { kind: "ellipse", label: "دائرة / بيضاوي", Icon: Circle },
  { kind: "diamond", label: "معين", Icon: Diamond },
  { kind: "star8", label: "نجمة ثمانية", Icon: Star },
  { kind: "arch", label: "قوس", Icon: DoorClosed },
];

const clampZoom = (z: number) => Math.min(8, Math.max(0.05, z));

function Tip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function initialDoc() {
  const id = lastProjectId();
  const d = id ? loadProjectLocal(id) : null;
  return { doc: d ?? createSampleProject(), saved: !!d };
}

/** Small corner mark showing that a rail button opens a group of tools. */
function GroupMark() {
  return (
    <span
      aria-hidden
      className="absolute bottom-1 right-1 size-0 border-b-4 border-l-4 border-b-current border-l-transparent opacity-60"
    />
  );
}

export function Editor() {
  const [init] = useState(initialDoc);
  const editor = useEditor(init.doc);
  const {
    doc,
    selected,
    selectedId,
    addObject,
    removeObject,
    updateObject,
    undo,
    redo,
    loadDoc,
    isSaved,
    markSaved,
  } = editor;
  const [zoom, setZoomRaw] = useState(0.7);
  const setZoom = useCallback((z: number) => setZoomRaw(clampZoom(z)), []);
  const [showChecker, setShowChecker] = useState(false);
  const [showBounds, setShowBounds] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openDlg, setOpenDlg] = useState(false);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"left" | "right" | null>(null);
  const [exporting, setExporting] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [ornamentsOpen, setOrnamentsOpen] = useState(true);
  const [insertSize, setInsertSize] = useState(76);
  const [group, setGroup] = useState<"draw" | "shapes" | "fonts" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasWrap = useRef<HTMLDivElement>(null);
  const fonts = useFonts();
  const fontsVersion = fonts.filter((f) => f.status === "ready").length;

  useEffect(() => {
    fontService.init();
    if (init.saved) markSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fit = useCallback(() => {
    const el = canvasWrap.current;
    if (!el) return;
    setZoom(Math.min((el.clientWidth - 160) / doc.width, (el.clientHeight - 160) / doc.height));
  }, [doc.width, doc.height, setZoom]);
  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  const confirmDiscard = () =>
    isSaved || !doc.objects.length || window.confirm("You have unsaved changes. Discard them?");

  const save = useCallback(() => {
    const r = saveProjectLocal(doc);
    if (r.ok) {
      markSaved();
      setSaveError(null);
      toast.success("Project saved in this browser");
    } else {
      setSaveError(r.error);
      toast.error(`Save failed: ${r.error}`);
    }
  }, [doc, markSaved]);

  const newProject = () => {
    if (!confirmDiscard()) return;
    const d = createProject();
    loadDoc(d, false);
    setLastProject(d.id);
  };

  const addText = (fontFamily?: string) => {
    const t = createText(doc, fontFamily ? { fontFamily } : {});
    addObject(t);
    setEditingId(t.id);
  };
  const addShape = (k: ShapeKind) => addObject(createShape(doc, k));
  const insertDecoration = (value: string, x = doc.width / 2, y = doc.height / 2) => {
    if (value.startsWith("@vector:")) {
      const kind = value.slice(8);
      if (kind === "floral") {
        addObject(createFloralRosette(x, y, Math.round(insertSize * 2.5)));
        return;
      }
      const size = Math.round(insertSize * 2.5);
      const style = {
        x,
        y,
        fill: "transparent",
        stroke: "#a0703a",
        strokeWidth: Math.max(2, size * 0.012),
      };
      if (kind === "rosette") {
        const outer = createShape(doc, "star8", {
          ...style,
          name: "وردة هندسية — نجمة",
          width: size,
          height: size,
        });
        const inner = createShape(doc, "ellipse", {
          ...style,
          name: "وردة هندسية — دائرة",
          width: size * 0.58,
          height: size * 0.58,
          strokeWidth: Math.max(1.5, size * 0.008),
        });
        const core = createShape(doc, "diamond", {
          ...style,
          name: "وردة هندسية — قلب",
          width: size * 0.24,
          height: size * 0.24,
          strokeWidth: Math.max(1.5, size * 0.008),
        });
        addObject(outer);
        addObject(inner);
        addObject(core);
      } else {
        const shape = kind === "frame" ? "rect" : (kind as ShapeKind);
        const item = createShape(doc, shape, {
          ...style,
          name:
            (
              {
                star8: "نجمة ثمانية",
                diamond: "معين زخرفي",
                ellipse: "إطار دائري",
                arch: "قوس زخرفي",
                rect: "إطار زخرفي",
              } as Record<string, string>
            )[shape] ?? "زخرفة متجهية",
          width: size,
          height: kind === "arch" ? size * 1.25 : size,
          cornerRadius: kind === "frame" ? size * 0.08 : 0,
        });
        addObject(item);
      }
      return;
    }
    const item = createText(doc, {
      name: "عنصر زخرفي",
      text: value,
      x,
      y,
      fontSize: insertSize,
      color: "#a0703a",
      align: "center",
      direction: "rtl",
    });
    addObject(item);
  };

  const doExport = async (kind: "png1" | "png2" | "png4" | "svg" | "outline" | "project") => {
    setExporting(true);
    const name = safeFileName(doc.name);
    try {
      if (kind === "project") {
        const families = doc.objects.flatMap((o) => (o.type === "text" ? [o.fontFamily] : []));
        const file = { project: doc, fonts: fontService.exportUploaded(families) };
        downloadBlob(
          new Blob([JSON.stringify(file)], { type: "application/json" }),
          `${name}.acs.json`,
        );
      } else if (kind === "svg") {
        const { blob, missing, outlinedCount } = await exportSVG(doc);
        downloadBlob(blob, `${name}.svg`);
        if (outlinedCount)
          toast.info(
            `${outlinedCount} text object(s) with moved diacritics were written as outlines; the rest stays editable text.`,
          );
        if (missing.length)
          toast.warning(
            `SVG exported, but these fonts could not be embedded: ${missing.join(", ")}. The text may look different in other apps.`,
          );
        else
          toast.success(
            "Editable SVG exported with embedded fonts. Some SVG viewers ignore embedded fonts; use Outline SVG when the look must be exact.",
          );
        return;
      } else if (kind === "outline") {
        downloadBlob(await exportOutlineSVG(doc), `${name}-outlines.svg`);
      } else {
        const scale = kind === "png1" ? 1 : kind === "png2" ? 2 : 4;
        const { blob, warnings } = await exportPNG(doc, scale);
        downloadBlob(blob, `${name}@${scale}x.png`);
        warnings.forEach((w) => toast.warning(w));
      }
      toast.success("Export complete");
    } catch (e) {
      toast.error(`Export failed: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  const doPdf = async (opts: { page: PdfPage; background: PdfBackground }) => {
    setExporting(true);
    try {
      downloadBlob(await exportPDF(doc, opts), `${safeFileName(doc.name)}.pdf`);
      setPdfOpen(false);
      toast.success("Vector PDF exported");
    } catch (e) {
      toast.error(`PDF export failed: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  const openFile = async (file: File) => {
    try {
      const { project, fonts: embedded } = parseProjectFile(await file.text());
      await fontService.importEmbedded(embedded);
      loadDoc(project, false);
      setOpenDlg(false);
      toast.success(`Opened "${project.name}"`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const markObj = editor.markEdit
    ? doc.objects.find((o) => o.id === editor.markEdit!.objectId)
    : undefined;
  const markTarget =
    markObj?.type === "text" && editor.markEdit?.at != null && !markObj.locked
      ? { o: markObj, at: editor.markEdit.at }
      : null;

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select,[role=dialog]")) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && k === "y") {
        e.preventDefault();
        redo();
      } else if (mod && k === "s") {
        e.preventDefault();
        save();
      } else if (mod && k === "d" && selected) {
        e.preventDefault();
        addObject({ ...selected, id: uid(), x: selected.x + 20, y: selected.y + 20 });
      } else if (mod && (k === "=" || k === "+")) {
        e.preventDefault();
        setZoom(zoom * 1.2);
      } else if (mod && k === "-") {
        e.preventDefault();
        setZoom(zoom / 1.2);
      } else if (mod && k === "0") {
        e.preventDefault();
        fit();
      } else if (markTarget && k.startsWith("arrow")) {
        e.preventDefault();
        const { o, at } = markTarget;
        const d = (e.shiftKey ? 10 : 1) / o.fontSize;
        const a = getMarkAdjust(o.marks, at);
        const dx = (a?.dx ?? 0) + (k === "arrowleft" ? -d : k === "arrowright" ? d : 0);
        const dy = (a?.dy ?? 0) + (k === "arrowup" ? -d : k === "arrowdown" ? d : 0);
        const ch = a?.ch ?? o.text[at] ?? "";
        updateObject(
          o.id,
          {
            marks: setMarkAdjust(o.marks, at, ch, {
              dx: Math.round(dx * 1000) / 1000,
              dy: Math.round(dy * 1000) / 1000,
            }),
          },
          `mark:${at}:nudge`,
        );
      } else if (editor.markEdit && (k === "delete" || k === "backspace")) e.preventDefault();
      else if ((k === "delete" || k === "backspace") && selectedId) {
        e.preventDefault();
        removeObject(selectedId);
      } else if (k === "escape") {
        if (editor.markEdit) editor.setMarkEdit(null);
        else editor.setSelectedId(null);
      } else if (k === "enter" && selected?.type === "text") {
        e.preventDefault();
        setEditingId(selected.id);
      } else if (!mod && k === "v") editor.setTool("select");
      else if (!mod && k === "n" && selected?.type === "path") editor.setTool("node");
      else if (!mod && k === "p") editor.setTool("pen");
      else if (!mod && k === "c") editor.setTool("curvature");
      else if (!mod && k === "f") editor.setTool("freehand");
      else if (!mod && k === "t") {
        editor.setTool("select");
        addText();
      } else if (!mod && k === "o") setOrnamentsOpen((v) => !v);
      else if (selected && !selected.locked && k.startsWith("arrow")) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const dx = k === "arrowleft" ? -d : k === "arrowright" ? d : 0;
        const dy = k === "arrowup" ? -d : k === "arrowdown" ? d : 0;
        updateObject(selected.id, { x: selected.x + dx, y: selected.y + dy }, "nudge");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!isSaved && doc.objects.length) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isSaved, doc.objects.length]);

  const editing =
    (doc.objects.find((o) => o.id === editingId && o.type === "text") as TextObject | undefined) ??
    null;
  const status = saveError ? "Save failed" : isSaved ? "Saved" : "Unsaved changes";

  const activeDraw = DRAW_TOOLS.find((t) => t.tool === editor.tool);
  const DrawIcon = activeDraw?.Icon ?? PenTool;
  const tools = (
    <div className="flex flex-col items-center gap-1 py-2">
      <Tip label="تحديد وتحريك · Select (V)">
        <button
          className="tool-btn"
          data-active={editor.tool === "select"}
          onClick={() => editor.setTool("select")}
          aria-label="Selection tool"
        >
          <MousePointer2 className="size-4" />
        </button>
      </Tip>
      <Tip label="إضافة نص · Text (T)">
        <button
          className="tool-btn"
          onClick={() => {
            editor.setTool("select");
            addText();
          }}
          aria-label="Add text"
        >
          <Type className="size-4" />
        </button>
      </Tip>
      <div className="my-1 h-px w-6 bg-border" />
      <Popover open={group === "draw"} onOpenChange={(o) => setGroup(o ? "draw" : null)}>
        <Tip label="أدوات الرسم">
          <PopoverTrigger asChild>
            <button
              className="tool-btn relative"
              data-active={!!activeDraw}
              aria-label="Drawing tools"
            >
              <DrawIcon className="size-4" />
              <GroupMark />
            </button>
          </PopoverTrigger>
        </Tip>
        <PopoverContent side="right" align="start" className="w-60 p-1.5" dir="rtl">
          <div className="panel-label px-2 py-1">الرسم</div>
          {DRAW_TOOLS.map(({ tool, label, key, Icon }) => (
            <button
              key={tool}
              disabled={tool === "node" && selected?.type !== "path"}
              data-active={editor.tool === tool}
              onClick={() => {
                editor.setTool(tool);
                setGroup(null);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent disabled:opacity-40 data-[active=true]:bg-accent"
            >
              <Icon className="size-4 text-muted-foreground" />
              <span className="flex-1 text-start">{label}</span>
              <kbd className="text-[10px] text-muted-foreground">{key}</kbd>
            </button>
          ))}
        </PopoverContent>
      </Popover>
      <Popover open={group === "shapes"} onOpenChange={(o) => setGroup(o ? "shapes" : null)}>
        <Tip label="الأشكال">
          <PopoverTrigger asChild>
            <button className="tool-btn relative" aria-label="Shapes">
              <Shapes className="size-4" />
              <GroupMark />
            </button>
          </PopoverTrigger>
        </Tip>
        <PopoverContent side="right" align="start" className="w-56 p-1.5" dir="rtl">
          <div className="panel-label px-2 py-1">الأشكال</div>
          <div className="grid grid-cols-3 gap-1">
            {SHAPE_TOOLS.map(({ kind, label, Icon }) => (
              <button
                key={kind}
                onClick={() => {
                  editor.setTool("select");
                  addShape(kind);
                  setGroup(null);
                }}
                className="flex flex-col items-center gap-1 rounded-md border border-border p-2 text-[10px] text-muted-foreground hover:border-primary hover:bg-accent hover:text-foreground"
                aria-label={label}
              >
                <Icon className="size-5" />
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setOrnamentsOpen(true);
              setGroup(null);
            }}
            className="mt-1.5 w-full rounded-md px-2 py-1.5 text-start text-xs text-primary hover:bg-accent"
          >
            زخارف وأشكال إضافية ←
          </button>
        </PopoverContent>
      </Popover>
      <div className="my-1 h-px w-6 bg-border" />
      <Popover open={group === "fonts"} onOpenChange={(o) => setGroup(o ? "fonts" : null)}>
        <Tip label="الخطوط">
          <PopoverTrigger asChild>
            <button className="tool-btn" data-active={group === "fonts"} aria-label="Fonts">
              <ALargeSmall className="size-4" />
            </button>
          </PopoverTrigger>
        </Tip>
        <PopoverContent side="right" align="start" className="w-80 p-0">
          <FontsLibrary
            editor={editor}
            onAddText={(family) => {
              editor.setTool("select");
              addText(family);
              setGroup(null);
            }}
          />
        </PopoverContent>
      </Popover>
      <Tip label="التشكيل والزخارف">
        <button
          className="tool-btn"
          data-active={ornamentsOpen}
          onClick={() => setOrnamentsOpen((v) => !v)}
          aria-label="Diacritics and ornaments"
        >
          <Sparkles className="size-4" />
        </button>
      </Tip>
    </div>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col bg-background text-foreground">
        {/* Top toolbar */}
        <header className="flex h-12 shrink-0 items-center gap-1 border-b bg-panel px-2">
          <div className="flex items-center gap-2 pe-3">
            <span
              className="flex size-8 items-center justify-center rounded-md bg-primary font-display text-lg text-primary-foreground"
              dir="rtl"
            >
              ق
            </span>
            <div className="hidden max-w-52 leading-tight xl:block">
              <div className="truncate text-sm font-semibold">Arabic Calligraphy Studio</div>
              <div className="truncate text-[11px] text-muted-foreground" dir="auto">
                {doc.name}
              </div>
            </div>
          </div>
          <Tip label="New project">
            <button className="tool-btn" onClick={newProject} aria-label="New project">
              <FilePlus2 className="size-4" />
            </button>
          </Tip>
          <Tip label="Open project">
            <button
              className="tool-btn"
              onClick={() => {
                setProjects(listProjects());
                setOpenDlg(true);
              }}
              aria-label="Open project"
            >
              <FolderOpen className="size-4" />
            </button>
          </Tip>
          <Tip label="Save (Ctrl+S)">
            <button className="tool-btn" onClick={save} aria-label="Save project">
              <Save className="size-4" />
            </button>
          </Tip>
          <div className="mx-1 h-6 w-px bg-border" />
          <Tip label="Undo (Ctrl+Z)">
            <button
              className="tool-btn"
              onClick={undo}
              disabled={!editor.canUndo}
              aria-label="Undo"
            >
              <Undo2 className="size-4" />
            </button>
          </Tip>
          <Tip label="Redo (Ctrl+Shift+Z)">
            <button
              className="tool-btn"
              onClick={redo}
              disabled={!editor.canRedo}
              aria-label="Redo"
            >
              <Redo2 className="size-4" />
            </button>
          </Tip>
          <div className="mx-1 h-6 w-px bg-border" />
          <div className="hidden items-center sm:flex">
            <Tip label="Zoom out">
              <button
                className="tool-btn"
                onClick={() => setZoom(zoom / 1.2)}
                aria-label="Zoom out"
              >
                <Minus className="size-4" />
              </button>
            </Tip>
            <span className="w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
            <Tip label="Zoom in">
              <button className="tool-btn" onClick={() => setZoom(zoom * 1.2)} aria-label="Zoom in">
                <Plus className="size-4" />
              </button>
            </Tip>
            <Tip label="Fit (Ctrl+0)">
              <button className="tool-btn" onClick={fit} aria-label="Fit to screen">
                <Maximize className="size-4" />
              </button>
            </Tip>
          </div>
          <div className="flex-1" />
          <Tip label="Layers · الطبقات">
            <button
              className="tool-btn lg:hidden"
              onClick={() => setSheet("left")}
              aria-label="Layers"
            >
              <Layers className="size-4" />
            </button>
          </Tip>
          <Tip label="Properties">
            <button
              className="tool-btn lg:hidden"
              onClick={() => setSheet("right")}
              aria-label="Properties"
            >
              <SlidersHorizontal className="size-4" />
            </button>
          </Tip>
          <Popover>
            <Tip label="Settings">
              <PopoverTrigger asChild>
                <button className="tool-btn" aria-label="Settings">
                  <Settings2 className="size-4" />
                </button>
              </PopoverTrigger>
            </Tip>
            <PopoverContent align="end" className="w-64 space-y-3">
              <div className="panel-label">View settings</div>
              <label className="flex items-center justify-between text-sm">
                Checkerboard background{" "}
                <Switch checked={showChecker} onCheckedChange={setShowChecker} />
              </label>
              <label className="flex items-center justify-between text-sm">
                Page boundary <Switch checked={showBounds} onCheckedChange={setShowBounds} />
              </label>
              <p className="text-[11px] text-muted-foreground">
                Hold Space and drag to pan. Ctrl + scroll to zoom. Shift while rotating snaps to
                15°.
              </p>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="ms-1" disabled={exporting}>
                <Download /> <span className="hidden sm:inline">Export</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Image</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => doExport("png1")}>PNG · 1×</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("png2")}>
                PNG · 2× (high-res)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("png4")}>PNG · 4× (print)</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Vector</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => doExport("svg")}>
                <div>
                  <div>SVG · editable text</div>
                  <div className="text-[11px] text-muted-foreground">
                    Text stays editable; fonts embedded
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("outline")}>
                <div>
                  <div>SVG · outlines</div>
                  <div className="text-[11px] text-muted-foreground">
                    Exact look, no fonts needed
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPdfOpen(true)}>
                <div>
                  <div>PDF · vector, print-ready…</div>
                  <div className="text-[11px] text-muted-foreground">
                    Choose page size and background
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Project</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => doExport("project")}>
                Download project file (.acs.json)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="w-12 shrink-0 border-e bg-panel">{tools}</aside>
          <aside className="hidden w-56 shrink-0 border-e bg-panel lg:block">
            <LeftPanel editor={editor} />
          </aside>
          <main ref={canvasWrap} className="min-w-0 flex-1">
            <CanvasView
              editor={editor}
              zoom={zoom}
              onZoom={setZoom}
              showChecker={showChecker}
              showBounds={showBounds}
              fontsVersion={fontsVersion}
              onEditText={setEditingId}
              onDropDecoration={insertDecoration}
            />
          </main>
          <aside className="hidden w-72 shrink-0 overflow-y-auto border-s bg-panel lg:block">
            <PropertiesPanel editor={editor} onEditText={setEditingId} />
          </aside>
        </div>

        {/* Status bar */}
        <footer className="flex h-7 shrink-0 items-center gap-4 border-t bg-panel px-3 text-[11px] text-muted-foreground tabular-nums">
          <span>{Math.round(zoom * 100)}%</span>
          <span>
            {doc.width} × {doc.height} px
          </span>
          <span className="min-w-0 flex-1 truncate" dir="auto">
            {selected
              ? `${selected.type === "text" ? "Text" : selected.name}: ${selected.type === "text" ? selected.text.split("\n")[0] : ""}`
              : `${doc.objects.length} objects`}
          </span>
          <span
            className={saveError ? "text-destructive" : isSaved ? "text-success" : "text-warning"}
          >
            ● {status}
          </span>
        </footer>

        <Sheet open={sheet === "left"} onOpenChange={(o) => !o && setSheet(null)}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Layers</SheetTitle>
            </SheetHeader>
            <div className="h-full pt-8">
              <LeftPanel editor={editor} />
            </div>
          </SheetContent>
        </Sheet>
        <Sheet open={sheet === "right"} onOpenChange={(o) => !o && setSheet(null)}>
          <SheetContent side="right" className="w-80 overflow-y-auto p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Properties</SheetTitle>
            </SheetHeader>
            <div className="pt-8">
              <PropertiesPanel editor={editor} onEditText={setEditingId} />
            </div>
          </SheetContent>
        </Sheet>

        <TextEditorDialog
          obj={editing}
          onClose={() => setEditingId(null)}
          onSave={(text) => {
            // Elongation and diacritic positions follow the characters they belong to.
            if (editing) updateObject(editing.id, { text, ...remapAdjustments(editing, text) });
            setEditingId(null);
          }}
        />

        {ornamentsOpen && (
          <FloatingPanel
            storageKey="acs:ui:ornaments"
            title="التشكيل والزخارف · اسحب العناصر إلى اللوحة"
            icon={<Sparkles className="size-3.5 text-primary" />}
            onClose={() => setOrnamentsOpen(false)}
            initial={() => ({
              x: Math.max(8, window.innerWidth - 340 - (window.innerWidth >= 1024 ? 300 : 16)),
              y: 64,
              w: 320,
              h: Math.min(560, window.innerHeight - 120),
            })}
          >
            <DecorationsPanel
              onInsert={insertDecoration}
              footer={
                <SizeControls
                  editor={editor}
                  insertSize={insertSize}
                  onInsertSize={setInsertSize}
                />
              }
            />
          </FloatingPanel>
        )}

        <PdfExportDialog
          doc={doc}
          open={pdfOpen}
          busy={exporting}
          onClose={() => setPdfOpen(false)}
          onExport={doPdf}
        />

        <Dialog open={openDlg} onOpenChange={setOpenDlg}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Open project · فتح مشروع</DialogTitle>
              <DialogDescription>
                Projects saved in this browser, or open a downloaded project file.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {!projects.length && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No saved projects in this browser yet.
                </p>
              )}
              {projects.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <button
                    className="min-w-0 flex-1 text-start"
                    onClick={() => {
                      if (!confirmDiscard()) return;
                      const d = loadProjectLocal(p.id);
                      if (!d) {
                        toast.error("This project could not be read.");
                        return;
                      }
                      loadDoc(d, true);
                      setLastProject(d.id);
                      setOpenDlg(false);
                    }}
                  >
                    <div className="truncate text-sm" dir="auto">
                      {p.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(p.updatedAt).toLocaleString()}
                    </div>
                  </button>
                  <button
                    aria-label={`Delete ${p.name}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      deleteProjectLocal(p.id);
                      setProjects(listProjects());
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              aria-label="Project file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) openFile(f);
              }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <FolderOpen /> Open project file…
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
