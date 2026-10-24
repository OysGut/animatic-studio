/**
 * SB-4: tid, avspilling og storyboardfilm som ren modell (ADR-0003).
 *
 * Ett panel er et skudd i storyboardfilmen. Tidslinjen bygges av samme ordnede forekomstliste som
 * monteringen (INV-01), med panelene i panelrekkefølge. Varigheten arves: panelets egen timing,
 * ellers scenens 2D-scene, ellers scenens estimat i monteringen (planlagt/beregnet), ellers et fast
 * standardantall sekunder. Ingenting her skriver prosjektdata; forslag er bare tall.
 *
 * Lyden kopieres aldri: filmAudio regnes ut på den virkelige filmen og flyttes bare i tid til
 * storyboardtidslinjen (samme klipp, samme versjoner). Lyden er tidsmaster – bildet følger lydklokken.
 */
import type { FilmClip } from "../assembly/film";
import { estimatedSceneFrames, filmDurationFrames } from "../assembly/film";
import type { FilmAudioItem } from "../audio";
import type { CameraShot, Composition, ProjectState, Transition } from "../model";
import type { OccurrenceId } from "../ids";
import { speechSeconds } from "../language";
import { framesToSeconds, secondsToFrames } from "../time";
import { orderedOccurrences } from "../views";
import { panelBlockIds, panelTimingFrames, storyboardPanelsOf } from "./index";

/** Standard panelvarighet når verken panel, scene eller estimat gir en varighet (s). */
export const DEFAULT_PANEL_SECONDS = 2;

const CUT: Transition = { kind: "cut", frames: 0 };

/** Hvor panelets varighet kommer fra (arv). */
export type PanelTimingSource = "panel" | "scene" | "estimate" | "default";

export interface PanelTiming {
  readonly frames: number;
  readonly source: PanelTimingSource;
}

/**
 * Panelets varighet med arv (SB-4): egen timing → scenens 2D-scene → scenens estimat i monteringen
 * (planlagt eller beregnet fra manus/lyd) → standard. Estimatet kommer fra filmklippene, som allerede
 * veier planlagt tid og manusberegning.
 */
export function panelTiming(s: ProjectState, clips: readonly FilmClip[], panel: Composition): PanelTiming {
  if (panel.durationFrames > 0) return { frames: panel.durationFrames, source: "panel" };
  const inherited = panelTimingFrames(s, panel);
  if (inherited > 0) return { frames: inherited, source: "scene" };
  const clip = clips.find((c) => c.occurrenceId === panel.occurrenceId);
  if (clip && clip.durationFrames > 0) return { frames: clip.durationFrames, source: "estimate" };
  return { frames: Math.max(1, secondsToFrames(DEFAULT_PANEL_SECONDS, s.project.fps)), source: "default" };
}

/** Forslag til panelvarighet (aldri skrevet automatisk). */
export interface PanelTimingSuggestion {
  readonly panelId: string;
  readonly frames: number;
  /** Grunnlaget for forslaget. */
  readonly basis: "dialogue" | "audio";
}

/**
 * Forslag til timing per panel i en scene: summen av taletiden til replikkene panelet er forankret i,
 * ellers scenens samlede lyd fordelt likt på panelene. Endrer aldri ferdig film – tallet er et forslag
 * brukeren kan ta i bruk eksplisitt.
 */
export function suggestPanelTimings(
  s: ProjectState,
  clips: readonly FilmClip[],
  occurrenceId: OccurrenceId,
): PanelTimingSuggestion[] {
  const panels = storyboardPanelsOf(s, occurrenceId).filter((p) => p.active !== false && !p.hidden);
  if (panels.length === 0) return [];
  const fps = s.project.fps;
  const clip = clips.find((c) => c.occurrenceId === occurrenceId);
  const audioFrames = clip && clip.durationKind === "film" ? 0 : (clip?.durationFrames ?? 0);
  const perPanel = Math.max(1, Math.round(audioFrames / panels.length));
  const out: PanelTimingSuggestion[] = [];
  for (const p of panels) {
    let seconds = 0;
    for (const blockId of panelBlockIds(s, p.id)) {
      const b = s.blocks[blockId];
      if (b && !b.removed && b.kind === "dialogue") seconds += speechSeconds(b.text);
    }
    if (seconds > 0) out.push({ panelId: p.id, frames: Math.max(1, secondsToFrames(seconds, fps)), basis: "dialogue" });
    else if (audioFrames > 0) out.push({ panelId: p.id, frames: perPanel, basis: "audio" });
  }
  return out;
}

