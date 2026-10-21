/**
 * Import av ferdig film til en scene (M4 del 3, DEC-0047, REQ-0235/0238/0242): metadata leses i nettleseren
 * med mediabunny, filen lastes opp uendret til den private bøtta «assets» (kildematerialet bevares), og
 * versjonen lagres med AddTake. Feiler opplastingen, lagres ingenting.
 */
import { filmFilePath, ASSET_MAX_BYTES, FILM_MIME_TYPES, newId, secondsToFrames, type Rational, type TakeMedia } from "@/core";
import { ASSET_BUCKET, uploadFile } from "@/adapters/browser/storage-files";
import { safeFileName } from "@/app/library/asset-images";
import { t as tk } from "@/core/i18n/keyed";

/** Filtypene filmvelgerne godtar (MP4 med varianter, QuickTime og WebM). */
export const FILM_ACCEPT =
  "video/mp4,video/x-m4v,video/quicktime,video/webm,.mp4,.m4v,.mov,.qt,.webm";

/**
 * Filtype fra filnavnet og nettleserens oppgitte type, gjort om til de tre lagrede typene. Nettlesere oppgir
 * ulikt for samme fil (.m4v → «video/x-m4v», .mov kan være tom), så endelsen avgjør når typen er ukjent.
 */
export function mimeOf(file: Pick<File, "type" | "name">): string {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const t = file.type.toLowerCase();
  if (t === "video/quicktime" || ext === "mov" || ext === "qt") return "video/quicktime";
  if (t === "video/webm" || ext === "webm") return "video/webm";
  if (t === "video/mp4" || t === "video/x-m4v" || ext === "mp4" || ext === "m4v")
    return "video/mp4";
  return t || "ukjent"; // i18n-ignore – MIME-reserve, vises ikke
}

export function checkFilmFile(file: File): string | null {
  if (!FILM_MIME_TYPES.includes(mimeOf(file)))
    return tk("app-assembly-film-import.check-film-file.message.45169e5b6406");
  if (file.size > ASSET_MAX_BYTES)
    return tk("app-assembly-film-import.check-film-file.message.093fd30458d6");
  if (file.size === 0) return tk("app-assembly-film-import.check-film-file.message.a9ff3f3662ca");
  return null;
}

/** Feil som kan vises til brukeren rett (på brukerens språk). */
class FilmReadError extends Error {}

/** Leser lengde, oppløsning, bildefrekvens og kodeker fra filen. Kaster med en feilmelding for brukeren. */
export async function readFilmMetadata(file: File): Promise<TakeMedia> {
  const mb = await import("mediabunny");
  return readMeta(mb, new mb.BlobSource(file), file);
}

/**
 * Samme som readFilmMetadata, men for en fil som allerede ligger i lagringen (f.eks. en video fra mobilen,
 * DEC-0090): leses med en midlertidig lenke, bare de delene som trengs (ikke hele filen).
 */
export async function readFilmMetadataFromUrl(
  url: string,
  file: { readonly name: string; readonly type: string; readonly size: number },
): Promise<TakeMedia> {
  const mb = await import("mediabunny");
  return readMeta(mb, new mb.UrlSource(url), file);
}

async function readMeta(
  mb: typeof import("mediabunny"),
  source: InstanceType<typeof import("mediabunny").Source>,
  file: { readonly name: string; readonly type: string; readonly size: number },
): Promise<TakeMedia> {
  const input = new mb.Input({ source, formats: mb.ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new FilmReadError(tk("app-assembly-film-import.read-meta.message.09b2442e1b5b"));
    // Kan nettleseren spille av bildene? (ProRes og HEVC kan ikke spilles i Chrome/Firefox)
    const playable = await video.canDecode().catch(() => true);
    if (!playable)
      throw new FilmReadError(
        tk("app-assembly-film-import.read-meta.message.223210237229", { value1: String(codecName(video.codec)) }),
      );
    const audio = await input.getPrimaryAudioTrack();
    const seconds = await input.computeDuration();
    if (!Number.isFinite(seconds) || seconds <= 0)
      throw new FilmReadError(
        tk("app-assembly-film-import.read-meta.message.57854b823303"),
      );
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
    if (e instanceof FilmReadError) throw e;
    throw new Error(
      tk("app-assembly-film-import.read-meta.message.4e88816e7eb5"),
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
  const mediaRef = filmFilePath(projectId, "source", takeId, safeFileName(file.name));
  const error = await uploadFile(ASSET_BUCKET, mediaRef, file, {
    contentType: media.mimeType,
    upsert: false,
  });
  if (error)
    throw new Error(
      tk("app-assembly-film-import.upload-film.message.8917e47b2aed", { message: String(error.message) }),
    );
  return {
    takeId,
    mediaRef,
    media,
    durationFrames: Math.max(1, secondsToFrames(media.durationMs / 1000, fps)),
  };
}

/** Kodeken med et navn folk kjenner igjen. */
function codecName(codec: string | null | undefined): string {
  switch (codec) {
    case "avc":
      return "H.264";
    case "hevc":
      return "HEVC (H.265)";
    case "vp8":
    case "vp9":
    case "av1":
      return codec.toUpperCase();
    case null:
    case undefined:
      return tk("app-assembly-film-import.codec-name.message.9387128eafbc");
    default:
      return /prores|apch|apcn|ap4h/i.test(codec) ? "ProRes" : codec;
  }
}
