/**
 * Lydkomposisjoner (fase 2, bolk C, DEC-0094, REQ-0691–0697): et redigert lydresultat beskrives som deler av
 * kildeopptak (takes) plassert på spor. Komposisjonen lagres sammen med en ny versjon av lydressursen, ved
 * siden av en ferdig miks av den (så resten av appen spiller den som en vanlig lydfil). Originalopptakene
 * endres aldri, og miksen kan alltid lages på nytt fra komposisjonen (REQ-0693).
 *
 * Spor 0 er selve dialogen; spor 1–3 ligger oppå. «Sett inn før/etter» og «Erstatt område» flytter bare delene
 * i denne komposisjonen – aldri andre replikker eller lydklipp i scenen (REQ-0694).
 */
import type { AudioClip, ProjectState } from "../model";
import { isUuid } from "../ids";
import { L } from "../i18n";
import { isVoiceKind } from "./index";

export const COMPOSITION_FORMAT = 1;
export const COMPOSITION_TRACKS = 4;
export const COMPOSITION_MAX_SEGMENTS = 400;
/** Lengste komposisjon (10 minutter): en replikk eller en lyd, ikke en hel film. */
export const COMPOSITION_MAX_MS = 10 * 60 * 1000;

export interface AudioSegment {
  readonly id: string;
  /** Kildeopptaket (en versjon av en lydressurs uten egen komposisjon). */
  readonly versionId: string;
  /** 0 = dialogen, 1–3 = lag oppå. */
  readonly track: number;
  /** Start i komposisjonen (ms). */
  readonly atMs: number;
  /** Hvor i kildeopptaket delen begynner (ms). */
  readonly sourceInMs: number;
  readonly lengthMs: number;
  readonly gainDb: number;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
}

export interface AudioComposition {
  readonly format: typeof COMPOSITION_FORMAT;
  readonly segments: readonly AudioSegment[];
}

/** Hvor et nytt opptak legges (REQ-0692). */
export type InsertMode = "replace" | "before" | "after" | "over" | "range";

export interface TakeRef {
  readonly versionId: string;
  readonly durationMs: number;
}

type NewId = () => string;

const round = (x: number) => Math.max(0, Math.round(x));

function seg(
  newId: NewId,
  take: TakeRef,
  over: Partial<Omit<AudioSegment, "id" | "versionId">> = {},
): AudioSegment {
  return {
    id: newId(),
    versionId: take.versionId,
    track: 0,
    atMs: 0,
    sourceInMs: 0,
    lengthMs: round(take.durationMs),
    gainDb: 0,
    fadeInMs: 0,
    fadeOutMs: 0,
    ...over,
  };
}

/** En komposisjon av ett helt opptak. */
export function compositionFromTake(take: TakeRef, newId: NewId): AudioComposition {
  return { format: COMPOSITION_FORMAT, segments: [seg(newId, take)] };
}

/** Lengden: slutten på den siste delen (ms). */
export function compositionLengthMs(c: AudioComposition): number {
  return c.segments.reduce((m, s) => Math.max(m, s.atMs + s.lengthMs), 0);
}

/** Slutten på dialogsporet (spor 0). */
function mainEnd(c: AudioComposition): number {
  return c.segments
    .filter((s) => s.track === 0)
    .reduce((m, s) => Math.max(m, s.atMs + s.lengthMs), 0);
}

/** Delene sortert på spor og tid. */
export function sortedSegments(c: AudioComposition): AudioSegment[] {
  return [...c.segments].sort(
    (a, b) => a.track - b.track || a.atMs - b.atMs || a.id.localeCompare(b.id),
  );
}

/** Kildeopptakene komposisjonen bruker. */
export function compositionSources(c: AudioComposition): string[] {
  return [...new Set(c.segments.map((s) => s.versionId))];
}

