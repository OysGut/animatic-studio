/**
 * Flernivå tidsmodell (mandat 6.4, REQ-0105, ADR-0006): samme øyeblikk uttrykt som absolutt filmtid, lokal tid
 * i scenen, tid i en del av scenen (delsekvens, DEC-0048) og tid i kilden (filmfil eller 2D-scene). Rene
 * funksjoner begge veier, så avspillingshodet kan vises på alle nivåer og en kildetid kan finnes igjen i
 * filmen. Absolutt filmtid lagres aldri; den beregnes fra klippene (filmClips).
 */
import { type Rational } from "../time";

import { clipAtFrame, partAt, type FilmClip, type ResolvedPart } from "./film";
import { t } from "@/core/i18n/keyed";

/** Tid i kilden: millisekunder i en filmfil (versjon), bilde i 2D-scenen, eller tittelkort (ingen kildetid). */
export type SourceTime =
  | { readonly kind: "take"; readonly takeId: string; readonly ms: number }
  | { readonly kind: "composition"; readonly frame: number }
  | { readonly kind: "placeholder" };

/** Ett bilde i filmen på alle nivåer. */
export interface TimeLevels {
  /** Absolutt bilde i den samlede filmen. */
  readonly filmFrame: number;
  /** Scenen (forekomsten) – identiteten. */
  readonly occurrenceId: string;
  /** Klippets plass i filmen (0 = første scene). Bare til visning, aldri nøkkel (REQ-0037). */
  readonly clipIndex: number;
  /** Bildet fra scenens start. */
  readonly sceneFrame: number;
  /** Delen bildet ligger i: permanent ID (`partKey`). */
  readonly partId: string;
  /** Delens plass (0 = første), bare til visning, og bildet fra delens start. */
  readonly partIndex: number;
  readonly partFrame: number;
  readonly source: SourceTime;
}

const rate = (fps: Rational) => fps.num / fps.den;

/**
 * Permanent nøkkel for en del (REQ-0037): den lagrede delens ID, eller – for et klipp uten lagrede deler –
 * en nøkkel avledet av scenen (det finnes da bare én del).
 */
export function partKey(clip: Pick<FilmClip, "occurrenceId">, part: Pick<ResolvedPart, "id">): string {
  return part.id ?? `whole:${clip.occurrenceId}`;
}

/** Delen med nøkkelen, eller undefined (delen er fjernet eller hører til et annet klipp). */
export function partById(clip: FilmClip, partId: string): ResolvedPart | undefined {
  return clip.parts.find((p) => partKey(clip, p) === partId);
}

/** Delen som viser bildet i scenen (samme regel som partAt). */
function partAtFrame(clip: FilmClip, sceneFrame: number): ResolvedPart {
  return partAt(clip, sceneFrame).part;
}

/** Kildetid for bildet `partFrame` i delen `partId` (delen holdes på første/siste bilde utenfor). */
export function partToSource(
  clip: FilmClip,
  partId: string,
  partFrame: number,
  fps: Rational,
): SourceTime {
  const p = partById(clip, partId);
  if (!p) return { kind: "placeholder" };
  const o = Math.max(0, Math.min(p.durationFrames - 1, partFrame));
  if (p.source === "take" && p.take)
    return { kind: "take", takeId: p.take.id, ms: p.inMs + (o * 1000) / rate(fps) };
  if (p.source === "composition") return { kind: "composition", frame: p.inFrame + o };
  return { kind: "placeholder" };
}

/** Lokal tid i scenen → del og bilde i delen (bildet holdes innenfor scenen). */
export function sceneToPart(
  clip: FilmClip,
  sceneFrame: number,
): { readonly partId: string; readonly partIndex: number; readonly partFrame: number } {
  const f = Math.max(0, Math.min(clip.durationFrames - 1, sceneFrame));
  const p = partAtFrame(clip, f);
  return { partId: partKey(clip, p), partIndex: clip.parts.indexOf(p), partFrame: f - p.startFrame };
}

