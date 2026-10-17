/**
 * Romlyd i pauser (fase 2, bolk E, DEC-0096, REQ-0708/0709): forlengede pauser fylles med romlyd fra samme
 * opptak, fra partier uten tale, klikk eller markerte hendelser. Er romlyden for kort, settes flere biter sammen
 * med krysstoning og uten at samme bit kommer to ganger på rad. Talen strekkes eller pitches aldri. Finnes ingen
 * egnet romlyd, sier funksjonene fra, og brukeren kan velge stillhet eller en romlydfil (reserve: romlyd tatt
 * opp i bolk B). Romlydfylling er en hjelp, ikke en garanti for et sømløst resultat.
 *
 * Plattformnøytralt: jobber på `Float32Array` (mono) og millisekunder. Resultatet er vanlige deler med rollen
 * «room» på dialogsporet, så lydmotoren spiller og eksporterer dem som alt annet.
 */
import { L } from "../i18n";
import type { AudioComposition, AudioSegment } from "./composition";
import type { PauseGap } from "./pauses";

type NewId = () => string;

/** Et parti med romlyd i et opptak (ms i opptaket). Høyere poengsum er bedre. */
export interface RoomCandidate {
  readonly startMs: number;
  readonly endMs: number;
  readonly score: number;
}

export interface RoomToneOptions {
  /** Vinduslengde for nivåmåling (ms). */
  readonly windowMs?: number;
  /** Avstand til ord og markerte hendelser (ms). */
  readonly guardMs?: number;
  /** Korteste brukbare parti (ms). */
  readonly minMs?: number;
  /** Hvor mye over støygulvet et vindu kan være (dB). */
  readonly aboveFloorDb?: number;
  /** Hvor mye toppen i et vindu kan ligge over terskelen før det regnes som klikk (dB). */
  readonly clickDb?: number;
}

export const ROOM_DEFAULTS = {
  windowMs: 20,
  guardMs: 80,
  minMs: 150,
  aboveFloorDb: 6,
  clickDb: 12,
  crossfadeMs: 40,
} as const;

const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -120);

/**
 * Finner partier med romlyd i et opptak: nivå nær støygulvet (20-persentilen + 6 dB), ingen skarpe topper,
 * god avstand til ord (`avoid`: ord og markerte hendelser, ms i opptaket) og minst `minMs` lange.
 * Sortert etter poengsum (lange, jevne og stille partier først).
 */