/** Første ledige spor oppå dialogen i et tidsrom (eller det siste sporet). */
function freeOverlayTrack(c: AudioComposition, at: number, len: number): number {
  for (let t = 1; t < COMPOSITION_TRACKS; t++)
    if (!c.segments.some((s) => s.track === t && s.atMs < at + len && s.atMs + s.lengthMs > at))
      return t;
  return COMPOSITION_TRACKS - 1;
}

/**
 * Del dialogsporet ved et tidspunkt: en del som går over punktet blir to (samme kilde, fortsatt sømløst).
 * Uttoningen blir på den siste delen og inntoningen på den første.
 */
export function splitMainAt(c: AudioComposition, ms: number, newId: NewId): AudioComposition {
  const at = round(ms);
  const out: AudioSegment[] = [];
  for (const s of c.segments) {
    if (s.track !== 0 || at <= s.atMs || at >= s.atMs + s.lengthMs) {
      out.push(s);
      continue;
    }
    const first = at - s.atMs;
    out.push({ ...s, lengthMs: first, fadeOutMs: 0, fadeInMs: Math.min(s.fadeInMs, first) });
    out.push({
      ...s,
      id: newId(),
      atMs: at,
      sourceInMs: s.sourceInMs + first,
      lengthMs: s.lengthMs - first,
      fadeInMs: 0,
      fadeOutMs: Math.min(s.fadeOutMs, s.lengthMs - first),
    });
  }
  return { ...c, segments: out };
}

/**
 * Legger et nytt opptak inn i komposisjonen (REQ-0692):
 * - «replace»: hele lyden erstattes av opptaket.
 * - «before» / «after»: opptaket settes inn før eller etter dialogen; resten av dialogen flyttes tilsvarende
 *   (bare i denne komposisjonen).
 * - «over»: opptaket legges oppå som eget spor fra `atMs`.
 * - «range»: området [startMs, endMs) i dialogen erstattes av opptaket (eller en del av det, `takeInMs` og
 *   `takeLengthMs`); det som kommer etter, flyttes med forskjellen i lengde.
 */
export function insertTake(
  c: AudioComposition,
  take: TakeRef,
  mode: InsertMode,
  newId: NewId,
  opts: {
    readonly atMs?: number;
    readonly startMs?: number;
    readonly endMs?: number;
    readonly takeInMs?: number;
    readonly takeLengthMs?: number;
  } = {},
): AudioComposition {
  const inMs = round(Math.min(opts.takeInMs ?? 0, take.durationMs));
  const len = round(Math.min(opts.takeLengthMs ?? take.durationMs - inMs, take.durationMs - inMs));
  const piece = (over: Partial<AudioSegment>) =>
    seg(newId, take, { sourceInMs: inMs, lengthMs: len, ...over });
  switch (mode) {
    case "replace":
      return { ...c, segments: [piece({})] };
    case "before":
      return {
        ...c,
        segments: [piece({ atMs: 0 }), ...c.segments.map((s) => ({ ...s, atMs: s.atMs + len }))],
      };
    case "after":
      return { ...c, segments: [...c.segments, piece({ atMs: mainEnd(c) })] };
    case "over": {
      const at = round(opts.atMs ?? 0);
      return {
        ...c,
        segments: [...c.segments, piece({ atMs: at, track: freeOverlayTrack(c, at, len) })],
      };
    }
    case "range": {
      const start = round(Math.min(opts.startMs ?? 0, opts.endMs ?? 0));
      const end = round(Math.max(opts.startMs ?? 0, opts.endMs ?? 0));
      const cut = splitMainAt(splitMainAt(c, start, newId), end, newId);
      const delta = len - (end - start);
      const kept: AudioSegment[] = [];
      for (const s of cut.segments) {
        if (s.track === 0 && s.atMs >= start && s.atMs + s.lengthMs <= end) continue; // erstattes
        // Alt som starter etter området, flyttes med forskjellen i lengde (også lag oppå)
        kept.push(s.atMs >= end ? { ...s, atMs: Math.max(0, s.atMs + delta) } : s);
      }
      return { ...c, segments: [...kept, piece({ atMs: start })] };
    }
  }
}

