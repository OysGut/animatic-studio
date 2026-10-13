/** Utvalget i animatic-eksporten (KI-85): lyd følger scenen også for «valgt scene» og «fra–til». */
import { describe, expect, it } from "vitest";
import { filmClips, framesToSeconds, mainProduction, shiftAudioItems } from "@/core";
import { exportSelection } from "@/app/assembly/export-selection";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const fps = s0.project.fps;
const clips = filmClips(s0, main.id);
const none = new Set<string>();

describe("eksportutvalg (KI-85)", () => {
  it("hele filmen: ingen flytting", () => {
    expect(
      exportSelection(clips, "film", { selectedId: null, fromId: "", toId: "", picked: none }),
    ).toBeNull();
  });

  it("valgt scene: lyd fra scenen før i overlappen er ikke med", () => {
    const prev = clips[1]!;
    const cur = clips[2]!;
    const sel = exportSelection(clips, "selected", {
      selectedId: cur.occurrenceId,
      fromId: "",
      toId: "",
      picked: none,
    })!;
    expect(sel.clips.map((c) => c.occurrenceId)).toEqual([cur.occurrenceId]);
    expect(sel.startFrame).toBe(0);
    const curStart = framesToSeconds(cur.startFrame, fps);
    // Lyd fra forrige scene som ligger i tidsrommet til valgt scene (overlappen)
    const items = [
      { clip: { occurrenceId: prev.occurrenceId }, start: curStart, length: 2 },
      { clip: { occurrenceId: cur.occurrenceId }, start: curStart + 0.5, length: 1 },
    ];
    const out = shiftAudioItems(items, sel.shiftOf, fps, sel.runEndOf);
    expect(out).toHaveLength(1);
    expect(out[0]!.clip.occurrenceId).toBe(cur.occurrenceId);
    expect(out[0]!.start).toBeCloseTo(0.5, 6);
  });

  it("fra–til: scenene i spennet beholder lyden sin, lyd utenfor faller bort og kuttes ved slutten", () => {
    const a = clips[1]!;
    const b = clips[2]!;
    const sel = exportSelection(clips, "range", {
      selectedId: null,
      fromId: b.occurrenceId,
      toId: a.occurrenceId,
      picked: none,
    })!;
    expect(sel.clips.map((c) => c.occurrenceId)).toEqual([a.occurrenceId, b.occurrenceId]);
    expect(sel.clips[0]!.transition.kind).toBe("cut");
    // Naboer beholder overgangen mellom seg
    expect(sel.clips[1]!.transition).toEqual(b.transition);
    const items = [
      { clip: { occurrenceId: clips[0]!.occurrenceId }, start: 0, length: 1000 },
      {
        clip: { occurrenceId: a.occurrenceId },
        start: framesToSeconds(a.startFrame, fps),
        length: 1000,
      },
    ];
    const out = shiftAudioItems(items, sel.shiftOf, fps, sel.runEndOf);
    expect(out).toHaveLength(1);
    expect(out[0]!.start).toBeCloseTo(0, 6);
    expect(out[0]!.length).toBeCloseTo(framesToSeconds(sel.endFrame, fps), 6);
  });

  it("ukjent scene gir tomt utvalg", () => {
    const sel = exportSelection(clips, "selected", {
      selectedId: "finnes-ikke",
      fromId: "",
      toId: "",
      picked: none,
    })!;
    expect(sel.clips).toHaveLength(0);
  });
});
