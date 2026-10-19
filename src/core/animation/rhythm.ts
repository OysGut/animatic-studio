/**
 * CA8 (§71–§99): rytmeverktøyet (Director's Rhythm Engine). Ren planlegging oppå planRetime: mellomrommene
 * mellom tale, effekter og låste tidsrom endres; alt som er synkronisert, følger med (samme tidsavbildning).
 * Resultatet er én RetimeScene – én transaksjon og én angring. Ingenting lagres før «Bruk».
 */
import { L } from "../i18n";
import type { ProjectState } from "../model";
import { compositionDuration } from "../composition/animate";
import { compositionForOccurrence, planRetime, type RetimeGap, type RetimePlan } from "../composition/retime";
import { distributeLargestRemainder } from "../composition/timing";

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
  readonly newId?: () => string;
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
  if (!occ || !comp) return empty(L("Scenen har ingen 2D-scene.", "The scene has no 2D scene."));
  if (!Number.isFinite(o.tempo) || o.tempo < RHYTHM_TEMPO_MIN || o.tempo > RHYTHM_TEMPO_MAX) return empty(L("Ugyldig takt", "Invalid tempo"));
  const gaps = rhythmGaps(s, occurrenceId);
  if (!gaps.length) return empty(L("Scenen har ingen mellomrom som kan endres.", "The scene has no gaps that can change."));
  const fps = s.project.fps;
  const frameOfMs = (ms: number) => (ms * fps.num) / (1000 * fps.den);
  const speech = Object.values(s.audioClips)
    .filter((a) => a.occurrenceId === occurrenceId && !a.removed && (a.kind === "dialogue" || a.kind === "narration"))
    .map((a) => ({ id: a.id, start: Math.floor(frameOfMs(a.offsetMs)) }))
    .sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1));
  const cut = o.cutFrame ?? 0;
  const out: { before: RetimeGap; change: number; clipId: string | null }[] = [];
  for (const g of gaps) {
    const len = g.endFrame - g.startFrame;
    const next = speech.find((c) => c.start >= g.endFrame - 1) ?? null;
    const clipId = next && next.start <= g.endFrame + 1 ? next.id : null;
    if (g.endFrame <= cut) {
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
    const after = out.map((g, i) => ({ g, i })).filter((x) => x.g.before.endFrame > cut);
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
