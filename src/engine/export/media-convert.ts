/**
 * Konvertering av medier for produksjonspakkene (PTG3/PTG7). Planen (hva som konverteres, og hvor
 * det havner) ligger i core/interchange/media-formats.ts; her skjer bare dekoding og koding i nettleseren.
 * Video → PNG-sekvens (mediabunny), lyd → WAV 16 bit PCM 48 kHz (Web Audio), WebP/AVIF → PNG.
 */
import type { Rational } from "@/core/time";
import { sequenceFramePath, type MediaConversion } from "@/core/interchange/media-formats";
import { encodeWav } from "./audio-stem";
import type { ZipExtra } from "./zip";

export interface MediaConverter {
  image(blob: Blob): Promise<Uint8Array>;
  audio(blob: Blob, sampleRate: number): Promise<Uint8Array>;
  /** Ett PNG-bilde per filmbilde ved `fps`, fra tid 0 til slutten av videoen. */
  videoFrames(blob: Blob, fps: Rational, signal: AbortSignal): AsyncIterable<Uint8Array>;
}

async function canvasPng(c: HTMLCanvasElement | OffscreenCanvas): Promise<Uint8Array> {
  const blob = "convertToBlob" in c
    ? await c.convertToBlob({ type: "image/png" })
    : await new Promise<Blob>((ok, fail) => c.toBlob(b => (b ? ok(b) : fail(new Error("png"))), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

export const browserMediaConverter: MediaConverter = {
  async image(blob) {
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    c.getContext("2d")!.drawImage(bmp, 0, 0);
    bmp.close();
    return canvasPng(c);
  },
  async audio(blob, sampleRate) {
    const decoded = await new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(await blob.arrayBuffer());
    const frames = Math.max(1, Math.ceil(decoded.duration * sampleRate));
    const ctx = new OfflineAudioContext(decoded.numberOfChannels, frames, sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = decoded; src.connect(ctx.destination); src.start(0);
    const out = await ctx.startRendering();
    return encodeWav(Array.from({ length: out.numberOfChannels }, (_, i) => out.getChannelData(i)), sampleRate);
  },
  async *videoFrames(blob, fps, signal) {
    const mb = await import("mediabunny");
    const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new Error("no video track");
      const start = await track.getFirstTimestamp();
      const end = await track.computeDuration();
      const step = fps.den / fps.num;
      const count = Math.max(1, Math.round((end - start) / step));
      const sink = new mb.CanvasSink(track, { poolSize: 2 });
      const times = Array.from({ length: count }, (_, i) => start + i * step);
      let last: Uint8Array | null = null;
      for await (const w of sink.canvasesAtTimestamps(times)) {
        if (signal.aborted) throw new DOMException("aborted", "AbortError");
        // Mangler et bilde (før første nøkkelbilde), gjentas forrige, så sekvensen aldri får hull
        const png: Uint8Array | null = w ? await canvasPng(w.canvas) : last;
        if (png) { last = png; yield png; }
      }
    } finally { input.dispose?.(); }
  },
};

/**
 * Henter og konverterer mediene i planen og gir dem som ZIP-filer. Filer som ikke kan hentes eller
 * konverteres, legges i `failed` (relativ sti) og havner ikke i pakken.
 */
export async function* convertedMediaFiles(o: {
  readonly convert: readonly MediaConversion[]; readonly urls: Readonly<Record<string, string>>;
  readonly fps: Rational; readonly signal: AbortSignal; readonly failed: string[];
  readonly converter?: MediaConverter;
}): AsyncGenerator<ZipExtra> {
  const cv = o.converter ?? browserMediaConverter;
  for (const c of o.convert) {
    if (o.signal.aborted) throw new DOMException("aborted", "AbortError");
    const url = o.urls[c.ref.mediaPath];
    const res = url ? await fetch(url, { signal: o.signal }).catch(() => null) : null;
    if (!res?.ok) { o.failed.push(c.path); continue; }
    const blob = await res.blob();
    try {
      if (c.kind === "image-png") { const data = await cv.image(blob); yield { path: c.path, data }; }
      else if (c.kind === "audio-wav") { const data = await cv.audio(blob, c.sampleRate); yield { path: c.path, data }; }
      else {
        // Bildene samles først, så en halv sekvens aldri havner i pakken
        const frames: Uint8Array[] = [];
        for await (const f of cv.videoFrames(blob, o.fps, o.signal)) frames.push(f);
        if (frames.length === 0) throw new Error("empty");
        for (let i = 0; i < frames.length; i++) yield { path: sequenceFramePath(c, i), data: frames[i]! };
      }
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") throw e;
      o.failed.push(c.path);
    }
  }
}
