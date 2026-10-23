import { sourceLanguageOf } from "../dialogue/languages";
/**
 * Filmmontering (M4 del 1, mandat kap. 15, DEC-0043): den samlede filmen bygges fra den SAMME ordnede
 * listen av aktive sceneforekomster som manuset (INV-01). Det finnes ingen egen lagret filmrekkefølge –
 * flytting av en scene i filmtidslinjen er samme kommando som i manuset (MoveOccurrence, REQ-0018/0228).
 *
 * Hvert klipp er én aktiv scene. Materialet er scenens 2D-scene; scener uten 2D-scene vises som et
 * tittelkort med beregnet lengde fra manuset, så monteringen fungerer også når produksjonen er
 * ufullstendig (REQ-0240). Tidskoder beregnes alltid på nytt og lagres aldri (ADR-0006).
 */
import { countWords as segCount } from "../language/text-metrics";
import type { CompositionId, OccurrenceId, SceneId, VariantId } from "../ids";
import type { ClipPart, Composition, ProjectState, SceneHeading, Take, Transition } from "../model";
import { compareKeys } from "../order-key";
import { estimateProduction } from "../screenplay/duration";
import { framesToSeconds, msToFramesCeil, secondsToFrames, type Rational } from "../time";
import { MAIN_LANGUAGE, playsIn, sceneAudioEndMs } from "../audio";
import { activeStructure, blocksOfVariant, sceneNumberOf } from "../views";

/**
 * Hva klippet viser: importert ferdig film som er tatt i bruk («Bruk denne», DEC-0047), scenens 2D-scene,
 * eller et tittelkort fordi 2D-scenen ikke er laget ennå.
 */
export type FilmClipSource = "film" | "composition" | "placeholder";

export interface FilmClip {
  readonly occurrenceId: OccurrenceId;
  readonly sceneId: SceneId;
  readonly variantId: VariantId;
  readonly compositionId: CompositionId | null;
  readonly source: FilmClipSource;
  readonly heading: SceneHeading;
  readonly productionNumber: string | null;
  /** Første bilde i den samlede filmen. */
  readonly startFrame: number;
  readonly durationFrames: number;
  /**
   * «set»: lengden er satt i 2D-scenen. «planned»: brukerens planlagte lengde (REQ-0111/0113).
   * «estimate»: beregnet fra manuset (usikker, mandat 7.2). «film»: filmens lengde.
   */
  readonly durationKind: "set" | "planned" | "estimate" | "film";
  /** Den importerte filmen som vises (kilde «film»), ellers null. */
  readonly take: Take | null;
  /** Overgangen inn i klippet: scenens egen, ellers prosjektets standard (DEC-0051). */
  readonly transition: Transition;
  /** Scenen har ingen egen overgang og følger prosjektets standard. */
  readonly transitionInherited: boolean;
  /** Bilder klippet overlapper forrige klipp (overgang med overlapp, REQ-0576); 0 ellers. */
  readonly overlapFrames: number;
  /** Scenen vises og eksporteres i svart-hvitt (REQ-0574). */
  readonly monochrome: boolean;
  /** Delene klippet består av, etter hverandre (minst én). */
  readonly parts: readonly ResolvedPart[];
  /** Klippet er satt sammen av lagrede deler (kuttet eller splittet, DEC-0048). */
  readonly edited: boolean;
  /**
   * Spinoff (DEC-0072, KI-109): scenen er delt med hovedfilmen og har ikke eget materiale, så hovedfilmens
   * film og klipping vises. Forekomsten i hovedfilmen materialet kommer fra; mangler = eget materiale.
   */
  readonly inheritedFrom?: OccurrenceId;
}

/**
 * Forekomsten materialet (film og klipping) hentes fra (DEC-0072, KI-109): i en avledet produksjon en delt scene
 * uten eget valg arver hovedfilmens forekomst av samme scenevariant; ellers forekomsten selv.
 */
function materialOccurrence(
  s: ProjectState,
  productionId: string,
  o: {
    readonly id: OccurrenceId;
    readonly variantId: VariantId;
    readonly activeTakeId: string | null;
  },
  mainOfVariant: ReadonlyMap<
    string,
    { readonly id: OccurrenceId; readonly activeTakeId: string | null }
  >,
): { readonly id: OccurrenceId; readonly activeTakeId: string | null } {
  if (s.productions[productionId]?.kind === "main") return o;
  if (o.activeTakeId !== null || partsOf(s, o.id).length > 0) return o;
  const m = mainOfVariant.get(o.variantId);
  if (!m || m.id === o.id) return o;
  return m.activeTakeId !== null || partsOf(s, m.id).length > 0 ? m : o;
}

/**
 * En del av et klipp med plassering (DEC-0048): importert film fra `inMs`, 2D-scenen fra bilde
 * `inFrame`, eller tittelkort. `startFrame` er bildet i scenen der delen begynner.
 */