/**
 * Kameraskuddet et kameramerke på panelet tilsvarer: kameraet glider fra hele formatet til merkets
 * ramme (zoom/pan/tilt) over panelets varighet. Merket er fortsatt en instruksjon i prosjektdata;
 * skuddet lages ved visning/eksport og lagres aldri.
 */
export function panelCameraShot(s: ProjectState, panel: Composition, durationFrames: number): CameraShot | null {
  const mark = panelCameraMark(s, panel);
  if (!mark) return null;
  return {
    id: `sb4-${panel.id}`,
    name: panel.name,
    startFrame: 0,
    endFrame: Math.max(1, durationFrames - 1),
    easing: "ease-in-out",
    from: { x: panel.width / 2, y: panel.height / 2, zoom: 1, rotation: 0 },
    to: {
      x: mark.frame.x + mark.frame.width / 2 + mark.pan.x,
      y: mark.frame.y + mark.frame.height / 2 + mark.pan.y,
      zoom: mark.zoom > 0 ? mark.zoom : 1,
      rotation: mark.tilt,
    },
    curve: null,
  };
}

/** Kameramerket på panelet, om noen (første i lagsrekkefølgen). */
function panelCameraMark(s: ProjectState, panel: Composition): NonNullable<import("../model").CompositionLayer["cameraMark"]> | null {
  const layers = Object.values(s.layers)
    .filter((l) => !l.removed && l.compositionId === panel.id && l.cameraMark)
    .sort((a, b) => a.orderKey.localeCompare(b.orderKey));
  return layers[0]?.cameraMark ?? null;
}

/** Ett skudd i storyboardfilmen: ett synlig, aktivt panel med arvet timing. */
export interface StoryboardShot {
  readonly panel: Composition;
  readonly occurrenceId: OccurrenceId;
  /** Skuddets nummer i filmen (0-basert). */
  readonly index: number;
  /** Start i storyboardfilmen (bilder), med overganger trukket fra. */
  readonly startFrame: number;
  readonly durationFrames: number;
  readonly timingSource: PanelTimingSource;
  /** Overgangen inn i skuddet: scenens overgang på første panel i scenen, ellers klipp. */
  readonly transition: Transition;
  readonly overlapFrames: number;
  /** Kamerabevegelsen fra panelets kameramerke, eller null. */
  readonly camera: CameraShot | null;
}

/**
 * Storyboardfilmen for en produksjon: aktive scener i fortellerrekkefølge, synlige og aktive paneler
 * i panelrekkefølge. Deaktiverte paneler hoppes over; scenens overgang gjelder inn i første panel,
 * mellom paneler i samme scene er det klipp. Samme overlapp-regler som monteringen.
 */
export function storyboardTimeline(s: ProjectState, clips: readonly FilmClip[]): StoryboardShot[] {
  const panelsByOccurrence = new Map<string, Composition[]>();
  for (const c of Object.values(s.compositions)) {
    if (c.removed || c.kind !== "storyboard" || !c.occurrenceId) continue;
    if (c.hidden || c.active === false) continue;
    const list = panelsByOccurrence.get(c.occurrenceId) ?? [];
    list.push(c);
    panelsByOccurrence.set(c.occurrenceId, list);
  }
  for (const list of panelsByOccurrence.values())
    list.sort((a, b) => (a.orderKey ?? "").localeCompare(b.orderKey ?? "") || a.id.localeCompare(b.id));
  // Lagene per panel (for kameramerker), sortert som i editoren
  const layersByPanel = new Map<string, import("../model").CompositionLayer[]>();
  for (const l of Object.values(s.layers)) {
    if (l.removed) continue;
    const list = layersByPanel.get(l.compositionId) ?? [];
    list.push(l);
    layersByPanel.set(l.compositionId, list);
  }
  for (const list of layersByPanel.values()) list.sort((a, b) => a.orderKey.localeCompare(b.orderKey));

  const shots: StoryboardShot[] = [];
  let cursor = 0;
  let prevFree = 0;
  let prevIn = 0;
  let index = 0;
  for (const clip of clips) {
    const panels = panelsByOccurrence.get(clip.occurrenceId) ?? [];
    let first = true;
    for (const panel of panels) {
      const timing = panelTiming(s, clips, panel);
      const durationFrames = timing.frames;
      const transition = first ? clip.transition : CUT;
      const overlapFrames =
        index > 0 && transition.overlap === true && transition.kind !== "cut"
          ? Math.max(0, Math.min(transition.frames, prevFree - 1, durationFrames - 1, cursor - prevIn - 1))
          : 0;
      cursor -= overlapFrames;
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
      const withLayers = Object.assign(Object.create(Object.getPrototypeOf(panel)) as Composition, panel, {
        __layers: layersByPanel.get(panel.id) ?? [],
      });
      shots.push({
        panel,
        occurrenceId: clip.occurrenceId,
        index: index++,
        startFrame: cursor,
        durationFrames,
        timingSource: timing.source,
        transition,
        overlapFrames,
        camera: panelCameraShot(withLayers, durationFrames),
      });
      cursor += durationFrames;
      first = false;
    }
  }
  return shots;
}

