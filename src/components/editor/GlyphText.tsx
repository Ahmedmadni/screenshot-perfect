import { glyphStrokePx, type TextLayout } from "@/editor/glyphs/layout";
import type { TextObject } from "@/editor/model";

/**
 * Text drawn from HarfBuzz glyph outlines. When `interactive` (letter editing
 * mode), each base glyph is its own hit target; diacritics and inserted
 * tatweel stay non-interactive here.
 */
export function GlyphText({ o, layout, interactive, onGlyphPointerDown }: {
  o: TextObject;
  layout: TextLayout;
  interactive: boolean;
  onGlyphPointerDown: (e: React.PointerEvent<SVGPathElement>, o: TextObject, at: number, gid: number) => void;
}) {
  return (
    <>
      <rect x={-layout.boxWidth / 2} y={-layout.boxHeight / 2} width={layout.boxWidth} height={layout.boxHeight} fill="transparent" />
      <g data-glyph-text="">
        {layout.glyphs.map((item, i) => {
          if (!item.d) return null;
          const px = glyphStrokePx(o, layout, item);
          const editable = interactive && item.editAt >= 0 && !item.mark;
          return (
            <path key={i} transform={`matrix(${item.m.join(" ")})`} d={item.d} fill={o.color}
              stroke={px > 0 ? o.color : "none"} strokeWidth={px > 0 ? px / item.k : 0}
              strokeLinejoin="round" paintOrder="stroke fill"
              pointerEvents={editable ? "visiblePainted" : "none"}
              style={editable ? { cursor: o.locked ? "not-allowed" : "pointer" } : undefined}
              onPointerDown={editable ? (event) => onGlyphPointerDown(event, o, item.editAt, item.gid) : undefined}
              data-glyph-index={i} data-source-index={item.editAt} data-gid={item.gid} />
          );
        })}
      </g>
    </>
  );
}
