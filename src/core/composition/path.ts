/**
 * Hjelpere for bevegelsesbaner (DEC-0052, REQ-0581): fra frihåndstegning til en bane med få punkter,
 * «Glatt ut», rett linje og flytting av hele banen.
 */
import type { MotionPath, PathPoint } from "../model";

interface Pt {
  readonly x: number;
  readonly y: number;
}

const MAX_POINTS = 500;

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Ramer–Douglas–Peucker: færre punkter som ligger innenfor `tolerance` av den tegnede streken. */
export function simplifyPoints(points: readonly Pt[], tolerance: number): Pt[] {
  if (points.length <= 2) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let best = -1;
    let bestD = tolerance;
    for (let k = i + 1; k < j; k++) {
      const d = distToSegment(points[k]!, points[i]!, points[j]!);
      if (d > bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best >= 0) {
      keep[best] = true;
      stack.push([i, best], [best, j]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const round = (v: number) => Math.round(v * 10) / 10;

/**
 * En bane fra en frihåndstegning. Punktene forenkles (toleransen er i scenens piksler) og blir kurvede.
 * Gir null når tegningen er for kort til å bli en bane.
 */
export function pathPointsFromDrawing(raw: readonly Pt[], tolerance = 4): PathPoint[] | null {
  const pts = raw.filter(
    (p, i) => i === 0 || Math.hypot(p.x - raw[i - 1]!.x, p.y - raw[i - 1]!.y) > 0.5,
  );
  if (pts.length < 2) return null;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const extent = Math.max(...pts.map((p) => Math.hypot(p.x - first.x, p.y - first.y)));
  if (extent < 2) return null;
  let tol = tolerance;
  let simple = simplifyPoints(pts, tol);
  while (simple.length > MAX_POINTS) {
    tol *= 2;
    simple = simplifyPoints(pts, tol);
  }
  if (simple.length < 2) simple = [first, last];
  return simple.map((p) => ({ x: round(p.x), y: round(p.y), smooth: true }));
}

/** «Glatt ut»: færre punkter og myke kurver gjennom alle (toleransen øker med banens størrelse). */
export function smoothPathPoints(points: readonly PathPoint[]): PathPoint[] {
  if (points.length <= 2) return points.map((p) => ({ ...p, smooth: true }));
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const simple = simplifyPoints(points, Math.max(4, size * 0.03));
  return simple.map((p) => ({ x: p.x, y: p.y, smooth: true }));
}

/** Rett linje fra banens start til slutt. */
export function straightPathPoints(points: readonly PathPoint[]): PathPoint[] {
  const a = points[0]!;
  const b = points[points.length - 1]!;
  return [
    { x: a.x, y: a.y, smooth: false },
    { x: b.x, y: b.y, smooth: false },
  ];
}

/** Hele banen flyttet. */
export function translatePath(path: MotionPath, dx: number, dy: number): MotionPath {
  return {
    ...path,
    points: path.points.map((p) => ({ ...p, x: round(p.x + dx), y: round(p.y + dy) })),
  };
}

/** Ny bane: starter på `frame` og varer i to sekunder (eller til scenen slutter). */
export function newMotionPath(
  points: readonly PathPoint[],
  frame: number,
  durationFrames: number,
  fps: number,
): MotionPath {
  const start = Math.max(0, Math.min(frame, Math.max(0, durationFrames - 2)));
  const end = Math.max(start + 1, Math.min(durationFrames - 1, start + Math.round(fps * 2)));
  return { points, startFrame: start, endFrame: end, easeOut: 0, easeIn: 0, tempo: [] };
}