export interface ResolvedPart {
  /** Den lagrede delens id, eller null for et klipp uten deler. */
  readonly id: string | null;
  readonly source: "take" | "composition" | "placeholder";
  readonly take: Take | null;
  readonly startFrame: number;
  readonly durationFrames: number;
  readonly inMs: number;
  readonly outMs: number;
  readonly inFrame: number;
  /** Myk overgang inn i delen (bilder), DEC-0071. 0 = hardt kutt. */
  readonly transitionFrames?: number;
  /** Den samme overgangen i ms (som lagret). */
  readonly transitionMs?: number;
}

/** Delen på et bilde i scenen og bildet inne i delen. */
export function partAt(
  clip: FilmClip,
  localFrame: number,
): { readonly part: ResolvedPart; readonly offset: number } {
  const parts = clip.parts;
  let p = parts[0]!;
  for (const x of parts) if (x.startFrame <= localFrame) p = x;
  return {
    part: p,
    offset: Math.max(0, Math.min(p.durationFrames - 1, localFrame - p.startFrame)),
  };
}

/** Hva som vises på et bilde i scenen: tid i en filmfil, bilde i 2D-scenen eller tittelkort. */
export type SourceFrame =
  | { readonly kind: "take"; readonly take: Take; readonly seconds: number }
  | { readonly kind: "composition"; readonly frame: number }
  | { readonly kind: "placeholder" };

export function sourceAt(clip: FilmClip, localFrame: number, fps: Rational): SourceFrame {
  const { part, offset } = partAt(clip, localFrame);
  if (part.source === "take" && part.take)
    return {
      kind: "take",
      take: part.take,
      seconds: part.inMs / 1000 + framesToSeconds(offset, fps),
    };
  if (part.source === "composition") return { kind: "composition", frame: part.inFrame + offset };
  return { kind: "placeholder" };
}

/** Kilden for en del på et bilde inne i delen (begrenset til delens bilder: før/etter holdes). */
function partSource(part: ResolvedPart, offset: number, fps: Rational): SourceFrame {
  const o = Math.max(0, Math.min(part.durationFrames - 1, offset));
  if (part.source === "take" && part.take)
    return { kind: "take", take: part.take, seconds: part.inMs / 1000 + framesToSeconds(o, fps) };
  if (part.source === "composition") return { kind: "composition", frame: part.inFrame + o };
  return { kind: "placeholder" };
}

/**
 * Myk overgang mellom to deler i en scene (DEC-0071, REQ-0265): rundt skjøten tones neste del inn over den
 * forrige uten at scenen blir kortere. Før skjøten vises forrige del med neste dels første bilde (holdt)
 * oppå, etter skjøten neste del med forrige dels siste bilde (holdt) oppå; blandingen går jevnt fra 0 til 1.
 * Null når bildet ikke er i en overgang.
 */
export function partBlendAt(
  clip: FilmClip,
  localFrame: number,
  fps: Rational,
): { readonly source: SourceFrame; readonly alpha: number; readonly held: true } | null {
  for (let i = 1; i < clip.parts.length; i++) {
    const b = clip.parts[i]!;
    const a = clip.parts[i - 1]!;
    // Aldri lenger enn noen av de to delene: da når vinduet aldri forbi naboen, og to vinduer overlapper ikke
    const t = Math.min(b.transitionFrames ?? 0, a.durationFrames, b.durationFrames);
    if (t <= 0) continue;
    const half = t / 2;
    const d = localFrame - b.startFrame;
    if (d < -half || d >= half) continue;
    // mix: hvor langt overgangen har kommet (0 → 1)
    const mix = (d + half) / t;
    if (d < 0) return { source: partSource(b, 0, fps), alpha: mix, held: true };
    return { source: partSource(a, a.durationFrames - 1, fps), alpha: 1 - mix, held: true };
  }
  return null;
}

/** Lagrede deler i en forekomst, i rekkefølge. */
export function partsOf(s: ProjectState, occurrenceId: string): ClipPart[] {
  return Object.values(s.clipParts)
    .filter((p) => p.occurrenceId === occurrenceId && !p.removed)
    .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
}

const CUT: Transition = { kind: "cut", frames: 0 };

/** Importert film som er tatt i bruk i forekomsten, om den finnes og har fil og lengde. */
/**
 * En versjon med en mediefil som kan vises i filmen: importert film, AI-video (DEC-0069, REQ-0180) eller
 * stillbilde med valgt varighet (DEC-0072, REQ-0214).
 */
export function isFilmTake(t: Take | null | undefined): t is Take {
  return (
    !!t &&
    (t.kind === "imported_film" || t.kind === "ai_video" || t.kind === "still") &&
    !!t.mediaRef
  );
}

/** Stillbilde i monteringen (DEC-0072): bildet vises uendret hele delen. */
export function isStillTake(t: Take | null | undefined): t is Take {
  return !!t && t.kind === "still" && !!t.mediaRef;
}

