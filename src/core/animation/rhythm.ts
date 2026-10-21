/**
 * CA8 (§71–§99): rytmeverktøyet (Director's Rhythm Engine). Ren planlegging oppå planRetime: mellomrommene
 * mellom tale, effekter og låste tidsrom endres; alt som er synkronisert, følger med (samme tidsavbildning).
 * Resultatet er én RetimeScene – én transaksjon og én angring. Ingenting lagres før «Bruk».
 */

import type { ProjectState } from "../model";
import { compositionDuration } from "../composition/animate";
import { compositionForOccurrence, planRetime, type RetimeGap, type RetimePlan } from "../composition/retime";
import { distributeLargestRemainder } from "../composition/timing";
import { t } from "@/core/i18n/keyed";

export interface RhythmLine {
  /** Ekstra pause (frames, kan være negativ) foran replikken. */
  readonly pauseFrames?: number;
  /** Vekt på pausen foran replikken (0–3). 1 = uendret. */
  readonly weight?: number;
}

export interface RhythmOptions {
  /** Takt: over 1 gir kortere pauser, under 1 lengre (0.25–4). */
  readonly tempo: number;
  /** Per replikk (lydklipp-ID). */
  readonly lines?: Readonly<Record<string, RhythmLine>>;
  /** Skjæringspunkt (§75–§76): bare mellomrom som slutter etter dette bildet, endres. */
  readonly cutFrame?: number;
  /** Ekstra forskyvning ved skjæringspunktet (§77) eller fordelt proporsjonalt (§78, «shift»). */
  readonly shiftFrames?: number;
  readonly proportional?: boolean;
  /**
   * Beskyttede tidsområder (§80, U5 del B) i tillegg til scenens låste tidsrom. Rytmeverktøyet flytter dem
   * aldri: bare mellomrom som starter etter slutten av alle beskyttede områder, kan endres.
   */
  readonly protectedRanges?: readonly { readonly startFrame: number; readonly endFrame: number }[];
  readonly newId?: () => string;
}

/** Første bilde der rytmeverktøyet kan endre noe (etter alle beskyttede og låste tidsrom). */
export function rhythmProtectedEnd(s: ProjectState, occurrenceId: string, extra: RhythmOptions["protectedRanges"] = []): number {
  const occ = s.occurrences[occurrenceId];
  const comp = occ ? compositionForOccurrence(s, occ) : undefined;
  const locked = comp?.timing?.lockedRanges ?? [];
  return [...locked, ...extra].reduce((m, r) => Math.max(m, r.endFrame), 0);
}

export interface RhythmGap {
  readonly before: RetimeGap;
  readonly change: number;
  /** Replikken mellomrommet står foran, eller null (slutten av scenen). */
  readonly clipId: string | null;
}

export interface RhythmPlan {
  readonly gaps: readonly RhythmGap[];
  readonly beforeFrames: number;
  readonly afterFrames: number;
  readonly retime: RetimePlan | null;
  readonly error: string | null;
}

export const RHYTHM_TEMPO_MIN = 0.25;
export const RHYTHM_TEMPO_MAX = 4;

/** De fleksible mellomrommene planRetime bruker for metoden «pauses» (samme struktur, §79–§80). */
export function rhythmGaps(s: ProjectState, occurrenceId: string): readonly RetimeGap[] {
  const occ = s.occurrences[occurrenceId];
  const comp = occ ? compositionForOccurrence(s, occ) : undefined;
  if (!occ || !comp) return [];
  const before = compositionDuration(s, comp);
  const probe = planRetime(s, occurrenceId, { targetFrames: before + 1, method: "pauses", keepAmbience: true, newId: () => "00000000-0000-4000-8000-000000000000" });
  return probe.report.gapsBefore;
}

