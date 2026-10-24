/** C-1: pure PNG encoder (RGBA 8-bit, stored deflate) with a tEXt hand-off marker, plus a tEXt reader. */
import { ByteReader, ByteWriter, adler32, crc32 } from "./bytes";

function chunk(w: ByteWriter, type: string, data: Uint8Array) {
  const t = new ByteWriter().ascii(type).bytes(data).done();
  w.u32be(data.length).bytes(t).u32be(crc32(t));
}
function zlibStored(raw: Uint8Array): Uint8Array {
  const w = new ByteWriter(); w.u8(0x78).u8(0x01);
  for (let i = 0; i < raw.length || i === 0; i += 65535) {
    const part = raw.subarray(i, Math.min(raw.length, i + 65535));
    const last = i + 65535 >= raw.length;
    w.u8(last ? 1 : 0).u16le(part.length).u16le(~part.length & 0xffff).bytes(part);
    if (last) break;
  }
  return w.u32be(adler32(raw)).done();
}

/** Filter-0 scanlines (the bytes a zlib compressor gets for IDAT). */
export function pngRaw(width: number, height: number, rgba: Uint8Array): Uint8Array {
  if (rgba.length !== width * height * 4) throw new Error("png size");
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  return raw;
}

export function encodePng(width: number, height: number, rgba: Uint8Array, text: Record<string, string> = {}): Uint8Array {
  return encodePngWith(width, height, rgba, text, zlibStored);
}

/** Same as encodePng, but IDAT comes from an injected zlib compressor (for example CompressionStream in an adapter). */
export function encodePngWith(width: number, height: number, rgba: Uint8Array, text: Record<string, string>, zlib: (raw: Uint8Array) => Uint8Array): Uint8Array {
  if (rgba.length !== width * height * 4) throw new Error("png size");
  const w = new ByteWriter();
  w.bytes(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  chunk(w, "IHDR", new ByteWriter().u32be(width).u32be(height).u8(8).u8(6).u8(0).u8(0).u8(0).done());
  for (const [k, v] of Object.entries(text)) chunk(w, "tEXt", new ByteWriter().ascii(k.slice(0, 79)).u8(0).ascii(v).done());
  chunk(w, "IDAT", zlib(pngRaw(width, height, rgba)));
  chunk(w, "IEND", new Uint8Array(0));
  return w.done();
}

export function readPngText(bytes: Uint8Array): Record<string, string> {
  const r = new ByteReader(bytes); const out: Record<string, string> = {};
  r.skip(8);
  while (r.pos + 12 <= bytes.length) {
    const len = r.u32be(), type = r.ascii(4); const data = r.bytes(len); r.skip(4);
    if (type === "tEXt") { const z = data.indexOf(0); if (z > 0) out[String.fromCharCode(...data.subarray(0, z))] = String.fromCharCode(...data.subarray(z + 1)); }
    if (type === "IEND") break;
  }
  return out;
}
