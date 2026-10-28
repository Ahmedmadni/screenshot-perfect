import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { TextObject } from "@/editor/model";

const MARKS: { ch: string; label: string }[] = [
  { ch: "\u064E", label: "Fatha" },
  { ch: "\u064F", label: "Damma" },
  { ch: "\u0650", label: "Kasra" },
  { ch: "\u0651", label: "Shadda" },
  { ch: "\u0652", label: "Sukun" },
  { ch: "\u064B", label: "Tanwin fath" },
  { ch: "\u064C", label: "Tanwin damm" },
  { ch: "\u064D", label: "Tanwin kasr" },
  { ch: "\u0670", label: "Dagger alif" },
  { ch: "\u0640", label: "Tatweel" },
];

export function TextEditorDialog({ obj, onClose, onSave }: { obj: TextObject | null; onClose: () => void; onSave: (text: string) => void }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (obj) setText(obj.text);
  }, [obj]);

  const insert = (ch: string) => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const next = text.slice(0, s) + ch + text.slice(e);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + ch.length, s + ch.length);
    });
  };

  return (
    <Dialog open={!!obj} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>تحرير النص · Edit text</DialogTitle>
          <DialogDescription>Type or paste Arabic text. Use the buttons to insert diacritics at the cursor.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1" dir="rtl">
          {MARKS.map((m) => (
            <button
              key={m.ch}
              type="button"
              onClick={() => insert(m.ch)}
              title={m.label}
              aria-label={`Insert ${m.label}`}
              className="h-10 w-10 rounded-md border border-input bg-card text-2xl hover:bg-accent"
              style={{ fontFamily: obj ? `"${obj.fontFamily}", serif` : undefined }}
            >
              {m.ch === "\u0640" ? "ـ" : `ب${m.ch}`}
            </button>
          ))}
        </div>
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          dir={obj?.direction ?? "rtl"}
          rows={5}
          aria-label="Text content"
          className="w-full resize-y rounded-md border border-input bg-card p-3 text-3xl leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
          style={{ fontFamily: obj ? `"${obj.fontFamily}", serif` : undefined }}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) onSave(text);
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(text)} disabled={!text.trim()}>Apply (Ctrl+Enter)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
