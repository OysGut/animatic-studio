/**
 * C-3 Premiere Pro: storyboardsekvensen ut (panelbilder, timing, overganger fra SB-9, lyd fra SB-4) og
 * forslag tilbake. Ren plan: endrer ingenting.
 *
 * Regler (INVARIANTS): retur er bare FORSLAG per panel. Brukeren godtar eller avviser hvert enkelt; ingenting
 * brukes automatisk. Scenenumre, scener og manus endres aldri: et panel som er flyttet til en annen scene i
 * Premiere får bare forslag om ny varighet, ikke ny scene. Paneler som mangler i Premiere slettes aldri.
 */
import type { Command, ProjectState } from "../index";
import type { AssetVersion } from "../model";
import { filmClips } from "../assembly/film";
import { filmAudio, type FilmAudioItem } from "../audio";
import { keyBetween } from "../order-key";
import { storyboardPanelsOf } from "../storyboard";
import { panelDetails } from "../storyboard/editing";
import { storyboardTempAudioItems, storyboardTimeline } from "../storyboard/playback";
import { secondsToFrames } from "../time";
import type { PremiereAudioClip, PremiereAudioTrack, PremiereReturn, PremiereSequence } from "./premiere-sequence";

const TRACK_OF: Record<string, PremiereAudioTrack> = { dialogue: "dialogue", narration: "dialogue", music: "music", sfx: "effects", ambience: "effects" };
const extOf = (mime: string) => (mime.includes("wav") ? "wav" : mime.includes("mpeg") ? "mp3" : mime.includes("ogg") ? "ogg" : mime.includes("aiff") ? "aif" : mime.includes("mp4") ? "m4a" : "bin");
export const premiereAudioPath = (v: AssetVersion) => `audio/${v.id}.${extOf(v.mimeType)}`;
export const premiereImagePath = (panelId: string) => `panels/${panelId}.png`;

/** Sekvensen for en produksjon, i storyboardfilmens tid (samme regler som avspillingen i SB-4). */
export function buildPremiereSequence(s: ProjectState, productionId: string, lang: string): { sequence: PremiereSequence; audioVersions: AssetVersion[] } {
  const fps = s.project.fps;
  const clips = filmClips(s, productionId);
  const shots = storyboardTimeline(s, clips);
  const sbStart = new Map<string, number>();
  for (const sh of shots) if (!sbStart.has(sh.occurrenceId)) sbStart.set(sh.occurrenceId, sh.startFrame);
  const filmStart = new Map(clips.map(c => [c.occurrenceId as string, c.startFrame]));
  const panels = shots.map(sh => {
    const d = panelDetails(sh.panel);
    const occ = s.occurrences[sh.occurrenceId as never]!;
    const t = sh.transition;
    return {
      panelId: sh.panel.id, revision: sh.panel.revision, occurrenceId: sh.occurrenceId, sceneId: String(occ.sceneId),
      label: d.number || sh.panel.name || sh.panel.id.slice(0, 8), sceneLabel: d.sceneNumber || String(occ.sceneId).slice(0, 8),
      startFrame: sh.startFrame, durationFrames: sh.durationFrames, image: premiereImagePath(sh.panel.id),
      transition: t && t.kind !== "cut" ? { kind: t.kind, frames: t.frames, ...(t.direction ? { direction: t.direction } : {}) } : null,
    };
  });
  const versions = new Map<string, AssetVersion>();
  const audio: PremiereAudioClip[] = [];
  const add = (a: FilmAudioItem, shift: number) => {
    if (!a.version || a.version.removed || a.clip.muted) return;
    const start = secondsToFrames(a.start, fps) + shift, len = secondsToFrames(a.length, fps);
    if (len < 1 || start < 0) return;
    versions.set(a.version.id, a.version);
    audio.push({ id: String(a.clip.id), track: TRACK_OF[a.clip.kind] ?? "effects", name: a.clip.name || a.clip.kind, path: premiereAudioPath(a.version), startFrame: start, lengthFrames: len, sourceInFrames: secondsToFrames(a.sourceIn, fps), gainDb: a.clip.gainDb });
  };
  // Scenelyd ligger i filmtid; flytt den til der scenen starter i storyboardfilmen.
  for (const a of filmAudio(s, clips, fps, lang)) {
    const occ = a.clip.occurrenceId as string;
    if (!sbStart.has(occ) || !filmStart.has(occ)) continue;
    add(a, sbStart.get(occ)! - filmStart.get(occ)!);
  }
  for (const a of storyboardTempAudioItems(s, shots, fps)) add(a, 0);
  const last = shots.at(-1);
  const lengthFrames = last ? last.startFrame + last.durationFrames : 0;
  const production = s.productions[productionId as never];
  return {
    sequence: { name: `${s.project.name}${production?.name ? ` – ${production.name}` : ""}`, projectId: s.project.id, productionId, fps, width: s.project.frameWidth, height: s.project.frameHeight, lengthFrames, panels, audio },
    audioVersions: [...versions.values()],
  };
}

