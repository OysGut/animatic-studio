/**
 * Bildesegmenter i et lag (Asset Studio AS2, A1): lagets eget bilde fra starten og ett segment per bildeskifte
 * (ImageSwap). Laget er fortsatt ett objekt med samme identitet; segmentene er bare en annen visning av
 * bildeskiftene. Alle operasjoner er rene og gir nye LayerFields til UpdateLayers. Fjerning fjerner byttet,
 * aldri bildet i biblioteket.
 */
import type { LayerFields } from "../commands/types";
import type { ImageSwap } from "../model";

export interface SegmentImage {
  readonly assetId: string;
  readonly assetVariantId: string | null;
  readonly versionId: string | null;
}

export interface ImageSegment {
  /** 0 = lagets eget bilde; i ≥ 1 = bildeskifte nr. i (swaps[i - 1]). */
  readonly index: number;
  readonly start: number;
  /** Første bilde etter segmentet (eksklusiv). */
  readonly end: number;
  readonly image: SegmentImage | null;
  readonly transition: ImageSwap["transition"] | null;
}

type Fields = Pick<LayerFields, "assetId" | "assetVariantId" | "versionId" | "swaps">;

const sorted = (list: readonly ImageSwap[]) => [...list].sort((a, b) => a.frame - b.frame);

export function segmentsOf(f: Fields, durationFrames: number): ImageSegment[] {
  const swaps = sorted(f.swaps);
  const end = Math.max(1, durationFrames);
  const out: ImageSegment[] = [
    {
      index: 0,
      start: 0,
      end: swaps[0]?.frame ?? end,
      image: f.assetId
        ? { assetId: f.assetId, assetVariantId: f.assetVariantId, versionId: f.versionId }
        : null,
      transition: null,
    },
  ];
  swaps.forEach((w, i) =>
    out.push({
      index: i + 1,
      start: w.frame,
      end: swaps[i + 1]?.frame ?? Math.max(end, w.frame + 1),
      image: { assetId: w.assetId, assetVariantId: w.assetVariantId, versionId: w.versionId },
      transition: w.transition ?? null,
    }),
  );
  return out;
}

/** Krysstoningene kortes ned så de aldri er lengre enn bildet før. */
function fitTransitions(swaps: ImageSwap[]): ImageSwap[] {
  return swaps.map((w, i) => {
    if (!w.transition) return w;
    const gap = w.frame - (i > 0 ? swaps[i - 1]!.frame : 0);
    return w.transition.frames > gap
      ? { ...w, transition: { ...w.transition, frames: Math.max(1, gap) } }
      : w;
  });
}

function withSwaps<F extends Fields>(f: F, swaps: ImageSwap[]): F {
  return { ...f, swaps: fitTransitions(sorted(swaps)) };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

/**
 * Legg inn et bilde fra `frame` (dra fra variantstripen). På bilde 0 erstattes lagets eget bilde; på et
 * bilde med et bytte erstattes byttets bilde. Ellers kommer det et nytt bytte.
 */
export function insertSegment<F extends Fields>(f: F, frame: number, img: SegmentImage): F {
  const at = Math.max(0, Math.round(frame));
  if (at === 0) return replaceSegment(f, 0, img);
  const swaps = sorted(f.swaps);
  const i = swaps.findIndex((w) => w.frame === at);
  const swap: ImageSwap = {
    frame: at,
    assetId: img.assetId as never,
    assetVariantId: img.assetVariantId as never,
    versionId: img.versionId as never,
  };
  if (i >= 0) swaps[i] = { ...swap, ...(swaps[i]!.transition ? { transition: swaps[i]!.transition } : {}) };
  else swaps.push(swap);
  return withSwaps(f, swaps);
}

/** Erstatt bildet i et segment (samme tid). */
export function replaceSegment<F extends Fields>(f: F, index: number, img: SegmentImage): F {
  if (index === 0)
    return {
      ...f,
      assetId: img.assetId as never,
      assetVariantId: img.assetVariantId as never,
      versionId: img.versionId as never,
    };
  const swaps = sorted(f.swaps);
  const w = swaps[index - 1];
  if (!w) return f;
  swaps[index - 1] = {
    ...w,
    assetId: img.assetId as never,
    assetVariantId: img.assetVariantId as never,
    versionId: img.versionId as never,
  };
  return withSwaps(f, swaps);
}

/**
 * Flytt et segment (hele segmentet, samme lengde): starten og byttet etter flyttes like mye, innenfor
 * nabosegmentene. Lagets eget bilde (0) starter alltid på 0 og kan ikke flyttes.
 */
export function moveSegment<F extends Fields>(
  f: F,
  index: number,
  newStart: number,
  durationFrames: number,
): F {
  if (index < 1) return f;
  const swaps = sorted(f.swaps);
  const w = swaps[index - 1];
  if (!w) return f;
  const next = swaps[index];
  const after = swaps[index + 1];
  const prevStart = index >= 2 ? swaps[index - 2]!.frame : 0;
  const len = (next?.frame ?? durationFrames) - w.frame;
  const hi = next ? (after?.frame ?? durationFrames + 1) - 1 - len : durationFrames - 1;
  const start = clamp(newStart, prevStart + 1, Math.max(prevStart + 1, hi));
  const delta = start - w.frame;
  swaps[index - 1] = { ...w, frame: start };
  if (next) swaps[index] = { ...next, frame: next.frame + delta };
  return withSwaps(f, swaps);
}

/** Trim slutten av et segment: flytter byttet etter (innenfor nabosegmentene). Siste segment: uendret. */
export function trimSegment<F extends Fields>(f: F, index: number, newEnd: number): F {
  const swaps = sorted(f.swaps);
  const next = swaps[index];
  if (!next) return f;
  const start = index >= 1 ? swaps[index - 1]!.frame : 0;
  const limit = swaps[index + 1]?.frame ?? Number.MAX_SAFE_INTEGER;
  swaps[index] = { ...next, frame: clamp(newEnd, start + 1, limit - 1) };
  return withSwaps(f, swaps);
}

/**
 * Fjern et segment: byttet fjernes, og segmentet før fortsetter. Fjernes lagets eget bilde (0), tar det
 * første byttets bilde over fra starten. Bildet i biblioteket berøres aldri. null når laget bare har ett.
 */
export function removeSegment<F extends Fields>(f: F, index: number): F | null {
  const swaps = sorted(f.swaps);
  if (index === 0) {
    const first = swaps[0];
    if (!first) return null;
    return withSwaps(
      {
        ...f,
        assetId: first.assetId,
        assetVariantId: first.assetVariantId,
        versionId: first.versionId,
      },
      swaps.slice(1),
    );
  }
  if (!swaps[index - 1]) return f;
  swaps.splice(index - 1, 1);
  return withSwaps(f, swaps);
}

/** Overgangen inn i et segment: kutt (null) eller krysstoning med varighet (kortes ned til bildet før). */
export function setSegmentTransition<F extends Fields>(
  f: F,
  index: number,
  frames: number | null,
): F {
  if (index < 1) return f;
  const swaps = sorted(f.swaps);
  const w = swaps[index - 1];
  if (!w) return f;
  const { transition: _t, ...rest } = w;
  swaps[index - 1] =
    frames === null || frames < 1
      ? rest
      : { ...rest, transition: { kind: "crossfade", frames: Math.round(frames) } };
  return withSwaps(f, swaps);
}