/** Storyboardfilmens lengde i bilder. */
export function storyboardDurationFrames(shots: readonly StoryboardShot[]): number {
  const last = shots[shots.length - 1];
  return last ? last.startFrame + last.durationFrames : 0;
}

/** Skuddet på et bilde i storyboardfilmen, og bildet inne i panelet. Utenfor: nærmeste ende. */
export function shotAtFrame(
  shots: readonly StoryboardShot[],
  frame: number,
): { readonly shot: StoryboardShot; readonly localFrame: number } | null {
  if (shots.length === 0) return null;
  let lo = 0;
  let hi = shots.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (shots[mid]!.startFrame <= frame) lo = mid;
    else hi = mid - 1;
  }
  const shot = shots[lo]!;
  if (frame > shot.startFrame + shot.durationFrames - 1) {
    const last = shots[shots.length - 1]!;
    return { shot: last, localFrame: last.durationFrames - 1 };
  }
  return { shot, localFrame: Math.max(0, frame - shot.startFrame) };
}

/**
 * Filmklipp for storyboardfilmen: ett klipp per skudd, med panelets komposisjon som kilde. Brukes av
 * både forhåndsvisningen og eksporten (én felles bildekildeadapter). `occurrenceId` peker på scenen,
 * så lyd og navigasjon fortsatt treffer riktig scene.
 */
export function storyboardClips(s: ProjectState, clips: readonly FilmClip[], shots: readonly StoryboardShot[]): FilmClip[] {
  const byOccurrence = new Map(clips.map((c) => [c.occurrenceId, c]));
  return shots.map((shot) => {
    const scene = byOccurrence.get(shot.occurrenceId);
    return {
      occurrenceId: shot.occurrenceId,
      sceneId: shot.panel.variantId ? (scene?.sceneId ?? shot.panel.variantId) : (scene?.sceneId ?? ""),
      variantId: shot.panel.variantId,
      compositionId: shot.panel.id,
      source: "composition" as const,
      parts: [
        {
          id: null,
          source: "composition" as const,
          take: null,
          startFrame: 0,
          durationFrames: shot.durationFrames,
          inMs: 0,
          outMs: Math.round(framesToSeconds(shot.durationFrames, s.project.fps) * 1000),
          inFrame: 0,
        },
      ],
      edited: false,
      heading: scene?.heading ?? { intExt: "", location: "", time: "" },
      productionNumber: scene?.productionNumber ?? null,
      startFrame: shot.startFrame,
      durationFrames: shot.durationFrames,
      durationKind: "set" as const,
      take: null,
      transition: shot.transition,
      transitionInherited: false,
      overlapFrames: shot.overlapFrames,
      monochrome: false,
    } satisfies FilmClip;
  });
}

/**
 * Scenelyden flyttet til storyboardtidslinjen (ingen kopi): samme klipp og versjoner, bare starttiden
 * regnes om. Et klipp beholdes i sin scene: starten flyttes med scenens første panel, slik at lyd som
 * løper over scenegrenser fortsatt gjør det. Lyd i scener uten paneler er ikke med. Lyden er
 * tidsmaster; panelene kan være kortere enn lyden uten at lyden klippes.
 */