/**
 * Lengden på en versjon av scenen i bilder med prosjektets bildefrekvens (KI-48): for film med kjent
 * lengde i filen (`media.durationMs`) regnes den ut fra filen, så den stemmer også etter at prosjektets
 * bildefrekvens er endret; ellers den lagrede lengden i bilder.
 */
export function takeFrames(t: Take, fps: Rational): number {
  const ms = t.media?.durationMs;
  if (typeof ms === "number" && Number.isFinite(ms) && ms > 0)
    return Math.max(1, secondsToFrames(ms / 1000, fps));
  return t.durationFrames ?? 0;
}

export function activeFilmTake(s: ProjectState, activeTakeId: string | null): Take | null {
  const t = activeTakeId ? s.takes[activeTakeId] : undefined;
  return isFilmTake(t) && takeFrames(t, s.project.fps) > 0 ? t : null;
}

/** Korteste beregnede scenelengde (samme regel som i sceneeditoren). */
export const MIN_ESTIMATED_SCENE_SECONDS = 5;

/** Beregnet lengde i bilder per sceneforekomst i produksjonen, fra manuset (minst 5 sekunder). */
export function estimatedSceneFrames(s: ProjectState, productionId: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of estimateProduction(s, productionId).scenes)
    out.set(
      e.occurrenceId,
      Math.max(1, secondsToFrames(Math.max(MIN_ESTIMATED_SCENE_SECONDS, e.seconds), s.project.fps)),
    );
  return out;
}

/** 2D-scenen per variant (den første som ikke er slettet), bygget én gang. */
function compositionsByVariant(s: ProjectState): Map<string, Composition> {
  const out = new Map<string, Composition>();
  for (const c of Object.values(s.compositions)) {
    if (c.removed) continue;
    const prev = out.get(c.variantId);
    if (!prev || c.id.localeCompare(prev.id) < 0) out.set(c.variantId, c);
  }
  return out;
}

const cache = new WeakMap<ProjectState, Map<string, FilmClip[]>>();

