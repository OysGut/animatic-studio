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

import { applyCommand, filmClips, type Command } from "@/core";
import { compositionForOccurrence, planRetime } from "@/core/composition/retime";
import { compositionDuration } from "@/core/composition/animate";
import { envelope } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

describe("B-100: Scene og montering viser samme lengde etter omtiming", () => {
  it("RetimeScene gir samme lengde i Scene og i monteringen", () => {
    const s = fixture.state;
    const occ = Object.values(s.occurrences).find((o) => !o.removed && compositionForOccurrence(s, o))!;
    const comp = compositionForOccurrence(s, occ)!;
    const target = compositionDuration(s, comp) + 30;
    const plan = planRetime(s, occ.id, { targetFrames: target, method: "end", keepAmbience: true });
    expect(plan.ok).toBe(true);
    const r = applyCommand(s, envelope((plan as { command: Command }).command));
    if (!r.ok) throw new Error(r.error.message);
    const after = r.state;
    const sceneLen = compositionDuration(after, after.compositions[comp.id]!);
    const clip = filmClips(after, occ.productionId).find((c) => c.occurrenceId === occ.id)!;
    expect(sceneLen).toBe(target);
    expect(clip.durationFrames).toBe(target);
  });
});
