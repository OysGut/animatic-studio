/**
 * Pauser mellom ord (fase 2, bolk E, DEC-0096, REQ-0705–0707): avstanden mellom to ord i en dialog endres uten
 * nytt opptak og uten å endre lyden i ordene. En pause gjøres lengre ved å dele talen i mellomrommet mellom
 * ordene og flytte resten av replikken; den gjøres kortere ved å ta bort tid fra mellomrommet (aldri fra et ord).
 * Den ekstra tiden er et hull på dialogsporet som fylles med romlyd, stillhet eller en valgt romlydfil (REQ-0708,
 * se `roomtone.ts`). Pauseendringene lagres i komposisjonen (format 2), så avspilling, eksport, angre og versjoner
 * virker som før. Endringene er lokale for denne komposisjonen (P9); manusteksten endres aldri (REQ-0707).
 *
 * Tider i ordkoblingen gjelder enten et kildeopptak eller komposisjonen editoren startet med (`AlignmentSource`).
 * Tidene følges gjennom delene i komposisjonen, så ordene «flytter seg» med pausene (jf. KI-247).
 */
import {
  COMPOSITION_FORMAT,
  PAUSE_MAX_DELTA_MS,
  segmentRole,
  splitMainAt,
  type AudioComposition,
  type AudioSegment,
  type PauseEdit,
  type PauseFill,
} from "./composition";
import type { WordAlignment } from "./alignment";

type NewId = () => string;

/** Hvilket opptak tidene i ordkoblingen gjelder. */
export type AlignmentSource =
  | { readonly kind: "version"; readonly versionId: string }
  | { readonly kind: "composition"; readonly composition: AudioComposition };

/** Taledelene på dialogsporet (ikke romlyd), sortert på tid. */
function speechParts(c: AudioComposition): AudioSegment[] {
  return c.segments
    .filter((s) => s.track === 0 && segmentRole(s) !== "room")
    .sort((a, b) => a.atMs - b.atMs || a.id.localeCompare(b.id));
}

/**
 * Et tidspunkt i en del. En starttid hører til delen som begynner der, en sluttid til delen som slutter der
 * (så et ord som starter rett etter et kutt, følger den flyttede delen).
 */
function inPart(s: AudioSegment, ms: number, edge: "start" | "end"): boolean {
  return edge === "start"
    ? ms >= s.sourceInMs && ms < s.sourceInMs + s.lengthMs
    : ms > s.sourceInMs && ms <= s.sourceInMs + s.lengthMs;
}

function fromSource(
  c: AudioComposition,
  versionId: string,
  ms: number,
  edge: "start" | "end",
): number | null {
  for (const s of speechParts(c))
    if (s.versionId === versionId && inPart(s, ms, edge)) return s.atMs + (ms - s.sourceInMs);
  return null;
}

function toSource(
  c: AudioComposition,
  ms: number,
  edge: "start" | "end",
): { versionId: string; ms: number } | null {
  for (const s of speechParts(c)) {
    const inside =
      edge === "start"
        ? ms >= s.atMs && ms < s.atMs + s.lengthMs
        : ms > s.atMs && ms <= s.atMs + s.lengthMs;
    if (inside) return { versionId: s.versionId, ms: s.sourceInMs + (ms - s.atMs) };
  }
  return null;
}

/** En tid i ordkoblingen → tid i komposisjonen nå, eller null når den delen ikke er med. */
export function alignmentTimeInComposition(
  c: AudioComposition,
  src: AlignmentSource,
  ms: number,
  edge: "start" | "end",
): number | null {
  if (src.kind === "version") return fromSource(c, src.versionId, ms, edge);
  const v = toSource(src.composition, ms, edge);
  return v ? fromSource(c, v.versionId, v.ms, edge) : null;
}

/** Tidsrommet for hvert ord i komposisjonen nå (null når ordet ikke har tid eller ikke er med). */
export function wordSpansInComposition(
  c: AudioComposition,
  a: WordAlignment,
  src: AlignmentSource,
): ({ readonly startMs: number; readonly endMs: number } | null)[] {
  return a.words.map((w) => {
    if (w.startMs === null || w.endMs === null) return null;
    const s = alignmentTimeInComposition(c, src, w.startMs, "start");
    const e = alignmentTimeInComposition(c, src, w.endMs, "end");
    return s === null || e === null || e < s ? null : { startMs: s, endMs: e };
  });
}

/** Ny kompositionskobling; kildeopptakets kobling endres aldri. */
export function alignmentInComposition(c: AudioComposition, a: WordAlignment, src: AlignmentSource): WordAlignment {
  const spans = wordSpansInComposition(c, a, src);
  return { ...a, words: a.words.map((word, i) => ({ ...word, startMs: spans[i]?.startMs ?? null, endMs: spans[i]?.endMs ?? null })) };
}

