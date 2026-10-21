/**
 * P7 (DEC-0085, ADR-0011): ProRes in MOV, encoded in the browser by our own encoder in Web Workers.
 * Loaded only when the user picks ProRes (dynamic import), so startup is unaffected. Frames are drawn with the
 * same drawFilmFrame as playback and streamed to the sink (OPFS when available) – never held in memory.
 */
import { cueAt, type ProjectState } from "@/core";
import { PRORES_MEMORY_LIMIT, PRORES_UNSUPPORTED, proresBytesEstimate, proresFrameBudget, proresLimitError, type ProResKind } from "@/core/prores-export";
import { hasAudioIn, renderAudio } from "../audio/mixer";
import { drawFilmFrame } from "../compositor/film";
import { fontsReady, textSpecsOf } from "../typography/fonts";
import type { AnimaticExportOptions } from "./animatic";
import { FilmVideoFrames } from "./film-video";
import { MovWriter, audioFramesFor, toSowt, type ByteSink } from "./mov";
import { supportsProRes } from "./prores-support";
import { t } from "@/core/i18n/keyed";
export { supportsProRes };

/** Free origin storage for OPFS export, or null when unknown. */
export async function proresStorage(): Promise<{ opfs: boolean; available: number | null }> {
  const opfs = typeof navigator !== "undefined" && !!navigator.storage?.getDirectory;
  let available: number | null = null;
  try {
    const e = await navigator.storage?.estimate?.();
    if (e?.quota != null) available = e.quota - (e.usage ?? 0);
  } catch { /* unknown */ }
  return { opfs, available };
}

export async function checkProResLimits(width: number, height: number, frames: number, kind: ProResKind, state: ProjectState, audio: boolean): Promise<void> {
  if (!supportsProRes()) throw new Error(PRORES_UNSUPPORTED());
  const st = await proresStorage();
  const err = proresLimitError(proresBytesEstimate(width, height, frames, kind, state.project.fps, audio, kind === "4444"), { ...st, width, height });
  if (err) throw new Error(err);
}

/** In-order worker pool; at most `workers * 2` frames in flight. */
export class ProResPool {
  private readonly workers: Worker[] = [];
  private readonly waiting = new Map<number, { ok: (f: Uint8Array) => void; fail: (e: Error) => void }>();
  private next = 0;
  constructor(count = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))) {
    for (let i = 0; i < count; i++) {
      const w = new Worker(new URL("./prores.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<{ id: number; frame?: Uint8Array; error?: string }>) => {
        const p = this.waiting.get(e.data.id); this.waiting.delete(e.data.id);
        if (!p) return;
        if (e.data.frame) p.ok(e.data.frame); else p.fail(new Error(e.data.error ?? "ProRes"));
      };
      w.onerror = (e) => { for (const p of this.waiting.values()) p.fail(new Error(e.message || "ProRes worker")); this.waiting.clear(); };
      this.workers.push(w);
    }
  }
  get size() { return this.workers.length; }
  /** R4: targetBytes is the frame budget from Apple's target bitrate (proresFrameBudget). */
  encode(rgba: Uint8ClampedArray, width: number, height: number, profile: ProResKind, targetBytes?: number): Promise<Uint8Array> {
    const id = this.next++;
    return new Promise((ok, fail) => {
      this.waiting.set(id, { ok, fail });
      this.workers[id % this.workers.length]!.postMessage({ id, width, height, profile, rgba, targetBytes }, [rgba.buffer]);
    });
  }
  close() { for (const w of this.workers) w.terminate(); this.workers.length = 0; }
}

function abortCheck(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException(t("engine-export-prores-export.abort-check.message.efc8245fd1eb"), "AbortError");
}

/** Guards an in-memory sink against growing past the safe limit. */
export function guardedSink(sink: ByteSink, inMemory: boolean): ByteSink {
  let n = 0;
  return { write: async (c) => {
    n += c.length;
    if (inMemory && n > PRORES_MEMORY_LIMIT)
      throw new Error(t("engine-export-prores-export.write.write.faa5bf92b1a8"));
    await sink.write(c);
  } };
}