export function findRoomTone(
  samples: Float32Array,
  sampleRate: number,
  avoid: readonly { readonly startMs: number; readonly endMs: number }[],
  o: RoomToneOptions = {},
): RoomCandidate[] {
  const win = o.windowMs ?? ROOM_DEFAULTS.windowMs;
  const guard = o.guardMs ?? ROOM_DEFAULTS.guardMs;
  const minMs = o.minMs ?? ROOM_DEFAULTS.minMs;
  const frame = Math.max(1, Math.round((win / 1000) * sampleRate));
  const count = Math.floor(samples.length / frame);
  if (count === 0) return [];
  const rms: number[] = [];
  const peak: number[] = [];
  for (let w = 0; w < count; w++) {
    let sum = 0;
    let p = 0;
    for (let i = w * frame; i < (w + 1) * frame; i++) {
      const v = samples[i]!;
      sum += v * v;
      p = Math.max(p, Math.abs(v));
    }
    rms.push(db(Math.sqrt(sum / frame)));
    peak.push(db(p));
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const floor = sorted[Math.floor(0.2 * (sorted.length - 1))]!;
  const limit = floor + (o.aboveFloorDb ?? ROOM_DEFAULTS.aboveFloorDb);
  const clickLimit = limit + (o.clickDb ?? ROOM_DEFAULTS.clickDb);
  const msOf = (w: number) => (w * frame * 1000) / sampleRate;
  const blocked = (w: number) => {
    const s = msOf(w);
    const e = msOf(w + 1);
    return avoid.some((a) => s < a.endMs + guard && e > a.startMs - guard);
  };
  // Klikk: toppen ligger langt over terskelen. Hold også et par vinduer avstand til klikket.
  const click = peak.map((p) => p > clickLimit);
  const nearClick = (w: number) => {
    for (let k = Math.max(0, w - 2); k <= Math.min(count - 1, w + 2); k++)
      if (click[k]) return true;
    return false;
  };
  const ok = rms.map((r, w) => r <= limit && !nearClick(w) && !blocked(w));
  const out: RoomCandidate[] = [];
  for (let w = 0; w < count;) {
    if (!ok[w]) {
      w++;
      continue;
    }
    let e = w;
    while (e < count && ok[e]) e++;
    const startMs = Math.round(msOf(w));
    const endMs = Math.round(msOf(e));
    if (endMs - startMs >= minMs) {
      const part = rms.slice(w, e);
      const mean = part.reduce((a, b) => a + b, 0) / part.length;
      const sd = Math.sqrt(part.reduce((a, b) => a + (b - mean) ** 2, 0) / part.length);
      // Lengde teller mest (opptil 1 s), så jevnhet og nærhet til støygulvet
      const score =
        Math.min(endMs - startMs, 1000) / 1000 - sd / 10 - Math.max(0, mean - floor) / 20;
      out.push({ startMs, endMs, score: Math.round(score * 1000) / 1000 });
    }
    w = e;
  }
  return out.sort((a, b) => b.score - a.score || a.startMs - b.startMs);
}

/** En bit romlyd som skal spilles (ms i opptaket og i fyllet). */
export interface RoomPiece {
  readonly sourceInMs: number;
  readonly lengthMs: number;
  /** Start i fyllet (ms fra hullets start). */
  readonly atMs: number;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
}

/**
 * Setter sammen romlyd som dekker `needMs`: biter fra kandidatene med `crossfadeMs` krysstoning, uten at samme
 * bit (samme kandidat og samme sted) kommer to ganger på rad. Med én kandidat hentes bitene fra skiftende steder
 * i den. Gir tom liste når ingen kandidat er lang nok.
 */
export function buildRoomFill(
  candidates: readonly RoomCandidate[],
  needMs: number,
  crossfadeMs: number = ROOM_DEFAULTS.crossfadeMs,
): RoomPiece[] {
  const need = Math.round(needMs);
  if (need <= 0) return [];
  const usable = candidates.filter((c) => c.endMs - c.startMs >= Math.max(2 * crossfadeMs, 20));
  if (usable.length === 0) return [];
  // Korte fyll: én bit, med kort inn- og uttoning i kantene
  const edge = (len: number) => Math.min(crossfadeMs, Math.floor(len / 4));
  const pieces: RoomPiece[] = [];
  let at = 0;
  let k = 0;
  let last = "";
  while (at < need) {
    const cand = usable[k % usable.length]!;
    const fullLen = cand.endMs - cand.startMs;
    // Med bare én kandidat brukes kortere biter, så de kan hentes fra ulike steder
    const candLen =
      usable.length === 1 && fullLen < need
        ? Math.max(2 * crossfadeMs + 20, Math.floor(fullLen * 0.6))
        : fullLen;
    const remaining = need - at;
    const len = Math.min(candLen, fullLen, remaining + (pieces.length ? crossfadeMs : 0));
    const lenNoOverlap = Math.max(1, len);
    // Velg et sted i kandidaten; bytt sted når samme kandidat brukes igjen
    const room = fullLen - lenNoOverlap;
    const turn = Math.floor(k / usable.length);
    let offset = room > 0 ? Math.round((turn * 0.37 * fullLen) % (room + 1)) : 0;
    let key = `${cand.startMs}:${offset}`;
    if (key === last && room > 0) {
      offset = (offset + Math.max(1, Math.round(room / 2))) % (room + 1);
      key = `${cand.startMs}:${offset}`;
    }
    const start = pieces.length ? at - crossfadeMs : 0;
    const lengthMs = Math.min(lenNoOverlap, need - start);
    pieces.push({
      sourceInMs: cand.startMs + offset,
      lengthMs,
      atMs: start,
      fadeInMs: pieces.length ? Math.min(crossfadeMs, lengthMs) : edge(lengthMs),
      fadeOutMs: 0,
    });
    last = key;
    at = start + lengthMs;
    k++;
    if (k > 10_000) break; // vern mot uendelig løkke
  }
  // Krysstoning ut på alle unntatt den siste, som tones kort ut i kanten
  return pieces.map((p, i) => ({
    ...p,
    fadeOutMs:
      i < pieces.length - 1
        ? Math.min(crossfadeMs, p.lengthMs)
        : Math.min(edge(p.lengthMs), p.lengthMs),
  }));
}

/** Hvor romlyden til en pause hentes fra. */
export interface RoomSource {
  readonly versionId: string;
  readonly candidates: readonly RoomCandidate[];
}

export interface FillResult {
  readonly composition: AudioComposition;
  /** Pauser som ikke kunne fylles (ingen egnet romlyd). */
  readonly unfilled: readonly { readonly afterWord: number; readonly message: string }[];
}

export const NO_ROOM_TONE_MESSAGE = () =>
  L(
    "Fant ingen egnet romlyd for pausen. Velg stillhet eller en romlydfil.",
    "No suitable room tone was found for the pause. Choose silence or a room tone file.",
  );

/**
 * Fyller hullene i pausene med romlyd (rollen «room», dialogsporet). Gammel romlyd i komposisjonen tas bort
 * først, så resultatet alltid svarer til pausene slik de er nå. `sourceFor` gir romlydkilden for en pause:
 * for fyll «room» samme opptak (eller reserven), for «asset» den valgte romlydfilen. Ingen kilde eller ingen
 * egnet romlyd gir en melding, og hullet står tomt (stillhet).
 */
export function fillPauseGaps(
  c: AudioComposition,
  gaps: readonly PauseGap[],
  sourceFor: (gap: PauseGap) => RoomSource | null,
  newId: NewId,
  crossfadeMs: number = ROOM_DEFAULTS.crossfadeMs,
): FillResult {
  const segments: AudioSegment[] = c.segments.filter((s) => s.role !== "room");
  const unfilled: { afterWord: number; message: string }[] = [];
  for (const g of gaps) {
    const src = sourceFor(g);
    const pieces = src ? buildRoomFill(src.candidates, g.toMs - g.fromMs, crossfadeMs) : [];
    if (!src || pieces.length === 0) {
      if (!unfilled.some((u) => u.afterWord === g.pause.afterWord))
        unfilled.push({ afterWord: g.pause.afterWord, message: NO_ROOM_TONE_MESSAGE() });
      continue;
    }
    for (const p of pieces)
      segments.push({
        id: newId(),
        versionId: src.versionId,
        track: 0,
        atMs: g.fromMs + p.atMs,
        sourceInMs: p.sourceInMs,
        lengthMs: p.lengthMs,
        gainDb: 0,
        fadeInMs: p.fadeInMs,
        fadeOutMs: p.fadeOutMs,
        role: "room",
      });
  }
  return { composition: { ...c, format: 2, segments }, unfilled };
}

/** En hel romlydfil som kandidat (valgt fil eller reserve tatt opp som romlyd), uten de ytterste 50 ms. */
export function wholeFileCandidate(durationMs: number): RoomCandidate[] {
  const s = Math.min(50, Math.floor(durationMs / 4));
  const e = Math.max(s, durationMs - s);
  return e - s > 0 ? [{ startMs: s, endMs: e, score: 1 }] : [];
}
