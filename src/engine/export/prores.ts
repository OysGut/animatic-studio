/**
 * P7 (DEC-0085) + R4: Apple ProRes encoder in plain TypeScript – ProRes 422 Proxy ("apco"), 422 LT ("apcs"),
 * 422 ("apcn"), 422 HQ ("apch") and 4444 with 16-bit alpha ("ap4h"). Own implementation of the public bitstream
 * (SMPTE RDD 36), so the app carries no GPL/LGPL code and no WebAssembly download. Intra-only, progressive.
 * R4: rate control per slice towards Apple's target bitrate (a byte budget per frame from the caller); the
 * quantiser is chosen per slice (1–128) so the frame stays within budget. Without a budget a fixed quantiser.
 * Pure: no DOM; the caller supplies RGBA pixels (straight alpha, as a 2D canvas returns them).
 * Colour: Rec.709 matrix, limited range 10-bit, tagged primaries/transfer/matrix = 1 (BT.709).
 */

import { PRORES_FOURCC, type ProResKind } from "@/core/prores-export";

export type ProResProfile = ProResKind;
export { PRORES_FOURCC };

/** Fixed quantiser when no budget is given (1 = finest). */
const QSCALE: Record<ProResProfile, number> = { proxy: 8, lt: 6, "422": 5, hq: 4, "4444": 3 };
/** Slice quantiser byte 1–224; above 128 the decoder scales it as (q - 96) × 4 (RDD 36). */
const Q_MAX = 224;
const qScale = (q: number) => (q > 128 ? (q - 96) << 2 : q);
const MBS_PER_SLICE = 8;

const SCAN = [
  0, 1, 8, 9, 2, 3, 10, 11, 16, 17, 24, 25, 18, 19, 26, 27, 4, 5, 12, 20, 13, 6, 7, 14, 21, 28, 29, 22,
  15, 23, 30, 31, 32, 33, 40, 48, 41, 34, 35, 42, 49, 56, 57, 50, 43, 36, 37, 44, 51, 58, 59, 52, 45, 38,
  39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];
const DC_CB = [0x04, 0x28, 0x28, 0x4d, 0x4d, 0x70, 0x70];
const FIRST_DC_CB = 0xb8;
const RUN_CB = [0x06, 0x06, 0x05, 0x05, 0x04, 0x29, 0x29, 0x29, 0x29, 0x28, 0x28, 0x28, 0x28, 0x28, 0x28, 0x4c];
const LEV_CB = [0x04, 0x0a, 0x05, 0x06, 0x04, 0x28, 0x28, 0x28, 0x28, 0x4c];

class BitWriter {
  private buf: Uint8Array;
  private pos = 0;
  private acc = 0;
  private n = 0;
  constructor(size = 1 << 16) { this.buf = new Uint8Array(size); }
  private byte(b: number) {
    if (this.pos >= this.buf.length) { const nb = new Uint8Array(this.buf.length * 2); nb.set(this.buf); this.buf = nb; }
    this.buf[this.pos++] = b;
  }
  put(bits: number, value: number) {
    // Up to 31 bits per call; split longer writes.
    if (bits > 24) { this.put(bits - 16, Math.floor(value / 65536)); this.put(16, value & 0xffff); return; }
    for (let i = bits - 1; i >= 0; i--) {
      this.acc = (this.acc << 1) | ((value >>> i) & 1);
      if (++this.n === 8) { this.byte(this.acc); this.acc = 0; this.n = 0; }
    }
  }
  zeros(bits: number) { for (let i = 0; i < bits; i++) this.put(1, 0); }
  flush(): Uint8Array {
    if (this.n) { this.byte(this.acc << (8 - this.n)); this.acc = 0; this.n = 0; }
    return this.buf.subarray(0, this.pos);
  }
}

function putCodeword(w: BitWriter, codebook: number, val: number) {
  const switchBits = (codebook & 3) + 1, rice = codebook >> 5, exp = (codebook >> 2) & 7;
  const switchVal = switchBits << rice;
  if (val >= switchVal) {
    const v = val - (switchVal - (1 << exp));
    const e = 31 - Math.clz32(v);
    w.zeros(e - exp + switchBits);
    w.put(e + 1, v);
  } else {
    const e = val >> rice;
    w.zeros(e);
    w.put(1, 1);
    if (rice) w.put(rice, val & ((1 << rice) - 1));
  }
}

