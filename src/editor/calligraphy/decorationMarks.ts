/** Original calligraphic silhouettes, not extracted from proprietary software. */
import { parsePath } from "../glyphs/svgpath";
import { segsToContours } from "../paths/convert";
import { createPathObject } from "../paths/edit";
import { contoursBounds } from "../paths/geometry";

export interface CalligraphicMark {
  id: string;
  label: string;
  category: "vowels" | "combined" | "fillers";
  d: string;
}

const fatha = "M12 43C28 34 58 20 88 10L82 23C57 29 33 40 12 46Z";
const damma = "M30 38C11 30 19 5 39 9C58 12 52 36 35 36C55 45 73 31 83 17C80 43 55 57 30 46L20 61L13 56ZM32 29C45 33 48 17 37 16C27 13 22 25 32 29Z";
const sukun = "M23 33C23 9 66 6 72 29C79 53 31 60 23 33ZM33 32C38 46 65 39 62 28C58 16 31 20 33 32Z";
const shadda = "M12 25C15 42 22 45 29 32L37 18C37 35 41 43 49 32L59 14C58 32 63 39 73 24L88 10C81 38 64 55 53 39C42 57 29 51 29 43C15 58 6 43 12 25Z";
const dot = "M43 14L57 22L49 37L35 28Z";
const raised = (d: string, y: number) => parsePath(d).map((s) => {
  const p = (v: [number, number]): [number, number] => [v[0], v[1] + y];
  if (s.op === "Z") return "Z";
  if (s.op === "C") return `C${p(s.c1).join(" ")} ${p(s.c2).join(" ")} ${p(s.p).join(" ")}`;
  return `${s.op}${p(s.p).join(" ")}`;
}).join(" ");

export const CALLIGRAPHIC_MARKS: CalligraphicMark[] = [
  { id: "fatha", label: "فتحة خطية", category: "vowels", d: fatha },
  { id: "kasra", label: "كسرة خطية", category: "vowels", d: fatha },
  { id: "damma", label: "ضمة خطية", category: "vowels", d: damma },
  { id: "sukun", label: "سكون دائري", category: "vowels", d: sukun },
  { id: "shadda", label: "شدة خطية", category: "vowels", d: shadda },
  { id: "tanwin-fath", label: "تنوين فتح خطي", category: "vowels", d: `${fatha}${raised(fatha, 17)}` },
  { id: "tanwin-kasr", label: "تنوين كسر خطي", category: "vowels", d: `${fatha}${raised(fatha, 17)}` },
  { id: "tanwin-damm", label: "تنوين ضم خطي", category: "vowels", d: `${damma}${raised(damma, 52)}` },
  { id: "dagger-alef", label: "ألف خنجرية", category: "vowels", d: "M48 7L60 0L50 80L44 89Z" },
  { id: "madd", label: "مدة خطية", category: "vowels", d: "M7 36C22 4 35 16 48 23C63 31 77 9 94 13L89 25C73 19 60 45 43 32C26 17 20 27 7 36Z" },
  { id: "hamza", label: "همزة مستقلة", category: "vowels", d: "M66 13C39 -1 21 26 44 33L22 47L15 58L77 33L84 20L52 29C31 29 39 8 66 18Z" },
  { id: "shadda-fatha", label: "شدة مع فتحة", category: "combined", d: `${shadda}${raised(fatha, -30)}` },
  { id: "shadda-kasra", label: "شدة مع كسرة", category: "combined", d: `${shadda}${raised(fatha, 45)}` },
  { id: "shadda-damma", label: "شدة مع ضمة", category: "combined", d: `${shadda}${raised(damma, -57)}` },
  { id: "shadda-tanwin", label: "شدة مع تنوين فتح", category: "combined", d: `${shadda}${raised(fatha, -42)}${raised(fatha, -25)}` },
  { id: "long-fatha", label: "فتحة ممتدة", category: "fillers", d: "M3 45C30 25 73 10 118 4L106 18C68 20 28 36 3 48Z" },
  { id: "inverted-damma", label: "ضمة مقلوبة زخرفية", category: "fillers", d: "M15 15C32 47 54 50 68 36C48 39 41 17 56 11C77 1 91 27 74 41C53 63 24 51 15 15ZM59 18C49 23 58 36 68 30C76 24 67 14 59 18Z" },
  { id: "small-seen", label: "سين صغيرة", category: "fillers", d: "M8 22C9 42 19 44 28 24L35 10C34 42 46 40 55 20L63 7C60 38 71 35 89 14C84 38 69 53 57 37C46 54 33 49 30 38C17 57 2 48 8 22Z" },
  { id: "head-ha", label: "رأس هاء", category: "fillers", d: "M12 48C14 20 37 2 54 9C73 17 78 37 90 49L65 54C45 47 33 47 12 48ZM28 35C35 35 46 33 56 41C59 19 43 11 28 35Z" },
  { id: "wedge", label: "وتد خطي", category: "fillers", d: "M12 46L72 7L52 37L12 51Z" },
  { id: "leaf", label: "ورقة خطية", category: "fillers", d: "M8 56C18 24 53 7 87 6C72 36 41 52 8 56Z" },
  { id: "diamond-dot", label: "نقطة قلم", category: "fillers", d: dot },
  { id: "three-dots", label: "ثلاث نقاط خطية", category: "fillers", d: `${dot}${raised(dot, 28)}M63 29L77 37L69 52L55 43Z` },
  { id: "curl", label: "حلية ملتفة", category: "fillers", d: "M7 52C20 8 71 -2 82 23C95 55 47 70 36 46C29 30 48 20 60 30C46 23 40 38 48 44C67 57 88 28 69 19C45 6 20 30 7 52Z" },
];

export function createCalligraphicMark(id: string, x: number, y: number, size: number, color: string) {
  const mark = CALLIGRAPHIC_MARKS.find((item) => item.id === id);
  if (!mark || !Number.isFinite(size) || size <= 0) return null;
  const source = segsToContours(parsePath(mark.d));
  const b = contoursBounds(source);
  if (!b) return null;
  const k = size / Math.max(b.maxX - b.minX, b.maxY - b.minY, 1);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const contours = source.map((c) => ({ ...c, nodes: c.nodes.map((n) => ({ ...n,
    x: (n.x - cx) * k, y: (n.y - cy) * k,
    in: [n.in[0] * k, n.in[1] * k] as [number, number],
    out: [n.out[0] * k, n.out[1] * k] as [number, number],
  })) }));
  return createPathObject(contours, { name: mark.label, x, y, fill: color, stroke: "transparent", strokeWidth: 0, fillRule: "evenodd" });
}