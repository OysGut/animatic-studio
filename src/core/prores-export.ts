/** P7 (DEC-0085): pure ProRes/MOV export rules – size estimate and safe limits. No browser APIs. */

import type { Rational } from "./time";
import { t } from "@/core/i18n/keyed";

/** R4: ProRes-profilene. «hq» er standard for film; «4444» er profilen med alfa (lageksport). */
export type ProResKind = "proxy" | "lt" | "422" | "hq" | "4444";
export const PRORES_KINDS: readonly ProResKind[] = ["hq", "422", "lt", "proxy", "4444"];
/** Profilene filmeksporten tilbyr (uten alfa). */
export const PRORES_FILM_KINDS: readonly ProResKind[] = ["hq", "422", "lt", "proxy"];
export const PRORES_FOURCC: Record<ProResKind, string> = { proxy: "apco", lt: "apcs", "422": "apcn", hq: "apch", "4444": "ap4h" };
export const PRORES_NAME: Record<ProResKind, string> = {
  proxy: "Apple ProRes 422 Proxy", lt: "Apple ProRes 422 LT", "422": "Apple ProRes 422", hq: "Apple ProRes 422 HQ", "4444": "Apple ProRes 4444",
};
export function isProResKind(v: unknown): v is ProResKind {
  return typeof v === "string" && (PRORES_KINDS as readonly string[]).includes(v);
}
/** Without OPFS the file is assembled in memory; stay well below what a browser tab survives. */
export const PRORES_MEMORY_LIMIT = 1024 ** 3;
/** With OPFS, keep this share of the free origin quota as headroom. */
export const PRORES_QUOTA_SHARE = 0.8;
export const PRORES_MAX_SIDE = 8192;

/**
 * R4: Apples målbitrate i Mbit/s for 1920×1080 ved 29,97 bilder/s (Apple ProRes White Paper). 4444 er uten alfa;
 * alfakanalen kommer i tillegg og er tapsfri.
 */
export const PRORES_MBPS_1080P2997: Record<ProResKind, number> = { proxy: 45, lt: 102, "422": 147, hq: 220, "4444": 330 };

/**
 * R4: målbitrate (bit/s) for profil, oppløsning og bildefrekvens. Apples tabeller er i praksis proporsjonale med
 * antall piksler og bilder per sekund (f.eks. HQ 3840×2160 ved 29,97 = 884 Mbit/s, her 880).
 */
export function proresTargetBitrate(width: number, height: number, fps: Rational, kind: ProResKind): number {
  const rate = fps.num / fps.den;
  return PRORES_MBPS_1080P2997[kind] * 1e6 * ((width * height) / (1920 * 1080)) * (rate / (30000 / 1001));
}

/** R4: målstørrelse for ett bilde i byte (det koderen styrer etter). */
export function proresFrameBudget(width: number, height: number, fps: Rational, kind: ProResKind): number {
  return Math.max(256, Math.floor(proresTargetBitrate(width, height, fps, kind) / 8 / (fps.num / fps.den)));
}

/**
 * R4: estimert filstørrelse – målbitraten er et tak per bilde, så dette er det høyeste vi venter (enkle bilder blir
 * mindre). Alfa i 4444 kommer i tillegg (tapsfri, avhenger av bildet) og regnes konservativt.
 */
export function proresBytesEstimate(width: number, height: number, frames: number, kind: ProResKind, fps: Rational, audio: boolean, alpha = false): number {
  const seconds = (frames * fps.den) / fps.num;
  const alphaBytes = alpha ? width * height * 0.25 * frames : 0;
  return Math.ceil(proresFrameBudget(width, height, fps, kind) * frames + alphaBytes + (audio ? seconds * 48000 * 4 : 0) + 64 * 1024 + frames * 32);
}

/** R4: lesbar størrelse (MB/GB) til estimatet i eksportdialogene. */
export function formatBytes(n: number): string {
  const loc = t("core-prores-export.gb.n-1024-3-to-locale-string.6ad24fa5ef35");
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toLocaleString(loc, { maximumFractionDigits: 1 })} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toLocaleString(loc, { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(n / 1024)).toLocaleString(loc)} kB`;
}

const gb = (n: number) => (n / 1024 ** 3).toLocaleString(t("core-prores-export.gb.n-1024-3-to-locale-string.6ad24fa5ef35"), { maximumFractionDigits: 1 });

/** Null when the export may start; otherwise a clear message (never a silent fallback). */
export function proresLimitError(estimate: number, o: { readonly opfs: boolean; readonly available: number | null; readonly width: number; readonly height: number }): string | null {
  if (o.width > PRORES_MAX_SIDE || o.height > PRORES_MAX_SIDE || o.width < 1 || o.height < 1)
    return t("core-prores-export.prores-limit-error.message.c961855174fa", { PRORES_MAX_SIDE: String(PRORES_MAX_SIDE) });
  if (!o.opfs && estimate > PRORES_MEMORY_LIMIT)
    return t("core-prores-export.prores-limit-error.message.8c0818bd0b32", { value1: String(gb(estimate)), value2: String(gb(PRORES_MEMORY_LIMIT)) });
  if (o.opfs && o.available !== null && estimate > o.available * PRORES_QUOTA_SHARE)
    return t("core-prores-export.prores-limit-error.message.ec13018d6e2f", { value1: String(gb(estimate)), value2: String(gb(o.available * PRORES_QUOTA_SHARE)) });
  return null;
}

/** Message shown (and the choice locked) when this browser cannot run the ProRes encoder. */
export const PRORES_UNSUPPORTED = (): string =>
  t("core-prores-export.prores-unsupported.message.419c4ada7157");
