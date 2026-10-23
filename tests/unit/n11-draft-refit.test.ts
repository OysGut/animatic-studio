// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyCommand, createDraft, defaultLayerFields, draftBaseRevisions, draftCommand, draftConflicts, layerFieldsOf, orderedOccurrences, pushDraft, rebaseDraft } from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

function setup() {
  const seed = seedProject(2);
  const occ = orderedOccurrences(seed.state, seed.mainId)[0];
  if (!occ) throw new Error("Missing scene fixture");
  const assetId = tid<"asset">(), variantId = tid<"asset_variant">(), compositionId = tid<"composition">(), layerId = tid<"composition_layer">();
  let state = mustApply(seed.state, { type: "CreateAssets", assets: [{ assetId, fields: { kind: "character", name: "Figur", names: [], description: "", category: "", tags: [] } }] });
  state = mustApply(state, { type: "CreateAssetVariant", variantId, assetId, fields: { name: "A", style: "animatic", appearance: "" } });
  state = mustApply(state, { type: "CreateComposition", compositionId, variantId: occ.variantId, fields: { name: "Scene", width: 1920, height: 1080, durationFrames: 100, background: "#000000" } });
  const comp = state.compositions[compositionId];
  if (!comp) throw new Error("Missing composition");
  const fields = defaultLayerFields(state, comp, { assetId, assetVariantId: variantId });
  state = mustApply(state, { type: "AddLayers", layers: [{ layerId, compositionId, fields: { ...fields, transform: { ...fields.transform, x: 300, y: 200, scaleX: 0.2, scaleY: 0.6 } } }] });
  const imageVariantId = tid<"asset_variant">();
  state = mustApply(state, { type: "CreateAssetVariant", variantId: imageVariantId, assetId, fields: { name: "B", style: "animatic", appearance: "" } });
  const versionId = tid<"asset_version">();
  state = mustApply(state, {
    type: "AddAssetVersion", versionId, variantId: imageVariantId, note: "",
    media: { path: `${state.project.id}/${assetId}/${versionId}/b.png`, mimeType: "image/png", width: 1600, height: 900, byteSize: 1000, sha256: "e".repeat(64) },
  });
  const layer = state.layers[layerId];
  if (!layer) throw new Error("Missing layer");
  const pushed = pushDraft(createDraft(state, occ.id, comp.id), {
    type: "UpdateLayers", layers: [{ layerId, fields: { ...layerFieldsOf(layer), assetVariantId: imageVariantId } }],
  });
  if (!pushed.ok) throw new Error(pushed.message);
  return { state, layerId, versionId, draft: pushed.draft };
}

describe("N11 – plassholderrefit i Asset Studio-utkast", () => {
  it("lagring gir bildets proporsjoner, vanlig innsettingsstørrelse og samme senter i én revisjon", () => {
    const { state, layerId, draft } = setup();
    const command = draftCommand(draft);
    if (!command) throw new Error("Missing draft command");
    const saved = applyCommand(state, envelope(command, undefined, draftBaseRevisions(draft)));
    if (!saved.ok) throw new Error(saved.error.message);
    expect(saved.state.layers[layerId]).toMatchObject({ width: 1600, height: 900,
      transform: { x: 300, y: 200, scaleX: 0.6, scaleY: 0.6 }, revision: (state.layers[layerId]?.revision ?? 0) + 1 });
    expect(saved.inverse.type).toBe("WithLayerRefit");
    const undo = applyCommand(saved.state, envelope(saved.inverse));
    if (!undo.ok) throw new Error(undo.error.message);
    expect(layerFieldsOf(undo.state.layers[layerId] ?? (() => { throw new Error("Missing layer"); })())).toEqual(layerFieldsOf(state.layers[layerId] ?? (() => { throw new Error("Missing layer"); })()));
    const redo = applyCommand(undo.state, envelope(undo.inverse));
    if (!redo.ok) throw new Error(redo.error.message);
    expect(redo.state.layers[layerId]?.transform).toEqual(saved.state.layers[layerId]?.transform);
    expect(redo.state.layers[layerId]?.width).toBe(1600);
  });

  it("rebase og angring bevarer en samtidig endring av et uvedkommende lagfelt", () => {
    const { state, layerId, draft } = setup();
    const layer = state.layers[layerId];
    if (!layer) throw new Error("Missing layer");
    const fresh = mustApply(state, { type: "UpdateLayers", layers: [{ layerId, fields: { ...layerFieldsOf(layer), name: "Behold dette navnet" } }] });
    expect(draftConflicts(draft, fresh)).toEqual([]);
    const rb = rebaseDraft(draft, fresh);
    if (!rb.ok) throw new Error(rb.message);
    const command = draftCommand(rb.draft);
    if (!command) throw new Error("Missing draft command");
    const saved = applyCommand(fresh, envelope(command, undefined, draftBaseRevisions(rb.draft)));
    if (!saved.ok) throw new Error(saved.error.message);
    expect(saved.state.layers[layerId]?.name).toBe("Behold dette navnet");
    expect(saved.state.layers[layerId]?.transform.scaleX).toBe(0.6);
    const undo = mustApply(saved.state, saved.inverse);
    expect(undo.layers[layerId]?.name).toBe("Behold dette navnet");
    expect(undo.layers[layerId]?.width).toBe(512);
  });
});