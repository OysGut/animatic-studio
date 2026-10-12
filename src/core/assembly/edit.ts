/**
 * Klipping i monteringen (DEC-0048, REQ-0220–0222): trimme, splitte og fjerne deler av et klipp. Rene
 * funksjoner som lager delelisten til kommandoen SetSceneEdit; kildemediet endres aldri.
 */
import type { ClipPartFields } from "../commands/types";
import type { ClipPartId, TakeId } from "../ids";
import type { Rational } from "../time";
import type { FilmClip } from "./film";

/** Korteste del (ms). */
export const MIN_PART_MS = 40;

const msOf = (frames: number, fps: Rational) => Math.round((frames * 1000 * fps.den) / fps.num);

/** Delene i et klipp som kommando-felter. Et klipp uten lagrede deler får én ny del (ny id). */
export function editableParts(clip: FilmClip, newId: () => string): ClipPartFields[] | null {
  if (clip.parts.some((p) => p.source === "placeholder")) return null;
  return clip.parts.map((p, i) => ({
    partId: (p.id ?? newId()) as ClipPartId,
    source: p.source === "take" ? "take" : "composition",
    takeId: p.source === "take" ? (p.take!.id as TakeId) : null,
    inMs: p.inMs,
    outMs: p.outMs,
    // Myk overgang inn i delen (DEC-0071); aldri på første del
    ...(i > 0 && p.transitionMs ? { transitionMs: p.transitionMs } : {}),
  }));
}

/** Sett myk overgang inn i del `i` (0 = hardt kutt). DEC-0071. */
export function setPartTransition(
  parts: readonly ClipPartFields[],
  i: number,
  ms: number,
): ClipPartFields[] | null {
  if (i <= 0 || i >= parts.length) return null;
  const p = parts[i]!;
  const prev = parts[i - 1]!;
  // Aldri lengre enn noen av de to delene
  const max = Math.min(p.outMs - p.inMs, prev.outMs - prev.inMs);
  const v = Math.max(0, Math.min(Math.round(ms), max));
  const { transitionMs: _old, ...rest } = p;
  return parts.map((x, k) => (k === i ? (v > 0 ? { ...rest, transitionMs: v } : rest) : x));
}

/** Splitter delen under bildet `localFrame` i to (null hvis bildet er på en grense eller ikke kan splittes). */
export function splitParts(
  clip: FilmClip,
  localFrame: number,
  fps: Rational,
  newId: () => string,
): ClipPartFields[] | null {
  const parts = editableParts(clip, newId);
  if (!parts) return null;
  const i = clip.parts.findIndex(
    (p) => localFrame > p.startFrame && localFrame < p.startFrame + p.durationFrames,
  );
  if (i < 0) return null;
  const r = clip.parts[i]!;
  const p = parts[i]!;
  const cut = p.inMs + msOf(localFrame - r.startFrame, fps);
  if (cut - p.inMs < MIN_PART_MS || p.outMs - cut < MIN_PART_MS) return null;
  return [
    ...parts.slice(0, i),
    { ...p, outMs: cut },
    // Den nye andre halvdelen fortsetter rett på (ingen overgang inn)
    (({ transitionMs: _t, ...rest }) => ({ ...rest, partId: newId() as ClipPartId, inMs: cut }))(p),
    ...parts.slice(i + 1),
  ];
}

/**
 * Ny inn- og utpunkt for del nr. `index` (ms i kilden). Holdes innenfor [0, maxMs] og minst MIN_PART_MS lang.
 */
export function trimPart(
  parts: readonly ClipPartFields[],
  index: number,
  change: { readonly inMs?: number; readonly outMs?: number },
  maxMs: number,
): ClipPartFields[] {
  return parts.map((p, i) => {
    if (i !== index) return p;
    let inMs = Math.round(change.inMs ?? p.inMs);
    let outMs = Math.round(change.outMs ?? p.outMs);
    inMs = Math.max(0, Math.min(inMs, maxMs - MIN_PART_MS));
    outMs = Math.max(inMs + MIN_PART_MS, Math.min(outMs, maxMs));
    return { ...p, inMs, outMs };
  });
}

/** Fjerner del nr. `index` (null hvis det er den eneste). */
export function removePart(
  parts: readonly ClipPartFields[],
  index: number,
): ClipPartFields[] | null {
  if (parts.length <= 1) return null;
  return parts.filter((_, i) => i !== index);
}

/** Bytter kilde for del nr. `index`; lengden beholdes så langt kilden rekker. */
export function setPartSource(
  parts: readonly ClipPartFields[],
  index: number,
  source: { readonly takeId: string | null },
  maxMs: number,
): ClipPartFields[] {
  return parts.map((p, i) => {
    if (i !== index) return p;
    const len = p.outMs - p.inMs;
    const inMs = Math.max(0, Math.min(p.inMs, maxMs - MIN_PART_MS));
    return {
      ...p,
      source: source.takeId ? "take" : "composition",
      takeId: (source.takeId ?? null) as TakeId | null,
      inMs,
      outMs: Math.min(maxMs, inMs + len),
    };
  });
}

/**
 * Forslag til hvor en lang film skal deles mellom scenene (DEC-0048): etter scenenes nåværende lengde,
 * skalert til filmens lengde. Gir starttiden (ms i filmen) for hver scene.
 */
export function proposeCuts(sceneFrames: readonly number[], filmMs: number): number[] {
  const total = sceneFrames.reduce((a, b) => a + Math.max(1, b), 0);
  const out: number[] = [];
  let acc = 0;
  for (const f of sceneFrames) {
    out.push(Math.round((acc / total) * filmMs));
    acc += Math.max(1, f);
  }
  return out;
}

/**
 * Utsnittene [inMs, outMs) for hver scene fra starttidene. null hvis tidene ikke stiger, er utenfor filmen
 * eller gir en del kortere enn MIN_PART_MS.
 */
export function cutsToRanges(
  starts: readonly number[],
  filmMs: number,
): { readonly inMs: number; readonly outMs: number }[] | null {
  const out: { inMs: number; outMs: number }[] = [];
  for (let i = 0; i < starts.length; i++) {
    const inMs = Math.round(starts[i]!);
    const outMs = Math.round(i + 1 < starts.length ? starts[i + 1]! : filmMs);
    if (!Number.isFinite(inMs) || inMs < 0 || outMs > filmMs || outMs - inMs < MIN_PART_MS)
      return null;
    out.push({ inMs, outMs });
  }
  return out;
}
