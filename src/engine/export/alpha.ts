/** P4: renderer-independent format adapters; future MOV/ProRes adapters implement AlphaEncoder. */
import { type ProjectState } from "@/core";
import { alphaExportError, alphaRange, alphaSceneClip, alphaLayerIds, alphaPixels,
  type AlphaExportSettings } from "@/core/layer-alpha";
import { drawFilmFrame } from "../compositor/film";
import type { ImageSource } from "../compositor/canvas";
import { fontsReady, textSpecsOf } from "../typography/fonts";
import { encodePngStrips } from "./png-writer";
import { writeZip, type ZipSink } from "./zip";
import type { Composition } from "@/core";
import { t } from "@/core/i18n/keyed";

export interface AlphaEncoder {
  encode(canvas: HTMLCanvasElement, frame: number): Promise<void>;
  finish(): Promise<void>;
  abort(): Promise<void>;
}
export interface AlphaExportOptions {
  readonly state: ProjectState;
  readonly composition: Composition;
  readonly settings: AlphaExportSettings;
  readonly images: ReadonlyMap<string, ImageSource>;
  readonly sink: ZipSink;
  readonly fileBase: string;
  readonly signal: AbortSignal;
  readonly onProgress?: (done: number, total: number) => void;
}

/** A positive alpha-keep WebCodecs probe is mandatory, even if a library could emulate alpha. */
export async function supportsVp9Alpha(width: number, height: number): Promise<boolean> {
  if (typeof VideoEncoder === "undefined") return false;
  try {
    const result = await VideoEncoder.isConfigSupported({ codec: "vp09.00.10.08", width, height,
      bitrate: 8_000_000, alpha: "keep" } as VideoEncoderConfig);
    return result.supported === true && (result.config as VideoEncoderConfig & { alpha?: string }).alpha === "keep";
  } catch { return false; }
}

/** Disk-backed staging: the download becomes visible only after successful finalization. */
export async function openAlphaSink(name: string, mime: string): Promise<ZipSink> {
  if (!navigator.storage?.getDirectory) {
    const parts: BlobPart[] = [];
    let link: { url: string; name: string } | null = null;
    return {
      write: async chunk => { parts.push(new Uint8Array(chunk).buffer); },
      close: async () => {
        const blob = new Blob(parts, { type: mime }); parts.length = 0;
        const url = URL.createObjectURL(blob); link = { url, name };
        const a = document.createElement("a"); a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
      },
      abort: async () => { parts.length = 0; if (link) URL.revokeObjectURL(link.url); link = null; },
      link: () => link,
    };
  }
  const root = await navigator.storage.getDirectory();
  const temp = `alpha-${crypto.randomUUID()}`;
  const handle = await root.getFileHandle(temp, { create: true });
  const writable = await handle.createWritable();
  let link: { url: string; name: string } | null = null;
  let closed = false;
  return {
    write: chunk => writable.write(chunk as unknown as BufferSource),
    close: async () => {
      await writable.close(); closed = true;
      const file = await handle.getFile();
      const url = URL.createObjectURL(file.slice(0, file.size, mime));
      link = { url, name };
      const a = document.createElement("a"); a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      // A File snapshot still depends on its OPFS backing entry in Chromium. Keep it
      // until the download has had time to consume it, then release both resources.
      setTimeout(() => { URL.revokeObjectURL(url); void root.removeEntry(temp).catch(() => undefined); }, 60_000);
    },
    abort: async () => {
      if (!closed) await writable.abort().catch(() => undefined);
      await root.removeEntry(temp).catch(() => undefined);
      if (link) URL.revokeObjectURL(link.url);
      link = null;
    },
    link: () => link,
  };
}

function checkAbort(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException(t("engine-export-alpha.check-abort.message.beb939e7ae1f"), "AbortError");
}

class PngSequenceEncoder implements AlphaEncoder {
  private parts: Uint8Array[] | null = null;
  constructor(private readonly o: AlphaExportOptions) {}
  async encode(canvas: HTMLCanvasElement): Promise<void> {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(t("engine-export-alpha.encode.message.6a81b8072f16"));
    this.parts = await encodePngStrips({ width: canvas.width, height: canvas.height }, async (y, rows) => {
      checkAbort(this.o.signal);
      return alphaPixels(ctx.getImageData(0, y, canvas.width, rows).data, this.o.settings.alpha);
    });
  }
  take(): Uint8Array {
    const parts = this.parts ?? [];
    const data = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0; for (const p of parts) { data.set(p, at); at += p.length; }
    this.parts = null;
    return data;
  }
  async finish() {}
  async abort() { this.parts = null; }
}

