/** Versioned, variant-owned character setup. All positions are relative to the source image. */
import { L } from "../i18n";
import type { ProjectState } from "../model";
export const RIG_MAX_BYTES = 512 * 1024;
export const FACE_ANCHORS = ["head", "mouth", "nose", "leftEye", "rightEye"] as const;
export type FaceAnchor = typeof FACE_ANCHORS[number];
export interface RelativePoint { readonly x: number; readonly y: number }
export type RigAnchors = Readonly<Partial<Record<FaceAnchor, RelativePoint>>>;
export interface RigSpec { readonly format: 1; readonly anchors: RigAnchors }
export interface AnimationRig { readonly id: string; readonly revision: number; readonly variantId: string; readonly currentVersionId: string | null; readonly removed: boolean }
export interface AnimationRigVersion { readonly id: string; readonly revision: number; readonly rigId: string; readonly number: number; readonly sourceVersionId: string; readonly spec: RigSpec; readonly algorithmVersion: 1; readonly removed: boolean }
export interface AnimationUse { readonly id: string; readonly revision: number; readonly layerId: string; readonly occurrenceId: string; readonly rigVersionId: string; readonly enabled: boolean; readonly removed: boolean }
export function rigSpecError(spec: RigSpec): string | null {
  if (!spec || spec.format !== 1 || !spec.anchors || typeof spec.anchors !== "object" || Array.isArray(spec.anchors)) return L("Ugyldig animasjonsoppsett", "Invalid animation setup");
  if (new TextEncoder().encode(JSON.stringify(spec)).length > RIG_MAX_BYTES) return L("Oppsettet er større enn 512 kB", "The setup exceeds 512 kB");
  for (const [key, point] of Object.entries(spec.anchors)) {
    if (!(FACE_ANCHORS as readonly string[]).includes(key) || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return L("Ankerpunkter må ligge innenfor bildet", "Anchors must be within the image");
  }
  return null;
}
export function rigOfVariant(state: ProjectState, variantId: string) {
  return Object.values(state.animationRigs).find(r => !r.removed && r.variantId === variantId);
}
export function animationUseOf(state: ProjectState, layerId: string, occurrenceId: string) {
  return Object.values(state.animationUses).find(u => !u.removed && u.layerId === layerId && u.occurrenceId === occurrenceId);
}
