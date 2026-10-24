import { useEffect, useMemo, useRef } from "react";
import type { ProjectState, FilmClip } from "@/core";
import type { Playback } from "@/app/scene-editor/use-playback";
import { currentPosition, rememberPosition } from "./current-scene";
import { panelPosition, positionIndex } from "@/core/storyboard/position";

/** Store subscription, not frame React state: N8 keeps the workspace out of playback ticks. */
export function usePositionPlayback(projectId: string, state: ProjectState, playback: Playback, occurrenceId: string | null, clips?: readonly FilmClip[]) {
  const scope = clips ? `${projectId}:${clips[0]?.occurrenceId ?? "empty"}` : `${projectId}:${occurrenceId}`;
  const restored = useRef("");
  const indexes = useMemo(() => {
    const out = new Map<string, ReturnType<typeof positionIndex>>();
    for (const id of new Set(Object.values(state.occurrences).map(o => o.productionId))) out.set(id, positionIndex(state, id));
    return out;
  }, [state]);
  const reverse = useMemo(() => clips ? [...clips].reverse() : [], [clips]);
  useEffect(() => {
    if (restored.current === scope || !occurrenceId) return;
    const p = currentPosition(projectId);
    const clip = clips?.find(c => c.occurrenceId === p?.occurrenceId);
    restored.current = scope;
    if (p && (clip || (!clips && p.occurrenceId === occurrenceId))) playback.setFrame((clip?.startFrame ?? 0) + Math.round((p.timeMs ?? 0) * state.project.fps.num / state.project.fps.den / 1000));
    else playback.setFrame(clips?.[0]?.startFrame ?? 0);
  }, [scope, projectId, occurrenceId, clips, playback, state.project.fps]);
  useEffect(() => {
    if (restored.current !== scope) return;
    const publish = () => {
      const f = playback.store.get();
      const clip = reverse.find(c => f >= c.startFrame);
      const id = clip?.occurrenceId ?? occurrenceId;
      if (!id) return;
      const p = panelPosition(state, id, null, null, Math.max(0, Math.round((f - (clip?.startFrame ?? 0)) * 1000 * state.project.fps.den / state.project.fps.num)), indexes.get(state.occurrences[id]?.productionId ?? ""));
      if (p) rememberPosition(projectId, p);
    };
    publish();
    return playback.store.subscribe(publish);
  }, [scope, projectId, state, playback.store, occurrenceId, clips, reverse, indexes]);
}