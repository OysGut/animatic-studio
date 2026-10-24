/**
 * C-1: pure PSD (Photoshop 8-bit RGB) writer and reader. Writes named layers with visibility, opacity and
 * alpha (Unicode names via «luni»), a flattened composite and an XMP block carrying the hand-off marker.
 * The reader understands raw and PackBits (RLE) channels, which Photoshop, Procreate and Krita write.
 */
import { ByteReader, ByteWriter, fromUtf8, utf8 } from "./bytes";

export interface PsdLayer {
  readonly name: string;
  readonly visible: boolean;
  /** 0–1 */
  readonly opacity: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** RGBA, width × height × 4 (straight alpha). */
  readonly rgba: Uint8Array;
}
export interface PsdDocument {
  readonly width: number;
  readonly height: number;
  /** Bottom first, as in Photoshop. */
  readonly layers: readonly PsdLayer[];
  /** XMP packet text (hand-off marker lives here), if any. */
  readonly xmp?: string;
  /** Flattened RGBA; computed from visible layers when omitted. */
  readonly composite?: Uint8Array;
}

export const PSD_MAX_SIDE = 30000;

/** Straight-alpha "over" of visible layers with their opacity. */
export function flattenLayers(width: number, height: number, layers: readonly PsdLayer[]): Uint8Array {
  const out = new Float32Array(width * height * 4);
  for (const l of layers) {
    if (!l.visible || l.opacity <= 0) continue;
    for (let y = 0; y < l.height; y++) {
      const dy = l.top + y; if (dy < 0 || dy >= height) continue;
      for (let x = 0; x < l.width; x++) {
        const dx = l.left + x; if (dx < 0 || dx >= width) continue;
        const si = (y * l.width + x) * 4, di = (dy * width + dx) * 4;
        const a = (l.rgba[si + 3]! / 255) * l.opacity; if (a <= 0) continue;
        const da = out[di + 3]!, oa = a + da * (1 - a);
        for (let c = 0; c < 3; c++) out[di + c] = (l.rgba[si + c]! * a + out[di + c]! * da * (1 - a)) / oa;
        out[di + 3] = oa;
      }
    }
  }
  const b = new Uint8Array(width * height * 4);
  for (let i = 0; i < b.length; i += 4) { b[i] = Math.round(out[i]!); b[i + 1] = Math.round(out[i + 1]!); b[i + 2] = Math.round(out[i + 2]!); b[i + 3] = Math.round(out[i + 3]! * 255); }
  return b;
}

function plane(rgba: Uint8Array, channel: number, n: number): Uint8Array {
  const p = new Uint8Array(n);
  for (let i = 0; i < n; i++) p[i] = rgba[i * 4 + channel]!;
  return p;
}
function pascalPadded(name: string, multiple: number): Uint8Array {
  const raw = Array.from(name).map((c) => { const code = c.charCodeAt(0); return code < 128 ? code : 63; }).slice(0, 255);
  const total = Math.ceil((raw.length + 1) / multiple) * multiple;
  const b = new Uint8Array(total); b[0] = raw.length; b.set(raw, 1);
  return b;
}

