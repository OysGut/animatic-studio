/** Shared evaluator boundary; CA3 anchors are non-rendering metadata, never destructive transforms. */
import type { ProjectState } from "../model";
import type { Frame } from "../composition/render";
import { layerVersion, layersOf } from "../composition/render";
import { rigSpecError } from "./rig";
export function characterRigAt(s: ProjectState, layerId: string, variantId: string | null) {
  const use = Object.values(s.animationUses).find(u => !u.removed && u.enabled && u.layerId === layerId);
  if (!use) return null;
  const version = s.animationRigVersions[use.rigVersionId];
  const rig = version ? s.animationRigs[version.rigId] : undefined;
  const layer = s.layers[layerId];
  if (!version || version.removed || !rig || rig.removed || rig.variantId !== variantId || !layer || s.occurrences[use.occurrenceId]?.variantId !== s.compositions[layer.compositionId]?.variantId || rigSpecError(version.spec)) return null;
  return { use, rig, version };
}
export function evaluateCharacterFrame(s: ProjectState, compositionId: string, frame: number, base: Frame): Frame {
  // CA4 authors the immutable shape set; CA5/CA6 add timed virtual mouth/eye draw items here.
  // Resolve only the currently visible variant, so swaps never inherit another variant's setup (§47).
  for (const layer of layersOf(s, compositionId)) {
    const version = layerVersion(s, layer, frame);
    const setup = characterRigAt(s, layer.id, version?.variantId ?? null);
    // CA3 establishes the shared, version-gated boundary; anchors alone draw no new pixels.
    if (!setup) continue;
  }
  return base;
}