/** Mellomrommet etter ord nr. `i` i komposisjonen nå: [slutten på ordet, starten på det neste]. */
export function gapAfterWord(
  c: AudioComposition,
  a: WordAlignment,
  src: AlignmentSource,
  i: number,
): { readonly fromMs: number; readonly toMs: number } | null {
  const w = a.words[i];
  const n = a.words[i + 1];
  if (!w || !n || w.endMs === null || n.startMs === null) return null;
  const e = alignmentTimeInComposition(c, src, w.endMs, "end");
  const s = alignmentTimeInComposition(c, src, n.startMs, "start");
  if (e === null || s === null) return null;
  return { fromMs: e, toMs: s };
}

/** Hull i talen på dialogsporet innenfor [from, to] (der romlyd eller stillhet skal være). */
export function speechHoles(
  c: AudioComposition,
  fromMs: number,
  toMs: number,
): { fromMs: number; toMs: number }[] {
  const out: { fromMs: number; toMs: number }[] = [];
  let at = fromMs;
  for (const s of speechParts(c)) {
    const st = s.atMs;
    const en = s.atMs + s.lengthMs;
    if (en <= at) continue;
    if (st >= toMs) break;
    if (st > at) out.push({ fromMs: at, toMs: Math.min(st, toMs) });
    at = Math.max(at, en);
    if (at >= toMs) break;
  }
  if (at < toMs) out.push({ fromMs: at, toMs });
  return out.filter((h) => h.toMs > h.fromMs);
}

/** Tar bort romlyd som ligger (med midten) i tidsrommet; den lages på nytt fra pausene. */
function stripRoom(c: AudioComposition, fromMs: number, toMs: number): AudioComposition {
  return {
    ...c,
    segments: c.segments.filter((s) => {
      if (segmentRole(s) !== "room") return true;
      const mid = s.atMs + s.lengthMs / 2;
      return mid < fromMs || mid > toMs;
    }),
  };
}

/** Åpner et hull på `ms` millisekunder ved tidspunktet: dialogsporet deles, og alt etter flyttes. */
function openAt(c: AudioComposition, at: number, ms: number, newId: NewId): AudioComposition {
  const cut = splitMainAt(c, at, newId);
  return {
    ...cut,
    segments: cut.segments.map((s) => (s.atMs >= at ? { ...s, atMs: s.atMs + ms } : s)),
  };
}

/** Tar bort [from, to) fra dialogsporet og flytter alt etter tilbake. */
function removeRange(
  c: AudioComposition,
  from: number,
  to: number,
  newId: NewId,
): AudioComposition {
  const cut = splitMainAt(splitMainAt(c, from, newId), to, newId);
  const d = to - from;
  const segments: AudioSegment[] = [];
  for (const s of cut.segments) {
    if (s.track === 0 && s.atMs >= from && s.atMs + s.lengthMs <= to) continue;
    segments.push(s.atMs >= to ? { ...s, atMs: Math.max(0, s.atMs - d) } : s);
  }
  return { ...cut, segments };
}

export function pauseFor(c: AudioComposition, afterWord: number): PauseEdit | undefined {
  return c.pauses?.find((p) => p.afterWord === afterWord);
}

function withPause(
  c: AudioComposition,
  afterWord: number,
  deltaMs: number,
  fill: PauseFill,
  newId: NewId,
): AudioComposition {
  const old = pauseFor(c, afterWord);
  const rest = (c.pauses ?? []).filter((p) => p.afterWord !== afterWord);
  const keep = deltaMs !== 0 || fill.kind !== "room";
  const pauses = keep
    ? [...rest, { id: old?.id ?? newId(), afterWord, deltaMs, fill }].sort(
        (x, y) => x.afterWord - y.afterWord,
      )
    : rest;
  return { ...c, format: COMPOSITION_FORMAT, pauses };
}

/**
 * Setter pausen etter ord nr. `afterWord` til `deltaMs` lengre (negativ: kortere) enn i opptaket (P1, P5).
 * Ordene endres aldri: tid legges til eller tas bort bare i mellomrommet mellom dem, og pausen blir aldri
 * kortere enn 0. Gir null når ordene ikke har tid i komposisjonen eller overlapper.
 */
