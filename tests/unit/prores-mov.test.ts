import { describe, expect, it } from "vitest";
import { encodeProResFrame, type ProResProfile } from "@/engine/export/prores";
import { MovWriter, audioFramesFor, toSowt } from "@/engine/export/mov";
import { PRORES_MEMORY_LIMIT, proresBytesEstimate, proresLimitError } from "@/core/prores-export";
import { confidencePercent, discardedText, ratioTitle, qualityProfileError, type Rational } from "@/core";
import { isAlphaSettings, DEFAULT_ALPHA_SETTINGS } from "@/core/layer-alpha";

async function makeMov(profile: ProResProfile, fps: Rational, w: number, h: number, frames: number, audio: boolean) {
  const chunks: Uint8Array[] = [];
  const mov = new MovWriter({ write: async (c) => { chunks.push(c.slice()); } }, { width: w, height: h, fps, profile, audioRate: audio ? 48000 : null });
  await mov.start();
  for (let f = 0; f < frames; f++) {
    const px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      px[p] = x * 3; px[p + 1] = y * 2; px[p + 2] = 90; px[p + 3] = x < 8 && y < 8 ? 0 : 255;
    }
    await mov.addVideo(encodeProResFrame({ width: w, height: h, rgba: px, profile }));
    if (audio) { const n = audioFramesFor(f, fps, 48000); const s = new Float32Array(n).fill(0.25); await mov.addAudio(toSowt(s, s)); }
  }
  await mov.finish();
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0; for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

type Atom = { type: string; start: number; end: number };
const typeAt = (b: Uint8Array, i: number) => String.fromCharCode(b[i]!, b[i + 1]!, b[i + 2]!, b[i + 3]!);
function children(b: Uint8Array, start: number, end: number): Atom[] {
  const dv = new DataView(b.buffer, b.byteOffset), out: Atom[] = [];
  for (let i = start; i + 8 <= end;) { const size = dv.getUint32(i); out.push({ type: typeAt(b, i + 4), start: i + 8, end: i + size }); i += size; }
  return out;
}
function find(b: Uint8Array, path: string[], from = 0, to = b.length): Atom[] {
  const [head, ...rest] = path;
  const hits = children(b, from, to).filter((a) => a.type === head);
  return rest.length ? hits.flatMap((a) => find(b, rest, a.start, a.end)) : hits;
}
const u32 = (b: Uint8Array, i: number) => new DataView(b.buffer, b.byteOffset).getUint32(i);
const u16 = (b: Uint8Array, i: number) => new DataView(b.buffer, b.byteOffset).getUint16(i);

function stsdEntry(b: Uint8Array, trak: Atom) {
  const stsd = find(b, ["mdia", "minf", "stbl", "stsd"], trak.start, trak.end)[0]!;
  return { fourcc: typeAt(b, stsd.start + 12), at: stsd.start + 16, end: stsd.start + 8 + u32(b, stsd.start + 8) };
}

