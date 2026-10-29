/**
 * Minimal vector PDF 1.4 writer for a Scene. Everything is drawn as filled and
 * stroked paths (glyphs are already outlines), so Arabic shaping and diacritic
 * positions are exactly those of the glyph engine and no fonts are embedded.
 * Object opacity uses transparency groups so overlapping glyphs blend like SVG.
 */
import { fmt, type Mat, type Scene, type ScenePath } from "./scene";
import { pathToPdfOps } from "./svgpath";

export type PdfPage = "canvas" | "a4" | "a3" | "letter";
export type PdfBackground = "white" | "canvas" | "none";

export interface PdfOptions {
  page: PdfPage;
  background: PdfBackground;
  title: string;
  /** zlib compressor for content streams (optional). */
  deflate?: ((data: Uint8Array) => Promise<Uint8Array>) | undefined;
}

/** Paper sizes in PostScript points (portrait). */
export const PAPER: Record<Exclude<PdfPage, "canvas">, [number, number]> = {
  a4: [595.28, 841.89],
  a3: [841.89, 1190.55],
  letter: [612, 792],
};

/** CSS px → pt at 96 dpi. */
export const PX_TO_PT = 0.75;

export function pageLayout(width: number, height: number, page: PdfPage) {
  if (page === "canvas") return { pw: width * PX_TO_PT, ph: height * PX_TO_PT, s: PX_TO_PT, ox: 0, oy: 0 };
  let [pw, ph] = PAPER[page];
  if (width > height) [pw, ph] = [ph, pw];
  const s = Math.min(pw / width, ph / height);
  return { pw, ph, s, ox: (pw - width * s) / 2, oy: (ph - height * s) / 2 };
}

export function parseColor(c: string | null): [number, number, number] | null {
  if (!c || c === "transparent" || c === "none") return null;
  let h = c.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3,4}$/i.test(h)) h = [...h].map((x) => x + x).join("");
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) return [0, 0, 0];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const rgb = (c: [number, number, number]) => c.map((v) => fmt(v)).join(" ");
const cm = (m: Mat) => `${m.map(fmt).join(" ")} cm`;

const CAP = { butt: 0, round: 1, square: 2 } as const;
const JOIN = { miter: 0, round: 1, bevel: 2 } as const;

export function pathOps(p: ScenePath): string {
  const fill = parseColor(p.fill);
  const stroke = p.stroke && p.strokeWidth > 0 ? parseColor(p.stroke) : null;
  if (!fill && !stroke) return "";
  const parts = ["q", cm(p.m)];
  if (fill) parts.push(`${rgb(fill)} rg`);
  if (stroke) parts.push(`${rgb(stroke)} RG ${fmt(p.strokeWidth)} w ${JOIN[p.lineJoin ?? "round"]} j ${CAP[p.lineCap ?? "butt"]} J 4 M`);
  parts.push(pathToPdfOps(p.d));
  const eo = p.fillRule === "evenodd" ? "*" : "";
  parts.push(fill && stroke ? `B${eo}` : fill ? `f${eo}` : "S");
  parts.push("Q");
  return parts.join("\n");
}

const enc = new TextEncoder();

function pdfString(s: string): string {
  // UTF-16BE hex string keeps the file ASCII-only and supports Arabic titles.
  let hex = "FEFF";
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  return `<${hex}>`;
}

export async function sceneToPdf(scene: Scene, opts: PdfOptions): Promise<Uint8Array> {
  const { pw, ph, s, ox, oy } = pageLayout(scene.width, scene.height, opts.page);
  const W = scene.width;
  const H = scene.height;
  const objects: (Uint8Array | string)[] = []; // index i → object number i+1
  const add = (o: Uint8Array | string) => objects.push(o);
  const stream = async (dict: string, body: string) => {
    let data = enc.encode(body);
    let filter = "";
    if (opts.deflate) {
      data = new Uint8Array(await opts.deflate(data));
      filter = " /Filter /FlateDecode";
    }
    const head = enc.encode(`<< ${dict}${filter} /Length ${data.byteLength} >>\nstream\n`);
    const tail = enc.encode("\nendstream");
    const out = new Uint8Array(head.byteLength + data.byteLength + tail.byteLength);
    out.set(head, 0);
    out.set(data, head.byteLength);
    out.set(tail, head.byteLength + data.byteLength);
    return out;
  };

  // Reserve 1: catalog, 2: pages, 3: page, 4: contents, 5: info
  for (let i = 0; i < 5; i++) add("");
  const gs: string[] = [];
  const xo: string[] = [];
  const body: string[] = ["q", `${fmt(s)} 0 0 ${fmt(-s)} ${fmt(ox)} ${fmt(oy + H * s)} cm`, `0 0 ${fmt(W)} ${fmt(H)} re W n`];
  const bg = opts.background === "white" ? "#ffffff" : opts.background === "canvas" ? scene.background : null;
  const bgc = parseColor(bg);
  if (bgc) body.push(`${rgb(bgc)} rg 0 0 ${fmt(W)} ${fmt(H)} re f`);

  for (const o of scene.objects) {
    const ops = ["q", cm(o.m), ...o.paths.map(pathOps).filter(Boolean), "Q"].join("\n");
    if (o.opacity >= 1) body.push(ops);
    else if (o.opacity > 0) {
      const g = add(`<< /Type /ExtGState /ca ${fmt(o.opacity)} /CA ${fmt(o.opacity)} >>`);
      const x = add(await stream(`/Type /XObject /Subtype /Form /BBox [0 0 ${fmt(W)} ${fmt(H)}] /Group << /S /Transparency /CS /DeviceRGB >> /Resources << >>`, ops));
      gs.push(`/GS${g} ${g} 0 R`);
      xo.push(`/X${x} ${x} 0 R`);
      body.push(`q /GS${g} gs /X${x} Do Q`);
    }
  }
  body.push("Q");

  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const date = `D:${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objects[2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(pw)} ${fmt(ph)}] /Contents 4 0 R /Resources << /ExtGState << ${gs.join(" ")} >> /XObject << ${xo.join(" ")} >> >> /Group << /S /Transparency /CS /DeviceRGB >> >>`;
  objects[3] = await stream("", body.join("\n"));
  objects[4] = `<< /Title ${pdfString(opts.title)} /Producer ${pdfString("Arabic Calligraphy Studio")} /CreationDate (${date}) >>`;

  const chunks: Uint8Array[] = [new Uint8Array([...enc.encode("%PDF-1.4\n%"), 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])];
  let offset = chunks[0]!.byteLength;
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(offset);
    const head = enc.encode(`${i + 1} 0 obj\n`);
    const content = typeof o === "string" ? enc.encode(o) : o;
    const tail = enc.encode("\nendobj\n");
    chunks.push(head, content, tail);
    offset += head.byteLength + content.byteLength + tail.byteLength;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)].join("");
  chunks.push(enc.encode(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${offset}\n%%EOF\n`));
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.byteLength;
  }
  return out;
}