/** Del og bilde i delen → lokal tid i scenen. */
export function partToScene(clip: FilmClip, partId: string, partFrame: number): number {
  const p = partById(clip, partId);
  if (!p)
    throw new Error(
      t("core-assembly-time-levels.part-to-scene.message.ea6113e5d84e", { partIndex: String(partId) }),
    );
  return p.startFrame + partFrame;
}

/** Lokal tid i scenen → absolutt filmtid. */
export function sceneToFilm(clip: FilmClip, sceneFrame: number): number {
  return clip.startFrame + sceneFrame;
}

/** Absolutt filmtid → lokal tid i dette klippet (kan være utenfor klippet: negativ eller ≥ lengden). */
export function filmToScene(clip: FilmClip, filmFrame: number): number {
  return filmFrame - clip.startFrame;
}

/** Alle nivåer for et bilde i ett klipp (bildet holdes innenfor klippet). */
export function clipTimeLevels(
  clip: FilmClip,
  clipIndex: number,
  filmFrame: number,
  fps: Rational,
): TimeLevels {
  const sceneFrame = Math.max(0, Math.min(clip.durationFrames - 1, filmFrame - clip.startFrame));
  const { partId, partIndex, partFrame } = sceneToPart(clip, sceneFrame);
  return {
    filmFrame,
    occurrenceId: clip.occurrenceId,
    clipIndex,
    sceneFrame,
    partId,
    partIndex,
    partFrame,
    source: partToSource(clip, partId, partFrame, fps),
  };
}

/**
 * Absolutt filmtid → scene, del og kilde (den omvendte konverteringen). Ved overlapp mellom to scener gjelder
 * den senere (samme som clipAtFrame). Null når filmen er tom.
 */
export function filmToLevels(
  clips: readonly FilmClip[],
  filmFrame: number,
  fps: Rational,
): TimeLevels | null {
  const at = clipAtFrame(clips, filmFrame);
  if (!at) return null;
  const f = at.clip.startFrame + at.localFrame;
  return clipTimeLevels(at.clip, at.index, f, fps);
}

/** Scene, del og bilde i delen → absolutt filmtid. Null når scenen ikke er i filmen. */
export function levelsToFilm(
  clips: readonly FilmClip[],
  at: { readonly occurrenceId: string; readonly partId: string; readonly partFrame: number },
): number | null {
  const clip = clips.find((c) => c.occurrenceId === at.occurrenceId);
  if (!clip || !partById(clip, at.partId)) return null;
  return sceneToFilm(clip, partToScene(clip, at.partId, at.partFrame));
}

/**
 * Kildetid → bildene i scenen der den vises (en kilde kan brukes i flere deler, eller være kuttet bort: tom
 * liste). Filmfil: tid i ms; 2D-scene: bilde.
 */
export function sourceToScene(clip: FilmClip, source: SourceTime, fps: Rational): number[] {
  const out: number[] = [];
  for (const p of clip.parts) {
    let offset: number | null = null;
    if (source.kind === "take" && p.source === "take" && p.take?.id === source.takeId) {
      // Delens lengde i bilder er avrundet: siste bilde kan ligge litt etter utpunktet, så bildetallet avgjør
      if (source.ms >= p.inMs)
        offset = Math.floor(((source.ms - p.inMs) * rate(fps)) / 1000 + 1e-6);
    } else if (source.kind === "composition" && p.source === "composition") {
      if (source.frame >= p.inFrame && source.frame < p.inFrame + p.durationFrames)
        offset = source.frame - p.inFrame;
    }
    if (offset !== null && offset >= 0 && offset < p.durationFrames)
      out.push(p.startFrame + offset);
  }
  return out;
}

/** Kildetid → absolutte bilder i filmen der den vises (alle scener). */
export function sourceToFilm(
  clips: readonly FilmClip[],
  source: SourceTime,
  fps: Rational,
): { readonly occurrenceId: string; readonly filmFrame: number }[] {
  const out: { occurrenceId: string; filmFrame: number }[] = [];
  for (const c of clips)
    for (const f of sourceToScene(c, source, fps))
      out.push({ occurrenceId: c.occurrenceId, filmFrame: sceneToFilm(c, f) });
  return out;
}