/** Endrer en del (felt som mangler, er uendret). Verdiene holdes innenfor kildeopptaket. */
export function updateSegment(
  c: AudioComposition,
  id: string,
  patch: Partial<Omit<AudioSegment, "id" | "versionId">>,
  sourceMs?: number | null,
): AudioComposition {
  return {
    ...c,
    segments: c.segments.map((s) => {
      if (s.id !== id) return s;
      const n = { ...s, ...patch };
      const max = sourceMs ?? Number.POSITIVE_INFINITY;
      const sourceInMs = round(Math.min(n.sourceInMs, Math.max(0, max - 1)));
      const lengthMs = Math.max(1, round(Math.min(n.lengthMs, max - sourceInMs)));
      return {
        ...n,
        track: Math.max(0, Math.min(COMPOSITION_TRACKS - 1, Math.round(n.track))),
        atMs: round(n.atMs),
        sourceInMs,
        lengthMs,
        gainDb: Math.max(-60, Math.min(12, Math.round(n.gainDb * 10) / 10)),
        fadeInMs: round(Math.min(n.fadeInMs, lengthMs)),
        fadeOutMs: round(Math.min(n.fadeOutMs, lengthMs)),
      };
    }),
  };
}

export function removeSegment(c: AudioComposition, id: string): AudioComposition {
  return { ...c, segments: c.segments.filter((s) => s.id !== id) };
}

/** Er to komposisjoner like (for «ulagrede endringer»)? */
export function sameComposition(a: AudioComposition, b: AudioComposition): boolean {
  const key = (c: AudioComposition) =>
    JSON.stringify(sortedSegments(c).map(({ id: _id, ...rest }) => rest));
  return key(a) === key(b);
}

/**
 * Kontroll av en komposisjon (fra nettleseren eller databasen). `sourceMs` gir lengden på et kildeopptak, eller
 * null når det ikke finnes / ikke kan brukes. Gir feilmelding eller null.
 */
export function compositionError(
  c: unknown,
  sourceMs: (versionId: string) => number | null,
): string | null {
  const bad = L("Ugyldig lydkomposisjon", "Invalid audio composition");
  if (!c || typeof c !== "object") return bad;
  const o = c as Record<string, unknown>;
  if (o["format"] !== COMPOSITION_FORMAT || !Array.isArray(o["segments"])) return bad;
  const segs = o["segments"] as unknown[];
  if (segs.length === 0) return L("Komposisjonen er tom", "The composition is empty");
  if (segs.length > COMPOSITION_MAX_SEGMENTS)
    return L("Komposisjonen har for mange deler", "The composition has too many parts");
  const ids = new Set<string>();
  const int = (v: unknown, lo: number, hi: number) =>
    typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
  for (const x of segs) {
    if (!x || typeof x !== "object") return bad;
    const s = x as Record<string, unknown>;
    const keys = Object.keys(s).sort().join(",");
    if (keys !== "atMs,fadeInMs,fadeOutMs,gainDb,id,lengthMs,sourceInMs,track,versionId")
      return bad;
    if (typeof s["id"] !== "string" || !isUuid(s["id"]) || ids.has(s["id"])) return bad;
    ids.add(s["id"]);
    if (typeof s["versionId"] !== "string" || !isUuid(s["versionId"])) return bad;
    const src = sourceMs(s["versionId"]);
    if (src === null)
      return L(
        "Komposisjonen bruker et opptak som ikke finnes eller ikke kan brukes",
        "The composition uses a recording that does not exist or cannot be used",
      );
    if (!int(s["track"], 0, COMPOSITION_TRACKS - 1)) return bad;
    if (!int(s["atMs"], 0, COMPOSITION_MAX_MS) || !int(s["sourceInMs"], 0, COMPOSITION_MAX_MS))
      return bad;
    if (!int(s["lengthMs"], 1, COMPOSITION_MAX_MS)) return bad;
    // Litt slingringsmonn: lengden på et opptak kan avvike noen millisekunder mellom nettlesere
    if ((s["sourceInMs"] as number) + (s["lengthMs"] as number) > src + 50)
      return L("En del går forbi slutten av opptaket", "A part goes past the end of the recording");
    if (typeof s["gainDb"] !== "number" || !(s["gainDb"] >= -60 && s["gainDb"] <= 12)) return bad;
    if (
      !int(s["fadeInMs"], 0, s["lengthMs"] as number) ||
      !int(s["fadeOutMs"], 0, s["lengthMs"] as number)
    )
      return bad;
    if ((s["atMs"] as number) + (s["lengthMs"] as number) > COMPOSITION_MAX_MS)
      return L(
        "Komposisjonen er for lang (maks 10 minutter)",
        "The composition is too long (max 10 minutes)",
      );
  }
  return null;
}