/** Forslag for ett panel. Bare det som er endret er med. */
export interface PremiereEdit {
  readonly panelId: string;
  readonly occurrenceId: string;
  /** Scenen panelet havnet ved siden av i Premiere, når den er en annen (vises, brukes aldri). */
  readonly movedToOccurrenceId: string | null;
  readonly revision: number;
  readonly currentIndex: number;
  readonly proposedIndex: number;
  readonly currentDuration: number;
  readonly durationFrames: number;
  /** Panelet som står før i samme scene i Premiere (null = først). */
  readonly afterPanelId: string | null;
  readonly orderChanged: boolean;
  readonly durationChanged: boolean;
}
export interface PremiereProposal { readonly edits: readonly PremiereEdit[]; readonly conflicts: readonly string[]; readonly missing: number; readonly unknown: number }

/** Sammenligner Premiere-klippet med storyboardet. Kobling bare på panel-ID. */
export function planPremiereProposal(s: ProjectState, productionId: string, r: PremiereReturn): PremiereProposal {
  const shots = storyboardTimeline(s, filmClips(s, productionId));
  const byId = new Map(shots.map(sh => [sh.panel.id as string, sh]));
  const known = r.items.filter(i => byId.has(i.panelId));
  const edits: PremiereEdit[] = [];
  const conflicts: string[] = [];
  // Rekkefølgen per scene slik Premiere har den (bare paneler som hører til scenen).
  const perScene = new Map<string, string[]>();
  for (const it of known) { const occ = byId.get(it.panelId)!.occurrenceId; (perScene.get(occ) ?? perScene.set(occ, []).get(occ)!).push(it.panelId); }
  known.forEach((it, idx) => {
    const sh = byId.get(it.panelId)!;
    const occ = sh.occurrenceId as string;
    // Hvilken scene står panelet midt i i Premiere? Naboene avgjør; ulike naboer på begge sider = i en annen scene.
    const prev = known[idx - 1] ? byId.get(known[idx - 1]!.panelId)!.occurrenceId : null;
    const next = known[idx + 1] ? byId.get(known[idx + 1]!.panelId)!.occurrenceId : null;
    const moved = prev !== null && next !== null && prev === next && prev !== occ ? String(prev) : null;
    const list = perScene.get(occ)!;
    const pos = list.indexOf(it.panelId);
    const current = storyboardPanelsOf(s, sh.occurrenceId).filter(p => p.active !== false && !p.hidden).map(p => p.id as string);
    const afterPanelId = pos > 0 ? list[pos - 1]! : null;
    const curPos = current.indexOf(it.panelId);
    const curAfter = curPos > 0 ? current[curPos - 1]! : null;
    const orderChanged = moved === null && afterPanelId !== curAfter;
    const durationChanged = it.durationFrames !== sh.durationFrames;
    if (it.baseRevision !== null && it.baseRevision !== sh.panel.revision) conflicts.push(it.panelId);
    if (!orderChanged && !durationChanged && moved === null) return;
    edits.push({ panelId: it.panelId, occurrenceId: occ, movedToOccurrenceId: moved, revision: sh.panel.revision, currentIndex: sh.index, proposedIndex: idx,
      currentDuration: sh.durationFrames, durationFrames: it.durationFrames, afterPanelId, orderChanged, durationChanged });
  });
  return { edits, conflicts, missing: shots.filter(sh => !r.items.some(i => i.panelId === sh.panel.id)).length, unknown: r.items.length - known.length };
}

/**
 * Kommandoene når brukeren godtar forslaget for ett panel (én angregruppe i appen). null når panelet er endret
 * siden forslaget (revisjon) eller ikke finnes; da må brukeren hente sekvensen på nytt. Aldri scenebytte.
 */
export function premiereEditCommands(s: ProjectState, e: PremiereEdit): Command[] | null {
  const p = s.compositions[e.panelId as never];
  if (!p || p.removed || p.kind !== "storyboard" || p.revision !== e.revision || String(p.occurrenceId) !== e.occurrenceId) return null;
  const out: Command[] = [];
  if (e.orderChanged && e.movedToOccurrenceId === null) {
    const list = storyboardPanelsOf(s, p.occurrenceId!).filter(x => x.id !== p.id);
    const ai = e.afterPanelId ? list.findIndex(x => x.id === e.afterPanelId) : -1;
    if (e.afterPanelId && ai < 0) return null;
    const before = ai >= 0 ? list[ai]!.orderKey ?? null : null;
    const after = list[ai + 1]?.orderKey ?? null;
    out.push({ type: "MoveStoryboardPanel", panelId: p.id, orderKey: keyBetween(before, after) } as Command);
  }
  if (e.durationChanged) out.push({ type: "UpdateStoryboardPanel", panelId: p.id, durationFrames: e.durationFrames } as Command);
  return out;
}