export function setPause(
  c: AudioComposition,
  a: WordAlignment,
  src: AlignmentSource,
  afterWord: number,
  deltaMs: number,
  newId: NewId,
  fill?: PauseFill,
): AudioComposition | null {
  const gap = gapAfterWord(c, a, src, afterWord);
  if (!gap || gap.toMs < gap.fromMs) return null;
  const rec = pauseFor(c, afterWord);
  const old = rec?.deltaMs ?? 0;
  const current = gap.toMs - gap.fromMs;
  const original = current - old;
  const want = Math.max(
    -PAUSE_MAX_DELTA_MS,
    Math.min(PAUSE_MAX_DELTA_MS, Math.max(Math.round(deltaMs), -original)),
  );
  const change = want - old;
  const f = fill ?? rec?.fill ?? { kind: "room" };
  let out = stripRoom(c, gap.fromMs, gap.toMs);
  if (change > 0) {
    const holes = speechHoles(out, gap.fromMs, gap.toMs);
    // Utvid et hull som finnes (fra en tidligere endring), ellers del midt i mellomrommet
    const at = holes.length
      ? holes.reduce((m, h) => (h.toMs - h.fromMs > m.toMs - m.fromMs ? h : m)).toMs
      : Math.round((gap.fromMs + gap.toMs) / 2);
    out = openAt(out, at, change, newId);
  } else if (change < 0) {
    const x = Math.min(-change, current);
    const holes = speechHoles(out, gap.fromMs, gap.toMs);
    const big = holes.length
      ? holes.reduce((m, h) => (h.toMs - h.fromMs > m.toMs - m.fromMs ? h : m))
      : null;
    const center = big ? (big.fromMs + big.toMs) / 2 : (gap.fromMs + gap.toMs) / 2;
    const from = Math.max(gap.fromMs, Math.min(gap.toMs - x, Math.round(center - x / 2)));
    if (x > 0) out = removeRange(out, from, from + x, newId);
  }
  return withPause(out, afterWord, want, f, newId);
}

/**
 * Endrer pausen etter ord nr. `afterWord` med `changeMs` (oppå det som allerede er endret).
 */
export function adjustPause(
  c: AudioComposition,
  a: WordAlignment,
  src: AlignmentSource,
  afterWord: number,
  changeMs: number,
  newId: NewId,
): AudioComposition | null {
  return setPause(c, a, src, afterWord, (pauseFor(c, afterWord)?.deltaMs ?? 0) + changeMs, newId);
}

/**
 * Trekker ordene from..to fra hverandre (P3, P4, REQ-0706): `totalMs` fordeles likt på mellomrommene inne i
 * utvalget (600 ms over tre ord gir 300 + 300). Hver pause kan justeres for seg etterpå (P5). Mellomrom uten tid
 * hoppes over. Gir null når ingen pause kunne endres.
 */
export function spreadPause(
  c: AudioComposition,
  a: WordAlignment,
  src: AlignmentSource,
  fromWord: number,
  toWord: number,
  totalMs: number,
  newId: NewId,
): AudioComposition | null {
  const lo = Math.min(fromWord, toWord);
  const hi = Math.max(fromWord, toWord);
  const n = hi - lo;
  if (n < 1) return null;
  const total = Math.round(totalMs);
  const base = Math.trunc(total / n);
  let rest = total - base * n;
  let out = c;
  let changed = false;
  for (let k = lo; k < hi; k++) {
    const extra = rest > 0 ? 1 : rest < 0 ? -1 : 0;
    rest -= extra;
    const next = adjustPause(out, a, src, k, base + extra, newId);
    if (next) {
      out = next;
      changed = true;
    }
  }
  return changed ? out : null;
}

/** Bytter hva pausen fylles med (REQ-0708). Lengden er uendret. */
export function setPauseFill(
  c: AudioComposition,
  afterWord: number,
  fill: PauseFill,
  newId: NewId,
): AudioComposition {
  return withPause(c, afterWord, pauseFor(c, afterWord)?.deltaMs ?? 0, fill, newId);
}

export interface PauseGap {
  readonly pause: PauseEdit;
  readonly fromMs: number;
  readonly toMs: number;
}

/**
 * Hullene som skal fylles (forlengede pauser med fyll «room» eller «asset»; «silence» og «manual» står tomme).
 * Tidene er i komposisjonen nå.
 */
export function pauseGaps(c: AudioComposition, a: WordAlignment, src: AlignmentSource): PauseGap[] {
  const out: PauseGap[] = [];
  for (const p of c.pauses ?? []) {
    if (p.deltaMs <= 0 || (p.fill.kind !== "room" && p.fill.kind !== "asset")) continue;
    const gap = gapAfterWord(c, a, src, p.afterWord);
    if (!gap) continue;
    for (const h of speechHoles(c, gap.fromMs, gap.toMs)) out.push({ pause: p, ...h });
  }
  return out;
}

/** Pauseendringene i komposisjonen (tom liste for format 1). */
export function pausesOf(c: AudioComposition): readonly PauseEdit[] {
  return c.pauses ?? [];
}