/** Klippene i filmen, i samme rekkefølge som manuset. Deaktiverte scener er ikke med (mandat 2). */
export function filmClips(s: ProjectState, productionId: string): FilmClip[] {
  let byProd = cache.get(s);
  const hit = byProd?.get(productionId);
  if (hit) return hit;
  const estimates = estimatedSceneFrames(s, productionId);
  const audioEnd = sceneAudioEndMs(s);
  const comps = compositionsByVariant(s);
  let cursor = 0;
  // Bildene i forrige klipp etter dets egen innkommende overgang, og bildet i filmen der den slutter
  let prevFree = 0;
  let prevIn = 0;
  const standard = s.project.defaultTransition ?? CUT;
  // Hovedfilmens forekomst per scenevariant (arv av materiale i spinoffer)
  const mainOfVariant = new Map<string, { id: OccurrenceId; activeTakeId: string | null }>();
  if (s.productions[productionId]?.kind !== "main") {
    const mainId = Object.values(s.productions).find((p) => p.kind === "main")?.id;
    // Aktive forekomster går foran deaktiverte; ved flere av samme variant vinner den første (stabil rekkefølge)
    for (const x of Object.values(s.occurrences).sort((a, b) => a.id.localeCompare(b.id))) {
      if (x.productionId !== mainId) continue;
      const have = s.occurrences[mainOfVariant.get(x.variantId)?.id ?? ""];
      if (!have || (!have.active && x.active)) mainOfVariant.set(x.variantId, x);
    }
  }
  const clips = activeStructure(s, productionId).map((o, index): FilmClip => {
    const c = comps.get(o.variantId) ?? null;
    // Uten satt lengde: brukerens plan eller beregnet fra manuset, men aldri kortere enn lyden i scenen
    // (DEC-0044)
    const planned =
      o.plannedMs !== undefined ? Math.max(1, msToFramesCeil(o.plannedMs, s.project.fps)) : null;
    const estimate = Math.max(
      planned ?? estimates.get(o.id) ?? secondsToFrames(MIN_ESTIMATED_SCENE_SECONDS, s.project.fps),
      msToFramesCeil(audioEnd.get(o.id) ?? 0, s.project.fps),
    );
    const set = c !== null && c.durationFrames > 0;
    const fps = s.project.fps;
    const from = materialOccurrence(s, productionId, o, mainOfVariant);
    const stored = partsOf(s, from.id);
    let parts: ResolvedPart[];
    let take: Take | null;
    if (stored.length > 0) {
      // Klippet er kuttet eller splittet: delene etter hverandre
      let at = 0;
      parts = stored.map((p) => {
        const t = p.source === "take" && p.takeId ? (s.takes[p.takeId] ?? null) : null;
        const frames = Math.max(1, Math.round(((p.outMs - p.inMs) / 1000) * (fps.num / fps.den)));
        const r: ResolvedPart = {
          id: p.id,
          source:
            p.source === "take" ? (t ? "take" : "placeholder") : c ? "composition" : "placeholder",
          take: t,
          startFrame: at,
          durationFrames: frames,
          inMs: p.inMs,
          outMs: p.outMs,
          inFrame: Math.round((p.inMs / 1000) * (fps.num / fps.den)),
          ...(p.transitionMs
            ? {
                transitionMs: p.transitionMs,
                transitionFrames: Math.max(
                  1,
                  Math.round((p.transitionMs / 1000) * (fps.num / fps.den)),
                ),
              }
            : {}),
        };
        at += frames;
        return r;
      });
      take = parts.find((p) => p.take)?.take ?? null;
    } else {
      take = activeFilmTake(s, from.activeTakeId);
      const frames = take ? takeFrames(take, fps) : set ? c.durationFrames : estimate;
      parts = [
        {
          id: null,
          source: take ? "take" : c ? "composition" : "placeholder",
          take,
          startFrame: 0,
          durationFrames: frames,
          inMs: 0,
          // Aldri etter slutten av filen (lengden i bilder er avrundet)
          outMs: Math.min(
            Math.round(framesToSeconds(frames, fps) * 1000),
            take?.media?.durationMs ?? Number.MAX_SAFE_INTEGER,
          ),
          inFrame: 0,
        },
      ];
    }
    const edited = stored.length > 0;
    const durationFrames = parts.reduce((t, p) => t + p.durationFrames, 0);
    const transition = o.transition ?? standard;
    // Overlapp: scenen begynner før forrige er ferdig (aldri mer enn noen av klippene er lange)
    // Aldri inn i forrige klipps egen overgang (da ville tre klipp blandes), og aldri første bilde i
    // filmen (inntoningen fra svart)
    const overlapFrames =
      index > 0 && transition.overlap === true && transition.kind !== "cut"
        ? Math.max(
            0,
            Math.min(transition.frames, prevFree - 1, durationFrames - 1, cursor - prevIn - 1),
          )
        : 0;
    cursor -= overlapFrames;
    // Første klipp tones inn fra svart over hele overgangens lengde; ellers er overgangen sentrert
    const myIn =
      transition.kind === "cut"
        ? 0
        : overlapFrames > 0
          ? overlapFrames
          : index === 0
            ? Math.min(transition.frames, durationFrames)
            : Math.ceil(transition.frames / 2);
    prevFree = durationFrames - myIn;
    prevIn = cursor + myIn;
    const clip: FilmClip = {
      occurrenceId: o.id,
      sceneId: o.sceneId,
      variantId: o.variantId,
      compositionId: c?.id ?? null,
      source: take ? "film" : c ? "composition" : "placeholder",
      parts,
      edited,
      heading: s.variants[o.variantId]?.heading ?? { intExt: "", location: "", time: "" },
      productionNumber: sceneNumberOf(s, o),
      startFrame: cursor,
      durationFrames,
      durationKind: take
        ? "film"
        : edited || set
          ? "set"
          : planned !== null
            ? "planned"
            : "estimate",
      take,
      transition,
      transitionInherited: o.transition === undefined,
      overlapFrames,
      monochrome: o.monochrome === true,
      ...(from.id !== o.id ? { inheritedFrom: from.id } : {}),
    };
    cursor += durationFrames;
    return clip;
  });
  if (!byProd) {
    byProd = new Map();
    cache.set(s, byProd);
  }
  byProd.set(productionId, clips);
  return clips;
}

/** Filmens lengde i bilder. */
export function filmDurationFrames(clips: readonly FilmClip[]): number {
  const last = clips[clips.length - 1];
  return last ? last.startFrame + last.durationFrames : 0;
}

/** Klippet som vises på et bilde i filmen, og bildet inne i scenen. Utenfor filmen: nærmeste ende. */
export function clipAtFrame(
  clips: readonly FilmClip[],
  frame: number,
): { readonly clip: FilmClip; readonly index: number; readonly localFrame: number } | null {
  if (clips.length === 0) return null;
  let lo = 0;
  let hi = clips.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (clips[mid]!.startFrame <= frame) lo = mid;
    else hi = mid - 1;
  }
  const clip = clips[lo]!;
  const localFrame = Math.max(0, Math.min(clip.durationFrames - 1, frame - clip.startFrame));
  return { clip, index: lo, localFrame };
}

/** Hva som eksporteres (mandat 29.1): hele filmen, én scene eller et sammenhengende utvalg av scener. */
export type FilmRange =
  | { readonly kind: "film" }
  | { readonly kind: "scenes"; readonly fromOccurrenceId: string; readonly toOccurrenceId: string };

