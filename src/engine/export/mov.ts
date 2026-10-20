/**
 * P7: append-only QuickTime (MOV) writer for ProRes video and 16-bit PCM audio (48 kHz). Every sample is
 * written in its own small "mdat" atom as soon as it is ready, and the index ("moov") is written last, so the
 * file can stream straight into OPFS without seeking back and without holding frames in memory.
 * Pure: no DOM APIs.
 */
import type { Rational } from "@/core";
import { PRORES_FOURCC, type ProResProfile } from "./prores";

export interface ByteSink { write(chunk: Uint8Array): Promise<void> }

export interface MovOptions {
  readonly width: number;
  readonly height: number;
  readonly fps: Rational;
  readonly profile: ProResProfile;
  /** Stereo 16-bit PCM at this rate when set (normal film export); none for layer export. */
  readonly audioRate?: number | null;
}

const enc = new TextEncoder();
function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const size = 8 + parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(size), dv = new DataView(out.buffer);
  dv.setUint32(0, size); out.set(enc.encode(type), 4);
  let at = 8; for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
class W {
  private a: number[] = [];
  u8(v: number) { this.a.push(v & 255); return this; }
  u16(v: number) { return this.u8(v >> 8).u8(v); }
  u32(v: number) { return this.u16(Math.floor(v / 65536) & 0xffff).u16(v & 0xffff); }
  u64(v: number) { return this.u32(Math.floor(v / 2 ** 32)).u32(v >>> 0); }
  str(s: string) { for (const b of enc.encode(s)) this.u8(b); return this; }
  zeros(n: number) { for (let i = 0; i < n; i++) this.u8(0); return this; }
  matrix() { return this.u32(0x10000).u32(0).u32(0).u32(0).u32(0x10000).u32(0).u32(0).u32(0).u32(0x40000000); }
  get b() { return new Uint8Array(this.a); }
}

const COMPRESSOR: Record<ProResProfile, string> = { hq: "Apple ProRes 422 HQ", "4444": "Apple ProRes 4444" };

export class MovWriter {
  private pos = 0;
  private readonly vSizes: number[] = [];
  private readonly vOffsets: number[] = [];
  private readonly aChunks: { offset: number; frames: number }[] = [];
  private audioFrames = 0;
  constructor(private readonly sink: ByteSink, private readonly o: MovOptions) {}

  get bytesWritten() { return this.pos; }

  private async put(b: Uint8Array) { await this.sink.write(b); this.pos += b.length; }

  async start() {
    await this.put(box("ftyp", new W().str("qt  ").u32(0x200).str("qt  ").b));
    await this.put(box("wide"));
  }
  private async mdat(data: Uint8Array): Promise<number> {
    const h = new Uint8Array(8); new DataView(h.buffer).setUint32(0, data.length + 8); h.set(enc.encode("mdat"), 4);
    await this.put(h);
    const at = this.pos;
    await this.put(data);
    return at;
  }
  async addVideo(frame: Uint8Array) {
    this.vOffsets.push(await this.mdat(frame)); this.vSizes.push(frame.length);
  }
  /** Interleaved stereo little-endian 16-bit samples ("sowt"). */
  async addAudio(pcm: Uint8Array) {
    if (!this.o.audioRate || !pcm.length) return;
    const frames = pcm.length / 4;
    this.aChunks.push({ offset: await this.mdat(pcm), frames }); this.audioFrames += frames;
  }

