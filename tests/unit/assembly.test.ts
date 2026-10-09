// @vitest-environment node
/** Filmmontering (M4 del 1, DEC-0043): klipp fra den aktive strukturen, tidskoder, utvalg og flytting. */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPOSITION,
  clipAtFrame,
  estimatedSceneFrames,
  filmClips,
  filmDurationFrames,
  filmRange,
  keyBetween,
  scriptView,
  secondsToFrames,
  type ProjectState,
} from "@/core";
import { mustApply, seedProject, tid } from "../helpers/fixtures";

function withComposition(s: ProjectState, variantId: string, durationFrames: number) {
  return mustApply(s, {
    type: "CreateComposition",
    compositionId: tid(),
    variantId: variantId as never,
    fields: { ...DEFAULT_COMPOSITION, width: 1920, height: 1080, durationFrames },
  });
}

describe("filmClips", () => {
  it("følger manusets rekkefølge og utelater deaktiverte scener (INV-01, mandat 2)", () => {
    const { state, mainId } = seedProject(6);
    const occ = scriptView(state, mainId);
    const off = mustApply(state, {
      type: "SetOccurrenceActive",
      occurrenceId: occ[2]!.occurrenceId,
      active: false,
    });
    const clips = filmClips(off, mainId);
    expect(clips.map((c) => c.occurrenceId)).toEqual(
      scriptView(off, mainId).map((x) => x.occurrenceId),
    );
    expect(clips.some((c) => c.occurrenceId === occ[2]!.occurrenceId)).toBe(false);
  });

  it("bruker 2D-scenens lengde, ellers beregnet lengde fra manus, og summerer starttider", () => {
    const { state, mainId } = seedProject(3);
    const view = scriptView(state, mainId);
    const v0 = state.occurrences[view[0]!.occurrenceId]!.variantId;
    const v1 = state.occurrences[view[1]!.occurrenceId]!.variantId;
    let s = withComposition(state, v0, 100);
    s = withComposition(s, v1, 0); // lengde 0 = beregnet fra manus
    const est = estimatedSceneFrames(s, mainId);
    const clips = filmClips(s, mainId);
    expect(clips[0]).toMatchObject({
      source: "composition",
      durationFrames: 100,
      durationKind: "set",
    });
    expect(clips[1]).toMatchObject({
      source: "composition",
      durationKind: "estimate",
      durationFrames: est.get(view[1]!.occurrenceId),
    });
    expect(clips[2]).toMatchObject({
      source: "placeholder",
      compositionId: null,
      durationKind: "estimate",
    });
    expect(clips[1]!.startFrame).toBe(100);
    expect(clips[2]!.startFrame).toBe(100 + clips[1]!.durationFrames);
    expect(filmDurationFrames(clips)).toBe(clips[2]!.startFrame + clips[2]!.durationFrames);
    // Minst 5 sekunder for beregnede scener
    expect(clips[2]!.durationFrames).toBeGreaterThanOrEqual(secondsToFrames(5, s.project.fps));
  });

  it("tidskodene beregnes på nytt når en scene flyttes; scenens egen lengde er uendret (mandat 6.4)", () => {
    const { state, mainId } = seedProject(3);
    const view = scriptView(state, mainId);
    const v2 = state.occurrences[view[2]!.occurrenceId]!.variantId;
    const s = withComposition(state, v2, 80);
    const before = filmClips(s, mainId);
    const first = s.occurrences[view[0]!.occurrenceId]!;
    const moved = mustApply(s, {
      type: "MoveOccurrence",
      occurrenceId: view[2]!.occurrenceId,
      orderKey: keyBetween(null, first.orderKey),
    });
    const after = filmClips(moved, mainId);
    expect(after[0]!.occurrenceId).toBe(view[2]!.occurrenceId);
    expect(after[0]!.startFrame).toBe(0);
    expect(after[0]!.durationFrames).toBe(80);
    expect(before[2]!.startFrame).toBeGreaterThan(0);
    // Manuset har samme nye rekkefølge (samme kommando, REQ-0228)
    expect(scriptView(moved, mainId).map((x) => x.occurrenceId)).toEqual(
      after.map((c) => c.occurrenceId),
    );
  });

  it("er den samme lista for samme tilstand (bufret)", () => {
    const { state, mainId } = seedProject(4);
    expect(filmClips(state, mainId)).toBe(filmClips(state, mainId));
  });
});