/** Bildene [start, end) og klippene et utvalg dekker. Ukjente scener gir tomt utvalg. */
export function filmRange(
  clips: readonly FilmClip[],
  range: FilmRange,
): { readonly startFrame: number; readonly endFrame: number; readonly clips: readonly FilmClip[] } {
  if (range.kind === "film") return { startFrame: 0, endFrame: filmDurationFrames(clips), clips };
  let a = clips.findIndex((c) => c.occurrenceId === range.fromOccurrenceId);
  let b = clips.findIndex((c) => c.occurrenceId === range.toOccurrenceId);
  if (a < 0 || b < 0) return { startFrame: 0, endFrame: 0, clips: [] };
  if (b < a) [a, b] = [b, a];
  // Utvalget begynner og slutter rent: ingen overgang inn fra (eller ut i) scener utenfor utvalget
  const sel = clips
    .slice(a, b + 1)
    .map((c, i) => (i === 0 ? { ...c, transition: CUT, overlapFrames: 0 } : c));
  const first = sel[0]!;
  const last = sel[sel.length - 1]!;
  return {
    startFrame: first.startFrame,
    endFrame: last.startFrame + last.durationFrames,
    clips: sel,
  };
}

/**
 * Vilkårlige scener (DEC-0072, REQ-0417, KI-169): de valgte klippene settes etter hverandre i filmens
 * rekkefølge. Scener som også står etter hverandre i filmen, beholder overgangen mellom seg; ellers blir det
 * et rent kutt. `shiftOf` er hvor mange bilder hver scene er flyttet (for lyd og undertekster).
 */
export function filmSelection(
  clips: readonly FilmClip[],
  occurrenceIds: ReadonlySet<string>,
): {
  readonly startFrame: number;
  readonly endFrame: number;
  readonly clips: readonly FilmClip[];
  readonly shiftOf: ReadonlyMap<string, number>;
  /**
   * Siste bilde (eksklusivt) i den sammenhengende rekken av valgte naboscener scenen hører til: lyd og
   * undertekster kuttes der, så de ikke henger over i en scene som ikke var nabo i filmen (KI-172).
   */
  readonly runEndOf: ReadonlyMap<string, number>;
} {
  const out: FilmClip[] = [];
  const shiftOf = new Map<string, number>();
  const runEndOf = new Map<string, number>();
  let run: string[] = [];
  const closeRun = () => {
    const last = out[out.length - 1];
    if (last) for (const id of run) runEndOf.set(id, last.startFrame + last.durationFrames);
    run = [];
  };
  let prevIndex = -2;
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i]!;
    if (!occurrenceIds.has(c.occurrenceId)) continue;
    const prev = out[out.length - 1];
    let start: number;
    let next: FilmClip;
    if (!prev) {
      start = 0;
      next = { ...c, transition: CUT, overlapFrames: 0 };
    } else if (i === prevIndex + 1) {
      start = prev.startFrame + (c.startFrame - clips[prevIndex]!.startFrame);
      next = c;
    } else {
      start = prev.startFrame + prev.durationFrames;
      next = { ...c, transition: CUT, overlapFrames: 0 };
    }
    if (prev && i !== prevIndex + 1) closeRun();
    shiftOf.set(c.occurrenceId, start - c.startFrame);
    out.push({ ...next, startFrame: start });
    run.push(c.occurrenceId);
    prevIndex = i;
  }
  closeRun();
  const last = out[out.length - 1];
  return {
    startFrame: 0,
    endFrame: last ? last.startFrame + last.durationFrames : 0,
    clips: out,
    shiftOf,
    runEndOf,
  };
}

/** Lydklipp for et utvalg av scener (`filmSelection`): bare de valgte scenenes lyd, flyttet med scenen. */
export function shiftAudioItems<
  T extends { readonly clip: { readonly occurrenceId: string }; readonly start: number },
>(
  items: readonly T[],
  shiftOf: ReadonlyMap<string, number>,
  fps: Rational,
  runEndOf?: ReadonlyMap<string, number>,
): T[] {
  const out: T[] = [];
  for (const it of items) {
    const d = shiftOf.get(it.clip.occurrenceId);
    if (d === undefined) continue;
    const start = it.start + framesToSeconds(d, fps);
    const endF = runEndOf?.get(it.clip.occurrenceId);
    // Lyd som løper videre, stopper der rekken av nabo-scener slutter (KI-172)
    if (endF !== undefined && "length" in it && typeof it.length === "number") {
      const max = framesToSeconds(endF, fps) - start;
      if (max <= 0) continue;
      out.push({ ...it, start, length: Math.min(it.length, max) });
      continue;
    }
    out.push({ ...it, start });
  }
  return out;
}