export function writePsd(doc: PsdDocument): Uint8Array {
  const { width: W, height: H } = doc;
  if (!(W >= 1 && H >= 1 && W <= PSD_MAX_SIDE && H <= PSD_MAX_SIDE)) throw new Error("psd size");
  for (const l of doc.layers) if (l.rgba.length !== l.width * l.height * 4) throw new Error("psd layer size");
  const w = new ByteWriter();
  w.ascii("8BPS").u16be(1).zeros(6).u16be(4).u32be(H).u32be(W).u16be(8).u16be(3);
  w.u32be(0); // color mode data
  // Image resources: XMP (1060)
  const res = new ByteWriter();
  if (doc.xmp) {
    const x = utf8(doc.xmp);
    res.ascii("8BIM").u16be(1060).u16be(0).u32be(x.length).bytes(x);
    if (x.length % 2) res.u8(0);
  }
  const r = res.done(); w.u32be(r.length).bytes(r);
  // Layer and mask information
  const lm = new ByteWriter();
  const li = new ByteWriter();
  li.i16be(doc.layers.length);
  const channelData: Uint8Array[][] = [];
  for (const l of doc.layers) {
    const n = l.width * l.height;
    const chans = [plane(l.rgba, 3, n), plane(l.rgba, 0, n), plane(l.rgba, 1, n), plane(l.rgba, 2, n)];
    channelData.push(chans);
    li.i32be(l.top).i32be(l.left).i32be(l.top + l.height).i32be(l.left + l.width).u16be(4);
    [-1, 0, 1, 2].forEach((id, i) => li.i16be(id).u32be(chans[i]!.length + 2));
    li.ascii("8BIMnorm").u8(Math.round(Math.max(0, Math.min(1, l.opacity)) * 255)).u8(0).u8(l.visible ? 0 : 2).u8(0);
    const extra = new ByteWriter();
    extra.u32be(0).u32be(0).bytes(pascalPadded(l.name, 4));
    const units = Array.from(l.name).flatMap((c) => { const cp = c.codePointAt(0)!; return cp > 0xffff ? [0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff)] : [cp]; }).slice(0, 1000);
    const luni = new ByteWriter(); luni.u32be(units.length); for (const u of units) luni.u16be(u);
    if (luni.length % 4) luni.zeros(4 - (luni.length % 4));
    const lu = luni.done();
    extra.ascii("8BIMluni").u32be(lu.length).bytes(lu);
    const e = extra.done(); li.u32be(e.length).bytes(e);
  }
  for (const chans of channelData) for (const c of chans) li.u16be(0).bytes(c);
  if (li.length % 2) li.u8(0);
  const liBytes = li.done();
  lm.u32be(liBytes.length).bytes(liBytes).u32be(0);
  const lmBytes = lm.done(); w.u32be(lmBytes.length).bytes(lmBytes);
  // Composite image data (raw, planar R, G, B, A)
  const comp = doc.composite ?? flattenLayers(W, H, doc.layers);
  w.u16be(0);
  for (const c of [0, 1, 2, 3]) w.bytes(plane(comp, c, W * H));
  return w.done();
}

function unpackBits(src: Uint8Array, outLen: number): Uint8Array {
  const out = new Uint8Array(outLen); let i = 0, o = 0;
  while (i < src.length && o < outLen) {
    const n = (src[i++]! << 24) >> 24;
    if (n >= 0) { for (let k = 0; k <= n && o < outLen; k++) out[o++] = src[i++]!; }
    else if (n !== -128) { const v = src[i++]!; for (let k = 0; k < 1 - n && o < outLen; k++) out[o++] = v; }
  }
  return out;
}
function readChannel(r: ByteReader, len: number, w: number, h: number): Uint8Array {
  const end = r.pos + len;
  const comp = r.u16be(); const n = w * h;
  let out: Uint8Array;
  if (n === 0) out = new Uint8Array(0);
  else if (comp === 0) out = r.bytes(n).slice();
  else if (comp === 1) {
    const counts: number[] = []; for (let y = 0; y < h; y++) counts.push(r.u16be());
    out = new Uint8Array(n);
    for (let y = 0; y < h; y++) out.set(unpackBits(r.bytes(counts[y]!), w), y * w);
  } else throw new Error("psd compression");
  r.pos = end;
  return out;
}

