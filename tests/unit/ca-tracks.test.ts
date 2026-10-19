// @vitest-environment node
import { describe, expect, it } from "vitest";
import { animationImageTracks, animationDialogueTracks } from "@/core/animation/tracks";
import { applyCommand, layerFieldsOf, insertImageSegment, replaceImageSegment, removeImageSegment, moveImageSegment, trimImageSegment } from "@/core";
import { fixture } from "../visual/fixture-state";
import { envelope } from "../helpers/fixtures";

const s = fixture.state;
const layer = Object.values(s.layers).find(l => !l.removed && l.assetId);
if (!layer) throw new Error("Missing image fixture");
const comp = s.compositions[layer.compositionId];
if (!comp) throw new Error("Missing composition");
const image = { assetId: layer.assetId ?? "", assetVariantId: layer.assetVariantId, versionId: layer.versionId };

describe("CA2 existing scene projection", () => {
  it("projects all image layers and stable asset identity across swaps", () => {
    const fields = insertImageSegment(layerFieldsOf(layer), 20, image);
    const state = { ...s, layers: { ...s.layers, [layer.id]: { ...layer, ...fields } } };
    const track = animationImageTracks(state, comp.id, 100).find(t => t.layer.id === layer.id);
    expect(track?.segments.map(t => t.image?.assetId)).toEqual([layer.assetId, layer.assetId]);
    expect(track?.segments.map(t => [t.start, t.end])).toEqual([[0, 20], [20, 100]]);
  });
  it("uses selected take identity and project fps, not newest take or UI language", () => {
    const clip = Object.values(s.audioClips).find(c => !c.removed && c.kind === "dialogue");
    if (!clip) throw new Error("Missing dialogue fixture");
    const track = animationDialogueTracks(s, clip.occurrenceId, "nb").find(t => t.clip.id === clip.id);
    expect(track?.start).toBe(Math.round(clip.offsetMs / 1000 * s.project.fps.num / s.project.fps.den));
    if (clip.versionId) expect(track?.version?.id).toBe(clip.versionId);
    expect(animationDialogueTracks(s, clip.occurrenceId, "en").some(t => t.clip.id === clip.id)).toBe(clip.language === "en" || clip.language === "*");
  });
  it("insert, replace, move, trim and remove preserve transforms/keyframes and support undo/redo", () => {
    let state = s;
    const operations = [
      (f: ReturnType<typeof layerFieldsOf>) => insertImageSegment(f, 20, image),
      (f: ReturnType<typeof layerFieldsOf>) => insertImageSegment(f, 40, image),
      (f: ReturnType<typeof layerFieldsOf>) => replaceImageSegment(f, 1, image),
      (f: ReturnType<typeof layerFieldsOf>) => moveImageSegment(f, 1, 22, 100),
      (f: ReturnType<typeof layerFieldsOf>) => trimImageSegment(f, 1, 50),
      (f: ReturnType<typeof layerFieldsOf>) => removeImageSegment(f, 1),
    ];
    for (const operation of operations) {
      const before = state.layers[layer.id];
      if (!before) throw new Error("Missing current layer");
      const fields = operation(layerFieldsOf(before));
      if (!fields) throw new Error("Missing operation fields");
      const result = applyCommand(state, envelope({ type: "UpdateLayers", layers: [{ layerId: layer.id, fields }] }));
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Command rejected");
      expect(result.state.layers[layer.id]?.transform).toEqual(before.transform);
      expect(result.state.layers[layer.id]?.keyframes).toEqual(before.keyframes);
      const undo = applyCommand(result.state, envelope(result.inverse));
      if (!undo.ok) throw new Error("Undo rejected");
      expect(undo.state.layers[layer.id]?.swaps).toEqual(before.swaps);
      const redo = applyCommand(undo.state, envelope(undo.inverse));
      if (!redo.ok) throw new Error("Redo rejected");
      expect(redo.state.layers[layer.id]?.swaps).toEqual(fields.swaps);
      state = redo.state;
    }
    expect(state.assets).toEqual(s.assets);
  });
});
