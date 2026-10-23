/**
 * Avstandsmerkene langs en bevegelsesbane (spacing): ett merke per bilde, med hvor langt (0–1 av
 * strekningen) laget har kommet. Samme funksjon gir merkene i scenen og sporet på tidslinjen, så de
 * aldri kan være ulike. Ren funksjon uten nettleser-API.
 */
import { pathPointAt, pathProgress } from "../composition/render";
import type { MotionPath } from "../model";

export interface PathSpacingMark {
  readonly frame: number;
  /** Andel av strekningen langs banen (arc length), 0–1. */
  readonly progress: number;
  readonly x: number;
  readonly y: number;
  /** Start, slutt, tempopunkt eller lagets nøkkelbilde. */
  readonly key: boolean;
  /** Står stille siden forrige bilde (hold, eller toere). */
  readonly held: boolean;
}

/** Flere bilder enn dette tegnes ikke som enkeltmerker (ytelse). */
export const MAX_SPACING_MARKS = 2000;

export function pathSpacingMarks(path: MotionPath, keyFrames: readonly number[] = []): PathSpacingMark[] {
  const start = Math.round(path.startFrame);
  const end = Math.round(path.endFrame);
  if (end <= start) return [];
  const span = end - start;
  const keys = new Set<number>([start, end, ...path.tempo.map((q) => Math.round(start + q.t * span)), ...keyFrames]);
  const step = Math.max(1, Math.ceil((span + 1) / MAX_SPACING_MARKS));
  const out: PathSpacingMark[] = [];
  for (let f = start; f <= end; f += step) {
    const progress = pathProgress(path, f);
    const p = pathPointAt(path, progress);
    const prev = out.at(-1);
    out.push({ frame: f, progress, x: p.x, y: p.y, key: keys.has(f), held: !!prev && Math.abs(progress - prev.progress) < 1e-6 });
  }
  return out;
}
