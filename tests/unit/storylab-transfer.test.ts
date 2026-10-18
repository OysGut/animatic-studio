// @vitest-environment node
/** SL6: each transfer type, validation, ordering, undo and redo. */
import { describe, expect, it } from "vitest";
import { applyCommand, blocksOfVariant, mainProduction, orderedOccurrences, suggestionToCommands, type Command, type ProjectState, type SuggestionKind, type SuggestionTarget, type TransferSuggestion } from "@/core";
import { envelope } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const state = fixture.state;
const main = mainProduction(state);
if (!main) throw new Error("Missing main production");
const occurrence = orderedOccurrences(state, main.id).find((o) => blocksOfVariant(state, o.variantId).some((b) => b.kind === "dialogue"));
if (!occurrence) throw new Error("Missing scene");
const blocks = blocksOfVariant(state, occurrence.variantId);
const dialogue = blocks.find((b) => b.kind === "dialogue");
const first = blocks[0];
const asset = Object.values(state.assets).find((a) => a.kind === "character" && !a.removed);
if (!dialogue || !first || !asset) throw new Error("Missing transfer fixture");
const target = { productionId: main.id, variantId: occurrence.variantId, afterBlockId: first.id };
function plan(kind: SuggestionKind, payload: Record<string, unknown>, to: SuggestionTarget = target) {
  return suggestionToCommands(state, { id: "suggestion", kind, payload, sessionId: "session", turnId: "turn" }, to);
}
function commands(kind: SuggestionKind, payload: Record<string, unknown>, to: SuggestionTarget = target) {
  const p = plan(kind, payload, to);
  if (!p.ok) throw new Error(p.message);
  return p.commands;
}
function visible(s: ProjectState) {
  return JSON.parse(JSON.stringify([s.blocks, s.annotations, s.storyProfiles], (key, value) => key === "revision" || key === "currentRev" ? undefined : value));
}
function roundTrip(cmds: readonly Command[]) {
  let s = state;
  const inverses: Command[] = [];
  for (const c of cmds) { const r = applyCommand(s, envelope(c)); if (!r.ok) throw new Error(r.error.message); s = r.state; inverses.unshift(r.inverse); }
  const after = s;
  const redo: Command[] = [];
  for (const c of inverses) { const r = applyCommand(s, envelope(c)); if (!r.ok) throw new Error(r.error.message); s = r.state; redo.unshift(r.inverse); }
  expect(visible(s)).toEqual(visible(state));
  for (const c of redo) { const r = applyCommand(s, envelope(c)); if (!r.ok) throw new Error(r.error.message); s = r.state; }
  expect(visible(s)).toEqual(visible(after));
  return after;
}
describe("Story Lab transfer", () => {
  it("rewrites only the referenced dialogue using EditBlockText, reversible", () => {
    const cs = commands("line", { sceneId: occurrence.sceneId, blockId: dialogue.id, suggestion: "Ny replikk" });
    expect(cs).toEqual([{ type: "EditBlockText", productionId: main.id, blockId: dialogue.id, text: "Ny replikk" }]);
    expect(roundTrip(cs).blocks[dialogue.id]?.text).toBe("Ny replikk");
  });
  it("inserts character and dialogue after the selected block, before its next neighbor", () => {
    const cs = commands("line", { speaker: asset.id, text: "Improvisert" });
    expect(cs.map((c) => c.type)).toEqual(["InsertBlock", "InsertBlock"]);
    const inserted = cs.flatMap((c) => c.type === "InsertBlock" ? [c.block] : []);
    expect(inserted.map((b) => [b.kind, b.text])).toEqual([["character", asset.name.toUpperCase()], ["dialogue", "Improvisert"]]);
    const second = blocks[1]; if (!second) throw new Error("Missing next block");
    expect(first.orderKey < (inserted[0]?.orderKey ?? "")).toBe(true);
    expect((inserted[0]?.orderKey ?? "") < (inserted[1]?.orderKey ?? "")).toBe(true);
    expect((inserted[1]?.orderKey ?? "") < second.orderKey).toBe(true);
    roundTrip(cs);
  });
  it("scene draft inserts every pair in order and never removes original material", () => {
    const cs = commands("scene_draft", { turns: [{ speaker: asset.id, text: "A" }, { speaker: asset.id, text: "B" }] });
    expect(cs).toHaveLength(4);
    expect(cs.flatMap((c) => c.type === "InsertBlock" ? [c.block.text] : [])).toEqual([asset.name.toUpperCase(), "A", asset.name.toUpperCase(), "B"]);
    const after = roundTrip(cs);
    for (const b of blocks) expect(after.blocks[b.id]).toEqual(state.blocks[b.id]);
  });
  it("profile changes use SetStoryProfile, preserving fields outside the patch", () => {
    const cs = commands("profile_change", { patch: { notes: "En ny observasjon" } }, { assetId: asset.id });
    expect(cs[0]).toMatchObject({ type: "SetStoryProfile", assetId: asset.id, profile: { notes: "En ny observasjon" } });
    roundTrip(cs);
  });
  for (const kind of ["analysis", "motivation", "plot_point"] as const) it(`${kind} creates a sourced system note, reversible`, () => {
    const cs = commands(kind, { text: "Observasjon", evidence: [dialogue.id] });
    expect(cs[0]).toMatchObject({ type: "AddAnnotations", annotations: [{ blockId: dialogue.id, source: "system" }] });
    if (cs[0]?.type !== "AddAnnotations") throw new Error("Missing annotation");
    expect(cs[0].annotations[0]?.text).toContain("Observasjon");
    expect(cs[0].annotations[0]?.text).toContain("session");
    roundTrip(cs);
  });
  it("notes without block evidence attach to the first block", () => {
    expect(commands("analysis", { text: "Notat", evidence: ["profile:notes"] })[0]).toMatchObject({ type: "AddAnnotations", annotations: [{ blockId: first.id }] });
  });
  it("rejects unknown blocks, scenes and speakers without mutating state", () => {
    const before = JSON.stringify(state);
    expect(plan("line", { blockId: "missing", text: "X" }).ok).toBe(false);
    expect(plan("line", { blockId: dialogue.id, sceneId: "other", text: "X" }).ok).toBe(false);
    expect(plan("line", { speaker: asset.id, text: "X" }, { ...target, variantId: "missing" }).ok).toBe(false);
    expect(plan("line", { speaker: asset.id, text: "X" }, { ...target, afterBlockId: "missing" }).ok).toBe(false);
    expect(plan("line", { speaker: "missing", text: "X" }).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });
  it("rejects free text masquerading as profile fields", () => {
    expect(plan("profile_change", { text: "Hun er sjenert" }, { assetId: asset.id }).ok).toBe(false);
  });
  it("only the main production can receive manuscript transfers", () => {
    expect(plan("line", { speaker: asset.id, text: "X" }, { ...target, productionId: "other" }).ok).toBe(false);
  });
  it("removed blocks still reserve their order keys", () => {
    const second = blocks[1]; if (!second) throw new Error("Missing neighbor");
    const withRemoved = { ...state, blocks: { ...state.blocks, [second.id]: { ...second, removed: true } } };
    const p = suggestionToCommands(withRemoved, { id: "x", kind: "line", payload: { speaker: asset.id, text: "X" } }, target);
    if (!p.ok) throw new Error(p.message);
    expect(p.commands.every((c) => c.type === "InsertBlock" && c.block.orderKey < second.orderKey)).toBe(true);
  });
});