export function planRhythm(s: ProjectState, occurrenceId: string, o: RhythmOptions): RhythmPlan {
  const occ = s.occurrences[occurrenceId];
  const comp = occ ? compositionForOccurrence(s, occ) : undefined;
  const before = comp ? compositionDuration(s, comp) : 0;
  const empty = (error: string): RhythmPlan => ({ gaps: [], beforeFrames: before, afterFrames: before, retime: null, error });
  if (!occ || !comp) return empty(t("core-animation-rhythm.plan-rhythm.empty.331f8bb24222"));
  if (!Number.isFinite(o.tempo) || o.tempo < RHYTHM_TEMPO_MIN || o.tempo > RHYTHM_TEMPO_MAX) return empty(t("core-animation-rhythm.plan-rhythm.empty.174ccc1c30e4"));
  const gaps = rhythmGaps(s, occurrenceId);
  if (!gaps.length) return empty(t("core-animation-rhythm.plan-rhythm.empty.e837d5e358dd"));
  const fps = s.project.fps;
  const frameOfMs = (ms: number) => (ms * fps.num) / (1000 * fps.den);
  const speech = Object.values(s.audioClips)
    .filter((a) => a.occurrenceId === occurrenceId && !a.removed && (a.kind === "dialogue" || a.kind === "narration"))
    .map((a) => ({ id: a.id, start: Math.floor(frameOfMs(a.offsetMs)) }))
    .sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1));
  const guard = rhythmProtectedEnd(s, occurrenceId, o.protectedRanges);
  const cut = o.cutFrame ?? 0;
  // Et mellomrom som starter før slutten av et beskyttet område, ville flyttet området: det står fast
  const frozen = (g: RetimeGap) => g.endFrame <= cut || g.startFrame < guard;
  const out: { before: RetimeGap; change: number; clipId: string | null }[] = [];
  for (const g of gaps) {
    const len = g.endFrame - g.startFrame;
    const next = speech.find((c) => c.start >= g.endFrame - 1) ?? null;
    const clipId = next && next.start <= g.endFrame + 1 ? next.id : null;
    if (frozen(g)) {
      out.push({ before: g, change: 0, clipId });
      continue;
    }
    const line = clipId ? o.lines?.[clipId] : undefined;
    const weight = Math.max(0, Math.min(3, line?.weight ?? 1));
    const wanted = Math.round((len / o.tempo) * weight + (line?.pauseFrames ?? 0));
    out.push({ before: g, change: Math.max(0, wanted) - len, clipId });
  }
  // Forskyvning ved skjæringspunktet: samlet i første mellomrom etter punktet, eller fordelt (§77–§78)
  const shift = Math.round(o.shiftFrames ?? 0);
  if (shift) {
    const after = out.map((g, i) => ({ g, i })).filter((x) => !frozen(x.g.before));
    if (after.length) {
      const parts = o.proportional
        ? distributeLargestRemainder(shift, after.map((x) => Math.max(1, x.g.before.endFrame - x.g.before.startFrame)))
        : after.map((_, k) => (k === 0 ? shift : 0));
      after.forEach((x, k) => (out[x.i] = { ...x.g, change: x.g.change + parts[k]! }));
    }
  }
  // Komprimering stopper ved siste gyldige tilstand (§80): ingen mellomrom under null
  const gapsOut = out.map((g) => ({ ...g, change: Math.max(-(g.before.endFrame - g.before.startFrame), g.change) }));
  const total = gapsOut.reduce((a, g) => a + g.change, 0);
  const after = Math.max(1, before + total);
  if (gapsOut.every((g) => g.change === 0)) return { gaps: gapsOut, beforeFrames: before, afterFrames: before, retime: null, error: null };
  const retime = planRetime(s, occurrenceId, {
    targetFrames: after,
    method: "pauses",
    keepAmbience: true,
    gapChanges: gapsOut.map((g) => g.change),
    ...(o.newId ? { newId: o.newId } : {}),
  });
  return { gaps: gapsOut, beforeFrames: before, afterFrames: after, retime, error: retime.ok ? null : retime.reason };
}

/** Piksler per frame-trinn ved vertikalt drag (§95). */
export const RHYTHM_VERTICAL_STEP_PX = 8;

/**
 * §94–§96: forskyvning fra et drag. Vannrett gir rask justering (frames under pekeren), loddrett ±1 frame per
 * trinn (opp = +), og skrått blander de to jevnt etter vinkelen (cos²/sin²), så overgangen er uten hopp og
 * ingenting telles dobbelt.
 */
export function rhythmDragShift(dxFrames: number, dyPx: number): number {
  const steps = -dyPx / RHYTHM_VERTICAL_STEP_PX;
  const dx = Math.abs(dxFrames), dy = Math.abs(steps);
  if (dx + dy === 0) return 0;
  const len2 = dx * dx + dy * dy;
  const h = (dx * dx) / len2, v = (dy * dy) / len2;
  const r = Math.round(dxFrames * h + steps * v);
  return r === 0 ? 0 : r;
}
