/** SB-4: portable reverse dialogue lookup and scene-local storyboard time. */
import type { ProjectState } from "../model";
import { filmClips, blockSpans } from "../assembly/film";
import { panelBlockIds } from "./index";
import { storyboardTimeline } from "./playback";

export function panelPosition(s: ProjectState, occurrenceId: string, panelId: string | null, blockId: string | null, timeMs = 0) {
  const occ = s.occurrences[occurrenceId];
  if (!occ) return null;
  const clips = filmClips(s, occ.productionId);
  const shots = storyboardTimeline(s, clips).filter(shot => shot.occurrenceId === occurrenceId);
  const contains = (id: string, block: string) => panelBlockIds(s, id).includes(block as never) || s.compositions[id]?.storyboard?.dialogueIds.includes(block);
  const shot = (panelId ? shots.find(x => x.panel.id === panelId) : null)
    ?? (blockId ? shots.find(x => contains(x.panel.id, blockId)) : null)
    ?? shots.find(x => timeMs >= (x.startFrame - (shots[0]?.startFrame ?? 0)) * 1000 * s.project.fps.den / s.project.fps.num && timeMs < (x.startFrame - (shots[0]?.startFrame ?? 0) + x.durationFrames) * 1000 * s.project.fps.den / s.project.fps.num);
  const clip = clips.find(c => c.occurrenceId === occurrenceId);
  const span = blockId && clip ? blockSpans(s, clip).find(x => x.blockId === blockId) : null;
  const startMs = shot ? Math.round((shot.startFrame - (shots[0]?.startFrame ?? 0)) * 1000 * s.project.fps.den / s.project.fps.num) : 0;
  return { occurrenceId, sceneId: occ.sceneId, productionId: occ.productionId,
    panelId: shot?.panel.id ?? null,
    blockId: blockId ?? shot?.panel.storyboard?.dialogueIds[0] ?? (shot ? panelBlockIds(s, shot.panel.id)[0] : null) ?? null,
    timeMs: blockId && span && clip ? Math.max(startMs, Math.round((span.startFrame - clip.startFrame) * 1000 * s.project.fps.den / s.project.fps.num)) : panelId ? Math.max(startMs, timeMs) : timeMs };
}

export function scrubFrame(x: number, width: number, frames: number, rtl: boolean): number {
  const fraction = width > 0 ? Math.max(0, Math.min(1, x / width)) : 0;
  return Math.round((rtl ? 1 - fraction : fraction) * Math.max(0, frames - 1));
}