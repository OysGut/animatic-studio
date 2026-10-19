/** All rig writes use the ordinary command/patch transaction, including undo and redo. */
import { L } from "../i18n";
import { isUuid } from "../ids";
import type { ProjectState } from "../model";
import { rigSpecError, type AnimationRig, type AnimationRigVersion, type AnimationUse, type RigSpec, type RigAnchors } from "./rig";
export type RigCommand =
  | { type: "CreateRig"; rigId: string; variantId: string }
  | { type: "SaveRigVersion"; rigId: string; versionId: string; sourceVersionId: string; spec: RigSpec }
  | { type: "SetRigAnchors"; rigId: string; versionId: string; sourceVersionId: string; anchors: RigAnchors }
  | { type: "AttachAnimationUse"; useId: string; layerId: string; occurrenceId: string; rigVersionId: string }
  | { type: "SetAnimationLayerEnabled"; useId: string; enabled: boolean }
  | { type: "UndoAnimationChange"; rigs: Readonly<Record<string, AnimationRig | null>>; versions: Readonly<Record<string, AnimationRigVersion | null>>; uses: Readonly<Record<string, AnimationUse | null>> };
export function applyRigCommand(s: ProjectState, c: RigCommand) {
  const rigs = { ...s.animationRigs }, versions = { ...s.animationRigVersions }, uses = { ...s.animationUses };
  const inverse: Extract<RigCommand, { type: "UndoAnimationChange" }> = { type: "UndoAnimationChange", rigs: {}, versions: {}, uses: {} };
  const oldRigs: Record<string, AnimationRig | null> = {}, oldVersions: Record<string, AnimationRigVersion | null> = {}, oldUses: Record<string, AnimationUse | null> = {};
  const invalid = (message: string): never => { throw new Error(message); };
  const fresh = (id: string) => { if (!isUuid(id) || Object.values(s).some(v => v && typeof v === "object" && Object.prototype.hasOwnProperty.call(v, id))) invalid(L("Ugyldig eller brukt ID", "Invalid or used ID")); };
  if (c.type === "CreateRig") {
    fresh(c.rigId);
    const variant = s.assetVariants[c.variantId];
    if (!variant || variant.archived || Object.values(rigs).some(r => !r.removed && r.variantId === c.variantId)) invalid(L("Varianten mangler eller har allerede et oppsett", "The variant is missing or already has a setup"));
    oldRigs[c.rigId] = null;
    rigs[c.rigId] = { id: c.rigId, revision: 1, variantId: c.variantId, currentVersionId: null, removed: false };
  } else if (c.type === "SaveRigVersion" || c.type === "SetRigAnchors") {
    fresh(c.versionId);
    const rig = rigs[c.rigId];
    if (!rig || rig.removed) return invalid(L("Oppsettet finnes ikke", "The setup was not found"));
    const source = s.assetVersions[c.sourceVersionId];
    if (!source || source.removed || source.variantId !== rig.variantId || !source.mimeType.startsWith("image/")) invalid(L("Bildet tilhører ikke oppsettets variant", "The image does not belong to the setup variant"));
    const previous = rig.currentVersionId ? versions[rig.currentVersionId] : undefined;
    const spec: RigSpec = c.type === "SetRigAnchors" ? { ...(previous?.spec ?? { format: 1 }), anchors: c.anchors } : c.spec;
    const error = rigSpecError(spec); if (error) invalid(error);
    for (const part of Object.values(spec.parts ?? {})) {
      if (!part.versionId) continue;
      const image = s.assetVersions[part.versionId];
      if (!image || image.removed || !image.mimeType.startsWith("image/") || s.assetVariants[image.variantId]?.assetId !== s.assetVariants[rig.variantId]?.assetId) invalid(L("Rigg-delen tilhører ikke ressursen", "The rig part does not belong to the asset"));
    }
    oldRigs[rig.id] = rig; oldVersions[c.versionId] = null;
    versions[c.versionId] = { id: c.versionId, revision: 1, rigId: rig.id, sourceVersionId: c.sourceVersionId, number: Math.max(0, ...Object.values(versions).filter(v => v.rigId === rig.id).map(v => v.number)) + 1, spec: structuredClone(spec), algorithmVersion: 1, removed: false };
    rigs[rig.id] = { ...rig, currentVersionId: c.versionId, revision: rig.revision + 1 };
  } else if (c.type === "AttachAnimationUse") {
    if (!uses[c.useId]) fresh(c.useId);
    const layer = s.layers[c.layerId], occurrence = s.occurrences[c.occurrenceId], version = versions[c.rigVersionId];
    const rig = version ? rigs[version.rigId] : undefined;
    if (!layer || layer.removed || !occurrence || !occurrence.active || !version || version.removed || !rig || rig.removed || s.compositions[layer.compositionId]?.variantId !== occurrence.variantId || s.assetVariants[rig.variantId]?.assetId !== layer.assetId) invalid(L("Oppsettet kan ikke brukes på dette laget", "The setup cannot be used on this layer"));
    if (Object.values(uses).some(u => !u.removed && u.layerId === c.layerId && u.occurrenceId === c.occurrenceId && u.id !== c.useId)) invalid(L("Laget har allerede et animasjonsoppsett", "The layer already has an animation setup"));
    oldUses[c.useId] = uses[c.useId] ?? null;
    uses[c.useId] = { id: c.useId, revision: (uses[c.useId]?.revision ?? 0) + 1, layerId: c.layerId, occurrenceId: c.occurrenceId, rigVersionId: c.rigVersionId, enabled: true, removed: false };
  } else if (c.type === "SetAnimationLayerEnabled") {
    const use = uses[c.useId]; if (!use || use.removed || typeof c.enabled !== "boolean") return invalid(L("Animasjonsbruken finnes ikke", "The animation use was not found"));
    oldUses[use.id] = use; uses[use.id] = { ...use, enabled: c.enabled, revision: use.revision + 1 };
  } else {
    for (const [id, row] of Object.entries(c.rigs)) { oldRigs[id] = rigs[id] ?? null; if (row) rigs[id] = { ...row, revision: (rigs[id]?.revision ?? 0) + 1 }; else delete rigs[id]; }
    for (const [id, row] of Object.entries(c.versions)) { oldVersions[id] = versions[id] ?? null; if (row) versions[id] = { ...row, revision: (versions[id]?.revision ?? 0) + 1 }; else delete versions[id]; }
    for (const [id, row] of Object.entries(c.uses)) { oldUses[id] = uses[id] ?? null; if (row) uses[id] = { ...row, revision: (uses[id]?.revision ?? 0) + 1 }; else delete uses[id]; }
    if (Object.values(versions).some(v => !rigs[v.rigId]) || Object.values(rigs).some(r => r.currentVersionId && !versions[r.currentVersionId]) || Object.values(uses).some(u => !versions[u.rigVersionId])) invalid(L("Oppsettet brukes fortsatt. Angre bruken først.", "The setup is still in use. Undo its use first."));
  }
  return { state: { ...s, animationRigs: rigs, animationRigVersions: versions, animationUses: uses }, inverse: { ...inverse, rigs: oldRigs, versions: oldVersions, uses: oldUses }, affected: [...Object.keys(oldRigs), ...Object.keys(oldVersions), ...Object.keys(oldUses)] };
}
