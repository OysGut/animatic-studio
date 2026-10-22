/** PTG4 project-owned mouth data. Scene-local frames use the project rate; export remaps boundaries. */
export const RHUBARB_MOUTHS = ["A", "B", "C", "D", "E", "F", "G", "H", "X"] as const;
export const BLAIR_MOUTHS = ["AI", "E", "O", "U", "FV", "L", "MBP", "WQ", "etc", "rest"] as const;
export type MouthSystem = "rhubarb" | "preston-blair";
export type MouthShape = typeof RHUBARB_MOUTHS[number] | typeof BLAIR_MOUTHS[number];
export interface MouthSet {
  readonly id: string;
  readonly revision: number;
  readonly characterId: string;
  readonly system: MouthSystem;
  readonly variants: Readonly<Partial<Record<MouthShape, string | null>>>;
  readonly removed: boolean;
}
export interface MouthSpan { readonly startFrame: number; readonly endFrame: number; readonly shape: MouthShape }
export interface MouthTrack {
  readonly id: string;
  readonly revision: number;
  readonly occurrenceId: string;
  readonly characterId: string;
  readonly setId: string;
  readonly clipId: string;
  readonly blockId: string;
  readonly language: string;
  readonly spans: readonly MouthSpan[];
  /** Immutable generation basis; manual editing never updates this receipt. */
  readonly source: { readonly text: string; readonly blockRevision: number; readonly audioSignature: string; readonly setSystem: MouthSystem; readonly algorithm: "ptg4-text-1" };
  readonly removed: boolean;
}
export const mouthShapes = (system: MouthSystem): readonly MouthShape[] => system === "rhubarb" ? RHUBARB_MOUTHS : BLAIR_MOUTHS;
export function validMouthSpans(spans: readonly MouthSpan[], system: MouthSystem): boolean {
  if (!Array.isArray(spans) || spans.length > 100000) return false;
  let end = 0;
  for (const span of spans) {
    if (!span || !Number.isInteger(span.startFrame) || !Number.isInteger(span.endFrame) || span.startFrame < end || span.endFrame <= span.startFrame || !mouthShapes(system).includes(span.shape)) return false;
    end = span.endFrame;
  }
  return true;
}