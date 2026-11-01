import type { TextLayout } from "@/editor/glyphs/layout";
import type { TextObject } from "@/editor/model";

export function GlyphText({ o, layout, selectedGlyph, onGlyphPointerDown }: {
  o: TextObject;
  layout: TextLayout;
  selectedGlyph: { at: number; gid: number } | null;
  onGlyphPointerDown: (e: React.PointerEvent<SVGPathElement>, o: TextObject, at: number, gid: number) => void;
}) {
  return (
    <>
      <rect x={-layout.boxWidth / 2} y={-layout.boxHeight / 2} width={layout.boxWidth} height={layout.boxHeight} fill="transparent" />
      <g data-glyph-text="">
        {layout.glyphs.map((item, i) => {
          if (!item.d) return null;
          const active = selectedGlyph?.at === item.editAt && selectedGlyph?.gid === item.gid;
          const matrix = `matrix(${item.k * item.sx} 0 0 ${-item.k * item.sy} ${item.tx} ${item.ty})`;
          return (
            <g key={i}>
              {active && <path transform={matrix} d={item.d} fill="var(--selection)" fillOpacity={0.12} stroke="var(--selection)" strokeWidth={Math.max(1, 1.5 / item.k)} pointerEvents="none" />}
              <path transform={matrix} d={item.d} fill={o.color}
                stroke={item.thickness > 0 ? o.color : "none"} strokeWidth={item.thickness > 0 ? item.thickness / item.k : 0}
                strokeLinejoin="round" paintOrder="stroke fill"
                pointerEvents={item.editAt >= 0 && !item.mark ? "visiblePainted" : "none"}
                style={{ cursor: o.locked ? "not-allowed" : "pointer" }}
                onPointerDown={item.editAt >= 0 && !item.mark ? (event) => onGlyphPointerDown(event, o, item.editAt, item.gid) : undefined}
                data-glyph-index={i} data-source-index={item.editAt} />
            </g>
          );
        })}
      </g>
    </>
  );
}
