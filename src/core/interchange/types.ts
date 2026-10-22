import type { Rational } from "../time";
import type { CompositionLayer, AudioClip, TransitionKind } from "../model";

export interface EventTime {
  readonly absoluteStartFrame: number;
  readonly absoluteEndFrame: number;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly lengthFrames: number;
  readonly crossesCut: boolean;
}
export interface FileRef {
  readonly id: string;
  readonly mediaPath: string;
  readonly path: string;
  readonly mimeType: string;
  readonly byteSize: number;
}
export interface LayerTrack {
  readonly id: string;
  readonly source: CompositionLayer;
  readonly fileId: string | null;
  readonly keyframes: readonly (Omit<CompositionLayer["keyframes"][number], "frame"> & { readonly frame: number })[];
  readonly swaps: readonly (Omit<CompositionLayer["swaps"][number], "frame"> & { readonly frame: number; readonly fileId: string | null })[];
  readonly activeRange: { readonly startFrame: number; readonly endFrame: number } | null;
  readonly path: (Omit<NonNullable<CompositionLayer["path"]>, "startFrame" | "endFrame"> & { readonly startFrame: number; readonly endFrame: number }) | null;
}
export interface AudioTrack extends EventTime {
  readonly id: string;
  readonly sourceOccurrenceId: string;
  readonly source: AudioClip;
  readonly fileId: string | null;
  readonly sourceInMs: number;
  readonly speed: number;
  readonly gain: number;
  readonly fadeInFrames: number;
  readonly fadeOutFrames: number;
  readonly volumeKeys: readonly { readonly frame: number; readonly db: number }[];
}
export interface WordEvent extends EventTime {
  readonly id: string;
  readonly blockId: string;
  readonly audioId: string;
  readonly text: string;
}
export interface InterchangeDialogueLine extends EventTime {
  readonly id: string;
  readonly sourceOccurrenceId: string;
  readonly text: string;
  readonly character: string;
  readonly characterAssetId: string | null;
  readonly estimated: boolean;
}
export interface Shot {
  readonly id: string;
  readonly sceneId: string;
  readonly sceneNumber: string | null;
  readonly shotNumber: number;
  readonly version: number;
  readonly name: string;
  readonly startFrame: number;
  readonly lengthFrames: number;
  readonly timecodeIn: string;
  /** Exclusive endpoint, like all interchange ranges. */
  readonly timecodeOut: string;
  readonly handleIn: number;
  readonly handleOut: number;
  readonly frameIn: number;
  readonly frameOut: number;
  readonly transition: { readonly type: TransitionKind; readonly lengthFrames: number; readonly overlap: boolean };
  readonly sourceStartFrame: number;
  readonly sourceLengthFrames: number;
  readonly compositionId: string | null;
  readonly thumbnail: { readonly path: string; readonly sourceFrame: number };
  readonly description: string;
  readonly characters: readonly string[];
  readonly sets: readonly string[];
  readonly props: readonly string[];
  readonly status: string;
  readonly layers: readonly LayerTrack[];
  readonly camera: null;
  readonly audio: AudioTrack[];
  readonly dialogue: InterchangeDialogueLine[];
  readonly words: WordEvent[];
}
export interface InterchangeDoc {
  readonly project: { readonly id: string; readonly code: string; readonly name: string };
  readonly production: { readonly id: string; readonly name: string };
  readonly language: { readonly dialogue: string; readonly subtitles: string | null };
  readonly fps: Rational;
  readonly captureFps: Rational;
  readonly sourceFps: Rational;
  readonly exposureStep: number;
  readonly lengthFrames: number;
  readonly shots: Shot[];
  readonly references: FileRef[];
  readonly namingVersion: "1";
}