describe("clipAtFrame", () => {
  it("finner klippet og bildet i scenen, og holder seg innenfor filmen", () => {
    const { state, mainId } = seedProject(4);
    const clips = filmClips(state, mainId);
    for (const [i, c] of clips.entries()) {
      expect(clipAtFrame(clips, c.startFrame)).toMatchObject({ index: i, localFrame: 0 });
      expect(clipAtFrame(clips, c.startFrame + c.durationFrames - 1)).toMatchObject({
        index: i,
        localFrame: c.durationFrames - 1,
      });
    }
    expect(clipAtFrame(clips, -10)!.index).toBe(0);
    const end = filmDurationFrames(clips);
    expect(clipAtFrame(clips, end + 100)).toMatchObject({
      index: clips.length - 1,
      localFrame: clips[clips.length - 1]!.durationFrames - 1,
    });
    expect(clipAtFrame([], 0)).toBeNull();
  });
});

describe("filmRange", () => {
  it("hele filmen, én scene og et utvalg (også baklengs)", () => {
    const { state, mainId } = seedProject(5);
    const clips = filmClips(state, mainId);
    expect(filmRange(clips, { kind: "film" })).toMatchObject({
      startFrame: 0,
      endFrame: filmDurationFrames(clips),
    });
    const one = filmRange(clips, {
      kind: "scenes",
      fromOccurrenceId: clips[2]!.occurrenceId,
      toOccurrenceId: clips[2]!.occurrenceId,
    });
    expect(one.clips).toHaveLength(1);
    expect(one.endFrame - one.startFrame).toBe(clips[2]!.durationFrames);
    const back = filmRange(clips, {
      kind: "scenes",
      fromOccurrenceId: clips[3]!.occurrenceId,
      toOccurrenceId: clips[1]!.occurrenceId,
    });
    expect(back.clips.map((c) => c.occurrenceId)).toEqual(
      clips.slice(1, 4).map((c) => c.occurrenceId),
    );
    expect(back.startFrame).toBe(clips[1]!.startFrame);
    expect(
      filmRange(clips, { kind: "scenes", fromOccurrenceId: "x", toOccurrenceId: "y" }).clips,
    ).toHaveLength(0);
  });
});

describe("lengde i filmtidslinjen", () => {
  it("å endre lengden på en scene endrer verken manus eller rekkefølge (REQ-0230)", () => {
    const { state, mainId } = seedProject(3);
    const view = scriptView(state, mainId);
    const v0 = state.occurrences[view[0]!.occurrenceId]!.variantId;
    const compId = tid<"composition">();
    let s = mustApply(state, {
      type: "CreateComposition",
      compositionId: compId as never,
      variantId: v0 as never,
      fields: { ...DEFAULT_COMPOSITION, width: 1920, height: 1080, durationFrames: 200 },
    });
    const before = scriptView(s, mainId);
    const c = s.compositions[compId]!;
    s = mustApply(s, {
      type: "UpdateComposition",
      compositionId: c.id,
      fields: {
        name: c.name,
        width: c.width,
        height: c.height,
        durationFrames: 25,
        background: c.background,
      },
    });
    expect(scriptView(s, mainId)).toEqual(before);
    expect(filmClips(s, mainId)[0]!.durationFrames).toBe(25);
    expect(filmClips(s, mainId)[1]!.startFrame).toBe(25);
  });
});
