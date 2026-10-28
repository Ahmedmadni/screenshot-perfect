import type { TextLayout } from "@/editor/glyphs/layout";
import type { TextObject } from "@/editor/model";

/** Draws a text object from glyph-engine outlines (used when features or diacritic edits are active). */
export function GlyphText({ o, layout }: { o: TextObject; layout: TextLayout }) {
  const stroke = layout.boldStroke;
  return (
    <>
      <rect x={-layout.boxWidth / 2} y={-layout.boxHeight / 2} width={layout.boxWidth} height={layout.boxHeight} fill="transparent" />
      <g fill={o.color} stroke={stroke ? o.color : undefined} strokeLinejoin="round" data-glyph-text="">
        {layout.glyphs.map((g, i) =>
          g.d ? (
            <path key={i} transform={`matrix(${g.k} 0 0 ${-g.k} ${g.tx} ${g.ty})`} d={g.d} strokeWidth={stroke ? stroke / g.k : undefined} />
          ) : null,
        )}
      </g>
    </>
  );
}
