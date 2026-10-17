/**
 * Overganger mellom takes og automatisk avspilling (fase 2, bolk E, DEC-0096, REQ-0709/0710).
 *
 * En skjøt er der to taledeler fra ulike opptak møtes på dialogsporet. Overgangen kan mykes opp med korte
 * toninger på hver side og romlyd under skjøten (en del med rollen «transition»). Romlyd fra ulike opptak antas
 * ikke å være lik: brukeren velger hvilket opptak romlyden hentes fra (standard: opptaket etter skjøten).
 *
 * `changedSpan` finner området en endring gjelder, så det kan forhåndsspilles med kontekst etter en fullført
 * endring (REQ-0710).
 */
import {
  COMPOSITION_FORMAT,
  segmentRole,
  type AudioComposition,
  type AudioSegment,
} from "./composition";

type NewId = () => string;

/** Største toning på hver side av en skjøt (ms). */
export const TRANSITION_MAX_FADE_MS = 500;
/** Korteste romlyd under en skjøt (ms). */
export const TRANSITION_MIN_ROOM_MS = 80;
/** Hvor nær to deler må ligge for å regnes som en skjøt (ms). */
const JOINT_TOLERANCE_MS = 5;

export interface TakeJoint {
  /** Tidspunktet i komposisjonen. */
  readonly atMs: number;
  readonly beforeId: string;
  readonly afterId: string;
  readonly beforeVersionId: string;
  readonly afterVersionId: string;
}

function speech(c: AudioComposition): AudioSegment[] {
  return c.segments
    .filter((s) => s.track === 0 && segmentRole(s) === "speech")
    .sort((a, b) => a.atMs - b.atMs || a.id.localeCompare(b.id));
}

/** Skjøtene mellom ulike opptak på dialogsporet. */
export function takeJoints(c: AudioComposition): TakeJoint[] {
  const parts = speech(c);
  const out: TakeJoint[] = [];
  for (let i = 1; i < parts.length; i++) {
    const a = parts[i - 1]!;
    const b = parts[i]!;
    if (a.versionId === b.versionId) continue;
    if (Math.abs(a.atMs + a.lengthMs - b.atMs) > JOINT_TOLERANCE_MS) continue;
    out.push({
      atMs: b.atMs,
      beforeId: a.id,
      afterId: b.id,
      beforeVersionId: a.versionId,
      afterVersionId: b.versionId,
    });
  }
  return out;
}

export interface TransitionSettings {
  /** Toning ut før og inn etter skjøten (ms). */
  readonly fadeMs: number;
  /** Romlyd under skjøten, eller null. */
  readonly room: {
    readonly versionId: string;
    readonly sourceInMs: number;
    readonly lengthMs: number;
  } | null;
}

/** Romlyd som hører til en skjøt (midten ligger nær skjøten). */
function transitionPartsAt(c: AudioComposition, atMs: number): AudioSegment[] {
  return c.segments.filter(
    (s) =>
      segmentRole(s) === "transition" &&
      Math.abs(s.atMs + s.lengthMs / 2 - atMs) <= Math.max(50, s.lengthMs / 2),
  );
}

/** Slik overgangen er nå. */
export function transitionAt(c: AudioComposition, j: TakeJoint): TransitionSettings {
  const a = c.segments.find((s) => s.id === j.beforeId);
  const b = c.segments.find((s) => s.id === j.afterId);
  const fadeMs = Math.min(a?.fadeOutMs ?? 0, b?.fadeInMs ?? 0);
  const r = transitionPartsAt(c, j.atMs)[0];
  return {
    fadeMs,
    room: r ? { versionId: r.versionId, sourceInMs: r.sourceInMs, lengthMs: r.lengthMs } : null,
  };
}

/**
 * Setter overgangen ved en skjøt: toning ut på delen før og inn på delen etter, og eventuelt romlyd sentrert
 * under skjøten (med jevn toning, se lydmotoren). Ingen deler flyttes, og talen endres ikke i hastighet eller
 * tonehøyde.
 */
