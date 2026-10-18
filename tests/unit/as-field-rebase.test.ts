// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  applyCommand, audioClipFieldsOf, checkInvariants, createDraft, draftBaseRevisions,
  draftCommand, draftConflicts, hitTest, insertImageSegment, layerFieldsOf,
  pushDraft, rebaseDraft, redoDraft, renderFrame, undoDraft, type Command,
  type ProjectState, type SceneDraft,
} from "@/core";
import { fixture } from "../visual/fixture-state";
import { envelope, mustApply, tid } from "../helpers/fixtures";

function setup() {
  const s = fixture.state;
  const layer = Object.values(s.layers).find((l) => l.kind !== "group" && l.assetId &&
    Object.values(s.assetVariants).some((v) => v.assetId === l.assetId && Object.values(s.assetVersions).some((ver) => ver.variantId === v.id)));
  if (!layer) throw new Error("Missing image layer");
  const comp = s.compositions[layer.compositionId];
  const occ = Object.values(s.occurrences).find((o) => o.variantId === comp?.variantId);
  const clip = Object.values(s.audioClips).find((c) => c.occurrenceId === occ?.id);
  if (!comp || !occ || !clip) throw new Error("Missing scene fixture");
  return { s, layer, comp, occ, clip };
}
function push(d: SceneDraft, command: Command) {
  const r = pushDraft(d, command);
  if (!r.ok) throw new Error(r.message);
  return r.draft;
}
const mute = (s: ProjectState, id: string, muted: boolean): Command => {
  const clip = s.audioClips[id as never];
  if (!clip) throw new Error("Missing clip");
  return { type: "UpdateAudioClips", clips: [{ clipId: clip.id, fields: { ...audioClipFieldsOf(clip), muted } }] };
};

