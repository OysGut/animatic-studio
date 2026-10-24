/** C-1: small pure byte helpers (big/little endian writers, CRC-32, Adler-32, stored ZIP). No DOM or Node APIs. */

export class ByteWriter {
  private buf = new Uint8Array(1024);
  private n = 0;
  private ensure(k: number) {
    if (this.n + k <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.n + k) size *= 2;
    const next = new Uint8Array(size); next.set(this.buf.subarray(0, this.n)); this.buf = next;
  }
  get length(): number { return this.n; }
  u8(v: number) { this.ensure(1); this.buf[this.n++] = v & 0xff; return this; }
  u16be(v: number) { return this.u8(v >>> 8).u8(v); }
  i16be(v: number) { return this.u16be(v < 0 ? v + 0x10000 : v); }
  u32be(v: number) { return this.u16be((v >>> 16) & 0xffff).u16be(v & 0xffff); }
  i32be(v: number) { return this.u32be(v >>> 0); }
  u16le(v: number) { return this.u8(v).u8(v >>> 8); }
  u32le(v: number) { return this.u16le(v & 0xffff).u16le((v >>> 16) & 0xffff); }
  bytes(b: Uint8Array) { this.ensure(b.length); this.buf.set(b, this.n); this.n += b.length; return this; }
  ascii(s: string) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i) & 0x7f); return this; }
  zeros(k: number) { this.ensure(k); this.n += k; return this; }
  /** Overwrite 4 bytes at an earlier offset (for lengths known only afterwards). */
  patchU32be(at: number, v: number) { this.buf[at] = v >>> 24; this.buf[at + 1] = v >>> 16; this.buf[at + 2] = v >>> 8; this.buf[at + 3] = v; }
  patchU32le(at: number, v: number) { this.buf[at] = v; this.buf[at + 1] = v >>> 8; this.buf[at + 2] = v >>> 16; this.buf[at + 3] = v >>> 24; }
  done(): Uint8Array { return this.buf.slice(0, this.n); }
}

export class ByteReader {
  pos = 0;
  constructor(readonly b: Uint8Array) {}
  need(k: number) { if (this.pos + k > this.b.length) throw new Error("truncated"); }
  u8() { this.need(1); return this.b[this.pos++]!; }
  u16be() { return (this.u8() << 8) | this.u8(); }
  i16be() { const v = this.u16be(); return v >= 0x8000 ? v - 0x10000 : v; }
  u32be() { return ((this.u16be() << 16) >>> 0) + this.u16be(); }
  i32be() { return this.u32be() | 0; }
  u16le() { return this.u8() | (this.u8() << 8); }
  u32le() { return (this.u16le() + this.u16le() * 0x10000) >>> 0; }
  bytes(k: number) { this.need(k); const out = this.b.subarray(this.pos, this.pos + k); this.pos += k; return out; }
  ascii(k: number) { return String.fromCharCode(...this.bytes(k)); }
  skip(k: number) { this.need(k); this.pos += k; }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(b: Uint8Array, start = 0xffffffff): number {
  let c = start;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function adler32(b: Uint8Array): number {
  let a = 1, s = 0;
  for (let i = 0; i < b.length; i++) { a = (a + b[i]!) % 65521; s = (s + a) % 65521; }
  return ((s << 16) | a) >>> 0;
}
export const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
export const fromUtf8 = (b: Uint8Array): string => new TextDecoder().decode(b);

/** Minimal stored (uncompressed) ZIP for the hand-off package: the file plus manifest.json and a README. */
export function storedZip(files: readonly { path: string; data: Uint8Array }[]): Uint8Array {
  const w = new ByteWriter();
  const central: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];
  for (const f of files) {
    const name = utf8(f.path), crc = crc32(f.data), offset = w.length;
    w.u32le(0x04034b50).u16le(20).u16le(0x0800).u16le(0).u16le(0).u16le(0).u32le(crc).u32le(f.data.length).u32le(f.data.length).u16le(name.length).u16le(0).bytes(name).bytes(f.data);
    central.push({ name, crc, size: f.data.length, offset });
  }
  const cdStart = w.length;
  for (const c of central) w.u32le(0x02014b50).u16le(20).u16le(20).u16le(0x0800).u16le(0).u16le(0).u16le(0).u32le(c.crc).u32le(c.size).u32le(c.size).u16le(c.name.length).u16le(0).u16le(0).u16le(0).u16le(0).u32le(0).u32le(c.offset).bytes(c.name);
  const cdSize = w.length - cdStart;
  w.u32le(0x06054b50).u16le(0).u16le(0).u16le(central.length).u16le(central.length).u32le(cdSize).u32le(cdStart).u16le(0);
  return w.done();
}
