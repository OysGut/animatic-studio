/**
 * Filmmontering (M4 del 1, mandat kap. 15, DEC-0043): den samlede filmen bygges fra den SAMME ordnede
 * listen av aktive sceneforekomster som manuset (INV-01). Det finnes ingen egen lagret filmrekkefølge –
 * flytting av en scene i filmtidslinjen er samme kommando som i manuset (MoveOccurrence, REQ-0018/0228).
 *
 * Hvert klipp er én aktiv scene. Materialet er scenens 2D-scene; scener uten 2D-scene vises som et
 * tittelkort med beregnet lengde fra manuset, så monteringen fungerer også når produksjonen er
 * ufullstendig (REQ-0240). Tidskoder beregnes alltid på nytt og lagres aldri (ADR-0006).
 */
import type { CompositionId, OccurrenceId, SceneId, VariantId } from "../ids";
import type { Composition, ProjectState, SceneHeading, Take, Transition } from "../model";
import { estimateProduction } from "../screenplay/duration";
import { msToFramesCeil, secondsToFrames } from "../time";
import { sceneAudioEndMs } from "../audio";
import { activeStructure, blocksOfVariant } from "../views";

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
  /** «set»: lengden er satt i 2D-scenen. «estimate»: beregnet fra manuset (usikker, mandat 7.2). «film»: filmens lengde. */
  readonly durationKind: "set" | "estimate" | "film";
  /** Den importerte filmen som vises (kilde «film»), ellers null. */
  readonly take: Take | null;
  /** Overgangen inn i klippet (kutt når den ikke er satt). */
  readonly transition: Transition;
}

const CUT: Transition = { kind: "cut", frames: 0 };

/** Importert film som er tatt i bruk i forekomsten, om den finnes og har fil og lengde. */
export function activeFilmTake(s: ProjectState, activeTakeId: string | null): Take | null {
  const t = activeTakeId ? s.takes[activeTakeId] : undefined;
  return t && t.kind === "imported_film" && t.mediaRef && (t.durationFrames ?? 0) > 0 ? t : null;
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
  const clips = activeStructure(s, productionId).map((o): FilmClip => {
    const c = comps.get(o.variantId) ?? null;
    // Uten satt lengde: beregnet fra manuset, men aldri kortere enn lyden i scenen (DEC-0044)
    const estimate = Math.max(
      estimates.get(o.id) ?? secondsToFrames(MIN_ESTIMATED_SCENE_SECONDS, s.project.fps),
      msToFramesCeil(audioEnd.get(o.id) ?? 0, s.project.fps),
    );
    const set = c !== null && c.durationFrames > 0;
    const take = activeFilmTake(s, o.activeTakeId);
    const durationFrames = take ? take.durationFrames! : set ? c.durationFrames : estimate;
    const clip: FilmClip = {
      occurrenceId: o.id,
      sceneId: o.sceneId,
      variantId: o.variantId,
      compositionId: c?.id ?? null,
      source: take ? "film" : c ? "composition" : "placeholder",
      heading: s.variants[o.variantId]?.heading ?? { intExt: "", location: "", time: "" },
      productionNumber: o.productionNumber,
      startFrame: cursor,
      durationFrames,
      durationKind: take ? "film" : set ? "set" : "estimate",
      take,
      transition: o.transition ?? CUT,
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
  const sel = clips.slice(a, b + 1);
  const first = sel[0]!;
  const last = sel[sel.length - 1]!;
  return {
    startFrame: first.startFrame,
    endFrame: last.startFrame + last.durationFrames,
    clips: sel,
  };
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
  readonly mix: number;
  readonly kind: Transition["kind"];
  /** Andel svart over bildet (overgang via svart og inntoning fra svart). */
  readonly black: number;
}

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
  };
  // Første klipp: inntoning fra svart
  const first = clips[0]!;
  if (at.index === 0 && first.transition.kind !== "cut") {
    const d = Math.min(first.transition.frames, first.durationFrames);
    if (frame < d) return { ...plain, kind: first.transition.kind, black: 1 - (frame + 0.5) / d };
  }
  // Overgangen inn i dette klippet eller det neste kan dekke bildet
  for (const i of [at.index, at.index + 1]) {
    if (i <= 0 || i >= clips.length) continue;
    const prev = clips[i - 1]!;
    const next = clips[i]!;
    // Overgangen kan ikke være lengre enn klippene på hver side (ellers ville vinduene overlappe)
    const t0 = next.transition;
    const frames = Math.min(t0.frames, prev.durationFrames, next.durationFrames);
    if (t0.kind === "cut" || frames <= 0) continue;
    const t = { kind: t0.kind, frames };
    const before = Math.floor(t.frames / 2);
    const from = next.startFrame - before;
    if (frame < from || frame >= from + t.frames) continue;
    const p = (frame - from + 0.5) / t.frames;
    const a = local(prev, frame);
    const b = local(next, frame);
    if (t.kind === "dissolve") return { a, b, mix: p, kind: "dissolve", black: 0 };
    // Via svart: første halvdel toner a ut, andre halvdel toner b inn
    return p < 0.5
      ? { a, b: null, mix: 0, kind: "dip", black: p * 2 }
      : { a: b, b: null, mix: 0, kind: "dip", black: (1 - p) * 2 };
  }
  return plain;
}

/** Tidsrommet (bilder i filmen) en manusblokk dekker i klippet (DEC-0047, REQ-0097/0098). */
export interface BlockSpan {
  readonly blockId: string;
  readonly startFrame: number;
  readonly endFrame: number;
  /** «linked»: fra et lydklipp koblet til replikken. «estimate»: beregnet fra teksten. */
  readonly kind: "linked" | "estimate";
}

const SPOKEN_WORDS_PER_SECOND = 150 / 60;

function blockWeight(kind: string, text: string): number {
  if (kind === "dialogue")
    return (
      Math.max(1, text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length) /
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
    if (a.removed || a.occurrenceId !== clip.occurrenceId || !a.blockId) continue;
    const st = clip.startFrame + msToFramesCeil(a.offsetMs, fps);
    const prev = linked.get(a.blockId);
    if (!prev || st < prev.start)
      linked.set(a.blockId, { start: st, end: st + Math.max(1, msToFramesCeil(a.lengthMs, fps)) });
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
    const link = linked.get(owner.id);
    if (link) {
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
