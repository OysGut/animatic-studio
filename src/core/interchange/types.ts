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
  /** Satt når mediet er konvertert til PNG-sekvens (media-formats.ts): `path` er første bilde, `pattern` bruker %05d. */
  readonly sequence?: { readonly pattern: string };
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
/** Én eksponering i kamerasporet (én per bilde på ener, annethvert bilde på toere). */
export interface CameraFrameSample {
  /** Bilde på opptakstidslinjen, relativt til skuddets start. */
  readonly frame: number;
  /** Synsfeltet på referanseplaten i mm (W0/z). */
  readonly fieldWidthMm: number;
  readonly fieldHeightMm: number;
  /** Panorering i mm på referanseplaten (scenepiksler gjennom pxPerMm). */
  readonly panXMm: number;
  readonly panYMm: number;
  /** Rull i grader (scenens rotasjon). */
  readonly rollDeg: number;
  /** Kamerahøyde over bordet i mm. «Fysisk kamera»: ny høyde fra linseformelen; «fast kamera»: konstant. */
  readonly cameraHeightMm: number;
  /** Digital zoom (1 = hele formatet). I modusen «fast kamera» ligger zoomen i figurstørrelsen (B-090). */
  readonly zoom: number;
}
/** En plate i riggen, med 3D-tolkning (avstand fra kameraet) og 2D-tolkning (parallakse). */
export interface CameraPlate {
  readonly id: string;
  readonly name: string;
  /** Høyde over bordet i mm. */
  readonly heightMm: number;
  /** Avstand fra kameraet i mm (riggens kamerahøyde minus platehøyden). */
  readonly distanceMm: number;
  /** Parallakse relativt til referanseplaten (dRef/d). */
  readonly parallax: number;
}
/**
 * Kamerasporet for et skudd (PTG3, B-102 §4): regnet ut fra scenens rigg (B-087/B-090). Kameraet har
 * aldri egne mål ved siden av riggens; all geometri er avledet. null når scenen ikke har en gyldig rigg.
 */
export interface CameraTrack {
  readonly mode: "fixed" | "moving";
  readonly rigName: string;
  readonly sensorWidthMm: number;
  readonly sensorHeightMm: number;
  readonly focalLengthMm: number;
  /** Riggens kamerahøyde over bordet i mm (fast i «fast kamera», hvilehøyde i «fysisk kamera»). */
  readonly cameraHeightMm: number;
  readonly referencePlateId: string;
  /** Skjermpiksler per mm på referanseplaten (målt ved gyldig kalibrering, ellers fra teorien). */
  readonly pxPerMm: number;
  /** true når pxPerMm kommer fra en gyldig kalibrering (B-090 pkt 5). */
  readonly calibrated: boolean;
  readonly plates: readonly CameraPlate[];
  readonly frames: readonly CameraFrameSample[];
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
  readonly transition: { readonly type: TransitionKind; readonly lengthFrames: number; readonly overlap: boolean; readonly direction?: "left" | "right" | "up" | "down" };
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
  readonly camera: CameraTrack | null;
  /** Why camera is null: no 2D composition, no rig for the scene, or a rig that cannot be used. */
  readonly cameraMissing?: "no-composition" | "no-rig" | "invalid-rig" | null;
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
  /** Prosjektets billedformat i piksler (leveranseformatet pakkene bygger mot). */
  readonly frameSize: { readonly width: number; readonly height: number };
  readonly sourceFps: Rational;
  readonly exposureStep: number;
  readonly lengthFrames: number;
  readonly shots: Shot[];
  readonly references: FileRef[];
  readonly namingVersion: "1";
}