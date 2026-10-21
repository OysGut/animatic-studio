// @vitest-environment node
import { describe, it, expect } from "vitest";
import { applyCommand, compositionFromTake, alignmentInComposition, setWordTiming, manualAlignment, diffStates, emptyProjectState, stateFromRows, type Command } from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";
import { removableAiSource } from "@/core/generation/source-cleanup";

describe("KI-224", () => {
  it("løst er ikke slettet; status har invers og gjør om, og overlever rader", () => {
    const { state } = seedProject(1);
    const variant = Object.values(state.variants)[0];
    if (!variant) throw new Error("missing variant");
    const id = tid<"annotation">();
    const initial = mustApply(state, { type: "AddAnnotations", annotations: [{ annotationId: id, variantId: variant.id, blockId: null, start: 0, end: 0, quote: "", text: "Sjekk lyden", authorName: "Test" }] });
    const result = applyCommand(initial, envelope({ type: "SetAnnotationResolved", annotationId: id, resolved: true }));
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state.annotations[id]).toMatchObject({ resolved: true, removed: false, text: "Sjekk lyden" });
    const undone = applyCommand(result.state, envelope(result.inverse as Command));
    if (!undone.ok) throw new Error(undone.error.message);
    expect(undone.state.annotations[id]?.resolved).toBe(false);
    const redone = mustApply(undone.state, undone.inverse as Command);
    expect(redone.annotations[id]?.resolved).toBe(true);
    expect(diffStates(initial, result.state).updates["script_annotations"]?.[0]).toMatchObject({ resolved: true, removed: false });
    const rows = diffStates(emptyProjectState(redone.project), redone).inserts;
    const reloaded = stateFromRows({ project: { id: redone.project.id, revision: 1, name: "Test", fps_num: 25, fps_den: 1 }, productions: rows["productions"] ?? [], scenes: rows["scenes"] ?? [], scene_variants: rows["scene_variants"] ?? [], script_blocks: rows["script_blocks"] ?? [], scene_occurrences: rows["scene_occurrences"] ?? [], script_annotations: rows["script_annotations"] ?? [], script_block_revisions: [], production_segments: [], takes: [] });
    expect(reloaded.annotations[id]?.resolved).toBe(true);
  });
});

describe("KI-247", () => {
  it("word end at a cut follows the preceding segment; new version timings do not mutate the source", () => {
    const a = setWordTiming(setWordTiming(manualAlignment("b", "Hei du", "2026-10-19T18:10:00Z"), 0, 100, 500), 1, 600, 900);
    const initial = compositionFromTake({ versionId: "take", durationMs: 1000 }, () => "s");
    const segment = initial.segments[0];
    if (!segment) throw new Error("missing segment");
    const edited = { ...initial, segments: [{ ...segment, id: "left", lengthMs: 500 }, { ...segment, id: "right", sourceInMs: 500, atMs: 1000, lengthMs: 500 }] };
    const projected = alignmentInComposition(edited, a, { kind: "composition", composition: initial });
    expect(projected.words.map((w) => [w.startMs, w.endMs])).toEqual([[100, 500], [1100, 1400]]);
    expect(a.words[1]?.startMs).toBe(600);
    const again = alignmentInComposition({ ...edited, segments: edited.segments.map((s) => ({ ...s, atMs: s.atMs + 200 })) }, projected, { kind: "composition", composition: edited });
    expect(again.words[1]?.startMs).toBe(1300);
  });
});

describe("KI-207", () => {
  it("only old unreferenced source MP4s in this project are eligible", () => {
    const now = Date.parse("2026-10-19T18:00:00Z");
    const old = "2026-09-01T00:00:00Z";
    expect(removableAiSource("p", "p/temp/ai-source/a.mp4", old, new Set(), now)).toBe(true);
    expect(removableAiSource("p", "p/generated/films/a.mp4", old, new Set(), now)).toBe(false);
    expect(removableAiSource("p", "other/ai-source/a.mp4", old, new Set(), now)).toBe(false);
    expect(removableAiSource("p", "p/ai-source/a.mp4", old, new Set(["p/ai-source/a.mp4"]), now)).toBe(false);
    expect(removableAiSource("p", "p/ai-source/a.mp4", "2026-10-18T00:00:00Z", new Set(), now)).toBe(false);
  });
});