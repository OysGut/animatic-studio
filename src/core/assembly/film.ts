/**
 * Filmmontering (M4 del 1, mandat kap. 15, DEC-0043): den samlede filmen bygges fra den SAMME ordnede
 * listen av aktive sceneforekomster som manuset (INV-01). Det finnes ingen egen lagret filmrekkefølge –
 * flytting av en scene i filmtidslinjen er samme kommando som i manuset (MoveOccurrence, REQ-0018/0228).
 *
 * Hvert klipp er én aktiv scene. Materialet er scenens 2D-scene; scener uten 2D-scene vises som et
 * tittelkort med beregnet lengde fra manuset, så monteringen fungerer også når produksjonen er
 * ufullstendig (REQ-0240). Tidskoder beregnes alltid på nytt og lagres aldri (ADR-0006).
 */
import type { CompositionId, OccurrenceId, SceneId, VariantId } from "../ids";
import type { Composition, ProjectState, SceneHeading } from "../model";
import { estimateProduction } from "../screenplay/duration";
import { msToFramesCeil, secondsToFrames } from "../time";
import { sceneAudioEndMs } from "../audio";
import { activeStructure } from "../views";

/** Hva klippet viser: scenens 2D-scene, eller et tittelkort fordi 2D-scenen ikke er laget ennå. */
export type FilmClipSource = "composition" | "placeholder";

export interface FilmClip {
  readonly occurrenceId: OccurrenceId;
  readonly sceneId: SceneId;
  readonly variantId: VariantId;
  readonly compositionId: CompositionId | null;
  readonly source: FilmClipSource;
  readonly heading: SceneHeading;
  readonly productionNumber: string | null;
  /** Første bilde i den samlede filmen. */
  readonly startFrame: number;
  readonly durationFrames: number;
  /** «set»: lengden er satt i 2D-scenen. «estimate»: beregnet fra manuset (usikker, mandat 7.2). */
  readonly durationKind: "set" | "estimate";
}

/** Korteste beregnede scenelengde (samme regel som i sceneeditoren). */
export const MIN_ESTIMATED_SCENE_SECONDS = 5;

/** Beregnet lengde i bilder per sceneforekomst i produksjonen, fra manuset (minst 5 sekunder). */
export function estimatedSceneFrames(s: ProjectState, productionId: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of estimateProduction(s, productionId).scenes)
    out.set(
      e.occurrenceId,
      Math.max(1, secondsToFrames(Math.max(MIN_ESTIMATED_SCENE_SECONDS, e.seconds), s.project.fps)),
    );
  return out;
}

/** 2D-scenen per variant (den første som ikke er slettet), bygget én gang. */
function compositionsByVariant(s: ProjectState): Map<string, Composition> {
  const out = new Map<string, Composition>();
  for (const c of Object.values(s.compositions)) {
    if (c.removed) continue;
    const prev = out.get(c.variantId);
    if (!prev || c.id.localeCompare(prev.id) < 0) out.set(c.variantId, c);
  }
  return out;
}

const cache = new WeakMap<ProjectState, Map<string, FilmClip[]>>();

/** Klippene i filmen, i samme rekkefølge som manuset. Deaktiverte scener er ikke med (mandat 2). */
export function filmClips(s: ProjectState, productionId: string): FilmClip[] {
  let byProd = cache.get(s);
  const hit = byProd?.get(productionId);
  if (hit) return hit;
  const estimates = estimatedSceneFrames(s, productionId);
  const audioEnd = sceneAudioEndMs(s);
  const comps = compositionsByVariant(s);
  let cursor = 0;
  const clips = activeStructure(s, productionId).map((o): FilmClip => {
    const c = comps.get(o.variantId) ?? null;
    // Uten satt lengde: beregnet fra manuset, men aldri kortere enn lyden i scenen (DEC-0044)
    const estimate = Math.max(
      estimates.get(o.id) ?? secondsToFrames(MIN_ESTIMATED_SCENE_SECONDS, s.project.fps),
      msToFramesCeil(audioEnd.get(o.id) ?? 0, s.project.fps),
    );
    const set = c !== null && c.durationFrames > 0;
    const durationFrames = set ? c.durationFrames : estimate;
    const clip: FilmClip = {
      occurrenceId: o.id,
      sceneId: o.sceneId,
      variantId: o.variantId,
      compositionId: c?.id ?? null,
      source: c ? "composition" : "placeholder",
      heading: s.variants[o.variantId]?.heading ?? { intExt: "", location: "", time: "" },
      productionNumber: o.productionNumber,
      startFrame: cursor,
      durationFrames,
      durationKind: set ? "set" : "estimate",
    };
    cursor += durationFrames;
    return clip;
  });
  if (!byProd) {
    byProd = new Map();
    cache.set(s, byProd);
  }
  byProd.set(productionId, clips);
  return clips;
}

/** Filmens lengde i bilder. */
export function filmDurationFrames(clips: readonly FilmClip[]): number {
  const last = clips[clips.length - 1];
  return last ? last.startFrame + last.durationFrames : 0;
}

/** Klippet som vises på et bilde i filmen, og bildet inne i scenen. Utenfor filmen: nærmeste ende. */
export function clipAtFrame(
  clips: readonly FilmClip[],
  frame: number,
): { readonly clip: FilmClip; readonly index: number; readonly localFrame: number } | null {
  if (clips.length === 0) return null;
  let lo = 0;
  let hi = clips.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (clips[mid]!.startFrame <= frame) lo = mid;
    else hi = mid - 1;
  }
  const clip = clips[lo]!;
  const localFrame = Math.max(0, Math.min(clip.durationFrames - 1, frame - clip.startFrame));
  return { clip, index: lo, localFrame };
}

/** Hva som eksporteres (mandat 29.1): hele filmen, én scene eller et sammenhengende utvalg av scener. */
export type FilmRange =
  | { readonly kind: "film" }
  | { readonly kind: "scenes"; readonly fromOccurrenceId: string; readonly toOccurrenceId: string };

/** Bildene [start, end) og klippene et utvalg dekker. Ukjente scener gir tomt utvalg. */
export function filmRange(
  clips: readonly FilmClip[],
  range: FilmRange,
): { readonly startFrame: number; readonly endFrame: number; readonly clips: readonly FilmClip[] } {
  if (range.kind === "film") return { startFrame: 0, endFrame: filmDurationFrames(clips), clips };
  let a = clips.findIndex((c) => c.occurrenceId === range.fromOccurrenceId);
  let b = clips.findIndex((c) => c.occurrenceId === range.toOccurrenceId);
  if (a < 0 || b < 0) return { startFrame: 0, endFrame: 0, clips: [] };
  if (b < a) [a, b] = [b, a];
  const sel = clips.slice(a, b + 1);
  const first = sel[0]!;
  const last = sel[sel.length - 1]!;
  return {
    startFrame: first.startFrame,
    endFrame: last.startFrame + last.durationFrames,
    clips: sel,
  };
}