export function storyboardAudioItems(
  clips: readonly FilmClip[],
  shots: readonly StoryboardShot[],
  items: readonly FilmAudioItem[],
  fps: ProjectState["project"]["fps"],
): FilmAudioItem[] {
  // Første skudd per scene, og filmklippenes start, i sekunder
  const firstShot = new Map<string, number>();
  for (const shot of shots)
    if (!firstShot.has(shot.occurrenceId)) firstShot.set(shot.occurrenceId, framesToSeconds(shot.startFrame, fps));
  const clipStart = new Map(clips.map((c) => [c.occurrenceId, framesToSeconds(c.startFrame, fps)]));
  const out: FilmAudioItem[] = [];
  for (const it of items) {
    const occId = it.clip.occurrenceId;
    const to = firstShot.get(occId);
    const from = clipStart.get(occId);
    if (to === undefined || from === undefined) continue;
    out.push({ ...it, start: Math.max(0, to + (it.start - from)) });
  }
  return out;
}

/**
 * Prosjektvisningen for storyboardavspilling og -eksport: panelene får kameraskuddet sitt (fra
 * kameramerket) og kameramerkelaget skjules, slik at eksisterende tegning (view «camera») animerer
 * bevegelsen i stedet for å vise merket. Originaltilstanden endres aldri.
 */
export function storyboardViewState(s: ProjectState, shots: readonly StoryboardShot[]): ProjectState {
  const compositions = { ...s.compositions };
  const layers = { ...s.layers };
  for (const shot of shots) {
    if (!shot.camera) continue;
    const panel = compositions[shot.panel.id];
    if (!panel) continue;
    compositions[shot.panel.id] = { ...panel, camera: { shots: [shot.camera] } };
    for (const l of Object.values(layers)) {
      if (l.compositionId === shot.panel.id && l.cameraMark && !l.hidden)
        layers[l.id] = { ...l, hidden: true };
    }
  }
  return { ...s, compositions, layers };
}

/** Bildekilden i eksportvinduet og storyboardavspillingen (SB-4-presiseringen). */
export type ExportImageSource = "animation" | "film" | "storyboard";

/**
 * Én felles bildekildeadapter for eksisterende eksport (SB-4): samme klipp- og lydmodell, tre kilder.
 * «animasjon» er dagens oppførsel uendret (aktivt take vinner, ellers 2D-scenen). «film» bruker bare
 * importert film der det finnes; scener uten take blir tittelkort. «storyboard» bygger filmen av
 * panelene (storyboardClips) med scenelyden flyttet (storyboardAudioItems) og kameramerker som
 * kamerabevegelse (storyboardViewState).
 */
export function exportImageSource(
  s: ProjectState,
  clips: readonly FilmClip[],
  source: ExportImageSource,
): { readonly state: ProjectState; readonly clips: FilmClip[]; readonly shots: readonly StoryboardShot[] } {
  if (source === "storyboard") {
    const shots = storyboardTimeline(s, clips);
    return { state: storyboardViewState(s, shots), clips: storyboardClips(s, clips, shots), shots };
  }
  if (source === "film") {
    return {
      state: s,
      clips: clips.map((c) =>
        c.take
          ? c
          : {
              ...c,
              compositionId: null,
              source: "placeholder" as const,
              parts: c.parts.map((p) => ({ ...p, source: "placeholder" as const, take: null })),
            },
      ),
      shots: [],
    };
  }
  return { state: s, clips: [...clips], shots: [] };
}

/**
 * Storyboardfilmens utgangspunkt for avspilling/eksport: klippene, lyden flyttet og visningen med
 * kamerabevegelser, regnet ut fra den virkelige filmen (filmClips) og scenelyden (filmAudio).
 */
export function storyboardFilm(
  s: ProjectState,
  clips: readonly FilmClip[],
  items: readonly FilmAudioItem[],
): {
  readonly state: ProjectState;
  readonly clips: FilmClip[];
  readonly audio: FilmAudioItem[];
  readonly shots: readonly StoryboardShot[];
  readonly durationFrames: number;
} {
  const shots = storyboardTimeline(s, clips);
  const out = storyboardClips(s, clips, shots);
  return {
    state: storyboardViewState(s, shots),
    clips: out,
    audio: storyboardAudioItems(clips, shots, items, s.project.fps),
    shots,
    durationFrames: Math.max(1, storyboardDurationFrames(shots)),
  };
}

/** Filmklippenes samlede lengde brukes bare via monteringen; re-eksportert her for lesbarhet. */
export { filmDurationFrames, estimatedSceneFrames, orderedOccurrences };