/** Undertekster for et utvalg av scener: teksten følger scenen den begynner i (i den opprinnelige filmen). */
export function shiftCues<T extends { readonly startMs: number; readonly endMs: number }>(
  cues: readonly T[],
  clips: readonly FilmClip[],
  shiftOf: ReadonlyMap<string, number>,
  fps: Rational,
  runEndOf?: ReadonlyMap<string, number>,
): T[] {
  const out: T[] = [];
  for (const cue of cues) {
    const f = (cue.startMs / 1000) * (fps.num / fps.den);
    const c = clips.find((x) => f >= x.startFrame && f < x.startFrame + x.durationFrames);
    const d = c ? shiftOf.get(c.occurrenceId) : undefined;
    if (d === undefined || !c) continue;
    const ms = framesToSeconds(d, fps) * 1000;
    const endF = runEndOf?.get(c.occurrenceId);
    const cap = endF !== undefined ? framesToSeconds(endF, fps) * 1000 : Infinity;
    out.push({ ...cue, startMs: cue.startMs + ms, endMs: Math.min(cue.endMs + ms, cap) });
  }
  return out;
}

/** Ett klipp i et bilde: klippet og bildet inne i scenen (holdes på første/siste bilde utenfor klippet). */
export interface ClipFrame {
  readonly clip: FilmClip;
  readonly localFrame: number;
  /** Bildet holdes (overgang utenfor klippets egen tid): importert film skal stå stille. */
  readonly held?: boolean;
}

/**
 * Hva som vises på et bilde, med overganger (DEC-0047): `a` alene, eller `a` og `b` blandet med andelen `mix`
 * (0 = bare a, 1 = bare b). Overgangen inn i et klipp er sentrert om klippet (halvparten før, halvparten
 * etter), og filmens lengde endres ikke; utenfor sitt eget klipp holdes første eller siste bilde.
 * Overgang inn i første klipp tones inn fra svart. `kind` er overgangen som pågår.
 */
export interface FrameMix {
  readonly a: ClipFrame;
  readonly b: ClipFrame | null;
  /** Hvor langt overgangen har kommet (0–1): andel av b for overtoning, tørk, skyv og iris. */
  readonly mix: number;
  readonly kind: Transition["kind"];
  /** Andel svart over bildet (overgang via svart og inntoning fra svart). */
  readonly black: number;
  /** Andel hvitt over bildet (overgang via hvitt og inntoning fra hvitt). */
  readonly white: number;
}

/**
 * Hva som vises på et bilde, med overganger (DEC-0047, DEC-0051): `a` alene, eller `a` og `b` med
 * overgangen `kind` som har kommet `mix` (0–1) på vei. Uten overlapp ligger overgangen midt på klippet
 * (halvparten før, halvparten etter) og første/siste bilde holdes utenfor klippets egen tid; med overlapp
 * spilles begge klippene i overlappen. Overgang inn i første klipp tones inn fra svart (eller hvitt).
 */
export function frameMix(clips: readonly FilmClip[], frame: number): FrameMix | null {
  const at = clipAtFrame(clips, frame);
  if (!at) return null;
  const local = (c: FilmClip, f: number): ClipFrame => {
    const lf = Math.max(0, Math.min(c.durationFrames - 1, f - c.startFrame));
    return lf === f - c.startFrame
      ? { clip: c, localFrame: lf }
      : { clip: c, localFrame: lf, held: true };
  };
  const plain: FrameMix = {
    a: { clip: at.clip, localFrame: at.localFrame },
    b: null,
    mix: 0,
    kind: "cut",
    black: 0,
    white: 0,
  };
  // Første klipp: inntoning fra svart (via hvitt: fra hvitt)
  const first = clips[0]!;
  if (at.index === 0 && first.transition.kind !== "cut") {
    const d = Math.min(first.transition.frames, first.durationFrames);
    if (frame < d) {
      const amount = 1 - (frame + 0.5) / d;
      return first.transition.kind === "dipWhite"
        ? { ...plain, kind: "dipWhite", white: amount }
        : { ...plain, kind: first.transition.kind, black: amount };
    }
  }
  // Overgangen inn i dette klippet eller det neste kan dekke bildet
  for (const i of [at.index, at.index + 1]) {
    if (i <= 0 || i >= clips.length) continue;
    const prev = clips[i - 1]!;
    const next = clips[i]!;
    const t0 = next.transition;
    if (t0.kind === "cut") continue;
    // Med overlapp: overgangen er overlappen. Ellers sentrert, aldri lengre enn klippene på hver side.
    const frames =
      next.overlapFrames > 0
        ? next.overlapFrames
        : Math.min(t0.frames, prev.durationFrames, next.durationFrames);
    if (frames <= 0) continue;
    const from =
      next.overlapFrames > 0 ? next.startFrame : next.startFrame - Math.floor(frames / 2);
    if (frame < from || frame >= from + frames) continue;
    const p = (frame - from + 0.5) / frames;
    const a = local(prev, frame);
    const b = local(next, frame);
    if (t0.kind === "dip" || t0.kind === "dipWhite") {
      // Via svart/hvitt: første halvdel toner a ut, andre halvdel toner b inn
      const amount = p < 0.5 ? p * 2 : (1 - p) * 2;
      const shown = p < 0.5 ? a : b;
      return {
        a: shown,
        b: null,
        mix: 0,
        kind: t0.kind,
        black: t0.kind === "dip" ? amount : 0,
        white: t0.kind === "dipWhite" ? amount : 0,
      };
    }
    return { a, b, mix: p, kind: t0.kind, black: 0, white: 0 };
  }
  return plain;
}

