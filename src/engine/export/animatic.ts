/**
 * Eksport av animatic i nettleseren (M4 del 1, mandat 14.2 og 29.1, REQ-0211/0213/0416, DEC-0043).
 * Hvert bilde tegnes med samme funksjon som avspillingen (drawFilmFrame) og kodes med WebCodecs gjennom
 * biblioteket mediabunny (MPL-2.0, ingen nettverkskall). Ingen generativ AI og ingen betalte tjenester.
 *
 * Format: MP4 (H.264) når nettleseren kan kode det, ellers WebM (VP9/AV1). Lyd (M4 del 2, DEC-0044) mikses
 * i biter på 20 sekunder med samme plassering som avspillingen og kodes som AAC eller Opus.
 * Bare på klienten.
 */
import type { AudioKind, FilmAudioItem, FilmClip, ProjectState, Rational } from "@/core";
import { type AudioBank, hasAudioIn, renderAudio } from "../audio/mixer";
import type { ImageSource } from "../compositor/canvas";
import { drawFilmFrame } from "../compositor/film";

export interface AnimaticExportOptions {
  readonly state: ProjectState;
  readonly clips: readonly FilmClip[];
  /** Bildene [startFrame, endFrame) i filmen. */
  readonly startFrame: number;
  readonly endFrame: number;
  /** Videoens størrelse i piksler (gjøres om til partall). */
  readonly width: number;
  readonly height: number;
  readonly fps: Rational;
  readonly images: ReadonlyMap<string, ImageSource>;
  readonly onProgress?: (done: number, total: number) => void;
  readonly signal?: AbortSignal;
  /** Lyden i filmen (tider i sekunder i den samlede filmen) og dekodede lydfiler. */
  readonly audio?: {
    readonly items: readonly FilmAudioItem[];
    readonly bank: AudioBank;
    readonly mutedKinds?: ReadonlySet<AudioKind>;
  };
}

export interface AnimaticFile {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly extension: string;
  readonly codec: string;
  /** Lydkodeken, eller null hvis videoen er uten lyd. */
  readonly audioCodec: string | null;
}

/** Lengden på hver lydbit som mikses om gangen (s). Holder minnebruken nede for lange filmer. */
const AUDIO_CHUNK = 20;
const SAMPLE_RATE = 48000;

/** Brukervennlig feil (vises som den er). */
export class ExportError extends Error {}

/** Kan nettleseren lage video her? (WebCodecs finnes ikke i alle nettlesere.) */
export function canExportVideo(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export async function exportAnimatic(o: AnimaticExportOptions): Promise<AnimaticFile> {
  if (!canExportVideo())
    throw new ExportError(
      "Nettleseren kan ikke lage video. Bruk en nyere utgave av Chrome, Edge, Safari eller Firefox.",
    );
  const total = o.endFrame - o.startFrame;
  if (total <= 0) throw new ExportError("Utvalget er tomt.");
  const width = even(o.width);
  const height = even(o.height);
  const mb = await import("mediabunny");
  const codec = await mb.getFirstEncodableVideoCodec(["avc", "vp9", "av1"], {
    width,
    height,
    quality: mb.QUALITY_HIGH,
  });
  if (!codec)
    throw new ExportError(
      `Nettleseren kan ikke kode video i ${width} × ${height}. Prøv halv størrelse, eller en annen nettleser.`,
    );
  const format = codec === "avc" ? new mb.Mp4OutputFormat() : new mb.WebMOutputFormat();
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format, target });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new ExportError("Kunne ikke tegne bildene (lerretet er ikke tilgjengelig).");

  const source = new mb.CanvasSource(canvas, { codec, quality: mb.QUALITY_HIGH });
  const fps = o.fps.num / o.fps.den;
  output.addVideoTrack(source, { frameRate: fps });
  const step = o.fps.den / o.fps.num;

  // Lyd: bare hvis det finnes hørbar lyd i utvalget og nettleseren kan kode den
  const from = o.startFrame * step;
  const seconds = total * step;
  const audible = o.audio
    ? o.audio.items.filter((it) => !o.audio!.mutedKinds?.has(it.clip.kind))
    : [];
  let audioSource: InstanceType<typeof mb.AudioBufferSource> | null = null;
  let audioCodec: string | null = null;
  if (o.audio && hasAudioIn(audible, o.audio.bank, from, from + seconds)) {
    const wanted = format
      .getSupportedAudioCodecs()
      .filter((c): c is "aac" | "opus" => c === "aac" || c === "opus");
    const ac = await mb.getFirstEncodableAudioCodec(wanted, {
      numberOfChannels: 2,
      sampleRate: SAMPLE_RATE,
      quality: mb.QUALITY_HIGH,
    });
    if (ac) {
      audioSource = new mb.AudioBufferSource({ codec: ac, quality: mb.QUALITY_HIGH });
      output.addAudioTrack(audioSource);
      audioCodec = ac;
    }
  }
  let audioDone = 0; // sekunder lyd som er lagt til
  const addAudioUntil = async (t: number) => {
    if (!audioSource || !o.audio) return;
    while (audioDone < Math.min(t, seconds) - 1e-9) {
      const len = Math.min(AUDIO_CHUNK, seconds - audioDone);
      const buf = await renderAudio(audible, o.audio.bank, from + audioDone, len, SAMPLE_RATE);
      await audioSource.add(buf);
      audioDone += len;
    }
  };

  try {
    await output.start();
    for (let i = 0; i < total; i++) {
      if (o.signal?.aborted) throw new DOMException("Avbrutt", "AbortError");
      // Lyden ligger litt foran bildet, så filen flettes jevnt
      if (i * step >= audioDone - 1) await addAudioUntil(i * step + AUDIO_CHUNK);
      drawFilmFrame(ctx, o.state, o.clips, o.startFrame + i, {
        width,
        height,
        images: o.images,
        placeholders: false,
      });
      await source.add(i * step, step);
      if (i % 6 === 0 || i === total - 1) {
        o.onProgress?.(i + 1, total);
        // Slipp til nettleseren av og til, så fremdriften vises og «Avbryt» virker
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await addAudioUntil(seconds);
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => undefined);
    throw e;
  }
  const buffer = target.buffer;
  if (!buffer) throw new ExportError("Videoen ble tom.");
  return {
    bytes: new Uint8Array(buffer),
    mimeType: format.mimeType,
    extension: format.fileExtension,
    codec,
    audioCodec,
  };
}

/**
 * Laster alle bildene før eksporten (avspillingen viser dem etter hvert; eksporten må ha dem fra første bilde).
 * `urls`: mediesti → signert lenke. Bilder som ikke kan lastes, meldes tilbake og utelates.
 */
export async function loadImages(
  urls: Readonly<Record<string, string>>,
): Promise<{ images: Map<string, ImageSource>; failed: string[] }> {
  const images = new Map<string, ImageSource>();
  const failed: string[] = [];
  await Promise.all(
    Object.entries(urls).map(async ([path, url]) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      try {
        await img.decode();
        images.set(path, img);
      } catch {
        failed.push(path);
      }
    }),
  );
  return { images, failed };
}
