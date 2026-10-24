/**
 * SB-5: rene oppslag for referansepanelet i sceneeditoren. Panelet er låst for redigering; alt her er
 * lesing fra tilstanden. Avspillingsfølgingen bruker storyboardfilmen (samme timing som galleriet og
 * eksporten), slik at aktivt panel alltid følger avspillingshodet etter storyboardtimingen.
 */
import type { FilmClip } from "../assembly/film";
import type { Composition, ProjectState } from "../model";
import { layersOf } from "../composition/render";
import { shotAtFrame, storyboardTimeline } from "./playback";
import { panelBlockIds, storyboardPanelsOf } from "./index";
import { panelDetails } from "./editing";

/**
 * Aktivt panel for scenens bilde i sceneeditoren: scenelokalt bilde (0 = scenens start) regnes om til
 * storyboardfilmens tidslinje, og skuddet der peker på panelet. Uten paneler eller utenfor scenens
 * paneler: null.
 */
export function activePanelIdAtFrame(
  s: ProjectState,
  clips: readonly FilmClip[],
  occurrenceId: string,
  frame: number,
): string | null {
  const shots = storyboardTimeline(s, clips);
  const sceneShots = shots.filter((shot) => shot.occurrenceId === occurrenceId);
  if (!sceneShots.length) return null;
  const first = sceneShots[0]!.startFrame;
  const end = sceneShots[sceneShots.length - 1]!.startFrame + sceneShots[sceneShots.length - 1]!.durationFrames;
  const absolute = Math.max(first, Math.min(end - 1, first + Math.max(0, frame)));
  const at = shotAtFrame(shots, absolute);
  return at && at.shot.occurrenceId === occurrenceId ? at.shot.panel.id : null;
}

/** Oppsummert innhold for ett panel i referansepanelet (lesing; ingenting skrives). */
export interface PanelReferenceInfo {
  readonly panel: Composition;
  readonly number: string;
  /** Plasserte figurer: lag med bilde (ressurs). */
  readonly figures: number;
  readonly notes: number;
  readonly arrows: number;
  readonly cameraMark: boolean;
  /** Kamerainstruksjon fra panelets detaljer (utsnitt, vinkel, brennvidde, bevegelse). */
  readonly shot: string | null;
  readonly angle: string | null;
  readonly focalMm: number | null;
  readonly movement: string;
  /** Forankrede replikker/manusblokker. */
  readonly dialogue: number;
  /** Kommentarer på panelet (åpne og løste; slettede telles ikke). */
  readonly comments: number;
  readonly status: string;
}

export function panelReferenceInfo(s: ProjectState, panel: Composition): PanelReferenceInfo {
  const layers = layersOf(s, panel.id);
  const details = panelDetails(panel);
  return {
    panel,
    number: details.number,
    figures: layers.filter((l) => l.assetId).length,
    notes: layers.filter((l) => l.kind === "note").length,
    arrows: layers.filter((l) => l.kind === "arrow").length,
    cameraMark: layers.some((l) => l.kind === "camera_mark"),
    shot: details.shot,
    angle: details.angle,
    focalMm: details.focalMm,
    movement: details.movement,
    dialogue: new Set([...panelBlockIds(s, panel.id), ...details.dialogueIds]).size,
    comments: Object.values(s.annotations).filter((a) => !a.removed && a.panelId === panel.id).length,
    status: Object.values(s.productionStatuses).find((p) => !p.removed && p.area === "storyboard" && p.compositionId === panel.id)?.status ?? "not_started",
  };
}

/** Panelene i scenen med referanseinfo, i panelrekkefølge. */
export function scenePanelReferences(s: ProjectState, occurrenceId: string): PanelReferenceInfo[] {
  return storyboardPanelsOf(s, occurrenceId).map((p) => panelReferenceInfo(s, p));
}
