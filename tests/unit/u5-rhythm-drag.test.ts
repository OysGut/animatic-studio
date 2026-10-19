// @vitest-environment node
/** U5 del B (§73–§96, §80): dra-modusen i rytmeverktøyet og beskyttede tidsområder. */
import { describe, expect, it } from "vitest";
import { applyCommand, type Command, type ProjectState } from "@/core";
import { planRhythm, rhythmDragShift, rhythmGaps, rhythmProtectedEnd, RHYTHM_VERTICAL_STEP_PX } from "@/core/animation/rhythm";
import { compositionForOccurrence } from "@/core/composition/retime";
import { compositionDuration } from "@/core/composition/animate";
import { timingOf } from "@/core/composition/timing";
import { compositionFieldsOf } from "@/app/scene-editor/timeline-helpers";
import { envelope } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const clip = Object.values(fixture.state.audioClips).find((c) => !c.removed && c.kind === "dialogue")!;
const occ = clip.occurrenceId;
const comp = compositionForOccurrence(fixture.state, fixture.state.occurrences[occ]!)!;
function apply(s: ProjectState, c: Command) {
  const r = applyCommand(s, envelope(c));
  if (!r.ok) throw new Error(r.error.message);
  return r;
}

describe("rhythmDragShift (§94–§96)", () => {
  it("vannrett drag gir frames under pekeren", () => {
    expect(rhythmDragShift(14, 0)).toBe(14);
    expect(rhythmDragShift(-6, 0)).toBe(-6);
  });
  it("rett opp gir +1 frame per trinn, rett ned −1", () => {
    expect(rhythmDragShift(0, -RHYTHM_VERTICAL_STEP_PX * 3)).toBe(3);
    expect(rhythmDragShift(0, RHYTHM_VERTICAL_STEP_PX * 2)).toBe(-2);
  });
  it("skrått drag er langsommere enn vannrett og uten hopp", () => {
    const diag = rhythmDragShift(20, -RHYTHM_VERTICAL_STEP_PX * 20);
    expect(diag).toBe(20); // like store bidrag: blandet, ikke summert (ingen dobbelttelling)
    expect(Math.abs(rhythmDragShift(20, RHYTHM_VERTICAL_STEP_PX * 5))).toBeLessThan(20);
    let prev = rhythmDragShift(10, 0);
    for (let dy = 1; dy <= 80; dy++) {
      const v = rhythmDragShift(10, dy);
      expect(Math.abs(v - prev)).toBeLessThanOrEqual(1);
      prev = v;
    }
  });
  it("ingen bevegelse gir null", () => expect(rhythmDragShift(0, 0)).toBe(0));
});

describe("beskyttede tidsområder (§80)", () => {
  const gaps = rhythmGaps(fixture.state, occ);
  it("uten beskyttelse endres mellomrommene", () => {
    const p = planRhythm(fixture.state, occ, { tempo: 0.5 });
    expect(p.gaps.some((g) => g.change !== 0)).toBe(true);
  });
  it("et beskyttet område over hele scenen gir ingen endring", () => {
    const end = compositionDuration(fixture.state, comp);
    const p = planRhythm(fixture.state, occ, { tempo: 0.5, protectedRanges: [{ startFrame: 0, endFrame: end }] });
    expect(p.gaps.every((g) => g.change === 0)).toBe(true);
    expect(p.retime).toBeNull();
  });
  it("mellomrom før slutten av et beskyttet område står fast; det beskyttede flyttes ikke", () => {
    if (gaps.length < 2) return;
    const guard = gaps[1]!.startFrame;
    const p = planRhythm(fixture.state, occ, { tempo: 0.5, protectedRanges: [{ startFrame: 0, endFrame: guard }] });
    for (const g of p.gaps) if (g.before.startFrame < guard) expect(g.change).toBe(0);
  });
  it("lagrede låste tidsrom regnes som beskyttet, også i dra-modus", () => {
    const end = compositionDuration(fixture.state, comp);
    const s = apply(fixture.state, {
      type: "UpdateComposition",
      compositionId: comp.id,
      fields: compositionFieldsOf(comp),
      timing: { ...timingOf(comp), lockedRanges: [{ id: "lock-1", startFrame: 0, endFrame: end, label: "" }] },
    } as Command).state;
    expect(rhythmProtectedEnd(s, occ)).toBe(end);
    const p = planRhythm(s, occ, { tempo: 1, cutFrame: 0, shiftFrames: 10 });
    expect(p.retime).toBeNull();
  });
  it("dra-forskyvning gir én RetimeScene som angres i ett steg", () => {
    const p = planRhythm(fixture.state, occ, { tempo: 1, cutFrame: 0, shiftFrames: rhythmDragShift(8, 0) });
    expect(p.retime?.ok).toBe(true);
    if (!p.retime?.ok) return;
    expect(p.retime.command.type).toBe("RetimeScene");
    const r = apply(fixture.state, p.retime.command);
    const back = apply(r.state, r.inverse);
    expect(compositionDuration(back.state, back.state.compositions[comp.id]!)).toBe(p.beforeFrames);
  });
});