// Orthonormal 8-point DCT basis.
const COS = new Float64Array(64);
for (let u = 0; u < 8; u++)
  for (let x = 0; x < 8; x++)
    COS[u * 8 + x] = (u === 0 ? Math.SQRT1_2 : 1) * 0.5 * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
const tmp = new Float64Array(64);

/** Forward DCT of a block (values already centred), result scaled ×4 like ProRes expects (not quantised). */
function dct(src: Float64Array, out: Float64Array, at: number) {
  for (let y = 0; y < 8; y++)
    for (let u = 0; u < 8; u++) {
      let s = 0;
      for (let x = 0; x < 8; x++) s += src[y * 8 + x]! * COS[u * 8 + x]!;
      tmp[y * 8 + u] = s;
    }
  for (let v = 0; v < 8; v++)
    for (let u = 0; u < 8; u++) {
      let s = 0;
      for (let y = 0; y < 8; y++) s += tmp[y * 8 + u]! * COS[v * 8 + y]!;
      out[at + v * 8 + u] = s * 4;
    }
}

function encodeCoeffs(w: BitWriter, q: Int32Array, blocks: number) {
  // DC: first absolute, then sign-adaptive differences (mirrors the reference decoder).
  let prev = q[0]!;
  putCodeword(w, FIRST_DC_CB, prev >= 0 ? prev * 2 : -prev * 2 - 1);
  let cb = 5, sign = 0;
  for (let b = 1; b < blocks; b++) {
    const dc = q[b * 64]!, d = dc - prev;
    let code: number;
    if (d === 0) { code = 0; sign = 0; }
    else {
      const neg = d < 0 ? -1 : 0;
      code = neg === sign ? 2 * Math.abs(d) : 2 * Math.abs(d) - 1;
      sign = neg;
    }
    putCodeword(w, DC_CB[cb]!, code);
    cb = Math.min(code, 6);
    prev = dc;
  }
  // AC: interleaved across blocks in scan order, run/level with adaptive codebooks.
  let run = 0, prevRun = 4, prevLevel = 2;
  for (let i = 1; i < 64; i++) {
    const k = SCAN[i]!;
    for (let b = 0; b < blocks; b++) {
      const level = q[b * 64 + k]!;
      if (!level) { run++; continue; }
      const abs = Math.abs(level);
      putCodeword(w, RUN_CB[Math.min(prevRun, 15)]!, run);
      putCodeword(w, LEV_CB[Math.min(prevLevel, 9)]!, abs - 1);
      w.put(1, level < 0 ? 1 : 0);
      prevRun = run; prevLevel = abs; run = 0;
    }
  }
}

function putAlphaDiff(w: BitWriter, cur: number, prev: number) {
  const abits = 16, dsize = 1 << 6;
  let diff = (cur - prev) & 0xffff;
  if (diff >= (1 << abits) - dsize) diff -= 1 << abits;
  if (diff < -dsize || diff > dsize || !diff) { w.put(1, 1); w.put(abits, diff & 0xffff); }
  else { w.put(1, 0); w.put(6, Math.abs(diff) - 1); w.put(1, diff < 0 ? 1 : 0); }
}
function putAlphaRun(w: BitWriter, run: number) {
  if (run) { w.put(1, 0); if (run < 16) w.put(4, run); else w.put(15, run); }
  else w.put(1, 1);
}
function encodeAlpha(w: BitWriter, a: Uint16Array) {
  let prev = 0xffff, cur = a[0]!, run = 0;
  putAlphaDiff(w, cur, prev); prev = cur;
  for (let i = 1; i < a.length; i++) {
    cur = a[i]!;
    if (cur !== prev) { putAlphaRun(w, run); putAlphaDiff(w, cur, prev); prev = cur; run = 0; }
    else run++;
  }
  if (run) putAlphaRun(w, run);
}

function quant(src: Float64Array, step: number): Int32Array {
  const out = new Int32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = Math.round(src[i]! / step);
  return out;
}

