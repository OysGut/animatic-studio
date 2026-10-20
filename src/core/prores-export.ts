/** P7 (DEC-0085): pure ProRes/MOV export rules – size estimate and safe limits. No browser APIs. */

import type { Rational } from "./time";
import { t } from "@/core/i18n/keyed";

export type ProResKind = "hq" | "4444";
/** Without OPFS the file is assembled in memory; stay well below what a browser tab survives. */
export const PRORES_MEMORY_LIMIT = 1024 ** 3;
/** With OPFS, keep this share of the free origin quota as headroom. */
export const PRORES_QUOTA_SHARE = 0.8;
export const PRORES_MAX_SIDE = 8192;
/** Conservative bytes per pixel and frame (measured on the built-in encoder, busy pictures). */
const BPP: Record<ProResKind, number> = { hq: 0.9, "4444": 1.6 };

export function proresBytesEstimate(width: number, height: number, frames: number, kind: ProResKind, fps: Rational, audio: boolean): number {
  const seconds = (frames * fps.den) / fps.num;
  return Math.ceil(width * height * BPP[kind] * frames + (audio ? seconds * 48000 * 4 : 0) + 64 * 1024 + frames * 32);
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
