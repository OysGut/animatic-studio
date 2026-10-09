// @vitest-environment node
/** Varighetsestimat (REQ-0109, REQ-0115). */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DURATION_ASSUMPTIONS,
  estimateProduction,
  formatDuration,
  formatEighths,
  orderedOccurrences,
  scriptPages,
} from "@/core";
import { mustApply, seedProject } from "../helpers/fixtures";

describe("Varighetsestimat", () => {
  it("bygger på dialog og handling med justerbare antakelser", () => {
    const { state, mainId } = seedProject();
    const a = estimateProduction(state, mainId);
    const b = estimateProduction(state, mainId, {
      ...DEFAULT_DURATION_ASSUMPTIONS,
      dialogueWordsPerMinute: 75,
    });
    expect(a.scenes[0]!.dialogueWords).toBe(2);
    expect(a.scenes[0]!.actionLines).toBe(1);
    expect(b.activeSeconds).toBeGreaterThanOrEqual(a.activeSeconds);
  });

  it("deaktiverte scener utelates fra totalen og legges til igjen ved aktivering (REQ-0115)", () => {
    const { state, mainId } = seedProject();
    const occ = orderedOccurrences(state, mainId)[2]!;
    const before = estimateProduction(state, mainId);
    const off = mustApply(state, {
      type: "SetOccurrenceActive",
      occurrenceId: occ.id,
      active: false,
    });
    const after = estimateProduction(off, mainId);
    const sceneSec = before.scenes.find((x) => x.occurrenceId === occ.id)!.seconds;
    expect(after.activeSeconds).toBe(before.activeSeconds - sceneSec);
    const on = mustApply(off, { type: "SetOccurrenceActive", occurrenceId: occ.id, active: true });
    expect(estimateProduction(on, mainId).activeSeconds).toBe(before.activeSeconds);
  });

  it("sidelengde i åttendedeler fra sidebrytingen, og formatering", () => {
    const { state, mainId } = seedProject();
    const e = estimateProduction(
      state,
      mainId,
      DEFAULT_DURATION_ASSUMPTIONS,
      scriptPages(state, mainId),
    );
    expect(e.scenes.every((x) => x.eighths >= 1)).toBe(true);
    expect(formatEighths(11)).toBe("1 3/8");
    expect(formatEighths(8)).toBe("1");
    expect(formatEighths(3)).toBe("3/8");
    expect(formatDuration(3930)).toBe("1:05:30");
    expect(formatDuration(247)).toBe("4:07");
  });
});