describe("AS round 2 – field-level drafts", () => {
  it("keeps the new take version alongside draft muting, including save and undo", () => {
    const { s, comp, occ, clip } = setup();
    const d = push(createDraft(s, occ.id, comp.id), mute(s, clip.id, true));
    const old = Object.values(s.assetVersions).find((v) => s.assetVariants[v.variantId]?.assetId === clip.assetId);
    if (!old) throw new Error("Missing sound version");
    const versionId = tid<"asset_version">();
    const number = Math.max(...Object.values(s.assetVersions).filter((v) => v.variantId === old.variantId).map((v) => v.number)) + 1;
    const withVersion = { ...s, assetVersions: { ...s.assetVersions, [versionId]: { ...old, id: versionId, number } } } as ProjectState;
    const fresh = mustApply(withVersion, { type: "UpdateAudioClips", clips: [{ clipId: clip.id, fields: { ...audioClipFieldsOf(clip), assetVariantId: old.variantId, versionId } }] });
    expect(draftConflicts(d, fresh)).toEqual([]);
    const rebased = rebaseDraft(d, fresh);
    if (!rebased.ok) throw new Error(rebased.message);
    const cmd = draftCommand(rebased.draft);
    if (!cmd) throw new Error("Missing draft command");
    expect(cmd.type === "UpdateSceneDraft" && cmd.steps[0]).toEqual({ type: "UpdateAudioClips", clips: [{ clipId: clip.id, fields: { muted: true } }] });
    const saved = applyCommand(fresh, envelope(cmd, undefined, draftBaseRevisions(rebased.draft)));
    if (!saved.ok) throw new Error(saved.error.message);
    expect(saved.state.audioClips[clip.id]).toMatchObject({ muted: true, versionId, revision: (fresh.audioClips[clip.id]?.revision ?? 0) + 1 });
    const undone = mustApply(saved.state, saved.inverse);
    expect(undone.audioClips[clip.id]).toMatchObject({ muted: clip.muted, versionId });
  });

  it("same field on both sides conflicts, even if both chose the same value", () => {
    const { s, comp, occ, clip } = setup();
    const d = push(createDraft(s, occ.id, comp.id), mute(s, clip.id, true));
    expect(draftConflicts(d, mustApply(s, mute(s, clip.id, true)))).toEqual([clip.id]);
  });

  it("an own receipt does not excuse a simultaneous foreign edit to the same row and field", () => {
    const { s, comp, occ, clip } = setup();
    const d = push(createDraft(s, occ.id, comp.id), mute(s, clip.id, true));
    const own = mustApply(s, mute(s, clip.id, true));
    const receipt = { before: s, after: own, affected: [clip.id] };
    expect(draftConflicts(d, own, [receipt])).toEqual([]);
    const foreign = mustApply(own, mute(own, clip.id, true));
    expect(draftConflicts(d, foreign, [receipt])).toEqual([clip.id]);
  });

  it("rebase merges transform subfields and preserves redo after an unrelated own write", () => {
    const { s, comp, occ, layer } = setup();
    const fields = layerFieldsOf(layer);
    const d = push(createDraft(s, occ.id, comp.id), { type: "UpdateLayers", layers: [{ layerId: layer.id, fields: { ...fields, transform: { ...fields.transform, x: 123 } } }] });
    const fresh = mustApply(s, { type: "UpdateLayers", layers: [{ layerId: layer.id, fields: { ...fields, transform: { ...fields.transform, y: 456 } } }] });
    expect(draftConflicts(d, fresh)).toEqual([]);
    const rb = rebaseDraft(undoDraft(d), fresh);
    if (!rb.ok) throw new Error(rb.message);
    expect(redoDraft(rb.draft).state.layers[layer.id]?.transform).toMatchObject({ x: 123, y: 456 });
  });

  it("three variants of the same asset insert three swaps and preserve animation", () => {
    const { s, comp, occ, layer } = setup();
    const variant = Object.values(s.assetVariants).find((v) => v.assetId === layer.assetId);
    const version = Object.values(s.assetVersions).find((v) => v.variantId === variant?.id);
    if (!variant || !version) throw new Error("Missing asset fixture");
    let fresh = s;
    const images = [1, 2, 3].map(() => {
      const assetVariantId = tid<"asset_variant">();
      const versionId = tid<"asset_version">();
      fresh = { ...fresh,
        assetVariants: { ...fresh.assetVariants, [assetVariantId]: { ...variant, id: assetVariantId, approvedVersionId: versionId } },
        assetVersions: { ...fresh.assetVersions, [versionId]: { ...version, id: versionId, variantId: assetVariantId } },
      } as ProjectState;
      return { assetId: layer.assetId ?? "", assetVariantId, versionId };
    });
    expect(checkInvariants(fresh)).toEqual([]);
    let d = createDraft(fresh, occ.id, comp.id);
    for (const [i, image] of images.entries()) {
      const current = d.state.layers[layer.id];
      if (!current) throw new Error("Missing layer");
      d = push(d, { type: "UpdateLayers", layers: [{ layerId: layer.id, fields: insertImageSegment(layerFieldsOf(current), (i + 1) * 20, image) }] });
    }
    expect(d.state.layers[layer.id]?.swaps).toHaveLength(3);
    expect(d.state.layers[layer.id]?.keyframes).toEqual(layer.keyframes);
    expect(checkInvariants(d.state)).toEqual([]);
    const malformed = { ...fresh, assetVariants: { ...fresh.assetVariants, [images[0]?.assetVariantId ?? ""]: { ...variant, id: images[0]?.assetVariantId, approvedVersionId: version.id } } } as ProjectState;
    const current = malformed.layers[layer.id];
    if (!current || !images[0]) throw new Error("Missing test input");
    const rejected = pushDraft(createDraft(malformed, occ.id, comp.id), { type: "UpdateLayers", layers: [{ layerId: layer.id, fields: insertImageSegment(layerFieldsOf(current), 20, images[0]) }] });
    expect(rejected.ok).toBe(false);
    expect(!rejected.ok && rejected.message).toContain("REQ-0136");
  });

  it("a hidden foreground layer cannot intercept a visible layer", () => {
    const { s, comp, layer } = setup();
    const visible = { ...layer, visible: true, keyframes: [], path: null, groupId: null, activeRange: null };
    const hiddenId = tid<"composition_layer">();
    const hidden = { ...visible, id: hiddenId, visible: false, orderKey: "z" };
    const state = { ...s, layers: { [layer.id]: visible, [hiddenId]: hidden } } as ProjectState;
    const frame = renderFrame(state, comp.id, 0, { includeHidden: true, view: "scene" });
    expect(frame.items.some((item) => item.layerId === hiddenId)).toBe(true);
    expect(hitTest(frame, visible.transform.x, visible.transform.y, { includeLocked: true })?.layerId).toBe(layer.id);
  });
});