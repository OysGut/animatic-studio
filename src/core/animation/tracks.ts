/** Animation is a projection of existing scene layers, image swaps and selected audio takes. */
import { layersOf, layerVersion } from "../composition/render";
import { imageSegmentsOf } from "../composition/segments";
import { audioVersion, clipLanguage } from "../audio";
import { secondsToFrames } from "../time";
import type { ProjectState } from "../model";
import { clipEditOf } from "../dialogue/versions";

export function animationImageTracks(state: ProjectState, compositionId: string, duration: number) {
  return layersOf(state, compositionId).filter(layer => layer.assetId || layer.swaps.length).map(layer => ({
    layer,
    segments: imageSegmentsOf(layer, duration).map(segment => {
      const version = layerVersion(state, layer, segment.start);
      const variant = version ? state.assetVariants[version.variantId] : undefined;
      return { ...segment, version, variant };
    }),
  }));
}

export function animationDialogueTracks(state: ProjectState, occurrenceId: string, language: string) {
  return Object.values(state.audioClips)
    .filter(clip => !clip.removed && clip.occurrenceId === occurrenceId && clip.kind === "dialogue" && (clipLanguage(clip, state) === language || clipLanguage(clip, state) === "*"))
    .sort((a, b) => a.offsetMs - b.offsetMs || a.id.localeCompare(b.id))
    .map(clip => ({
      clip, version: audioVersion(state, clip), block: clip.blockId ? state.blocks[clip.blockId] : undefined,
      start: secondsToFrames(clip.offsetMs / 1000, state.project.fps),
      end: secondsToFrames((clip.offsetMs + clipEditOf(state, clip).lengthMs) / 1000, state.project.fps),
    }));
}

/** Other selected sound clips follow dialogue directly in the same scrolling timeline. */
export function animationSoundTracks(state: ProjectState, occurrenceId: string, language: string) {
  return Object.values(state.audioClips)
    .filter(clip => !clip.removed && clip.occurrenceId === occurrenceId && clip.kind !== "dialogue" && (clipLanguage(clip, state) === language || clipLanguage(clip, state) === "*"))
    .sort((a, b) => a.offsetMs - b.offsetMs || a.id.localeCompare(b.id))
    .map(clip => ({ clip, version: audioVersion(state, clip), block: undefined,
      start: secondsToFrames(clip.offsetMs / 1000, state.project.fps),
      end: secondsToFrames((clip.offsetMs + clip.lengthMs) / 1000, state.project.fps) }));
}
