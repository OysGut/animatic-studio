/**
 * C-0: SHA-256 i ren TypeScript (FIPS 180-4), inkrementell, så kontrollsum, PKCE (S256) og tokenhash
 * beregnes likt i nettleser, server, plugins og tester uten plattform-API (ADR-0003).
 */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export class Sha256 {
  private h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  private buf = new Uint8Array(64);
  private len = 0;
  private total = 0;
  private w = new Uint32Array(64);

  update(data: Uint8Array): this {
    let i = 0;
    this.total += data.length;
    if (this.len > 0) {
      while (this.len < 64 && i < data.length) this.buf[this.len++] = data[i++]!;
      if (this.len === 64) { this.block(this.buf, 0); this.len = 0; }
    }
    while (i + 64 <= data.length) { this.block(data, i); i += 64; }
    while (i < data.length) this.buf[this.len++] = data[i++]!;
    return this;
  }

  digest(): Uint8Array {
    const bits = this.total * 8;
    const pad = new Uint8Array(((this.len < 56 ? 56 : 120) - this.len) + 8);
    pad[0] = 0x80;
    const hi = Math.floor(bits / 0x100000000), lo = bits >>> 0;
    const n = pad.length;
    pad[n - 8] = hi >>> 24; pad[n - 7] = hi >>> 16; pad[n - 6] = hi >>> 8; pad[n - 5] = hi;
    pad[n - 4] = lo >>> 24; pad[n - 3] = lo >>> 16; pad[n - 2] = lo >>> 8; pad[n - 1] = lo;
    this.total -= pad.length; // padding telles ikke som data
    this.update(pad);
    const out = new Uint8Array(32);
    for (let j = 0; j < 8; j++) { const v = this.h[j]!; out[j * 4] = v >>> 24; out[j * 4 + 1] = v >>> 16; out[j * 4 + 2] = v >>> 8; out[j * 4 + 3] = v; }
    return out;
  }

  private block(d: Uint8Array, o: number): void {
    const w = this.w;
    for (let t = 0; t < 16; t++) w[t] = (d[o + t * 4]! << 24) | (d[o + t * 4 + 1]! << 16) | (d[o + t * 4 + 2]! << 8) | d[o + t * 4 + 3]!;
    for (let t = 16; t < 64; t++) {
      const a = w[t - 15]!, b = w[t - 2]!;
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) | 0;
    }
    let [a, b, c, dd, e, f, g, h] = [this.h[0]!, this.h[1]!, this.h[2]!, this.h[3]!, this.h[4]!, this.h[5]!, this.h[6]!, this.h[7]!];
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t]! + w[t]!) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (dd + t1) | 0; dd = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    this.h[0] = (this.h[0]! + a) | 0; this.h[1] = (this.h[1]! + b) | 0; this.h[2] = (this.h[2]! + c) | 0; this.h[3] = (this.h[3]! + dd) | 0;
    this.h[4] = (this.h[4]! + e) | 0; this.h[5] = (this.h[5]! + f) | 0; this.h[6] = (this.h[6]! + g) | 0; this.h[7] = (this.h[7]! + h) | 0;
  }
}

const utf8 = (s: string): Uint8Array => {
  const out: number[] = [];
  for (const ch of s) {
    let c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else { out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); c = 0; }
  }
  return Uint8Array.from(out);
};

export const toHex = (b: Uint8Array): string => Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
export function base64Url(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    if (i + 1 < b.length) s += B64[(n >> 6) & 63]!;
    if (i + 2 < b.length) s += B64[n & 63]!;
  }
  return s;
}
export const sha256Bytes = (data: Uint8Array | string): Uint8Array => new Sha256().update(typeof data === "string" ? utf8(data) : data).digest();
export const sha256Hex = (data: Uint8Array | string): string => toHex(sha256Bytes(data));
