/** WOFF 1.0 → SFNT (TTF/OTF) conversion so uploaded .woff fonts can be shaped. */

export type Inflate = (data: Uint8Array) => Promise<Uint8Array>;

/** zlib inflate using the browser's DecompressionStream. */
export const browserInflate: Inflate = async (data) => {
  const ds = new DecompressionStream("deflate");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

export async function woffToSfnt(buf: ArrayBuffer, inflate: Inflate = browserInflate): Promise<ArrayBuffer> {
  const v = new DataView(buf);
  if (v.getUint32(0) !== 0x774f4646) throw new Error("Not a WOFF file.");
  const flavor = v.getUint32(4);
  const numTables = v.getUint16(12);
  const tables: { tag: number; data: Uint8Array; checksum: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const e = 44 + i * 20;
    const tag = v.getUint32(e);
    const offset = v.getUint32(e + 4);
    const compLength = v.getUint32(e + 8);
    const origLength = v.getUint32(e + 12);
    const checksum = v.getUint32(e + 16);
    const raw = new Uint8Array(buf, offset, compLength);
    const data = compLength < origLength ? await inflate(raw) : raw.slice();
    if (data.byteLength !== origLength) throw new Error("WOFF table has an unexpected size.");
    tables.push({ tag, data, checksum });
  }
  tables.sort((a, b) => a.tag - b.tag);
  const pad4 = (n: number) => (n + 3) & ~3;
  const headerSize = 12 + 16 * numTables;
  const total = tables.reduce((s, t) => s + pad4(t.data.byteLength), headerSize);
  const out = new ArrayBuffer(total);
  const ov = new DataView(out);
  const bytes = new Uint8Array(out);
  let es = 0;
  while (1 << (es + 1) <= numTables) es++;
  ov.setUint32(0, flavor);
  ov.setUint16(4, numTables);
  ov.setUint16(6, (1 << es) * 16);
  ov.setUint16(8, es);
  ov.setUint16(10, numTables * 16 - (1 << es) * 16);
  let off = headerSize;
  tables.forEach((t, i) => {
    const d = 12 + i * 16;
    ov.setUint32(d, t.tag);
    ov.setUint32(d + 4, t.checksum);
    ov.setUint32(d + 8, off);
    ov.setUint32(d + 12, t.data.byteLength);
    bytes.set(t.data, off);
    off += pad4(t.data.byteLength);
  });
  return out;
}
