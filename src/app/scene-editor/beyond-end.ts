/**
 * Nøkkelbilder og kamerautsnitt etter scenens slutt (KI-44): når scenen kortes ned, ligger de igjen utenfor
 * tidslinjen. Ingenting slettes automatisk; sceneeditoren varsler og lar brukeren velge dem.
 */
import { layersOf, type Composition, type ProjectState } from "@/core";

export interface BeyondEndLayer {
  readonly layerId: string;
  readonly name: string;
  /** Bildene (sortert) med nøkkelbilder etter siste bilde i scenen. */
  readonly frames: readonly number[];
}

export interface BeyondEndShot {
  readonly shotId: string;
  readonly name: string;
  readonly startFrame: number;
  readonly endFrame: number;
  /** Hele utsnittet ligger etter slutten (ellers går det bare forbi). */
  readonly entirely: boolean;
}

export interface BeyondEnd {
  readonly layers: readonly BeyondEndLayer[];
  readonly shots: readonly BeyondEndShot[];
  readonly keyframeCount: number;
  /** Siste bilde noe av dette bruker: scenen må være minst så lang (+1) for å vise alt. */
  readonly maxFrame: number;
}

/** Hva som ligger etter scenens siste bilde (`durationFrames - 1`). */
export function beyondEnd(
  state: ProjectState,
  composition: Composition,
  durationFrames: number,
): BeyondEnd {
  const last = Math.max(0, durationFrames - 1);
  let maxFrame = last;
  let keyframeCount = 0;
  const layers: BeyondEndLayer[] = [];
  for (const l of layersOf(state, composition.id)) {
    const frames = [...new Set(l.keyframes.map((k) => k.frame))]
      .filter((f) => f > last)
      .sort((a, b) => a - b);
    if (!frames.length) continue;
    keyframeCount += frames.length;
    maxFrame = Math.max(maxFrame, frames[frames.length - 1]!);
    layers.push({ layerId: l.id, name: l.name, frames });
  }
  const shots: BeyondEndShot[] = composition.camera.shots
    .filter((sh) => sh.endFrame > last)
    .map((sh) => {
      maxFrame = Math.max(maxFrame, sh.endFrame);
      return {
        shotId: sh.id,
        name: sh.name,
        startFrame: sh.startFrame,
        endFrame: sh.endFrame,
        entirely: sh.startFrame > last,
      };
    });
  return { layers, shots, keyframeCount, maxFrame };
}
