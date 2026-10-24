/** SB-4: portable reverse dialogue lookup and scene-local storyboard time. */
import type { ProjectState } from "../model";
import { filmClips, blockSpans } from "../assembly/film";
import { panelBlockIds } from "./index";
import { storyboardTimeline } from "./playback";

export function positionIndex(s: ProjectState, productionId: string) {
  const clips = filmClips(s, productionId);
  const shots = storyboardTimeline(s, clips);
  const first = new Map<string, number>();
  const blocks = new Map<string, readonly string[]>();
  for (const shot of shots) {
    if (!first.has(shot.occurrenceId)) first.set(shot.occurrenceId, shot.startFrame);
    blocks.set(shot.panel.id, [...new Set([...panelBlockIds(s, shot.panel.id), ...(shot.panel.storyboard?.dialogueIds ?? [])])]);
  }
  return { clips, shots, first, blocks };
}

export function panelPosition(s: ProjectState, occurrenceId: string, panelId: string | null, blockId: string | null, timeMs = 0, index?: ReturnType<typeof positionIndex>) {
  const occ = s.occurrences[occurrenceId];
  if (!occ) return null;
  const cached = index ?? positionIndex(s, occ.productionId);
  const clips = cached.clips;
  const shots = cached.shots.filter(shot => shot.occurrenceId === occurrenceId);
  const contains = (id: string, block: string) => cached.blocks.get(id)?.includes(block);
  timeMs = Math.max(0, Number.isFinite(timeMs) ? timeMs : 0);
  const shot = (panelId ? shots.find(x => x.panel.id === panelId) : null)
    ?? (blockId ? shots.find(x => contains(x.panel.id, blockId)) : null)
    ?? shots.find(x => timeMs >= (x.startFrame - (shots[0]?.startFrame ?? 0)) * 1000 * s.project.fps.den / s.project.fps.num && timeMs < (x.startFrame - (shots[0]?.startFrame ?? 0) + x.durationFrames) * 1000 * s.project.fps.den / s.project.fps.num);
  const clip = clips.find(c => c.occurrenceId === occurrenceId);
  const span = blockId && clip ? blockSpans(s, clip).find(x => x.blockId === blockId) : null;
  const startMs = shot ? Math.round((shot.startFrame - (shots[0]?.startFrame ?? 0)) * 1000 * s.project.fps.den / s.project.fps.num) : 0;
  return { occurrenceId, sceneId: occ.sceneId, productionId: occ.productionId,
    panelId: shot?.panel.id ?? null,
    blockId: blockId ?? shot?.panel.storyboard?.dialogueIds[0] ?? (shot ? panelBlockIds(s, shot.panel.id)[0] : null) ?? null,
    timeMs: blockId && span && clip ? Math.max(startMs, Math.round((span.startFrame - clip.startFrame) * 1000 * s.project.fps.den / s.project.fps.num)) : panelId && shot ? Math.min(startMs + Math.max(0, shot.durationFrames - 1) * 1000 * s.project.fps.den / s.project.fps.num, Math.max(startMs, timeMs)) : timeMs };
}

export function scrubFrame(x: number, width: number, frames: number, rtl: boolean): number {
  const fraction = width > 0 ? Math.max(0, Math.min(1, x / width)) : 0;
  return Math.round((rtl ? 1 - fraction : fraction) * Math.max(0, frames - 1));
}