export function readPsd(bytes: Uint8Array): PsdDocument {
  const r = new ByteReader(bytes);
  if (r.ascii(4) !== "8BPS" || r.u16be() !== 1) throw new Error("not psd");
  r.skip(6);
  const channels = r.u16be(), H = r.u32be(), W = r.u32be(), depth = r.u16be(), mode = r.u16be();
  if (depth !== 8 || mode !== 3) throw new Error("psd unsupported");
  if (W > PSD_MAX_SIDE || H > PSD_MAX_SIDE) throw new Error("psd size");
  r.skip(r.u32be());
  const resEnd = r.u32be() + r.pos;
  let xmp: string | undefined;
  while (r.pos + 12 <= resEnd) {
    if (r.ascii(4) !== "8BIM") break;
    const id = r.u16be(); const nl = r.u8(); r.skip(nl + ((nl + 1) % 2));
    const size = r.u32be(); const data = r.bytes(size); if (size % 2) r.skip(1);
    if (id === 1060) xmp = fromUtf8(data);
  }
  r.pos = resEnd;
  const lmLen = r.u32be(), lmEnd = r.pos + lmLen;
  const layers: PsdLayer[] = [];
  if (lmLen > 0) {
    const liLen = r.u32be(), liEnd = r.pos + liLen;
    if (liLen > 0) {
      const count = Math.abs(r.i16be());
      const recs: { top: number; left: number; w: number; h: number; ch: { id: number; len: number }[]; opacity: number; visible: boolean; name: string }[] = [];
      for (let i = 0; i < count; i++) {
        const top = r.i32be(), left = r.i32be(), bottom = r.i32be(), right = r.i32be();
        const nc = r.u16be(); const ch: { id: number; len: number }[] = [];
        for (let c = 0; c < nc; c++) ch.push({ id: r.i16be(), len: r.u32be() });
        r.skip(8); const opacity = r.u8(); r.skip(1); const flags = r.u8(); r.skip(1);
        const extraEnd = r.u32be() + r.pos;
        r.skip(r.u32be()); r.skip(r.u32be());
        const nl = r.u8(); let name = r.ascii(nl); r.skip((4 - ((nl + 1) % 4)) % 4);
        while (r.pos + 12 <= extraEnd) {
          const sig = r.ascii(4); const key = r.ascii(4); const len = r.u32be(); const start = r.pos;
          if ((sig === "8BIM" || sig === "8B64") && key === "luni") {
            const n = r.u32be(); const u: number[] = []; for (let k = 0; k < n; k++) u.push(r.u16be());
            name = String.fromCharCode(...u);
          }
          r.pos = start + len;
        }
        r.pos = extraEnd;
        recs.push({ top, left, w: Math.max(0, right - left), h: Math.max(0, bottom - top), ch, opacity: opacity / 255, visible: (flags & 2) === 0, name });
      }
      for (const rec of recs) {
        const rgba = new Uint8Array(rec.w * rec.h * 4).fill(255);
        for (const c of rec.ch) {
          const data = readChannel(r, c.len, rec.w, rec.h);
          const idx = c.id === -1 ? 3 : c.id >= 0 && c.id <= 2 ? c.id : -1;
          if (idx < 0) continue;
          for (let i = 0; i < data.length; i++) rgba[i * 4 + idx] = data[i]!;
        }
        layers.push({ name: rec.name, visible: rec.visible, opacity: rec.opacity, left: rec.left, top: rec.top, width: rec.w, height: rec.h, rgba });
      }
    }
    r.pos = liEnd;
  }
  r.pos = lmEnd;
  // Composite
  let composite: Uint8Array | undefined;
  try {
    const comp = r.u16be(); const n = W * H;
    composite = new Uint8Array(n * 4).fill(255);
    const planes: Uint8Array[] = [];
    if (comp === 0) for (let c = 0; c < channels; c++) planes.push(r.bytes(n));
    else if (comp === 1) {
      const counts: number[] = []; for (let k = 0; k < channels * H; k++) counts.push(r.u16be());
      for (let c = 0; c < channels; c++) { const p = new Uint8Array(n); for (let y = 0; y < H; y++) p.set(unpackBits(r.bytes(counts[c * H + y]!), W), y * W); planes.push(p); }
    }
    planes.slice(0, 4).forEach((p, c) => { for (let i = 0; i < n; i++) composite![i * 4 + c] = p[i]!; });
  } catch { composite = undefined; }
  return { width: W, height: H, layers, ...(xmp ? { xmp } : {}), ...(composite ? { composite } : {}) };
}