export function setTransition(
  c: AudioComposition,
  j: TakeJoint,
  t: TransitionSettings,
  newId: NewId,
): AudioComposition {
  const fade = Math.max(0, Math.min(TRANSITION_MAX_FADE_MS, Math.round(t.fadeMs)));
  const old = new Set(transitionPartsAt(c, j.atMs).map((s) => s.id));
  const segments: AudioSegment[] = c.segments
    .filter((s) => !old.has(s.id))
    .map((s) =>
      s.id === j.beforeId
        ? { ...s, fadeOutMs: Math.min(fade, s.lengthMs) }
        : s.id === j.afterId
          ? { ...s, fadeInMs: Math.min(fade, s.lengthMs) }
          : s,
    );
  if (t.room) {
    const len = Math.max(TRANSITION_MIN_ROOM_MS, Math.round(t.room.lengthMs));
    const at = Math.max(0, Math.round(j.atMs - len / 2));
    const half = Math.floor(len / 2);
    segments.push({
      id: newId(),
      versionId: t.room.versionId,
      track: 0,
      atMs: at,
      sourceInMs: Math.max(0, Math.round(t.room.sourceInMs)),
      lengthMs: len,
      gainDb: 0,
      fadeInMs: half,
      fadeOutMs: half,
      role: "transition",
    });
  }
  return { ...c, format: COMPOSITION_FORMAT, segments };
}

/**
 * Området en endring gjelder (ms i den nye komposisjonen): delene som er nye eller endret, og stedet der fjernede
 * deler lå. Null når ingenting er endret.
 */
export function changedSpan(
  before: AudioComposition,
  after: AudioComposition,
): { readonly fromMs: number; readonly toMs: number } | null {
  const key = (s: AudioSegment) =>
    JSON.stringify([
      s.versionId,
      s.track,
      s.atMs,
      s.sourceInMs,
      s.lengthMs,
      s.gainDb,
      s.fadeInMs,
      s.fadeOutMs,
      s.role ?? "speech",
    ]);
  const was = new Map<string, number>();
  for (const s of before.segments) was.set(key(s), (was.get(key(s)) ?? 0) + 1);
  const now = new Map<string, number>();
  for (const s of after.segments) now.set(key(s), (now.get(key(s)) ?? 0) + 1);
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  const take = (s: AudioSegment) => {
    from = Math.min(from, s.atMs);
    to = Math.max(to, s.atMs + s.lengthMs);
  };
  const seen = new Map<string, number>();
  for (const s of after.segments) {
    const k = key(s);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n > (was.get(k) ?? 0)) take(s);
  }
  const seenOld = new Map<string, number>();
  for (const s of before.segments) {
    const k = key(s);
    const n = (seenOld.get(k) ?? 0) + 1;
    seenOld.set(k, n);
    if (n > (now.get(k) ?? 0)) {
      // En fjernet eller flyttet del: stedet der den lå (avgrenset til den nye lengden)
      from = Math.min(from, s.atMs);
      to = Math.max(to, Math.min(s.atMs + s.lengthMs, s.atMs + 1));
    }
  }
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return {
    fromMs: Math.max(0, Math.round(from)),
    toMs: Math.max(Math.round(from) + 1, Math.round(to)),
  };
}

/** Området som spilles automatisk etter en endring: endringen med kontekst før og etter (REQ-0710, §42). */
export function autoPlayRange(
  span: { readonly fromMs: number; readonly toMs: number },
  contextMs: number,
  lengthMs: number,
): { readonly fromMs: number; readonly toMs: number } {
  const ctx = Math.max(0, contextMs);
  const fromMs = Math.max(0, span.fromMs - ctx);
  const toMs = Math.min(Math.max(lengthMs, fromMs + 1), span.toMs + ctx);
  return { fromMs, toMs: Math.max(fromMs + 1, toMs) };
}