/** Normal film export: ProRes 422 HQ (or 422/LT/Proxy, R4) + stereo PCM 48 kHz in MOV, at Apple's target bitrate. */
export async function exportProResFilm(o: AnimaticExportOptions & { readonly sink: ByteSink; readonly profile?: ProResKind }): Promise<{ bytes: number; audio: boolean }> {
  const kind: ProResKind = o.profile && o.profile !== "4444" ? o.profile : "hq";
  const total = o.endFrame - o.startFrame;
  if (total <= 0) throw new Error(t("engine-export-prores-export.export-pro-res-film.message.f642ea62e9ff"));
  const width = Math.max(2, Math.round(o.width / 2) * 2), height = Math.max(2, Math.round(o.height / 2) * 2);
  const step = o.fps.den / o.fps.num, from = o.startFrame * step, seconds = total * step;
  const audible = o.audio ? o.audio.items.filter((it) => !o.audio!.mutedKinds?.has(it.clip.kind)) : [];
  const withAudio = !!o.audio && hasAudioIn(audible, o.audio.bank, from, from + seconds);
  await checkProResLimits(width, height, total, kind, o.state, withAudio);
  const budget = proresFrameBudget(width, height, o.fps, kind);
  const st = await proresStorage();
  const mov = new MovWriter(guardedSink(o.sink, !st.opfs), { width, height, fps: o.fps, profile: kind, audioRate: withAudio ? 48000 : null });
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!ctx) throw new Error(t("engine-export-prores-export.export-pro-res-film.message.5af6ad7366ac"));
  await fontsReady(textSpecsOf(o.state));
  const hasFilm = o.clips.some((c) => c.parts.some((p) => p.source === "take"));
  const video = hasFilm ? new FilmVideoFrames(await import("mediabunny"), o.filmUrls ?? {}) : null;
  const pool = new ProResPool();
  // Audio mixed in 20 s chunks, sliced per video frame.
  let aBuf: AudioBuffer | null = null, aStart = 0, aPos = 0;
  const audioFor = async (i: number): Promise<Uint8Array> => {
    const n = audioFramesFor(i, o.fps, 48000);
    const L0 = new Float32Array(n), R0 = new Float32Array(n);
    let filled = 0;
    while (filled < n) {
      if (!aBuf || aPos >= aBuf.length) {
        aStart += aBuf ? aBuf.length : 0; aPos = 0;
        aBuf = await renderAudio(audible, o.audio!.bank, from + aStart / 48000, Math.min(20, Math.max(1 / 48000, seconds - aStart / 48000) + 0.05), 48000);
        if (!aBuf.length) break;
      }
      const take = Math.min(n - filled, aBuf.length - aPos);
      const l = aBuf.getChannelData(0), r = aBuf.numberOfChannels > 1 ? aBuf.getChannelData(1) : l;
      L0.set(l.subarray(aPos, aPos + take), filled); R0.set(r.subarray(aPos, aPos + take), filled);
      filled += take; aPos += take;
    }
    return toSowt(L0, R0);
  };
  const inFlight: Promise<Uint8Array>[] = [];
  let written = 0;
  const drain = async (keep: number) => {
    while (inFlight.length > keep) {
      const frame = await inFlight.shift()!;
      abortCheck(o.signal);
      await mov.addVideo(frame);
      if (withAudio) await mov.addAudio(await audioFor(written));
      written++;
      if (written % 3 === 0 || written === total) o.onProgress?.(written, total);
    }
  };
  try {
    await mov.start();
    for (let i = 0; i < total; i++) {
      abortCheck(o.signal);
      if (video) await video.prepare(o.state, o.clips, o.startFrame + i);
      drawFilmFrame(ctx, o.state, o.clips, o.startFrame + i, {
        width, height, images: o.images, placeholders: false, monochrome: o.monochrome ?? false,
        ...(o.characterPass ? { characterPass: o.characterPass } : {}),
        ...(video ? { video: video.provider } : {}),
        ...(o.subtitles?.length ? { subtitle: cueAt(o.subtitles, (o.startFrame + i) * step * 1000)?.text ?? null } : {}),
      });
      inFlight.push(pool.encode(ctx.getImageData(0, 0, width, height).data, width, height, kind, budget));
      await drain(pool.size * 2 - 1);
      await new Promise((r) => setTimeout(r, 0));
    }
    await drain(0);
    await mov.finish();
    return { bytes: mov.bytesWritten, audio: withAudio };
  } finally {
    pool.close();
    await video?.close().catch(() => undefined);
  }
}
