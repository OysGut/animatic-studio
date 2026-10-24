import { useEffect, useRef } from "react";
import type { ProjectState, FilmClip } from "@/core";
import type { Playback } from "@/app/scene-editor/use-playback";
import { currentPosition, rememberPosition } from "./current-scene";
import { panelPosition } from "@/core/storyboard/position";

/** Store subscription, not frame React state: N8 keeps the workspace out of playback ticks. */
export function usePositionPlayback(projectId: string, state: ProjectState, playback: Playback, occurrenceId: string | null, clips?: readonly FilmClip[]) {
  const initial = useRef(currentPosition(projectId));
  const restored = useRef(false);
  useEffect(() => {
    const p = initial.current;
    if (restored.current || !occurrenceId || (p && p.occurrenceId !== occurrenceId && !clips)) return;
    const clip = clips?.find(c => c.occurrenceId === p?.occurrenceId);
    if (p && clips && !clip) return;
    restored.current = true;
    if (p) playback.setFrame((clip?.startFrame ?? 0) + Math.round((p.timeMs ?? 0) * state.project.fps.num / state.project.fps.den / 1000));
  }, [occurrenceId, clips, playback, state.project.fps]);
  useEffect(() => {
    if (!restored.current) return;
    const publish = () => {
      const f = playback.store.get();
      const clip = clips ? [...clips].reverse().find(c => f >= c.startFrame) : null;
      const id = clip?.occurrenceId ?? occurrenceId;
      if (!id) return;
      const p = panelPosition(state, id, null, null, Math.max(0, Math.round((f - (clip?.startFrame ?? 0)) * 1000 * state.project.fps.den / state.project.fps.num)));
      if (p) rememberPosition(projectId, p);
    };
    publish();
    return playback.store.subscribe(publish);
  }, [projectId, state, playback.store, occurrenceId, clips]);
}