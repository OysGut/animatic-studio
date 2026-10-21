/**
 * B-100 runde 3: spacing-drag. Strekker eller krymper et objekts animasjon i tid fra et klikkpunkt
 * (eller hele animasjonen rundt klikkpunktet som anker). Banens form og nodene i rommet endres aldri,
 * bare når objektet er hvor. Ren funksjon: gir én UpdateLayers-kommando (én angring), ingen skriving.
 */
import type { Command } from "../commands/types";
import { layerFieldsOf } from "../composition";
import { pathProgress } from "../composition/render";
import { timingOf } from "../composition/timing";
import type { CompositionLayer, MotionPath, ProjectState } from "../model";

export type SpacingLimit = "merge" | "locked" | "start" | null;

export interface SpacingPlan {
  readonly ok: boolean;
  /** Grunnen når planen ikke kan brukes. */
  readonly reason?: "no-layer" | "layer-locked" | "no-motion" | "nothing-after-anchor";
  /** Forskyvningen som faktisk brukes (kan være mindre enn ønsket ved en grense). */
  readonly delta: number;
  /** Hvorfor draget stoppet ved en grense, eller null. */
  readonly limit: SpacingLimit;
  readonly oldStart: number;
  readonly oldEnd: number;
  readonly newStart: number;
  readonly newEnd: number;
  readonly layerIds: readonly string[];
  readonly command: Command | null;
}

const TEMPO_SAMPLES = 20;

/** Laget og alle barna (rekursivt) i en gruppe. */
export function spacingLayers(s: ProjectState, layerId: string): CompositionLayer[] {
  const root = s.layers[layerId];
  if (!root || root.removed) return [];
  const out = [root];
  const seen = new Set([root.id]);
  for (let i = 0; i < out.length; i++) {
    const parent = out[i]!;
    for (const l of Object.values(s.layers))
      if (!l.removed && l.groupId === parent.id && l.compositionId === root.compositionId && !seen.has(l.id)) {
        seen.add(l.id);
        out.push(l);
      }
  }
  return out;
}

function timesOf(l: CompositionLayer): number[] {
  const t = l.keyframes.map((k) => k.frame);
  if (l.path) t.push(l.path.startFrame, l.path.endFrame);
  for (const sw of l.swaps) t.push(sw.frame);
  return t;
}

/** Tidsspennet til animasjonen (alle nøkkelbilder, baner og bildeskifter), eller null. */
export function spacingSpan(layers: readonly CompositionLayer[]): { start: number; end: number } | null {
  const t = layers.flatMap(timesOf);
  if (!t.length) return null;
  const start = Math.min(...t);
  const end = Math.max(...t);
  return end > start ? { start, end } : null;
}

type Mapper = (t: number) => number;

function mapperFor(a: number, span: { start: number; end: number }, delta: number, whole: boolean): Mapper | null {
  if (span.end > a) {
    const k = (span.end - a + delta) / (span.end - a);
    if (k <= 0) return null;
    return (t) => (whole || t > a ? Math.round(a + (t - a) * k) || 0 : t);
  }
  if (whole && a > span.start) {
    // Klikk etter siste node: hele animasjonen strekkes bakover fra ankeret.
    const k = (a - span.start + delta) / (a - span.start);
    if (k <= 0) return null;
    return (t) => Math.round(a + (t - a) * k) || 0;
  }
  return null;
}

function strictlyIncreasing(xs: readonly number[]): boolean {
  for (let i = 1; i < xs.length; i++) if (xs[i]! <= xs[i - 1]!) return false;
  return true;
}

function remapPath(p: MotionPath, map: Mapper): MotionPath {
  const s2 = map(p.startFrame);
  const e2 = map(p.endFrame);
  const uniform = (() => {
    // Lineær skalering av hele banen: tempo og ease beholdes eksakt.
    const mid = (p.startFrame + p.endFrame) / 2;
    const span = p.endFrame - p.startFrame;
    const expectMid = s2 + ((e2 - s2) * (mid - p.startFrame)) / span;
    return Math.abs(map(mid) - expectMid) <= 1;
  })();
  if (uniform) return { ...p, startFrame: s2, endFrame: e2 };
  // Ankeret ligger inne i banen: fremdriften før ankeret beholdes; kurven bakes inn i tempopunkter.
  const inverse = (t2: number): number => {
    let lo = p.startFrame;
    let hi = p.endFrame;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (mapExact(map, m) < t2) lo = m;
      else hi = m;
    }
    return (lo + hi) / 2;
  };
  const tempo: { t: number; p: number }[] = [];
  for (let i = 1; i < TEMPO_SAMPLES; i++) {
    const t = i / TEMPO_SAMPLES;
    const prog = pathProgress(p, inverse(s2 + t * (e2 - s2)));
    const prev = tempo.at(-1)?.p ?? 0;
    tempo.push({ t, p: Math.min(1, Math.max(prev, prog)) });
  }
  return { ...p, startFrame: s2, endFrame: e2, easeOut: 0, easeIn: 0, tempo };
}

