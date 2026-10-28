import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { pageLayout, type PdfBackground, type PdfPage } from "@/editor/glyphs/pdf";
import type { ProjectDoc } from "@/editor/model";

const PAGES: { id: PdfPage; label: string }[] = [
  { id: "canvas", label: "Canvas size" },
  { id: "a4", label: "A4" },
  { id: "a3", label: "A3" },
  { id: "letter", label: "US Letter" },
];

const BACKGROUNDS: { id: PdfBackground; label: string; hint: string }[] = [
  { id: "canvas", label: "Canvas colour", hint: "Uses the project background." },
  { id: "white", label: "White", hint: "Plain white page." },
  { id: "none", label: "None (transparent)", hint: "No background is drawn. PDF viewers show the page as white; layout and print apps keep it transparent." },
];

const mm = (pt: number) => Math.round((pt / 72) * 25.4);

export function PdfExportDialog({ doc, open, busy, onClose, onExport }: { doc: ProjectDoc; open: boolean; busy: boolean; onClose: () => void; onExport: (o: { page: PdfPage; background: PdfBackground }) => void }) {
  const [page, setPage] = useState<PdfPage>("canvas");
  const [background, setBackground] = useState<PdfBackground>(doc.transparentBackground ? "none" : "canvas");
  const l = pageLayout(doc.width, doc.height, page);
  const opt = "rounded-md border border-input px-2.5 py-1.5 text-xs text-start hover:bg-accent data-[active=true]:border-primary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export PDF · تصدير PDF</DialogTitle>
          <DialogDescription>Vector PDF: every letter, diacritic and shape is drawn as a sharp outline, so it prints at any size without the fonts installed.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <div className="panel-label">Page size</div>
          <div className="grid grid-cols-2 gap-1.5">
            {PAGES.map((p) => (
              <button key={p.id} type="button" className={opt} data-active={page === p.id} onClick={() => setPage(p.id)}>{p.label}</button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {mm(l.pw)} × {mm(l.ph)} mm{page === "canvas" ? ` (${doc.width} × ${doc.height} px at 96 dpi)` : ", design fitted and centred, aspect ratio kept"}
          </p>
        </div>
        <div className="space-y-1.5">
          <div className="panel-label">Background</div>
          <div className="grid gap-1.5">
            {BACKGROUNDS.map((b) => (
              <button key={b.id} type="button" className={opt} data-active={background === b.id} onClick={() => setBackground(b.id)}>
                <div>{b.label}</div>
                <div className="text-[11px] opacity-75">{b.hint}</div>
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Text in the PDF is outlined, so it cannot be searched or selected. Fonts must be bundled or uploaded TTF, OTF or WOFF files.</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={() => onExport({ page, background })}>{busy ? "Exporting…" : "Export PDF"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