export interface ProResFrameInput {
  readonly width: number;
  readonly height: number;
  /** RGBA, straight alpha, width*height*4 bytes. */
  readonly rgba: Uint8Array | Uint8ClampedArray;
  readonly profile: ProResProfile;
  /** R4: byte budget for the whole frame (Apple's target bitrate / fps). Without it a fixed quantiser. */
  readonly targetBytes?: number;
}

/** Rec.709 limited-range 10-bit planes, edge-replicated to whole macroblocks. */
function planes(i: ProResFrameInput, cw: number, ch: number, chromaW: number) {
  const { width, height, rgba } = i;
  const Y = new Float64Array(cw * ch), U = new Float64Array(chromaW * ch), V = new Float64Array(chromaW * ch);
  const A = i.profile === "4444" ? new Uint16Array(cw * ch) : null;
  const full = chromaW === cw;
  const cb = new Float64Array(cw), cr = new Float64Array(cw);
  for (let y = 0; y < ch; y++) {
    const sy = Math.min(y, height - 1);
    for (let x = 0; x < cw; x++) {
      const p = (sy * width + Math.min(x, width - 1)) * 4;
      const r = rgba[p]! / 255, g = rgba[p + 1]! / 255, b = rgba[p + 2]! / 255;
      const yl = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      Y[y * cw + x] = 64 + 876 * yl - 512;
      cb[x] = 896 * ((b - yl) / 1.8556);
      cr[x] = 896 * ((r - yl) / 1.5748);
      if (A) A[y * cw + x] = rgba[p + 3]! * 257;
    }
    if (full) { U.set(cb, y * cw); V.set(cr, y * cw); }
    else for (let x = 0; x < chromaW; x++) {
      U[y * chromaW + x] = (cb[2 * x]! + cb[2 * x + 1]!) / 2;
      V[y * chromaW + x] = (cr[2 * x]! + cr[2 * x + 1]!) / 2;
    }
  }
  return { Y, U, V, A };
}

