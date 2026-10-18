// @vitest-environment node
/**
 * AS retterunde 1: samlede kommandoer (UpdateSceneDraft, RetimeScene) gir én skriving per rad. Revisjonen blir
 * opprinnelig + 1 uansett hvor mange trinn som rører raden, også ved angring.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPOSITION,
  applyCommand,
  audioClipFieldsOf,
  checkInvariants,
  createDraft,
  defaultLayerFields,
  draftBaseRevisions,
  draftCommand,
  layerFieldsOf,
  pushDraft,
  scriptView,
  type AudioClipFields,
  type Command,
  type ProjectState,
  type SceneDraft,
} from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

function scene() {
  const seed = seedProject(2);
  const occ = scriptView(seed.state, seed.mainId)[1]!.occurrenceId;
  const o = seed.state.occurrences[occ]!;
  let s = seed.state;
  const soundId = tid<"asset">();
  s = mustApply(s, {
    type: "CreateAssets",
    assets: [{ assetId: soundId, fields: { kind: "sound", name: "Lyd", names: [], description: "", category: "", tags: [] } }],
  });
  const compositionId = tid<"composition">();
  s = mustApply(s, {
    type: "CreateComposition",
    compositionId,
    variantId: o.variantId,
    fields: { ...DEFAULT_COMPOSITION, durationFrames: 200 },
  });
  const layerId = tid<"composition_layer">();
  s = mustApply(s, {
    type: "AddLayers",
    layers: [{ layerId, compositionId, fields: defaultLayerFields(s, s.compositions[compositionId]!, { fill: "#808080" }) }],
  });
  const clipId = tid<"audio_clip">();
  const clip: AudioClipFields = {
    occurrenceId: occ as never,
    kind: "music",
    name: "Musikk",
    assetId: soundId as never,
    assetVariantId: null,
    versionId: null,
    blockId: null,
    offsetMs: 0,
    sourceInMs: 0,
    lengthMs: 1000,
    gainDb: 0,
    fadeInMs: 0,
    fadeOutMs: 0,
    muted: false,
    continues: false,
    volumeKeys: [],
  };
  s = mustApply(s, { type: "AddAudioClips", clips: [{ clipId, fields: clip }] });
  return { s, occ, compositionId, layerId, clipId };
}

const moveLayer = (s: ProjectState, id: string, x: number): Command => {
  const f = layerFieldsOf(s.layers[id as never]!);
  return { type: "UpdateLayers", layers: [{ layerId: id as never, fields: { ...f, transform: { ...f.transform, x } } }] };
};
const gainClip = (s: ProjectState, id: string, gainDb: number): Command =>
  ({
    type: "UpdateAudioClips",
    clips: [{ clipId: id, fields: { ...audioClipFieldsOf(s.audioClips[id as never]!), gainDb } }],
  }) as Command;

function draftWith(s: ProjectState, occ: string, comp: string, n: number, layerId: string, clipId: string): SceneDraft {
  let d = createDraft(s, occ, comp);
  for (let i = 1; i <= n; i++) {
    for (const c of [moveLayer(d.state, layerId, i * 10), gainClip(d.state, clipId, -i)]) {
      const r = pushDraft(d, c);
      if (!r.ok) throw new Error(r.message);
      d = r.draft;
    }
  }
  return d;
}

describe("AS retterunde 1 – én revisjon per rad", () => {
  for (const n of [2, 3]) {
    it(`UpdateSceneDraft med ${n} trinn på samme lag og lydklipp: + 1, også ved angring`, () => {
      const { s, occ, compositionId, layerId, clipId } = scene();
      const lr = s.layers[layerId as never]!.revision;
      const cr = s.audioClips[clipId as never]!.revision;
      const d = draftWith(s, occ, compositionId, n, layerId, clipId);
      const saved = applyCommand(s, envelope(draftCommand(d)!, undefined, draftBaseRevisions(d)));
      expect(saved.ok).toBe(true);
      if (!saved.ok) return;
      expect(saved.state.layers[layerId as never]!.revision).toBe(lr + 1);
      expect(saved.state.audioClips[clipId as never]!.revision).toBe(cr + 1);
      expect(saved.state.layers[layerId as never]!.transform.x).toBe(n * 10);
      expect(saved.state.audioClips[clipId as never]!.gainDb).toBe(-n);
      expect(checkInvariants(saved.state)).toEqual([]);
      const undo = applyCommand(saved.state, envelope(saved.inverse));
      expect(undo.ok).toBe(true);
      if (!undo.ok) return;
      expect(undo.state.layers[layerId as never]!.revision).toBe(lr + 2);
      expect(undo.state.audioClips[clipId as never]!.revision).toBe(cr + 2);
      expect(undo.state.layers[layerId as never]!.transform.x).toBe(s.layers[layerId as never]!.transform.x);
      expect(undo.state.audioClips[clipId as never]!.gainDb).toBe(0);
    });
  }

  it("RetimeScene med to trinn på samme lag: + 1, også ved angring", () => {
    const { s, occ, compositionId, layerId } = scene();
    const lr = s.layers[layerId as never]!.revision;
    const first = moveLayer(s, layerId, 5);
    const mid = mustApply(s, first);
    const cmd: Command = {
      type: "RetimeScene",
      occurrenceId: occ as never,
      compositionId: compositionId as never,
      steps: [first, moveLayer(mid, layerId, 7)],
    } as Command;
    const saved = applyCommand(s, envelope(cmd));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.state.layers[layerId as never]!.revision).toBe(lr + 1);
    expect(saved.state.layers[layerId as never]!.transform.x).toBe(7);
    const undo = applyCommand(saved.state, envelope(saved.inverse));
    expect(undo.ok && undo.state.layers[layerId as never]!.revision).toBe(lr + 2);
  });
});
