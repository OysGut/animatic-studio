/**
 * Lydmotoren for komposisjoner (fase 2, bolk C, DEC-0094, REQ-0697): samme miks brukes til forhåndsavspilling,
 * lagring og eksport, så det som eksporteres er det brukeren hørte. Pauser og romlyd (bolk E) er vanlige deler i
 * komposisjonen og mikses på samme måte (E4–E7). Delene legges på riktig sted med volum og
 * inn-/uttoning (lineært, også der delene overlapper – en enkel krysstoning). Bare på klienten (Web Audio).
 */
import type { AudioComposition, AudioSegment } from "@/core";

export interface RenderOptions {
  readonly sampleRate?: number;
  readonly channels?: 1 | 2;
  /** Utsnitt (ms i komposisjonen). Standard: hele. */
  readonly fromMs?: number;
  readonly toMs?: number;
}

/**
 * Romlyd og overganger (bolk E, DEC-0096) tones med jevn effekt (sinus/cosinus), så volumet holdes jevnt der to
 * biter romlyd krysstones (REQ-0708). Tale tones lineært som før.
 */
function equalPower(s: AudioSegment): boolean {
  return s.role === "room" || s.role === "transition";
}

/** Volumet (forsterkning) for en del på et tidspunkt (ms fra delens start). Ren funksjon, for tester. */
export function segmentGainAt(s: AudioSegment, t: number): number {
  if (t < 0 || t > s.lengthMs) return 0;
  const base = Math.pow(10, s.gainDb / 20);
  const shape = equalPower(s) ? (x: number) => Math.sin((Math.PI / 2) * x) : (x: number) => x;
  let k = 1;
  if (s.fadeInMs > 0 && t < s.fadeInMs) k = Math.min(k, shape(t / s.fadeInMs));
  if (s.fadeOutMs > 0 && t > s.lengthMs - s.fadeOutMs)
    k = Math.min(k, shape((s.lengthMs - t) / s.fadeOutMs));
  return base * Math.max(0, k);
}

/** Punktene volumkurven tegnes gjennom (ms i komposisjonen), innenfor [start, end]. */
export function gainPoints(s: AudioSegment, start: number, end: number): number[] {
  const points = new Set([start, end]);
  const steps = equalPower(s) ? 8 : 1;
  const add = (from: number, len: number) => {
    for (let i = 0; i <= steps; i++) {
      const p = from + (len * i) / steps;
      if (p > start && p < end) points.add(p);
    }
  };
  if (s.fadeInMs > 0) add(s.atMs, s.fadeInMs);
  if (s.fadeOutMs > 0) add(s.atMs + s.lengthMs - s.fadeOutMs, s.fadeOutMs);
  return [...points].sort((a, b) => a - b);
}

/**
 * Mikser komposisjonen (eller et utsnitt) til en AudioBuffer. Deler uten dekodet kildeopptak hoppes over.
 * `buffers` gir det dekodede opptaket for en versjon.
 */
export async function renderComposition(
  c: AudioComposition,
  buffers: (versionId: string) => AudioBuffer | undefined,
  o: RenderOptions = {},
): Promise<AudioBuffer> {
  const rate = o.sampleRate ?? 48000;
  const total = c.segments.reduce((m, s) => Math.max(m, s.atMs + s.lengthMs), 0);
  const from = Math.max(0, o.fromMs ?? 0);
  const to = Math.max(from + 1, Math.min(total || 1, o.toMs ?? total));
  const frames = Math.max(1, Math.ceil(((to - from) / 1000) * rate));
  const ctx = new OfflineAudioContext(o.channels ?? 1, frames, rate);
  for (const s of c.segments) {
    const buf = buffers(s.versionId);
    if (!buf) continue;
    const start = Math.max(s.atMs, from);
    const end = Math.min(s.atMs + s.lengthMs, to);
    if (end <= start) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const when = (start - from) / 1000;
    // Volumkurven: punkter ved start, gjennom toningene og ved slutt
    const sorted = gainPoints(s, start, end);
    g.gain.setValueAtTime(segmentGainAt(s, sorted[0]! - s.atMs), when);
    for (const p of sorted.slice(1))
      g.gain.linearRampToValueAtTime(segmentGainAt(s, p - s.atMs), (p - from) / 1000);
    src.connect(g).connect(ctx.destination);
    src.start(when, (s.sourceInMs + (start - s.atMs)) / 1000, (end - start) / 1000);
  }
  return ctx.startRendering();
}

/** Kanaldata fra en AudioBuffer (til WAV/MP3). */
export function channelsOf(buf: AudioBuffer): Float32Array[] {
  return Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
}

/** Koder en miks som MP3 (LAME via mediabunny, bare når nettleseren ikke har en egen MP3-koder). */
export async function encodeMp3(buf: AudioBuffer, bitrate = 192_000): Promise<Uint8Array> {
  const mb = await import("mediabunny");
  if (!(await mb.canEncodeAudio("mp3"))) {
    const { registerMp3Encoder } = await import("@mediabunny/mp3-encoder");
    registerMp3Encoder();
  }
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp3OutputFormat(), target });
  const source = new mb.AudioBufferSource({ codec: "mp3", bitrate });
  output.addAudioTrack(source);
  await output.start();
  await source.add(buf);
  await output.finalize();
  if (!target.buffer) throw new Error("MP3");
  return new Uint8Array(target.buffer);
}