async function webmEncoder(o: AlphaExportOptions, canvas: HTMLCanvasElement): Promise<AlphaEncoder> {
  if (!await supportsVp9Alpha(canvas.width, canvas.height))
    throw new Error(t("engine-export-alpha.webm-encoder.message.5cce70f6bde9"));
  const mb = await import("mediabunny");
  const input = o.settings.alpha === "premultiplied" ? document.createElement("canvas") : canvas;
  input.width = canvas.width; input.height = canvas.height;
  const output = new mb.Output({ format: new mb.WebMOutputFormat({ appendOnly: true }),
    target: new mb.AppendOnlyStreamTarget(new WritableStream({ write: chunk => o.sink.write(chunk) })) });
  const source = new mb.CanvasSource(input, { codec: "vp9", quality: mb.QUALITY_HIGH, alpha: "keep" });
  const fps = o.state.project.fps.num / o.state.project.fps.den;
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();
  return {
    encode: async (_canvas, frame) => {
      if (o.settings.alpha === "premultiplied") {
        const ctx = canvas.getContext("2d"), target = input.getContext("2d");
        if (ctx && target) {
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          image.data.set(alphaPixels(image.data, "premultiplied")); target.putImageData(image, 0, 0);
        }
      }
      await source.add(frame / fps, 1 / fps);
    },
    finish: async () => { await output.finalize(); checkAbort(o.signal); await o.sink.close(); },
    abort: async () => { await output.cancel().catch(() => undefined); await o.sink.abort(); },
  };
}

/** P7: ProRes 4444 with 16-bit alpha in MOV, encoded in workers and streamed to the sink. */
async function proresEncoder(o: AlphaExportOptions, canvas: HTMLCanvasElement, total: number): Promise<AlphaEncoder> {
  const p = await import("./prores-export");
  const { MovWriter } = await import("./mov");
  await p.checkProResLimits(canvas.width, canvas.height, total, "4444", o.state, false);
  const st = await p.proresStorage();
  const mov = new MovWriter(p.guardedSink(o.sink, !st.opfs), { width: canvas.width, height: canvas.height,
    fps: o.state.project.fps, profile: "4444", audioRate: null });
  await mov.start();
  const pool = new p.ProResPool();
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t("engine-export-alpha.prores-encoder.message.4f544d8dc2c6"));
  const inFlight: Promise<Uint8Array>[] = [];
  const drain = async (keep: number) => { while (inFlight.length > keep) { const f = await inFlight.shift()!; checkAbort(o.signal); await mov.addVideo(f); } };
  return {
    encode: async () => {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const px = o.settings.alpha === "premultiplied" ? new Uint8ClampedArray(alphaPixels(data, "premultiplied")) : data;
      inFlight.push(pool.encode(px, canvas.width, canvas.height, "4444"));
      await drain(pool.size * 2 - 1);
    },
    finish: async () => { try { await drain(0); await mov.finish(); checkAbort(o.signal); await o.sink.close(); } finally { pool.close(); } },
    abort: async () => { pool.close(); await o.sink.abort(); },
  };
}

export async function exportAlphaLayers(o: AlphaExportOptions): Promise<void> {
  let encoder: AlphaEncoder | null = null;
  try {
    const error = alphaExportError(o.state, o.composition, o.settings);
    if (error) throw new Error(error);
    const clip = alphaSceneClip(o.state, o.composition);
    if (!clip) throw new Error(t("engine-export-alpha.export-alpha-layers.message.3199d6a2083f"));
    const range = alphaRange(o.composition, o.settings);
    const total = range.end - range.start;
    const canvas = document.createElement("canvas");
    canvas.width = o.composition.width; canvas.height = o.composition.height;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error(t("engine-export-alpha.export-alpha-layers.message.f48e9ce41a0f"));
    await fontsReady(textSpecsOf(o.state)); checkAbort(o.signal);
    const layers = alphaLayerIds(o.state, o.composition, o.settings.layerIds);
    const draw = (i: number) => drawFilmFrame(ctx, o.state, [clip], range.start + i, {
      width: canvas.width, height: canvas.height, images: o.images, placeholders: false,
      background: "transparent", layerIds: layers, effects: o.settings.effects,
    });
    if (o.settings.format === "png-seq") {
      const png = new PngSequenceEncoder(o); encoder = png;
      async function* frames() {
        for (let i = 0; i < total; i++) {
          checkAbort(o.signal); draw(i); await png.encode(canvas);
          yield { path: `${o.fileBase}/${o.fileBase} - ${String(range.start + i).padStart(6, "0")}.png`, data: png.take() };
          o.onProgress?.(i + 1, total);
          await new Promise(r => setTimeout(r, 0));
        }
        checkAbort(o.signal);
      }
      await writeZip(o.sink, [], {}, { signal: o.signal, extra: frames() });
      await png.finish();
    } else {
      encoder = o.settings.format === "mov-prores4444" ? await proresEncoder(o, canvas, total) : await webmEncoder(o, canvas);
      for (let i = 0; i < total; i++) {
        checkAbort(o.signal); draw(i); await encoder.encode(canvas, i);
        o.onProgress?.(i + 1, total); await new Promise(r => setTimeout(r, 0));
      }
      checkAbort(o.signal); await encoder.finish();
    }
  } catch (e) {
    await encoder?.abort().catch(() => undefined);
    await o.sink.abort().catch(() => undefined);
    throw e;
  }
}