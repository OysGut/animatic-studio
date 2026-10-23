/**
 * Medieformater i produksjonspakkene (PTG3 After Effects, PTG7 Nuke/Fusion). After Effects (og Nuke)
 * kan ikke importere WebM (VP8/VP9), Opus/OGG, WebP eller AVIF; ett slikt medium stoppet hele skriptet.
 * Her ligger hvitelisten og den rene planen for hva som skal konverteres og hvor resultatet havner.
 * Selve dekodingen og kodingen skjer i nettleseren (src/engine/export/media-convert.ts).
 * Ren TypeScript uten nettleser-API.
 *
 * Valg for video: PNG-sekvens (én PNG per bilde i egen mappe). Den importeres av alle AE-versjoner og
 * av Nuke/Fusion uten ekstra kodeker, og har tapsfri alfa. ProRes-MOV fra egen koder (ADR-0011) krever
 * Apples kodek i Windows-versjoner av AE eldre enn 2018 og er derfor ikke valgt.
 */
import type { FileRef, InterchangeDoc } from "./types";

/** Formatene After Effects importerer direkte (filendelse, små bokstaver). Alt annet konverteres. */
export const AE_SAFE_EXTENSIONS: readonly string[] = ["png", "jpg", "jpeg", "tif", "tiff", "psd", "mov", "mp4", "wav", "aif", "aiff", "mp3"];

export const CONVERTED_AUDIO_SAMPLE_RATE = 48000;
export const SEQUENCE_DIGITS = 5;

export const extensionOf = (path: string): string => {
  const base = path.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
};

export const isAeSafePath = (path: string): boolean => AE_SAFE_EXTENSIONS.includes(extensionOf(path));

/** Kaster hvis en mediefil i pakken har et format utenfor hvitelisten (siste kontroll før skriving). */
export function assertAeSafePaths(paths: readonly string[]): void {
  const bad = paths.filter(p => !isAeSafePath(p));
  // i18n-ignore: utviklerfeil (skal aldri nå brukeren; testene sikrer det)
  if (bad.length > 0) throw new Error(`Unsupported media format in package: ${bad.join(", ")}`);
}

export type MediaConversion =
  | { readonly kind: "image-png"; readonly ref: FileRef; readonly path: string }
  | { readonly kind: "audio-wav"; readonly ref: FileRef; readonly path: string; readonly sampleRate: number }
  | { readonly kind: "video-png-sequence"; readonly ref: FileRef; readonly dir: string; readonly path: string; readonly pattern: string };

/** Stien til bilde nr. `i` (0-basert) i en PNG-sekvens. */
export const sequenceFramePath = (c: { readonly dir: string; readonly ref: FileRef }, i: number): string =>
  `${c.dir}/${c.ref.id}_${String(i).padStart(SEQUENCE_DIGITS, "0")}.png`;

const VIDEO_EXT = new Set(["webm", "mkv", "ogv", "avi", "m4v", "wmv", "flv", "3gp"]);
const AUDIO_EXT = new Set(["opus", "ogg", "oga", "weba", "m4a", "aac", "flac", "wma", "caf"]);

function conversionFor(ref: FileRef, usedAsAudio: boolean): MediaConversion | null {
  if (isAeSafePath(ref.path)) return null;
  const mime = ref.mimeType.toLowerCase();
  const ext = extensionOf(ref.path);
  const stem = ref.path.slice(0, ref.path.length - ext.length - (ext ? 1 : 0));
  // Lyd bestemmes av bruken: opptak har ofte «video/webm» selv om det bare er lyd
  if (usedAsAudio || mime.startsWith("audio/") || AUDIO_EXT.has(ext)) {
    return { kind: "audio-wav", ref, path: `${stem}.wav`, sampleRate: CONVERTED_AUDIO_SAMPLE_RATE };
  }
  if (mime.startsWith("video/") || VIDEO_EXT.has(ext)) {
    const dir = stem;
    return { kind: "video-png-sequence", ref, dir, path: `${dir}/${ref.id}_${"0".repeat(SEQUENCE_DIGITS)}.png`, pattern: `${dir}/${ref.id}_%0${SEQUENCE_DIGITS}d.png` };
  }
  return { kind: "image-png", ref, path: `${stem}.png` };
}

export interface PackageMediaPlan {
  /** Dokumentet med stiene til de konverterte filene (sekvenser merket med `sequence`). */
  readonly doc: InterchangeDoc;
  /** Medier som kopieres uendret (allerede på hvitelisten). */
  readonly keep: readonly FileRef[];
  readonly convert: readonly MediaConversion[];
}

/**
 * Planlegger mediene en pakke bruker: lag og bildeskifter (`layers`), og lyd når `audio` er sann.
 * Hver fil ender på hvitelisten; dokumentets referanser peker på de konverterte filene.
 */
export function planPackageMedia(doc: InterchangeDoc, o: { readonly audio: boolean }): PackageMediaPlan {
  const visual = new Set<string>();
  const audio = new Set<string>();
  for (const s of doc.shots) {
    for (const l of s.layers) { if (l.fileId) visual.add(l.fileId); for (const w of l.swaps) if (w.fileId) visual.add(w.fileId); }
    if (o.audio) for (const a of s.audio) if (a.fileId) audio.add(a.fileId);
  }
  const keep: FileRef[] = [];
  const convert: MediaConversion[] = [];
  const references = doc.references.map((r): FileRef => {
    if (!visual.has(r.id) && !audio.has(r.id)) return r;
    const c = conversionFor(r, audio.has(r.id) && !visual.has(r.id));
    if (!c) { keep.push(r); return r; }
    convert.push(c);
    return { ...r, path: c.path, mimeType: c.kind === "audio-wav" ? "audio/wav" : "image/png", ...(c.kind === "video-png-sequence" ? { sequence: { pattern: c.pattern } } : {}) };
  });
  return { doc: { ...doc, references }, keep, convert };
}
