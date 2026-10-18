// @vitest-environment node
/** Story Lab (SL1): kommandoene med angre og gjør om, validering og radformatet. */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  COLLECTION_TABLES,
  diffStates,
  emptyStoryProfile,
  mainProduction,
  orderedOccurrences,
  profileError,
  stateFromRows,
  toRow,
  type AssetId,
  type Command,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const occs = orderedOccurrences(s0, mainProduction(s0)!.id);
const chars = Object.values(s0.assets).filter((a) => a.kind === "character");
const maja = chars[0]!.id as AssetId;
const anne = chars[1]!.id as AssetId;
const vase = Object.values(s0.assets).find((a) => a.kind === "object")!.id;

/** Gjør, angre (tilbake til før) og gjør om (samme som etter). */
function roundTrip(s: ProjectState, c: Command): ProjectState {
  const r = applyCommand(s, envelope(c));
  if (!r.ok) throw new Error(`${c.type}: ${r.error.message}`);
  const undo = applyCommand(r.state, envelope(r.inverse!));
  if (!undo.ok) throw new Error(`angre ${c.type}: ${undo.error.message}`);
  const plain = (x: ProjectState) =>
    JSON.parse(
      JSON.stringify([x.storyProfiles, x.storyProfileStages, x.storyFacts], (k, v) =>
        k === "revision" ? undefined : v,
      ),
    );
  expect(plain(undo.state)).toEqual(plain(s));
  const redo = applyCommand(undo.state, envelope(undo.inverse!));
  if (!redo.ok) throw new Error(`gjør om ${c.type}: ${redo.error.message}`);
  expect(plain(redo.state)).toEqual(plain(r.state));
  return r.state;
}

const fail = (s: ProjectState, c: unknown) => applyCommand(s, envelope(c as Command));

describe("kommandoene", () => {
  it("alle åtte kan gjøres, angres og gjøres om", () => {
    const profileId = tid();
    const stageId = tid();
    const factId = tid();
    const p = emptyStoryProfile();
    let s = roundTrip(s0, { type: "SetStoryProfile", profileId, assetId: maja, profile: p } as never);
    s = roundTrip(s, { type: "SetStoryProfile", profileId, assetId: maja, profile: { ...p, notes: "ny" } } as never);
    s = roundTrip(s, { type: "RemoveStoryProfile", profileId, removed: true } as never);
    s = roundTrip(s, { type: "RemoveStoryProfile", profileId, removed: false } as never);
    s = roundTrip(s, {
      type: "AddStoryProfileStage",
      stageId,
      assetId: maja,
      fromSceneId: occs[1]!.sceneId,
      patch: { notes: "a" },
    } as never);
    s = roundTrip(s, {
      type: "UpdateStoryProfileStage",
      stageId,
      fromSceneId: occs[2]!.sceneId,
      patch: { speech: { mood: "b" } },
    } as never);
    s = roundTrip(s, { type: "RemoveStoryProfileStage", stageId, removed: true } as never);
    s = roundTrip(s, {
      type: "AddStoryFact",
      factId,
      fields: { text: "Snøen", kind: "fact", atSceneId: null, knownBy: [{ assetId: anne, fromSceneId: null }] },
    } as never);
    s = roundTrip(s, {
      type: "UpdateStoryFact",
      factId,
      fields: { text: "Hemmelig", kind: "secret", atSceneId: occs[0]!.sceneId, knownBy: [] },
    } as never);
    s = roundTrip(s, { type: "RemoveStoryFact", factId, removed: true } as never);
    expect(s.storyFacts[factId]!.removed).toBe(true);
  });

  it("radformatet går fram og tilbake uten tap", () => {
    let s = mustApply(s0, { type: "SetStoryProfile", profileId: tid(), assetId: maja, profile: emptyStoryProfile() } as never);
    s = mustApply(s, {
      type: "AddStoryFact",
      factId: tid(),
      fields: { text: "x", kind: "fact", atSceneId: null, knownBy: [{ assetId: maja, fromSceneId: occs[0]!.sceneId }] },
    } as never);
    const empty = Object.fromEntries(
      [...Object.values(COLLECTION_TABLES), "script_block_revisions"].map((t) => [t, []]),
    );
    const rows = {
      ...empty,
      project: { id: s.project.id, revision: 1, name: "x", fps_num: 25, fps_den: 1, frame_width: 1920, frame_height: 1080 },
      story_profiles: Object.values(s.storyProfiles).map((e) => toRow("storyProfiles", e, s.project.id)),
      story_facts: Object.values(s.storyFacts).map((e) => toRow("storyFacts", e, s.project.id)),
    };
    const back = stateFromRows(rows as never);
    expect(back.storyProfiles).toEqual(s.storyProfiles);
    expect(back.storyFacts).toEqual(s.storyFacts);
  });
});

describe("validering", () => {
  it("bare karakterer og dyr kan få profil, og bare én aktiv per karakter", () => {
    expect(fail(s0, { type: "SetStoryProfile", profileId: tid(), assetId: vase, profile: emptyStoryProfile() }).ok).toBe(false);
    const s = mustApply(s0, { type: "SetStoryProfile", profileId: tid(), assetId: maja, profile: emptyStoryProfile() } as never);
    expect(fail(s, { type: "SetStoryProfile", profileId: tid(), assetId: maja, profile: emptyStoryProfile() }).ok).toBe(false);
  });

  it("ett aktivt stadium per karakter og scene", () => {
    const st = { type: "AddStoryProfileStage", assetId: maja, fromSceneId: occs[0]!.sceneId, patch: {} };
    const s = mustApply(s0, { ...st, stageId: tid() } as never);
    expect(fail(s, { ...st, stageId: tid() }).ok).toBe(false);
    expect(fail(s, { ...st, assetId: anne, stageId: tid() }).ok).toBe(true);
  });

  it("ugyldige profiler, fakta og referanser avvises", () => {
    expect(profileError(emptyStoryProfile())).toBeNull();
    expect(profileError({ ...emptyStoryProfile(), speech: { ...emptyStoryProfile().speech, level: "pirat" } })).not.toBeNull();
    expect(profileError({ ...emptyStoryProfile(), notes: "x".repeat(9000) })).not.toBeNull();
    expect(profileError({ ...emptyStoryProfile(), ekstra: 1 })).not.toBeNull();
    const fact = (f: Record<string, unknown>) =>
      fail(s0, { type: "AddStoryFact", factId: tid(), fields: { text: "x", kind: "fact", atSceneId: null, knownBy: [], ...f } });
    expect(fact({}).ok).toBe(true);
    expect(fact({ text: "" }).ok).toBe(false);
    expect(fact({ text: "x".repeat(4001) }).ok).toBe(false);
    expect(fact({ kind: "rykte" }).ok).toBe(false);
    expect(fact({ atSceneId: tid() }).ok).toBe(false);
    expect(fact({ knownBy: [{ assetId: vase, fromSceneId: null }] }).ok).toBe(false);
    expect(fact({ knownBy: [{ assetId: maja, fromSceneId: null }, { assetId: maja, fromSceneId: null }] }).ok).toBe(false);
    expect(
      fail(s0, { type: "AddStoryProfileStage", stageId: tid(), assetId: maja, fromSceneId: occs[0]!.sceneId, patch: { speech: { maxWords: 0 } } }).ok,
    ).toBe(false);
  });
});
