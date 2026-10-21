/**
 * QR-deling av en ferdig filmversjon (GP5, spes. §29–35). Plattformnøytral: hvilke filer som kan deles
 * (mp4 med H.264 og AAC, høyst 500 MB), varighetene og statusen som vises.
 */

import { t } from "@/core/i18n/keyed";

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
      return t("core-film-share.share-ineligible-text.message.9688dad34837");
    case "audio_codec":
      return t("core-film-share.share-ineligible-text.message.ba69ffaeb8fb");
    case "too_large":
      return t("core-film-share.share-ineligible-text.message.0a62bcc9800d");
    case "empty":
      return t("core-film-share.share-ineligible-text.message.6610dec83728");
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
      return t("core-film-share.share-status-text.message.1f725d557ca7");
    case "available":
      return t("core-film-share.share-status-text.message.b7c23fe8316a");
    case "expired":
      return t("core-film-share.share-status-text.message.ba1800731bb6");
    case "revoked":
      return t("core-film-share.share-status-text.message.61e0f8a61b44");
  }
}

/** Nøkkelen i lenken: 64 heksadesimale tegn. */
export const SHARE_TOKEN = /^[0-9a-f]{64}$/;

export function shareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/se/${token}`;
}
