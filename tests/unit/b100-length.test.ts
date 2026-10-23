// @vitest-environment node
import { describe, expect, it } from "vitest";
import { followRangeLength, followWindowLength } from "@/core/animation/time-format";

describe("B-100: lengden følger omtiming", () => {
  it("vindu over hele scenen utvides når scenen blir lengre", () => {
    expect(followWindowLength({ from: 0, span: 120 }, 120, 180)).toEqual({ from: 0, span: 180 });
  });
  it("vindu over hele scenen krymper når scenen blir kortere", () => {
    expect(followWindowLength({ from: 0, span: 120 }, 120, 60)).toEqual({ from: 0, span: 60 });
  });
  it("innzoomet vindu beholdes, men klemmes", () => {
    expect(followWindowLength({ from: 20, span: 40 }, 120, 180)).toEqual({ from: 20, span: 40 });
    expect(followWindowLength({ from: 80, span: 40 }, 120, 100)).toEqual({ from: 60, span: 40 });
  });
  it("avspillingsområde til gammel slutt følger ny slutt", () => {
    expect(followRangeLength({ from: 10, to: 119 }, 120, 180)).toEqual({ from: 10, to: 179 });
  });
  it("delområde klemmes og hele scenen blir null", () => {
    expect(followRangeLength({ from: 10, to: 50 }, 120, 30)).toEqual({ from: 10, to: 29 });
    expect(followRangeLength({ from: 0, to: 50 }, 120, 51)).toBeNull();
    expect(followRangeLength(null, 120, 180)).toBeNull();
  });
});

import { DEFAULT_COMPOSITION, applyCommand, filmClips, scriptView, type Command } from "@/core";
import { planRetime } from "@/core/composition/retime";
import { compositionDuration } from "@/core/composition/animate";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

describe("B-100: Scene og montering viser samme lengde etter omtiming", () => {
  it("RetimeScene gir samme lengde i Scene og i monteringen", () => {
    const seed = seedProject(2);
    const occId = scriptView(seed.state, seed.mainId)[1]!.occurrenceId;
    const occ = seed.state.occurrences[occId]!;
    const compositionId = tid<"composition">();
    const s = mustApply(seed.state, { type: "CreateComposition", compositionId, variantId: occ.variantId, fields: { ...DEFAULT_COMPOSITION, durationFrames: 120, background: "#101114" } });
    const plan = planRetime(s, occId, { targetFrames: 180, method: "end", keepAmbience: true, fill: "freeze" });
    expect(plan.ok ? "ok" : JSON.stringify(plan).slice(0, 300)).toBe("ok");
    const r = applyCommand(s, envelope((plan as { command: Command }).command));
    if (!r.ok) throw new Error(r.error.message);
    const sceneLen = compositionDuration(r.state, r.state.compositions[compositionId]!);
    const clip = filmClips(r.state, occ.productionId).find((c) => c.occurrenceId === occId)!;
    expect(sceneLen).toBe(180);
    expect(clip.durationFrames).toBe(180);
  });
});
