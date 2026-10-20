/** P7 (DEC-0085): pure ProRes/MOV export rules – size estimate and safe limits. No browser APIs. */
import { L } from "./i18n";
import type { Rational } from "./time";

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

const gb = (n: number) => (n / 1024 ** 3).toLocaleString(L("nb-NO", "en-GB"), { maximumFractionDigits: 1 });

/** Null when the export may start; otherwise a clear message (never a silent fallback). */
export function proresLimitError(estimate: number, o: { readonly opfs: boolean; readonly available: number | null; readonly width: number; readonly height: number }): string | null {
  if (o.width > PRORES_MAX_SIDE || o.height > PRORES_MAX_SIDE || o.width < 1 || o.height < 1)
    return L(`ProRes støtter høyst ${PRORES_MAX_SIDE} piksler på hver side.`, `ProRes supports at most ${PRORES_MAX_SIDE} pixels per side.`);
  if (!o.opfs && estimate > PRORES_MEMORY_LIMIT)
    return L(
      `ProRes-filen blir omtrent ${gb(estimate)} GB. Uten lagring i nettleseren (OPFS) er grensen ${gb(PRORES_MEMORY_LIMIT)} GB. Velg et kortere utvalg, halv størrelse, eller bruk Chrome eller Edge.`,
      `The ProRes file will be about ${gb(estimate)} GB. Without browser storage (OPFS) the limit is ${gb(PRORES_MEMORY_LIMIT)} GB. Choose a shorter selection, half size, or use Chrome or Edge.`,
    );
  if (o.opfs && o.available !== null && estimate > o.available * PRORES_QUOTA_SHARE)
    return L(
      `ProRes-filen blir omtrent ${gb(estimate)} GB, men nettleseren har bare ${gb(o.available * PRORES_QUOTA_SHARE)} GB ledig til eksport. Velg et kortere utvalg eller frigjør plass.`,
      `The ProRes file will be about ${gb(estimate)} GB, but the browser has only ${gb(o.available * PRORES_QUOTA_SHARE)} GB free for export. Choose a shorter selection or free up space.`,
    );
  return null;
}

/** Message shown (and the choice locked) when this browser cannot run the ProRes encoder. */
export const PRORES_UNSUPPORTED = (): string =>
  L("ProRes kan ikke lages i denne nettleseren (mangler Web Workers). Velg et annet format.",
    "ProRes cannot be made in this browser (Web Workers are missing). Choose another format.");