/**
 * Bildet i klippet (fra klippets start) der 2D-scenens bilde `compFrame` vises, eller null hvis det er
 * kuttet bort. Viser klippet ingen del av 2D-scenen (importert film i stedet), brukes tiden som tid i
 * scenen.
 */
export function compositionFrameInClip(clip: FilmClip, compFrame: number): number | null {
  if (!clip.parts.some((p) => p.source === "composition"))
    return compFrame < clip.durationFrames ? compFrame : null;
  for (const p of clip.parts)
    if (
      p.source === "composition" &&
      compFrame >= p.inFrame &&
      compFrame < p.inFrame + p.durationFrames
    )
      return p.startFrame + (compFrame - p.inFrame);
  return null;
}

/**
 * Omvendt av compositionFrameInClip (DEC-0052, naboscener): 2D-scenens bilde som vises på bildet
 * `localFrame` i klippet, eller null når klippet viser noe annet der (importert film, plassholder).
 */
export function clipFrameToComposition(clip: FilmClip, localFrame: number): number | null {
  if (!clip.parts.some((p) => p.source === "composition"))
    return localFrame >= 0 && localFrame < clip.durationFrames ? localFrame : null;
  for (const p of clip.parts)
    if (
      p.source === "composition" &&
      localFrame >= p.startFrame &&
      localFrame < p.startFrame + p.durationFrames
    )
      return p.inFrame + (localFrame - p.startFrame);
  return null;
}

/**
 * Scenen med nabosceneene før og etter (DEC-0052, REQ-0578): bildene i filmen fra starten av forrige
 * scene til slutten av neste, med overgangene mellom dem. Første scene i utvalget starter rent.
 */
export function neighbourRange(clips: readonly FilmClip[], occurrenceId: string) {
  const i = clips.findIndex((c) => c.occurrenceId === occurrenceId);
  if (i < 0) return null;
  const prev = clips[i - 1] ?? null;
  const next = clips[i + 1] ?? null;
  const range = filmRange(clips, {
    kind: "scenes",
    fromOccurrenceId: (prev ?? clips[i]!).occurrenceId,
    toOccurrenceId: (next ?? clips[i]!).occurrenceId,
  });
  return { ...range, current: clips[i]!, prev, next };
}

/** Tidsrommet (bilder i filmen) en manusblokk dekker i klippet (DEC-0047, REQ-0097/0098). */
export interface BlockSpan {
  readonly blockId: string;
  readonly startFrame: number;
  readonly endFrame: number;
  /**
   * «time»: tidskobling satt av brukeren (DEC-0048). «linked»: fra et lydklipp koblet til replikken.
   * «estimate»: beregnet fra teksten.
   */
  readonly kind: "time" | "linked" | "estimate";
  /** Tidskoblingen ligger etter slutten av klippet (klippet er kuttet): ikke dekket av filmen (REQ-0231). */
  readonly uncovered?: boolean;
}

const SPOKEN_WORDS_PER_SECOND = 150 / 60;

function blockWeight(kind: string, text: string): number {
  if (kind === "dialogue")
    return (
      Math.max(1, segCount(text)) /
      SPOKEN_WORDS_PER_SECOND
    );
  if (kind === "action" || kind === "shot")
    return Math.max(1, Math.ceil(text.trim().length / 61)) * 2;
  return 0;
}

/**
 * Når hver manusblokk i scenen skjer i filmen (bilder i den samlede filmen). Replikker med koblet lyd
 * (lydklipp med replikk) bruker lydens tid; resten fordeles etter tekstmengden over scenens lengde
 * (samme tommelfingerregler som varighetsestimatet). Karakternavn og parentes følger replikken sin.
 */
