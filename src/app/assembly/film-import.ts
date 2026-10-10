/**
 * Import av ferdig film til en scene (M4 del 3, DEC-0047, REQ-0235/0238/0242): metadata leses i nettleseren
 * med mediabunny, filen lastes opp uendret til den private bøtta «assets» (kildematerialet bevares), og
 * versjonen lagres med AddTake. Feiler opplastingen, lagres ingenting.
 */
import {
  ASSET_MAX_BYTES,
  FILM_MIME_TYPES,
  newId,
  secondsToFrames,
  type Rational,
  type TakeMedia,
} from "@/core";
import { supabase } from "@/integrations/supabase/client";
import { ASSET_BUCKET, safeFileName } from "@/app/library/asset-images";

/** Filtype fra filnavnet når nettleseren ikke oppgir den (f.eks. .mov i enkelte nettlesere). */
function mimeOf(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.toLowerCase().split(".").pop();
  return ext === "mov" ? "video/quicktime" : ext === "webm" ? "video/webm" : "video/mp4";
}

export function checkFilmFile(file: File): string | null {
  if (!FILM_MIME_TYPES.includes(mimeOf(file)))
    return "Filmen må være MP4, MOV (QuickTime) eller WebM.";
  if (file.size > ASSET_MAX_BYTES) return "Filmen er større enn 2 GB.";
  if (file.size === 0) return "Filen er tom.";
  return null;
}

/** Leser lengde, oppløsning, bildefrekvens og kodeker fra filen. Kaster med norsk feilmelding. */
export async function readFilmMetadata(file: File): Promise<TakeMedia> {
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error("Filen har ingen video.");
    const audio = await input.getPrimaryAudioTrack();
    const seconds = await input.computeDuration();
    if (!Number.isFinite(seconds) || seconds <= 0)
      throw new Error("Filmens lengde kunne ikke leses.");
    let fps: number | null = null;
    try {
      const stats = await video.computePacketStats(120);
      fps = stats.averagePacketRate > 0 ? Math.round(stats.averagePacketRate * 1000) / 1000 : null;
    } catch {
      fps = null;
    }
    return {
      fileName: file.name.slice(-255) || "film",
      mimeType: mimeOf(file),
      byteSize: file.size,
      width: video.displayWidth || null,
      height: video.displayHeight || null,
      fps,
      durationMs: Math.max(1, Math.round(seconds * 1000)),
      videoCodec: video.codec ?? null,
      hasAudio: audio !== null,
    };
  } catch (e) {
    const m = (e as Error).message;
    throw new Error(
      /ingen video|lengde/i.test(m) ? m : "Filen kunne ikke leses som film. Prøv MP4 (H.264).",
    );
  } finally {
    (input as unknown as { dispose?: () => void }).dispose?.();
  }
}

export interface ImportedFilm {
  readonly takeId: string;
  readonly mediaRef: string;
  readonly media: TakeMedia;
  readonly durationFrames: number;
}

/** Leser og laster opp filmen. Lagrer ingenting i prosjektet (det gjør AddTake etterpå). */
export async function uploadFilm(
  projectId: string,
  file: File,
  fps: Rational,
): Promise<ImportedFilm> {
  const problem = checkFilmFile(file);
  if (problem) throw new Error(problem);
  const media = await readFilmMetadata(file);
  const takeId = newId<"take">();
  const mediaRef = `${projectId}/films/${takeId}/${safeFileName(file.name)}`;
  const { error } = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(mediaRef, file, { contentType: media.mimeType, upsert: false });
  if (error) throw new Error(`Filmen kunne ikke lastes opp: ${error.message}`);
  return {
    takeId,
    mediaRef,
    media,
    durationFrames: Math.max(1, secondsToFrames(media.durationMs / 1000, fps)),
  };
}