/** One complete ProRes frame ("icpf" atom) as stored in a MOV sample. */
export function encodeProResFrame(i: ProResFrameInput): Uint8Array {
  const { width, height, profile } = i;
  if (!(width > 0 && height > 0 && width <= 8192 && height <= 8192 && i.rgba.length >= width * height * 4))
    throw new Error("Invalid ProRes frame size");
  const is444 = profile === "4444";
  const mbW = (width + 15) >> 4, mbH = (height + 15) >> 4;
  const cw = mbW * 16, ch = mbH * 16, chromaW = is444 ? cw : cw / 2;
  const { Y, U, V, A } = planes(i, cw, ch, chromaW);
  const fixedQ = QSCALE[profile];
  const slices: Uint8Array[] = [];
  const block = new Float64Array(64);
  const loadBlock = (P: Float64Array, pw: number, x0: number, y0: number) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) block[y * 8 + x] = P[(y0 + y) * pw + x0 + x]!;
  };
  const per = is444 ? 4 : 2, cmw = is444 ? 16 : 8;
  const hdr = is444 && A ? 8 : 6;
  const totalMbs = mbW * mbH;
  // R4: the budget left for slice data (frame and picture headers and the slice index come off first).
  const sliceCount = mbH * (mbW >> 3) + mbH * [4, 2, 1].filter((c) => mbW & c).length;
  let budget = i.targetBytes != null ? i.targetBytes - 8 - 20 - 8 - sliceCount * 2 : Infinity;
  let mbsLeft = totalMbs, prevQ = fixedQ;
  for (let my = 0; my < mbH; my++) {
    let mx = 0, remaining = mbW, count = MBS_PER_SLICE;
    while (remaining > 0) {
      while (remaining < count) count >>= 1;
      // DCT once; quantisation is repeated while searching for the quantiser.
      const ly = new Float64Array(count * 4 * 64);
      for (let m = 0; m < count; m++)
        for (let k = 0; k < 4; k++) {
          loadBlock(Y, cw, (mx + m) * 16 + (k & 1) * 8, my * 16 + (k >> 1) * 8);
          dct(block, ly, (m * 4 + k) * 64);
        }
      const chroma: Float64Array[] = [];
      for (const P of [U, V]) {
        const c = new Float64Array(count * per * 64);
        for (let m = 0; m < count; m++)
          for (let k = 0; k < per; k++) {
            loadBlock(P, chromaW, (mx + m) * cmw + (k >> 1) * 8, my * 16 + (k & 1) * 8);
            dct(block, c, (m * per + k) * 64);
          }
        chroma.push(c);
      }
      let alpha: Uint8Array | null = null;
      if (A) {
        const sw = count * 16, a = new Uint16Array(sw * 16);
        for (let y = 0; y < 16; y++) a.set(A.subarray((my * 16 + y) * cw + mx * 16, (my * 16 + y) * cw + mx * 16 + sw), y * sw);
        const w = new BitWriter(); encodeAlpha(w, a); alpha = w.flush().slice();
      }
      const encodeAt = (q: number): Uint8Array[] => {
        const step = 4 * qScale(q), parts: Uint8Array[] = [];
        let w = new BitWriter(); encodeCoeffs(w, quant(ly, step), count * 4); parts.push(w.flush().slice());
        for (const c of chroma) { w = new BitWriter(); encodeCoeffs(w, quant(c, step), count * per); parts.push(w.flush().slice()); }
        return parts;
      };
      // Alpha is lossless and outside the target (Apple's 4444 figures exclude alpha).
      const sizeOf = (parts: Uint8Array[]) => hdr + parts.reduce((n, p) => n + p.length, 0);
      let q = fixedQ, parts: Uint8Array[];
      if (Number.isFinite(budget)) {
        // Share of what is left of the frame budget, so savings in easy slices carry to busy ones.
        const target = Math.max(hdr + 16, (budget * count) / mbsLeft);
        q = prevQ; parts = encodeAt(q);
        if (sizeOf(parts) > target) {
          while (q < Q_MAX && sizeOf(parts) > target) { q = Math.min(Q_MAX, q + Math.max(1, q >> 2)); parts = encodeAt(q); }
        } else {
          for (let tries = 0; q > 1 && tries < 4; tries++) {
            const nq = Math.max(1, q - Math.max(1, q >> 2)), np = encodeAt(nq);
            if (sizeOf(np) > target) break;
            q = nq; parts = np;
          }
        }
        prevQ = q;
      } else parts = encodeAt(q);
      if (alpha) parts.push(alpha);
      const out = new Uint8Array(hdr + parts.reduce((n, p) => n + p.length, 0));
      out[0] = hdr << 3; out[1] = q;
      for (let k = 0; k < (hdr - 2) / 2; k++) { out[2 + k * 2] = parts[k]!.length >> 8; out[3 + k * 2] = parts[k]!.length & 0xff; }
      let at = hdr; for (const p of parts) { out.set(p, at); at += p.length; }
      if (out.length > 0xffff) throw new Error("ProRes slice too large");
      slices.push(out);
      budget -= out.length - (alpha?.length ?? 0); mbsLeft -= count;
      mx += count; remaining -= count;
    }
  }
  const frameHdr = 20, picHdr = 8;
  const picSize = picHdr + slices.length * 2 + slices.reduce((n, s) => n + s.length, 0);
  const total = 8 + frameHdr + picSize;
  const f = new Uint8Array(total), dv = new DataView(f.buffer);
  dv.setUint32(0, total); f.set([0x69, 0x63, 0x70, 0x66], 4); // "icpf"
  let o = 8;
  dv.setUint16(o, frameHdr); dv.setUint16(o + 2, is444 ? 1 : 0); f.set([0x61, 0x6e, 0x73, 0x74], o + 4); // vendor "anst"
  dv.setUint16(o + 8, width); dv.setUint16(o + 10, height);
  f[o + 12] = (is444 ? 3 : 2) << 6; f[o + 13] = 0;
  f[o + 14] = 1; f[o + 15] = 1; f[o + 16] = 1; // BT.709 primaries, transfer, matrix
  f[o + 17] = A ? 0x42 : 0x40; f[o + 18] = 0; f[o + 19] = 0; // 16-bit alpha; default (flat) quant matrices
  o += frameHdr;
  f[o] = picHdr << 3; dv.setUint32(o + 1, picSize); dv.setUint16(o + 5, slices.length); f[o + 7] = Math.log2(MBS_PER_SLICE) << 4;
  o += picHdr;
  for (const s of slices) { dv.setUint16(o, s.length); o += 2; }
  for (const s of slices) { f.set(s, o); o += s.length; }
  return f;
}
