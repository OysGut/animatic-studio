// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyCommand, diffStates, emptyProjectState, stateFromRows, renderFrame, makeBackup, backupIdMap, restoredState, type Command, type ProjectState, type ProjectRows } from "@/core";
import { rigSpecError, RIG_MAX_BYTES } from "@/core/animation/rig";
import { characterRigAt, evaluateCharacterFrame } from "@/core/animation/evaluate";
import { envelope } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";
const id = (n: number) => `01900000-0000-7000-8000-0053${String(n).padStart(8, "0")}`;
const source = Object.values(fixture.state.assetVersions).find(v => v.mimeType.startsWith("image/"));
if (!source) throw new Error("Missing image");
const layer = Object.values(fixture.state.layers).find(l => l.assetId === fixture.state.assetVariants[source.variantId]?.assetId);
if (!layer) throw new Error("Missing layer");
const occurrence = Object.values(fixture.state.occurrences).find(o => o.active && o.variantId === fixture.state.compositions[layer.compositionId]?.variantId);
if (!occurrence) throw new Error("Missing occurrence");
const spec = { format: 1 as const, anchors: { head: { x: .5, y: .2 }, mouth: { x: .5, y: .6 }, nose: { x: .5, y: .4 }, leftEye: { x: .4, y: .3 }, rightEye: { x: .6, y: .3 } } };
function apply(s: ProjectState, command: Command) { const r = applyCommand(s, envelope(command)); if (!r.ok) throw new Error(r.error.message); return r; }
const create: Command = { type: "CreateRig", rigId: id(1), variantId: source.variantId };
const save: Command = { type: "SaveRigVersion", rigId: id(1), versionId: id(2), sourceVersionId: source.id, spec };
const attach: Command = { type: "AttachAnimationUse", useId: id(3), layerId: layer.id, occurrenceId: occurrence.id, rigVersionId: id(2) };
function ready() { let s = fixture.state; for (const c of [create, save, attach]) s = apply(s, c).state; return s; }
describe("CA3 versioned rig", () => {
  it("validates relative anchors and the exact 512kB limit", () => {
    expect(RIG_MAX_BYTES).toBe(524288);
    expect(rigSpecError(spec)).toBeNull();
    expect(rigSpecError({ format: 1, anchors: { mouth: { x: 1.1, y: .5 } } })).not.toBeNull();
    expect(rigSpecError({ ...spec, extra: "x".repeat(524288) } as typeof spec)).not.toBeNull();
    expect(rigSpecError({ format: 1, anchors: { nose: { x: NaN, y: .5 } } })).not.toBeNull();
  });
  for (const [name, setup, command] of [
    ["CreateRig", () => fixture.state, create],
    ["SaveRigVersion", () => apply(fixture.state, create).state, save],
    ["SetRigAnchors", ready, { type: "SetRigAnchors", rigId: id(1), versionId: id(4), sourceVersionId: source.id, anchors: { ...spec.anchors, mouth: { x: .4, y: .7 } } }],
    ["AttachAnimationUse", () => apply(apply(fixture.state, create).state, save).state, attach],
    ["SetAnimationLayerEnabled", ready, { type: "SetAnimationLayerEnabled", useId: id(3), enabled: false }],
  ] as const) it(`${name} has inverse, undo and redo`, () => {
    const before = setup(), changed = apply(before, command), undone = apply(changed.state, changed.inverse), redone = apply(undone.state, undone.inverse);
    const content = (s: ProjectState) => JSON.stringify([s.animationRigs, s.animationRigVersions, s.animationUses], (k, v) => k === "revision" ? undefined : v);
    expect(content(undone.state)).toBe(content(before));
    expect(content(redone.state)).toBe(content(changed.state));
  });
  it("new anchor versions never mutate saved or scene-pinned versions", () => {
    const before = ready();
    const after = apply(before, { type: "SetRigAnchors", rigId: id(1), versionId: id(4), sourceVersionId: source.id, anchors: { mouth: { x: .2, y: .3 } } }).state;
    expect(after.animationRigVersions[id(2)]).toEqual(before.animationRigVersions[id(2)]);
    expect(after.animationRigVersions[id(4)]?.number).toBe(2);
    expect(after.animationUses[id(3)]?.rigVersionId).toBe(id(2));
  });
  it("disable keeps setup and settings, with no effect on other scenes", () => {
    const before = ready(), after = apply(before, { type: "SetAnimationLayerEnabled", useId: id(3), enabled: false }).state;
    expect(after.animationRigs).toEqual(before.animationRigs);
    expect(after.animationRigVersions).toEqual(before.animationRigVersions);
    expect(after.animationUses[id(3)]?.removed).toBe(false);
    expect(characterRigAt(after, layer.id, source.variantId)).toBeNull();
  });
  it("rejects stale revisions and use from another scene", () => {
    const before = ready();
    expect(applyCommand(before, envelope({ type: "SetAnimationLayerEnabled", useId: id(3), enabled: false }, undefined, { [id(3)]: 0 })).ok).toBe(false);
    expect(applyCommand(before, envelope({ ...attach, useId: id(8), occurrenceId: id(9) } as Command)).ok).toBe(false);
  });
  it("does not resolve another variant's rig", () => {
    expect(characterRigAt(ready(), layer.id, source.variantId)?.version.id).toBe(id(2));
    expect(characterRigAt(ready(), layer.id, id(99))).toBeNull();
  });
  it("compares the whole frame without a rig and with anchor-only metadata", () => {
    for (const frame of [0, 1, 24, 100]) {
      const base = renderFrame(fixture.state, layer.compositionId, frame, { view: "camera" });
      expect(evaluateCharacterFrame(fixture.state, layer.compositionId, frame, base)).toEqual(base);
      expect(renderFrame(ready(), layer.compositionId, frame, { view: "camera" })).toEqual(base);
    }
  });
  it("groups rig creation and attachment in UpdateSceneDraft with one revision per row", () => {
    const grouped = apply(fixture.state, { type: "UpdateSceneDraft", compositionId: layer.compositionId, occurrenceId: occurrence.id, steps: [create, save, attach] });
    expect(grouped.state.animationRigs[id(1)]?.revision).toBe(1);
    const undone = apply(grouped.state, grouped.inverse);
    expect(undone.state.animationRigs).toEqual({});
    expect(apply(undone.state, undone.inverse).state.animationUses[id(3)]?.enabled).toBe(true);
  });
  it("round trips new rows and remaps all rig references through backup restore", async () => {
    const s = ready(), patch = diffStates(emptyProjectState(s.project), s);
    const rows = { ...fixture.rows, project: fixture.project, ...patch.inserts, script_block_revisions: patch.blockRevisions } as unknown as ProjectRows;
    expect(stateFromRows(rows).animationRigVersions).toEqual(s.animationRigVersions);
    const b = makeBackup({ rows, scriptVersions: [], importedDocuments: [], changeLog: [], generationJobs: [], schemaVersion: 54, createdAt: "2026-10-19T06:00:00Z", include: new Set() });
    const main = Object.values(s.productions).find(p => p.kind === "main"); if (!main) throw new Error("Missing main");
    const map = await backupIdMap(b, id(90), id(91));
    const base = { ...emptyProjectState({ ...s.project, id: id(90) as never }), productions: { [id(91)]: { ...main, id: id(91) as never } } };
    const restored = restoredState(b, map, base, id(92));
    const rigId = map.get(id(1)), versionId = map.get(id(2)), useId = map.get(id(3)); if (!rigId || !versionId || !useId) throw new Error("Missing remap");
    expect(restored.animationRigs[rigId]?.currentVersionId).toBe(versionId);
    expect(restored.animationUses[useId]?.rigVersionId).toBe(versionId);
    expect(restored.animationRigVersions[versionId]?.spec).toEqual(spec);
  });
});
