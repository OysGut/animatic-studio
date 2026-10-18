/**
 * QR-deling av en ferdig filmversjon (GP5, spes. §29–35). Plattformnøytral: hvilke filer som kan deles
 * (mp4 med H.264 og AAC, høyst 500 MB), varighetene og statusen som vises.
 */
import { L } from "./i18n";

/** Største fil som kan deles (§34). */
export const MAX_SHARE_BYTES = 500 * 1024 * 1024;

/** Varigheten brukeren velger: 7 dager, 30 dager eller til den trekkes tilbake (null). */
export const SHARE_DAYS = [7, 30, null] as const;
export type ShareDays = (typeof SHARE_DAYS)[number];
export const DEFAULT_SHARE_DAYS: ShareDays = 30;

export interface ShareableFile {
  readonly mimeType: string;
  /** Videokodeken fra eksporten («avc» = H.264). */
  readonly codec: string;
  /** Lydkodeken, eller null uten lyd. */
  readonly audioCodec: string | null;
  readonly bytes: number;
}

export type ShareIneligible = "format" | "video_codec" | "audio_codec" | "too_large" | "empty";

/** Kan filen deles på mobil? iPhone spiller bare mp4 med H.264 og AAC. Ingen omkoding på serveren. */
export function shareEligibility(f: ShareableFile): { ok: true } | { ok: false; reason: ShareIneligible } {
  if (f.bytes <= 0) return { ok: false, reason: "empty" };
  if (f.mimeType.split(";")[0]!.trim() !== "video/mp4") return { ok: false, reason: "format" };
  if (f.codec !== "avc") return { ok: false, reason: "video_codec" };
  if (f.audioCodec !== null && f.audioCodec !== "aac") return { ok: false, reason: "audio_codec" };
  if (f.bytes > MAX_SHARE_BYTES) return { ok: false, reason: "too_large" };
  return { ok: true };
}

export function shareIneligibleText(reason: ShareIneligible): string {
  switch (reason) {
    case "format":
    case "video_codec":
      return L(
        "Filmen må eksporteres som MP4 med H.264 for å kunne deles på mobil. Velg MP4 i eksporten. Hvis nettleseren ikke kan lage H.264, bruk Chrome, Edge eller Safari.",
        "The film must be exported as MP4 with H.264 to be shared on mobile. Choose MP4 in the export. If the browser cannot make H.264, use Chrome, Edge or Safari.",
      );
    case "audio_codec":
      return L(
        "Lyden må være AAC for at filmen skal spille på iPhone. Denne nettleseren laget en annen lydkodek; eksporter på nytt i Chrome, Edge eller Safari.",
        "The sound must be AAC for the film to play on iPhone. This browser made another audio codec; export again in Chrome, Edge or Safari.",
      );
    case "too_large":
      return L(
        "Filen er større enn 500 MB. Eksporter i halv størrelse eller et kortere utvalg for å dele den.",
        "The file is larger than 500 MB. Export at half size or a shorter selection to share it.",
      );
    case "empty":
      return L("Filen er tom.", "The file is empty.");
  }
}

export type ShareRowStatus = "uploading" | "ready" | "revoked";

/** Statusen som vises (§35). QR vises som fungerende bare for «available». */
export type ShareStatus = "uploading" | "available" | "expired" | "revoked";

export function shareStatus(
  s: { readonly status: ShareRowStatus; readonly expiresAt: string | null },
  now: Date = new Date(),
): ShareStatus {
  if (s.status === "revoked") return "revoked";
  if (s.status === "uploading") return "uploading";
  if (s.expiresAt && Date.parse(s.expiresAt) <= now.getTime()) return "expired";
  return "available";
}

export function shareStatusText(s: ShareStatus): string {
  switch (s) {
    case "uploading":
      return L("Lastes opp – ikke delt ennå", "Uploading – not shared yet");
    case "available":
      return L("Tilgjengelig via QR", "Available via QR");
    case "expired":
      return L("Utløpt – ikke lenger delt", "Expired – no longer shared");
    case "revoked":
      return L("Trukket tilbake – ikke lenger delt", "Revoked – no longer shared");
  }
}

/** Nøkkelen i lenken: 64 heksadesimale tegn. */
export const SHARE_TOKEN = /^[0-9a-f]{64}$/;

export function shareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/se/${token}`;
}