/** Lengden på et kildeopptak for en komposisjon i prosjektet (lydversjon uten egen komposisjon). */
export function compositionSourceMs(s: ProjectState, versionId: string): number | null {
  const v = s.assetVersions[versionId];
  if (!v || v.composition || v.durationMs === null) return null;
  const va = s.assetVariants[v.variantId];
  const a = va ? s.assets[va.assetId] : undefined;
  return a?.kind === "sound" ? v.durationMs : null;
}

export interface LineConflict {
  readonly clipId: string;
  readonly name: string;
  /** Hvor mye de overlapper (ms). */
  readonly overlapMs: number;
}

/**
 * Andre replikker (dialog og forteller) i scenen som en lyd med denne lengden ville overlappe (REQ-0694).
 * Ingenting flyttes: konflikten vises, og brukeren håndterer den selv.
 */
export function lineConflicts(s: ProjectState, clip: AudioClip, lengthMs: number): LineConflict[] {
  const start = clip.offsetMs;
  const end = clip.offsetMs + lengthMs;
  return Object.values(s.audioClips)
    .filter(
      (a) =>
        a.id !== clip.id &&
        !a.removed &&
        !a.muted &&
        a.occurrenceId === clip.occurrenceId &&
        isVoiceKind(a.kind) &&
        (a.language ?? null) === (clip.language ?? null) &&
        a.offsetMs < end &&
        a.offsetMs + a.lengthMs > start,
    )
    .map((a) => ({
      clipId: a.id,
      name: a.name,
      overlapMs: Math.min(end, a.offsetMs + a.lengthMs) - Math.max(start, a.offsetMs),
    }))
    .sort((a, b) => b.overlapMs - a.overlapMs);
}

/** Et utsnitt [fromMs, toMs) av komposisjonen som egen komposisjon som starter på 0 (eksport av et område). */
export function cropComposition(
  c: AudioComposition,
  fromMs: number,
  toMs: number,
): AudioComposition {
  const from = round(Math.min(fromMs, toMs));
  const to = round(Math.max(fromMs, toMs));
  const segments: AudioSegment[] = [];
  for (const s of c.segments) {
    const start = Math.max(s.atMs, from);
    const end = Math.min(s.atMs + s.lengthMs, to);
    if (end <= start) continue;
    const lengthMs = end - start;
    segments.push({
      ...s,
      atMs: start - from,
      sourceInMs: s.sourceInMs + (start - s.atMs),
      lengthMs,
      fadeInMs: start === s.atMs ? Math.min(s.fadeInMs, lengthMs) : 0,
      fadeOutMs: end === s.atMs + s.lengthMs ? Math.min(s.fadeOutMs, lengthMs) : 0,
    });
  }
  return { ...c, segments };
}

/** Filnavn for en eksportert lyd: bokstaver, tall, mellomrom og bindestrek. */
export function audioExportName(name: string, ext: "wav" | "mp3"): string {
  const base =
    name
      .normalize("NFC")
      .replace(/[^\p{L}\p{N} _-]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || L("lyd", "audio");
  return `${base}.${ext}`;
}