/** Den ikke-avrundede mappingen (for invers ved baking). */
function mapExact(map: Mapper, t: number): number {
  const lo = Math.floor(t);
  const f = t - lo;
  return map(lo) * (1 - f) + map(lo + 1) * f;
}

function tryDelta(
  s: ProjectState,
  layers: readonly CompositionLayer[],
  a: number,
  span: { start: number; end: number },
  delta: number,
  whole: boolean,
): { ok: true; command: Command; newStart: number; newEnd: number } | { ok: false; limit: Exclude<SpacingLimit, null> } {
  const map = mapperFor(a, span, delta, whole);
  if (!map) return { ok: false, limit: "merge" };
  const comp = s.compositions[layers[0]!.compositionId];
  const locked = comp ? timingOf(comp).lockedRanges : [];
  const inLocked = (t: number) => locked.some((r) => t >= r.startFrame && t <= r.endFrame);
  const out: { layerId: CompositionLayer["id"]; fields: ReturnType<typeof layerFieldsOf> }[] = [];
  let newStart = Infinity;
  let newEnd = -Infinity;
  for (const l of layers) {
    for (const t of timesOf(l)) {
      const t2 = map(t);
      if (t2 < 0) return { ok: false, limit: "start" };
      if (t2 !== t && (inLocked(t) || inLocked(t2))) return { ok: false, limit: "locked" };
      newStart = Math.min(newStart, t2);
      newEnd = Math.max(newEnd, t2);
    }
    const byProp = new Map<string, number[]>();
    const keyframes = l.keyframes.map((k) => {
      const f = map(k.frame);
      byProp.set(k.property, [...(byProp.get(k.property) ?? []), f]);
      return { ...k, frame: f };
    });
    for (const fs of byProp.values()) if (!strictlyIncreasing(fs)) return { ok: false, limit: "merge" };
    const swaps = l.swaps.map((sw) => ({ ...sw, frame: map(sw.frame) }));
    if (!strictlyIncreasing(swaps.map((x) => x.frame))) return { ok: false, limit: "merge" };
    let path = l.path;
    if (path) {
      if (map(path.endFrame) <= map(path.startFrame)) return { ok: false, limit: "merge" };
      path = remapPath(path, map);
    }
    out.push({ layerId: l.id, fields: { ...layerFieldsOf(l), keyframes, swaps, path } });
  }
  return { ok: true, command: { type: "UpdateLayers", layers: out } as Command, newStart, newEnd };
}

/**
 * Planen for et spacing-drag. `anchor` er klikkpunktet (frame), `delta` ønsket endring av lengden i frames.
 * Ved en grense (to nøkkelbilder ville smelte sammen, låst tidsrom, før scenens start) stopper draget ved
 * største lovlige verdi, og `limit` forklarer hvorfor.
 */
export function planSpacingDrag(
  s: ProjectState,
  layerId: string,
  anchor: number,
  delta: number,
  opts: { readonly whole: boolean },
): SpacingPlan {
  const root = s.layers[layerId];
  const base = { delta: 0, limit: null, oldStart: 0, oldEnd: 0, newStart: 0, newEnd: 0, layerIds: [], command: null };
  if (!root || root.removed) return { ...base, ok: false, reason: "no-layer" };
  const layers = spacingLayers(s, layerId);
  if (layers.some((l) => l.locked)) return { ...base, ok: false, reason: "layer-locked" };
  const span = spacingSpan(layers);
  if (!span) return { ...base, ok: false, reason: "no-motion" };
  const a = Math.round(anchor);
  if (!opts.whole && span.end <= a) return { ...base, oldStart: span.start, oldEnd: span.end, ok: false, reason: "nothing-after-anchor" };
  const ids = layers.map((l) => l.id);
  const want = Math.round(delta);
  let limit: SpacingLimit = null;
  for (let d = want; ; d += d > 0 ? -1 : 1) {
    const r = tryDelta(s, layers, a, span, d, opts.whole);
    if (r.ok)
      return {
        ok: true, delta: d, limit, oldStart: span.start, oldEnd: span.end,
        newStart: r.newStart, newEnd: r.newEnd, layerIds: ids, command: d === 0 ? null : r.command,
      };
    limit ??= r.limit;
    if (d === 0) break;
  }
  return { ...base, ok: true, limit, oldStart: span.start, oldEnd: span.end, newStart: span.start, newEnd: span.end, layerIds: ids };
}
