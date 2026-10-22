/** B-118: scenestatus og scenefarge per sceneforekomst – kommando, angring, lagring og filter. */
import { describe, expect, it } from "vitest";
import { applyCommand, matchingScenes, scriptView, stateFromRows, toRow, type Command, type ProjectState } from "@/core";
import { envelope, mustApply, seedProject } from "../helpers/fixtures";

function setup() {
  const seed = seedProject(3);
  const view = scriptView(seed.state, seed.mainId);
  return { s: seed.state, mainId: seed.mainId, occ: view.map((v) => v.occurrenceId) };
}

function undoRedo(s0: ProjectState, c: Command) {
  const r = applyCommand(s0, envelope(c));
  if (!r.ok) throw new Error(r.error.message);
  const u = applyCommand(r.state, envelope(r.inverse!));
  if (!u.ok) throw new Error(u.error.message);
  const again = applyCommand(u.state, envelope(u.inverse!));
  if (!again.ok) throw new Error(again.error.message);
  return { done: r.state, undone: u.state, redone: again.state, inverse: r.inverse };
}

describe("B-118 arbeidsstatus", () => {
  it("settes, angres og gjøres om", () => {
    const { s, occ } = setup();
    const id = occ[0]! as never;
    const r = undoRedo(s, { type: "SetOccurrenceWorkStatus", occurrenceId: id, workStatus: "review" });
    expect(r.done.occurrences[id]!.workStatus).toBe("review");
    expect(r.inverse).toEqual({ type: "SetOccurrenceWorkStatus", occurrenceId: id, workStatus: null });
    expect(r.undone.occurrences[id]!.workStatus).toBeUndefined();
    expect(r.redone.occurrences[id]!.workStatus).toBe("review");
  });
  it("bytte gir forrige status som invers, og null fjerner", () => {
    const { s, occ } = setup();
    const id = occ[1]! as never;
    const a = mustApply(s, { type: "SetOccurrenceWorkStatus", occurrenceId: id, workStatus: "setup" });
    const r = applyCommand(a, envelope({ type: "SetOccurrenceWorkStatus", occurrenceId: id, workStatus: "retake" }));
    expect(r.ok && r.inverse).toEqual({ type: "SetOccurrenceWorkStatus", occurrenceId: id, workStatus: "setup" });
    const cleared = mustApply(a, { type: "SetOccurrenceWorkStatus", occurrenceId: id, workStatus: null });
    expect("workStatus" in cleared.occurrences[id]!).toBe(false);
  });
  it("avviser ukjent status", () => {
    const { s, occ } = setup();
    const r = applyCommand(s, envelope({ type: "SetOccurrenceWorkStatus", occurrenceId: occ[0]! as never, workStatus: "finished" }));
    expect(r.ok).toBe(false);
  });
});

describe("B-118 scenefarge", () => {
  it("settes, angres og gjøres om", () => {
    const { s, occ } = setup();
    const id = occ[2]! as never;
    const r = undoRedo(s, { type: "SetOccurrenceColor", occurrenceId: id, color: "teal" });
    expect(r.done.occurrences[id]!.color).toBe("teal");
    expect(r.undone.occurrences[id]!.color).toBeUndefined();
    expect(r.redone.occurrences[id]!.color).toBe("teal");
  });
  it("avviser hex og ukjente nøkler", () => {
    const { s, occ } = setup();
    for (const color of ["#ff0000", "magenta", ""]) {
      const r = applyCommand(s, envelope({ type: "SetOccurrenceColor", occurrenceId: occ[0]! as never, color }));
      expect(r.ok).toBe(false);
    }
  });
});

describe("B-118 lagring og filter", () => {
  it("rader skriver og leser status og farge; ukjente verdier blir ingen", () => {
    const { s, occ } = setup();
    let st = mustApply(s, { type: "SetOccurrenceWorkStatus", occurrenceId: occ[0]! as never, workStatus: "done" });
    st = mustApply(st, { type: "SetOccurrenceColor", occurrenceId: occ[0]! as never, color: "red" });
    const rows = Object.values(st.occurrences).map((o) => toRow("occurrences", o, st.project.id));
    const r0 = rows.find((r) => r["id"] === occ[0])!;
    expect(r0["work_status"]).toBe("done");
    expect(r0["color"]).toBe("red");
    expect(rows.find((r) => r["id"] === occ[1])!["color"]).toBeNull();
    const back = stateFromRows({
      project: { id: st.project.id, name: "x", fps_num: 25, fps_den: 1, revision: 1 },
      productions: [], scenes: [], scene_variants: [], script_blocks: [], script_block_revisions: [],
      scene_occurrences: rows.map((r) => (r["id"] === occ[1] ? { ...r, color: "#123456", work_status: "x" } : r)),
      production_segments: [], takes: [],
    });
    expect(back.occurrences[occ[0]!]!.workStatus).toBe("done");
    expect(back.occurrences[occ[0]!]!.color).toBe("red");
    expect(back.occurrences[occ[1]!]!.color).toBeUndefined();
    expect(back.occurrences[occ[1]!]!.workStatus).toBeUndefined();
  });
  it("scenelisten filtrerer på status, farge og «ingen»", () => {
    const { s, mainId, occ } = setup();
    let st = mustApply(s, { type: "SetOccurrenceWorkStatus", occurrenceId: occ[0]! as never, workStatus: "review" });
    st = mustApply(st, { type: "SetOccurrenceColor", occurrenceId: occ[1]! as never, color: "blue" });
    expect([...matchingScenes(st, mainId, { workStatus: "review" })]).toEqual([occ[0]]);
    expect([...matchingScenes(st, mainId, { color: "blue" })]).toEqual([occ[1]]);
    expect(new Set(matchingScenes(st, mainId, { color: "none" }))).toEqual(new Set([occ[0], occ[2]]));
    expect([...matchingScenes(st, mainId, { workStatus: "review", color: "blue" })]).toEqual([]);
  });
});
