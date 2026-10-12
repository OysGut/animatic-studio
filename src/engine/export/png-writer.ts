/**
 * PNG-skriver som tar bildet stripe for stripe (DEC-0074, KI-131). Hele bildet ligger aldri som rå piksler
 * i minnet: hver stripe filtreres og sendes rett inn i nettleserens CompressionStream("deflate") (zlib-format,
 * slik PNG krever), og bare de komprimerte bytene samles opp som IDAT-biter. Fargetype 6 (RGBA, 8 bit),
 * uten interlacing. Filteret velges per rad (None/Sub/Up) med den vanlige «minste sum av avvik»-regelen.
 */

export interface PngOptions {
  readonly width: number;
  readonly height: number;
  /** Oppløsning som lagres i pHYs-biten (piksler per tomme), så trykkprogrammer viser riktig mål. */
  readonly ppi?: number;
  /** Antall rader per stripe (standard: ca. 4 Mpx per stripe). */
  readonly stripRows?: number;
  /** Kalles etter hver stripe med andelen som er ferdig (0–1). */
  readonly onProgress?: (done: number) => void;
}

/** Leser en stripe: RGBA (ikke forhåndsmultiplisert), `rows` × bredde × 4 byte, fra rad `y0`. */
export type ReadStrip = (
  y0: number,
  rows: number,
) => Promise<ArrayLike<number> & { length: number }>;

const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
/** Mål for størrelsen på hver IDAT-bit (komprimerte byte). */
const IDAT_TARGET = 1 << 20;
/** Største bredde vi tillater (nettlesernes lerreter tåler ikke bredere striper). */
export const PNG_MAX_WIDTH = 16_384;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 slik PNG bruker den. `crc` lar oss fortsette over flere deler. */
export function crc32(bytes: Uint8Array, crc = 0): number {
  let c = (crc ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Én PNG-bit: lengde, type, data, CRC (over type og data). */
export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function header(width: number, height: number): Uint8Array {
  const d = new Uint8Array(13);
  const v = new DataView(d.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  d[8] = 8; // bitdybde
  d[9] = 6; // RGBA
  d[10] = 0; // deflate
  d[11] = 0; // standard filtermetode
  d[12] = 0; // ingen interlacing
  return d;
}

function physical(ppi: number): Uint8Array {
  const d = new Uint8Array(9);
  const v = new DataView(d.buffer);
  const ppm = Math.round(ppi / 0.0254);
  v.setUint32(0, ppm);
  v.setUint32(4, ppm);
  d[8] = 1; // meter
  return d;
}

/**
 * Filtrerer én rad inn i `out` (filterbyte + rad). `prev` er raden over (nuller for første rad).
 * Velger None, Sub eller Up etter minste sum av avvik.
 */
function filterRow(
  src: ArrayLike<number>,
  start: number,
  prev: Uint8Array,
  out: Uint8Array,
  at: number,
): void {
  const n = prev.length;
  let sNone = 0;
  let sSub = 0;
  let sUp = 0;
  for (let i = 0; i < n; i++) {
    const x = src[start + i]!;
    const a = i >= 4 ? src[start + i - 4]! : 0;
    const sub = (x - a) & 0xff;
    const up = (x - prev[i]!) & 0xff;
    sNone += x < 128 ? x : 256 - x;
    sSub += sub < 128 ? sub : 256 - sub;
    sUp += up < 128 ? up : 256 - up;
  }
  const filter = sSub < sNone && sSub <= sUp ? 1 : sUp < sNone ? 2 : 0;
  out[at] = filter;
  const o = at + 1;
  if (filter === 0) {
    for (let i = 0; i < n; i++) out[o + i] = src[start + i]!;
  } else if (filter === 1) {
    for (let i = 0; i < n; i++) out[o + i] = src[start + i]! - (i >= 4 ? src[start + i - 4]! : 0);
  } else {
    for (let i = 0; i < n; i++) out[o + i] = src[start + i]! - prev[i]!;
  }
  for (let i = 0; i < n; i++) prev[i] = src[start + i]!;
}

function concat(parts: readonly Uint8Array[], length: number): Uint8Array {
  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/**
 * Lager PNG-filen som en liste med deler (kan gis rett til `new Blob(...)`). `readStrip` kalles i rekkefølge
 * ovenfra og ned; bare én stripe av rå piksler finnes om gangen.
 */
export async function encodePngStrips(
  opts: PngOptions,
  readStrip: ReadStrip,
): Promise<Uint8Array[]> {
  const { width, height } = opts;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("Bildet må ha minst én piksel i hver retning.");
  }
  if (width > PNG_MAX_WIDTH) throw new Error("Bildet er for bredt for nettleseren.");
  const rowBytes = width * 4;
  const stripRows = Math.max(1, Math.min(height, opts.stripRows ?? Math.floor(4_000_000 / width)));

  const out: Uint8Array[] = [SIGNATURE, pngChunk("IHDR", header(width, height))];
  if (opts.ppi && opts.ppi > 0) out.push(pngChunk("pHYs", physical(opts.ppi)));

  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  let pending: Uint8Array[] = [];
  let pendingLen = 0;
  const flush = () => {
    if (!pendingLen) return;
    const all = concat(pending, pendingLen);
    // Komprimeringen kan levere mye på én gang; del opp så ingen bit blir uhåndterlig stor
    for (let at = 0; at < all.length; at += IDAT_TARGET) {
      out.push(pngChunk("IDAT", all.subarray(at, at + IDAT_TARGET)));
    }
    pending = [];
    pendingLen = 0;
  };
  // Leseren må gå samtidig med skrivingen, ellers stopper strømmen når bufferen er full
  const reading = (async () => {
    const reader = cs.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending.push(value);
      pendingLen += value.length;
      if (pendingLen >= IDAT_TARGET) flush();
    }
    flush();
  })();
  // Unngå «ubehandlet avvisning» hvis vi avbryter før vi venter på leseren
  reading.catch(() => undefined);

  const prev = new Uint8Array(rowBytes);
  try {
    for (let y0 = 0; y0 < height; y0 += stripRows) {
      const rows = Math.min(stripRows, height - y0);
      const px = await readStrip(y0, rows);
      if (px.length < rows * rowBytes) throw new Error("Stripen har for få piksler.");
      const filtered = new Uint8Array(rows * (rowBytes + 1));
      for (let r = 0; r < rows; r++)
        filterRow(px, r * rowBytes, prev, filtered, r * (rowBytes + 1));
      await writer.write(filtered);
      opts.onProgress?.((y0 + rows) / height);
    }
    await writer.close();
  } catch (e) {
    await writer.abort(e).catch(() => undefined);
    throw e;
  }
  await reading;
  out.push(pngChunk("IEND", new Uint8Array(0)));
  return out;
}