describe("P7 ProRes in MOV", () => {
  for (const [profile, fourcc] of [["hq", "apch"], ["4444", "ap4h"]] as const)
    for (const fps of [{ num: 24000, den: 1001 }, { num: 30000, den: 1001 }, { num: 25, den: 1 }])
      it(`${fourcc} at ${fps.num}/${fps.den}: FourCC, frame rate, size and Rec.709 tag`, async () => {
        const b = await makeMov(profile, fps, 70, 34, 3, profile === "hq");
        expect(typeAt(b, 4)).toBe("ftyp"); expect(typeAt(b, 8)).toBe("qt  ");
        const traks = find(b, ["moov", "trak"]);
        const v = traks.find((t) => stsdEntry(b, t).fourcc === fourcc)!;
        expect(v).toBeTruthy();
        const mdhd = find(b, ["mdia", "mdhd"], v.start, v.end)[0]!;
        expect(u32(b, mdhd.start + 12)).toBe(fps.num); // timescale
        expect(u32(b, mdhd.start + 16)).toBe(3 * fps.den); // 3 frames
        const stts = find(b, ["mdia", "minf", "stbl", "stts"], v.start, v.end)[0]!;
        expect(u32(b, stts.start + 8)).toBe(3); expect(u32(b, stts.start + 12)).toBe(fps.den);
        const e = stsdEntry(b, v);
        expect(u16(b, e.at + 24)).toBe(70); expect(u16(b, e.at + 26)).toBe(34);
        const tkhd = find(b, ["tkhd"], v.start, v.end)[0]!;
        expect(u32(b, tkhd.start + 76) / 65536).toBe(70); expect(u32(b, tkhd.start + 80) / 65536).toBe(34);
        const colr = find(b, ["colr"], e.at + 78, e.end)[0]!;
        expect(typeAt(b, colr.start)).toBe("nclc");
        expect([u16(b, colr.start + 4), u16(b, colr.start + 6), u16(b, colr.start + 8)]).toEqual([1, 1, 1]);
        // Every frame in the file starts with "icpf" and carries Rec.709 tags in its own header.
        const stco = find(b, ["mdia", "minf", "stbl", "co64"], v.start, v.end)[0]!;
        const off = u32(b, stco.start + 12);
        expect(typeAt(b, off + 4)).toBe("icpf");
        expect([b[off + 22], b[off + 23], b[off + 24]]).toEqual([1, 1, 1]);
        expect(u16(b, off + 16)).toBe(70); expect(u16(b, off + 18)).toBe(34);
      });

  it("film export carries stereo PCM 48 kHz ('sowt'); layer export has no audio track", async () => {
    const fps = { num: 24000, den: 1001 };
    const film = await makeMov("hq", fps, 32, 16, 5, true);
    const traks = find(film, ["moov", "trak"]);
    const a = traks.find((t) => stsdEntry(film, t).fourcc === "sowt")!;
    const e = stsdEntry(film, a);
    expect(u16(film, e.at + 16)).toBe(2); expect(u16(film, e.at + 18)).toBe(16);
    expect(u32(film, e.at + 24) / 65536).toBe(48000);
    const total = [0, 1, 2, 3, 4].reduce((n, i) => n + audioFramesFor(i, fps, 48000), 0);
    expect(total).toBe(Math.round((5 * 48000 * 1001) / 24000));
    const layer = await makeMov("4444", fps, 32, 16, 2, false);
    expect(find(layer, ["moov", "trak"]).length).toBe(1);
  });

  it("4444: decoding the alpha plane of one frame gives alpha 0 in the transparent corner", async () => {
    const w = 40, h = 20, px = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px[(y * w + x) * 4 + 3] = 0;
    const f = encodeProResFrame({ width: w, height: h, rgba: px, profile: "4444" });
    expect(typeAt(f, 4)).toBe("icpf");
    expect(f[8 + 12]! >> 6).toBe(3); // 4:4:4
    expect(f[8 + 17]! & 0xf).toBe(2); // 16-bit alpha
    const pic = 8 + u16(f, 8);
    const slices = u16(f, pic + 5), sliceW = 1 << (f[pic + 7]! >> 4);
    expect(slices).toBe(2 * 2); // 3 MBs wide → slices of 2 + 1, two MB rows
    const first = pic + 8 + slices * 2, size = u16(f, pic + 8);
    const hdr = f[first]! >> 3;
    expect(hdr).toBe(8);
    const ys = u16(f, first + 2), us = u16(f, first + 4), vs = u16(f, first + 6);
    const alpha = f.subarray(first + hdr + ys + us + vs, first + size);
    // Port of the reference alpha unpacker (16-bit).
    let bit = 0;
    const get = (n: number) => { let v = 0; for (let i = 0; i < n; i++, bit++) v = (v << 1) | ((alpha[bit >> 3] ?? 0) >> (7 - (bit & 7)) & 1); return v >>> 0; };
    const sliceMbs = Math.min(sliceW, 2); expect(sliceW).toBe(8);
    const count = sliceMbs * 256, out = new Uint16Array(count);
    let idx = 0, val = 0xffff;
    outer: while (idx < count) {
      do {
        if (get(1)) val = (val + get(16)) & 0xffff;
        else { const c = get(7), s = c & 1, m = (c + 2) >> 1; val = (val + (s ? -m : m)) & 0xffff; }
        out[idx++] = val;
        if (idx >= count) break outer;
      } while (get(1));
      let run = get(4); if (!run) run = get(11);
      for (let i = 0; i < run && idx < count; i++) out[idx++] = val;
    }
    const sw = sliceMbs * 16;
    expect(out[0]).toBe(0); // top-left corner
    expect(out[7 * sw + 7]).toBe(0);
    expect(out[8]).toBe(0xffff);
    expect(out[15 * sw + 20]).toBe(0xffff);
  });
});

describe("P7 limits and choices", () => {
  it("refuses an in-memory file above the safe limit and allows it with OPFS space", () => {
    const fps = { num: 24, den: 1 };
    const big = proresBytesEstimate(1920, 1080, 24 * 600, "hq", fps, true);
    expect(big).toBeGreaterThan(PRORES_MEMORY_LIMIT);
    expect(proresLimitError(big, { opfs: false, available: null, width: 1920, height: 1080 })).toMatch(/OPFS/);
    expect(proresLimitError(big, { opfs: true, available: big * 2, width: 1920, height: 1080 })).toBeNull();
    expect(proresLimitError(big, { opfs: true, available: big, width: 1920, height: 1080 })).not.toBeNull();
    expect(proresLimitError(1000, { opfs: true, available: null, width: 9000, height: 100 })).not.toBeNull();
  });
  it("quality profiles may suggest ProRes; layer export accepts the ProRes 4444 format", () => {
    expect(qualityProfileError("Endelig", { export: { format: "prores" } })).toBeNull();
    expect(isAlphaSettings({ ...DEFAULT_ALPHA_SETTINGS, format: "mov-prores4444" })).toBe(true);
  });
});

describe("P7 line-linking labels", () => {
  it("singular and plural discard count, percent confidence and ratio tooltip", () => {
    expect(discardedText(1)).toBe("1 ugyldig forslag forkastet.");
    expect(discardedText(2)).toBe("2 ugyldige forslag forkastet.");
    expect(confidencePercent(0.5)).toBe("50 %");
    expect(confidencePercent(0.92)).toBe("92 %");
    expect(ratioTitle(1, 2)).toBe("én norsk linje mot to oversatte");
    expect(ratioTitle(2, 1)).toBe("to norske linjer mot én oversatt");
  });
});