export function blockSpans(s: ProjectState, clip: FilmClip): BlockSpan[] {
  const fps = s.project.fps;
  const blocks = blocksOfVariant(s, clip.variantId).filter((b) => b.kind !== "heading");
  const end = clip.startFrame + clip.durationFrames;
  const clamp = (f: number) => Math.max(clip.startFrame, Math.min(end, f));
  const weights = blocks.map((b) => blockWeight(b.kind, b.text));
  const total = 2 + weights.reduce((a, b) => a + b, 0);
  const scale = clip.durationFrames / total;
  const linked = new Map<string, { start: number; end: number }>();
  for (const a of Object.values(s.audioClips)) {
    // Bare lyd i hovedspråket: replikkene har samme tid i alle språk (DEC-0059)
    if (
      a.removed ||
      a.occurrenceId !== clip.occurrenceId ||
      !a.blockId ||
      !playsIn(a, sourceLanguageOf(s), s)
    )
      continue;
    const st = clip.startFrame + msToFramesCeil(a.offsetMs, fps);
    const prev = linked.get(a.blockId);
    if (!prev || st < prev.start)
      linked.set(a.blockId, { start: st, end: st + Math.max(1, msToFramesCeil(a.lengthMs, fps)) });
  }
  // Tidskoblinger satt av brukeren går foran alt annet (tidligste kobling per blokk)
  const timed = new Map<string, { start: number; end: number | null }>();
  const toFrames = (ms: number) => Math.round((ms / 1000) * (fps.num / fps.den));
  for (const l of Object.values(s.timeLinks)) {
    if (l.removed || l.occurrenceId !== clip.occurrenceId) continue;
    // Hendelse i 2D-scenen: tiden er i 2D-scenens egen tid; finn hvor i klippet det bildet vises
    const local = l.layerId
      ? compositionFrameInClip(clip, toFrames(l.startMs))
      : toFrames(l.startMs);
    const st = local === null ? end : clip.startFrame + local;
    const en =
      l.endMs === null || local === null
        ? null
        : clip.startFrame + local + Math.max(1, toFrames(l.endMs) - toFrames(l.startMs));
    const prev = timed.get(l.blockId);
    if (!prev || st < prev.start) timed.set(l.blockId, { start: st, end: en });
  }
  const out: BlockSpan[] = [];
  let cursor = clip.startFrame + 2 * scale;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    let w = weights[i]!;
    // Karakternavn og parentes: samme tid som replikken som følger
    let owner = b;
    if (w === 0) {
      const next = blocks
        .slice(i + 1)
        .find((x, j) => weights[i + 1 + j]! > 0 || x.kind === "dialogue");
      if (next && (b.kind === "character" || b.kind === "parenthetical")) {
        owner = next;
        w = weights[blocks.indexOf(next)] ?? 0;
      }
    }
    const time = timed.get(b.id) ?? (owner !== b ? timed.get(owner.id) : undefined);
    const link = linked.get(owner.id);
    if (time) {
      const est = Math.max(1, Math.round(w * scale));
      const en = time.end ?? time.start + est;
      out.push({
        blockId: b.id,
        startFrame: clamp(time.start),
        endFrame: clamp(Math.max(time.start + 1, en)),
        kind: "time",
        ...(time.start >= end ? { uncovered: true } : {}),
      });
    } else if (link) {
      out.push({
        blockId: b.id,
        startFrame: clamp(link.start),
        endFrame: clamp(link.end),
        kind: "linked",
      });
    } else {
      const st = Math.round(cursor);
      out.push({
        blockId: b.id,
        startFrame: clamp(st),
        endFrame: clamp(Math.max(st + 1, Math.round(cursor + w * scale))),
        kind: "estimate",
      });
    }
    cursor += weights[i]! * scale;
  }
  return out;
}

/** Blokken som skjer på bildet (den siste som har startet), eller null. */
export function blockAtFrame(spans: readonly BlockSpan[], frame: number): BlockSpan | null {
  let hit: BlockSpan | null = null;
  for (const sp of spans) {
    if (sp.startFrame <= frame && frame < sp.endFrame) {
      if (!hit || sp.startFrame >= hit.startFrame) hit = sp;
    }
  }
  return hit;
}

/** Filmfilene (mediestier) klippene bruker. */
/** Stillbildene blant filene i filmen (DEC-0072): vises som bilde, ikke som video. */
export function stillMediaPaths(clips: readonly FilmClip[]): Set<string> {
  const out = new Set<string>();
  for (const c of clips)
    for (const p of c.parts)
      if (p.source === "take" && p.take?.kind === "still" && p.take.mediaRef)
        out.add(p.take.mediaRef);
  return out;
}

export function filmMediaPaths(clips: readonly FilmClip[]): string[] {
  const out = new Set<string>();
  for (const c of clips)
    for (const p of c.parts) if (p.source === "take" && p.take?.mediaRef) out.add(p.take.mediaRef);
  return [...out];
}

/**
 * Manusblokken som skjer på et bilde i 2D-scenen (DEC-0089: manuset i sceneeditoren markerer det som spilles
 * av). `compFrame` er bildet i 2D-scenens egen tid; null når klippet ikke viser 2D-scenen der, eller ingen
 * blokk dekker bildet.
 */
export function blockAtCompositionFrame(
  s: ProjectState,
  clip: FilmClip,
  compFrame: number,
  spans: readonly BlockSpan[] = blockSpans(s, clip),
): string | null {
  const local = compositionFrameInClip(clip, compFrame);
  if (local === null) return null;
  const f = clip.startFrame + local;
  let best: BlockSpan | null = null;
  for (const sp of spans) {
    if (f < sp.startFrame || f >= sp.endFrame) continue;
    // Karakternavn og replikk deler tid: vis replikken (den siste som starter før bildet)
    if (!best || sp.startFrame >= best.startFrame) best = sp;
  }
  return best?.blockId ?? null;
}
