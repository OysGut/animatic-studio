// @vitest-environment node
/** Eksport av vilkårlige scener (DEC-0072, REQ-0417, KI-169). */
import { describe, expect, it } from "vitest";
import {
  filmClips,
  filmSelection,
  framesToSeconds,
  mainProduction,
  shiftAudioItems,
  shiftCues,
} from "@/core";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const fps = s0.project.fps;
const clips = filmClips(s0, main.id);

describe("valgte scener", () => {
  it("settes etter hverandre; naboer beholder overgangen, hull gir rent kutt", () => {
    expect(clips.length).toBeGreaterThanOrEqual(4);
    const ids = new Set([clips[0]!.occurrenceId, clips[1]!.occurrenceId, clips[3]!.occurrenceId]);
    const sel = filmSelection(clips, ids);
    expect(sel.clips.map((c) => c.occurrenceId)).toEqual([...ids]);
    expect(sel.startFrame).toBe(0);
    expect(sel.clips[0]!.startFrame).toBe(0);
    expect(sel.clips[0]!.transition.kind).toBe("cut");
    // 0 og 1 er naboer: samme avstand som i filmen
    expect(sel.clips[1]!.startFrame).toBe(clips[1]!.startFrame - clips[0]!.startFrame);
    expect(sel.clips[1]!.transition).toEqual(clips[1]!.transition);
    // 3 kommer etter et hull: rett etter 1, rent kutt
    expect(sel.clips[2]!.startFrame).toBe(sel.clips[1]!.startFrame + sel.clips[1]!.durationFrames);
    expect(sel.clips[2]!.transition.kind).toBe("cut");
    expect(sel.clips[2]!.overlapFrames).toBe(0);
    expect(sel.endFrame).toBe(sel.clips[2]!.startFrame + sel.clips[2]!.durationFrames);
    expect(filmSelection(clips, new Set()).clips).toHaveLength(0);
  });

  it("lyd og undertekster følger scenen sin; resten er ikke med", () => {
    const third = clips[3]!;
    const sel = filmSelection(clips, new Set([third.occurrenceId]));
    const t = framesToSeconds(third.startFrame, fps);
    const items = [
      { clip: { occurrenceId: third.occurrenceId }, start: t + 1 },
      { clip: { occurrenceId: clips[0]!.occurrenceId }, start: 0.5 },
    ];
    expect(shiftAudioItems(items, sel.shiftOf, fps).map((x) => x.start)).toEqual([1]);
    const cues = [
      { startMs: (t + 2) * 1000, endMs: (t + 3) * 1000, text: "Hei" },
      { startMs: 100, endMs: 900, text: "Borte" },
    ];
    const out = shiftCues(cues, clips, sel.shiftOf, fps);
    expect(out).toHaveLength(1);
    expect(out[0]!.startMs).toBeCloseTo(2000, 0);
  });

  it("lyd og tekst kuttes der rekken av nabo-scener slutter (KI-172)", () => {
    const a = clips[0]!;
    const b = clips[2]!;
    const sel = filmSelection(clips, new Set([a.occurrenceId, b.occurrenceId]));
    const aEnd = framesToSeconds(sel.runEndOf.get(a.occurrenceId)!, fps);
    expect(aEnd).toBeCloseTo(framesToSeconds(a.durationFrames, fps), 6);
    const items = [{ clip: { occurrenceId: a.occurrenceId }, start: 0.5, length: 1000 }];
    const out = shiftAudioItems(items, sel.shiftOf, fps, sel.runEndOf);
    expect(out[0]!.length).toBeCloseTo(aEnd - 0.5, 6);
    const cue = [{ startMs: 500, endMs: 1_000_000, text: "Lang" }];
    expect(shiftCues(cue, clips, sel.shiftOf, fps, sel.runEndOf)[0]!.endMs).toBeCloseTo(
      aEnd * 1000,
      3,
    );
  });
});