  async finish() {
    const { width, height, fps, profile } = this.o;
    const n = this.vSizes.length;
    const ts = fps.num, vdur = n * fps.den;
    const hasAudio = !!this.o.audioRate && this.audioFrames > 0;
    const tkhd = (id: number, audio: boolean) => box("tkhd", new W().u32(0x0f).u32(0).u32(0).u32(id).u32(0).u32(vdur)
      .zeros(8).u16(0).u16(0).u16(audio ? 0x100 : 0).u16(0).matrix().u32(audio ? 0 : width * 65536).u32(audio ? 0 : height * 65536).b);
    const mdhd = (scale: number, dur: number) => box("mdhd", new W().u32(0).u32(0).u32(0).u32(scale).u32(dur).u16(0x55c4).u16(0).b);
    const hdlr = (ct: string, sub: string) => box("hdlr", new W().u32(0).str(ct).str(sub).u32(0).u32(0).u32(0).u8(0).b);
    const dinf = box("dinf", box("dref", new W().u32(0).u32(1).b, box("alis", new W().u32(1).b)));
    const co64 = (offs: readonly number[]) => { const w = new W().u32(0).u32(offs.length); for (const v of offs) w.u64(v); return box("co64", w.b); };
    const name = COMPRESSOR[profile];
    const entry = box(PRORES_FOURCC[profile], new W().zeros(6).u16(1).u16(0).u16(0).str("appl").u32(0).u32(0x400)
      .u16(width).u16(height).u32(72 * 65536).u32(72 * 65536).u32(0).u16(1)
      .u8(name.length).str(name).zeros(31 - name.length).u16(profile === "4444" ? 32 : 24).u16(0xffff).b,
      box("colr", new W().str("nclc").u16(1).u16(1).u16(1).b),
      box("fiel", new W().u8(1).u8(0).b),
      box("pasp", new W().u32(1).u32(1).b));
    const stsz = new W().u32(0).u32(0).u32(n); for (const s of this.vSizes) stsz.u32(s);
    const video = box("trak", tkhd(1, false), box("mdia", mdhd(ts, vdur), hdlr("mhlr", "vide"),
      box("minf", box("vmhd", new W().u32(1).u16(0x40).zeros(6).b), hdlr("dhlr", "alis"), dinf,
        box("stbl", box("stsd", new W().u32(0).u32(1).b, entry),
          box("stts", new W().u32(0).u32(1).u32(n).u32(fps.den).b),
          box("stsc", new W().u32(0).u32(1).u32(1).u32(1).u32(1).b),
          box("stsz", stsz.b), co64(this.vOffsets)))));
    const traks = [video];
    if (hasAudio) {
      const rate = this.o.audioRate!;
      const stsc = new W(); let entries = 0, last = -1;
      this.aChunks.forEach((c, i) => { if (c.frames !== last) { stsc.u32(i + 1).u32(c.frames).u32(1); entries++; last = c.frames; } });
      const sowt = box("sowt", new W().zeros(6).u16(1).u16(0).u16(0).u32(0).u16(2).u16(16).u16(0).u16(0).u32(rate * 65536).b);
      traks.push(box("trak", tkhd(2, true), box("mdia", mdhd(rate, this.audioFrames), hdlr("mhlr", "soun"),
        box("minf", box("smhd", new W().u32(0).u16(0).u16(0).b), hdlr("dhlr", "alis"), dinf,
          box("stbl", box("stsd", new W().u32(0).u32(1).b, sowt),
            box("stts", new W().u32(0).u32(1).u32(this.audioFrames).u32(1).b),
            box("stsc", new W().u32(0).u32(entries).b, stsc.b),
            box("stsz", new W().u32(0).u32(4).u32(this.audioFrames).b),
            co64(this.aChunks.map(c => c.offset)))))));
    }
    const mvhd = box("mvhd", new W().u32(0).u32(0).u32(0).u32(ts).u32(vdur).u32(0x10000).u16(0x100).zeros(10).matrix()
      .zeros(24).u32(traks.length + 1).b);
    await this.put(box("moov", mvhd, ...traks));
  }
}

/** Audio frames (per channel) belonging to video frame i, so audio interleaves frame by frame without drift. */
export function audioFramesFor(i: number, fps: Rational, rate: number): number {
  const at = (k: number) => Math.round((k * rate * fps.den) / fps.num);
  return at(i + 1) - at(i);
}

/** Float stereo planes → interleaved little-endian 16-bit (sowt). */
export function toSowt(left: Float32Array, right: Float32Array): Uint8Array {
  const out = new Uint8Array(left.length * 4), dv = new DataView(out.buffer);
  for (let i = 0; i < left.length; i++) {
    const l = Math.max(-1, Math.min(1, left[i]!)), r = Math.max(-1, Math.min(1, right[i]!));
    dv.setInt16(i * 4, Math.round(l * 32767), true); dv.setInt16(i * 4 + 2, Math.round(r * 32767), true);
  }
  return out;
}
