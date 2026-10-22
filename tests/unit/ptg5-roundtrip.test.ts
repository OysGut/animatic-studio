import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dragonframeImportDocument, dragonframeTimeline, dragonframeWarnings, parsePtgShotName, recognizeDragonframeShot } from "@/core/interchange/dragonframe-import";
import { readDragonframeXml } from "@/app/assembly/dragonframe-import";
import { seedProject, mustApply, tid, envelope } from "../helpers/fixtures";
import { applyCommand, filmClips, orderedOccurrences, sourceAt } from "@/core";

const xml = readFileSync("tests/fixtures/ptg5/twos/take.xml", "utf8");
const paths = [1,2,3,4].map(n => `PTG-TEST_SC001_SH010_v003_X1_${String(n).padStart(4,"0")}.png`);
function setup() {
  const { state, mainId } = seedProject(2);
  let s = mustApply(state, { type: "SetProjectFormat", width: 320, height: 180, fps: { num: 24, den: 1 } });
  const o = orderedOccurrences(s, mainId)[0]; if (!o) throw new Error("fixture");
  s = mustApply(s, { type: "CreateComposition", compositionId: tid<"composition">(), variantId: o.variantId,
    fields: { name: "fixture", width: 320, height: 180, durationFrames: 6, background: "#101114" } });
  return { s, mainId, o };
}
describe("PTG5 Dragonframe", () => {
  it("namespace XML, packed hidden flag, repeats and deleted files follow the EDL", () => {
    const parsed = readDragonframeXml(xml);
    const timeline = dragonframeTimeline(paths, parsed.entries);
    expect(timeline.files).toEqual([paths[0], paths[0], paths[1], paths[1]]);
    expect(timeline.hidden).toBe(1); expect(timeline.deleted).toBe(1); expect(timeline.repeats).toBe(2);
    expect(parsed.fps).toEqual({ num: 24000, den: 1000 });
  });
  it("rejects malformed XML and external entity documents", () => {
    expect(() => readDragonframeXml("<take>" )).toThrow();
    expect(() => readDragonframeXml('<!DOCTYPE take SYSTEM "file:///secret"><take/>' )).toThrow();
  });
  it("missing EDL is distinct from an empty EDL and missing images are partial", () => {
    expect(dragonframeTimeline(paths, null).files).toHaveLength(4);
    expect(dragonframeTimeline(paths, []).files).toHaveLength(0);
    expect(dragonframeTimeline(paths, [{ vframe: 1, file: 99 }]).missing).toBe(1);
    expect(dragonframeTimeline([...paths, "a_X2_0001.png"], null).files).toHaveLength(4);
  });
  it("PTG1 name accepts filename suffixes, keeps scene suffix and export version", () => {
    expect(parsePtgShotName("folder/PROSJEKT_SC012A_SH010_v003_X1_0001.png")).toEqual({ code: "PROSJEKT", scene: "SC012A", shot: 10, version: 3, name: "PROSJEKT_SC012A_SH010_v003" });
    expect(parsePtgShotName("random.mp4")).toBeNull();
  });
  it("recognizes only a unique current shot in the same project, otherwise requires scene choice", () => {
    const { s, mainId } = setup(); const doc = dragonframeImportDocument(s, mainId); const shot = doc.shots[0]; if (!shot) throw new Error("fixture");
    const name = shot.name.replace(/v001$/, "v003");
    expect(recognizeDragonframeShot([name, `${name}_X1_001.png`], doc)?.shot.id).toBe(shot.id);
    expect(recognizeDragonframeShot([name], doc)?.version).toBe(3);
    expect(recognizeDragonframeShot([name.replace(doc.project.code, "OTHER")], doc)).toBeNull();
    expect(recognizeDragonframeShot([name, name.replace("v003", "v004")], doc)).toBeNull();
  });
  it("compares short/long against handles and converts fps only through the model", () => {
    const { s, mainId } = setup(); const shot = dragonframeImportDocument(s, mainId).shots[0]; if (!shot) throw new Error("fixture");
    const extended = { ...shot, lengthFrames: 6, handleIn: 2, handleOut: 2 };
    const common = { fps: { num: 24, den: 1 }, expectedFps: { num: 24, den: 1 }, shot: extended };
    expect(dragonframeWarnings({ ...common, frames: 9 })).toEqual(["short", "partial"]);
    expect(dragonframeWarnings({ ...common, frames: 11 })).toEqual(["long"]);
    expect(dragonframeWarnings({ ...common, frames: 10 })).toEqual([]);
    expect(dragonframeWarnings({ ...common, frames: 5, fps: { num: 12, den: 1 } })).toEqual(["fps"]);
  });
  it("AddTake is inactivated; undo preserves media and active choice; explicit choice mixes film with animatic", () => {
    const { s, mainId, o } = setup(); const takeId = tid<"take">();
    const before = filmClips(s, mainId);
    const command = { type: "AddTake" as const, takeId, occurrenceId: o.id, segmentId: null, kind: "imported_film" as const, status: "in_progress" as const,
      durationFrames: 4, mediaRef: `${s.project.id}/film/source/${takeId}/PTG.mp4`, media: { fileName: "PTG_SC001_SH010_v003.mp4", mimeType: "video/mp4", byteSize: 200, width: 320, height: 180, fps: 24, durationMs: 167, videoCodec: "avc", hasAudio: false } };
    const result = applyCommand(s, envelope(command)); if (!result.ok) throw new Error(result.error.message);
    expect(result.state.occurrences[o.id]?.activeTakeId).toBe(s.occurrences[o.id]?.activeTakeId);
    expect(filmClips(result.state, mainId).map(c => c.source)).toEqual(before.map(c => c.source));
    const undone = mustApply(result.state, result.inverse);
    expect(undone.takes[takeId]?.mediaRef).toBe(command.mediaRef);
    expect(undone.occurrences[o.id]?.activeTakeId).toBe(s.occurrences[o.id]?.activeTakeId);
    const chosen = mustApply(result.state, { type: "SetSceneEdit", occurrenceId: o.id, activeTakeId: takeId, parts: [] });
    const clips = filmClips(chosen, mainId); const first = clips[0]; if (!first) throw new Error("fixture");
    expect(first.source).toBe("film"); expect(sourceAt(first, 1, chosen.project.fps).kind).toBe("take");
    expect(clips[1]?.source).toBe(before[1]?.source);
  });
});