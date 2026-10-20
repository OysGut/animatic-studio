/** Versioned, variant-owned character setup. All positions are relative to the source image. */
import { isPartSlot, rigPartError, type RigPart } from "./parts";
import { L } from "../i18n";
import type { ProjectState } from "../model";
import { t } from "@/core/i18n/keyed";
export const RIG_MAX_BYTES = 512 * 1024;
export const FACE_ANCHORS = ["head", "mouth", "nose", "leftEye", "rightEye"] as const;
export type FaceAnchor = typeof FACE_ANCHORS[number];
export interface RelativePoint { readonly x: number; readonly y: number }
export type RigAnchors = Readonly<Partial<Record<FaceAnchor, RelativePoint>>>;
/** CA7: standard karakteratferd på oppsettet (arves av alle bruk; lokale verdier på bruken overstyrer). */
export interface CharacterBehavior {
  readonly blinkEnabled?: boolean;
  readonly leftEyePatternId?: string | null;
  readonly rightEyePatternId?: string | null;
  /** Tics og standard overleggsmønstre. */
  readonly overlayPatternIds?: readonly string[];
  /** Pust: periode (ms) og utslag (andel av høyden, 0–0.05). */
  readonly breath?: { readonly enabled: boolean; readonly periodMs: number; readonly amount: number };
}
/** CA7: hvor oppsettet kom fra i det globale biblioteket (låst versjon). */
export interface RigOrigin { readonly globalSpecId: string; readonly globalNumber: number; readonly globalVariantId: string }
export interface RigSpec { readonly format: 1; readonly anchors: RigAnchors; readonly parts?: Readonly<Record<string, RigPart>>; readonly behavior?: CharacterBehavior; readonly origin?: RigOrigin }
export interface AnimationRig { readonly id: string; readonly revision: number; readonly variantId: string; readonly currentVersionId: string | null; readonly removed: boolean }
export interface AnimationRigVersion { readonly id: string; readonly revision: number; readonly rigId: string; readonly number: number; readonly sourceVersionId: string; readonly spec: RigSpec; readonly algorithmVersion: 1; readonly removed: boolean }
/** CA6 (§35–§44, §67): per-scene-innstillinger for en animasjonsbruk. Mangler = standardatferd. */
export interface UseBehavior {
  /** Automatisk blinking av/på (§35). Mangler = på. */
  readonly blinkEnabled?: boolean;
  /** Mønster per øye (§36); null = ikke noe mønster. Mangler = riggens standard. */
  readonly leftEyePatternId?: string | null;
  readonly rightEyePatternId?: string | null;
  /** Lokalt seed for denne forekomsten (§67); påvirker ikke andre scener. */
  readonly seed?: number;
  /** Manuelle blink/halvlukkede perioder (frames), redigerbare (§35, §37). */
  readonly manualBlinks?: readonly { readonly eye: "left" | "right" | "both"; readonly frame: number; readonly endFrame: number; readonly intensity: number }[];
  /** Aktive overleggsmønstre på laget (§39–§44). */
  readonly overlayPatternIds?: readonly string[];
  /** CA7: lokal overstyring av pusten. */
  readonly breath?: CharacterBehavior["breath"];
  /** CA8: eksportvalg for laget (§103–§106). Mangler = alt med, innbrent. */
  readonly export?: ExportFlags;
}
/** CA8: hva som tas med fra karakteranimasjonen, og om det brennes inn eller legges som eget lag. */
export interface ExportFlags {
  readonly mouth: boolean; readonly blink: boolean; readonly overlay: boolean; readonly masks: boolean; readonly adjust: boolean;
  readonly mode: "burned" | "separate";
}
export const DEFAULT_EXPORT_FLAGS: ExportFlags = { mouth: true, blink: true, overlay: true, masks: true, adjust: true, mode: "burned" };
export function breathError(b: CharacterBehavior["breath"] | undefined): string | null {
  if (b === undefined) return null;
  if (!b || typeof b.enabled !== "boolean" || !Number.isFinite(b.periodMs) || b.periodMs < 500 || b.periodMs > 20000 || !Number.isFinite(b.amount) || b.amount < 0 || b.amount > 0.05) return t("core-animation-rig.breath-error.message.7b28b3c88d65");
  return null;
}
export function exportFlagsError(f: ExportFlags | undefined): string | null {
  if (f === undefined) return null;
  if (!f || !["mouth", "blink", "overlay", "masks", "adjust"].every(k => typeof (f as unknown as Record<string, unknown>)[k] === "boolean") || (f.mode !== "burned" && f.mode !== "separate")) return t("core-animation-rig.export-flags-error.message.10111a9166c3");
  return null;
}
export interface AnimationUse { readonly id: string; readonly revision: number; readonly layerId: string; readonly occurrenceId: string; readonly rigVersionId: string; readonly enabled: boolean; readonly behavior?: UseBehavior; readonly removed: boolean }
export function rigSpecError(spec: RigSpec): string | null {
  if (!spec || spec.format !== 1 || !spec.anchors || typeof spec.anchors !== "object" || Array.isArray(spec.anchors)) return t("core-animation-rig.rig-spec-error.message.1ac74d450f78");
  if (new TextEncoder().encode(JSON.stringify(spec)).length > RIG_MAX_BYTES) return t("core-animation-rig.rig-spec-error.message.7c26bdd97397");
  for (const [key, point] of Object.entries(spec.anchors)) {
    if (!(FACE_ANCHORS as readonly string[]).includes(key) || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return t("core-animation-rig.rig-spec-error.message.2b765a047145");
  }
  if (spec.parts !== undefined) {
    if (!spec.parts || typeof spec.parts !== "object" || Array.isArray(spec.parts)) return t("core-animation-rig.rig-spec-error.message.1f68dffe51bb");
    for (const [slot, part] of Object.entries(spec.parts)) if (!isPartSlot(slot) || rigPartError(part)) return t("core-animation-rig.rig-spec-error.message.339421d88273");
  }
  if (spec.behavior !== undefined) {
    const b = spec.behavior;
    if (!b || typeof b !== "object" || Array.isArray(b) || breathError(b.breath) || (b.blinkEnabled !== undefined && typeof b.blinkEnabled !== "boolean") || (b.overlayPatternIds !== undefined && (!Array.isArray(b.overlayPatternIds) || b.overlayPatternIds.length > 50))) return t("core-animation-rig.rig-spec-error.message.959ab576abb9");
  }
  if (spec.origin !== undefined && (!spec.origin || !Number.isInteger(spec.origin.globalNumber) || spec.origin.globalNumber < 1 || typeof spec.origin.globalSpecId !== "string")) return t("core-animation-rig.rig-spec-error.message.e4c01f96bc7c");
  return null;
}
export function rigOfVariant(state: ProjectState, variantId: string) {
  return Object.values(state.animationRigs).find(r => !r.removed && r.variantId === variantId);
}
export function animationUseOf(state: ProjectState, layerId: string, occurrenceId: string) {
  return Object.values(state.animationUses).find(u => !u.removed && u.layerId === layerId && u.occurrenceId === occurrenceId);
}
