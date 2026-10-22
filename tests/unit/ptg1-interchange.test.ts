import { describe, expect, it } from "vitest";
import { applyCommand, orderedOccurrences, filmClips, filmDurationFrames, secondsToFrames, framesToSeconds, formatTimecode } from "@/core";
import { buildInterchange, eventTime, projectCodeValid, suggestProjectCode, sceneCode, shotName, nextShotVersion } from "@/core/interchange";
import { shotlistCsv, shotlistRows } from "@/core/interchange/shotlist";
import { seedProject, envelope } from "../helpers/fixtures";

describe("PTG1 utveksling", () => {
  for (const rate of [12, 24, 25, 30]) it(`bevarer avrundede grenser ved ${rate} opptak/s`, () => {
    const { state, mainId } = seedProject(4);
    const s = { ...state, project: { ...state.project, fps: { num: 24, den: 1 } } };
    const doc = buildInterchange(s, { productionId: mainId, language: "nb", captureFps: { num: rate, den: 1 } });
    const total = secondsToFrames(framesToSeconds(filmDurationFrames(filmClips(s, mainId)), s.project.fps), doc.fps);
    expect(doc.lengthFrames).toBe(total);
    expect(doc.shots.reduce((sum, x) => sum + x.lengthFrames, 0)).toBe(total);
    for (const shot of doc.shots) {
      expect(shot.timecodeIn).toBe(formatTimecode(shot.startFrame, doc.fps));
      expect(shot.timecodeOut).toBe(formatTimecode(shot.startFrame + shot.lengthFrames, doc.fps));
      expect(shot.handleIn).toBe(0); expect(shot.handleOut).toBe(0); expect(shot.camera).toBe(null);
    }
    if (rate === 12) { expect(doc.fps).toEqual({ num: 24, den: 1 }); expect(doc.exposureStep).toBe(2); }
  });
  it("klipper midt i fem bilders overlapp: 3/2 håndtak", () => {
    const { state, mainId } = seedProject(2);
    const occs = orderedOccurrences(state, mainId); const a = occs[0], b = occs[1];
    if (!a || !b) throw new Error("fixture");
    const s = { ...state, project: { ...state.project, fps: { num: 24, den: 1 } }, occurrences: {
      ...state.occurrences, [b.id]: { ...b, transition: { kind: "dissolve" as const, frames: 5, overlap: true } },
    } };
    const clips = filmClips(s, mainId); const incoming = clips[1];
    if (!incoming) throw new Error("fixture");
    const doc = buildInterchange(s, { productionId: mainId, language: "nb" });
    expect(incoming.overlapFrames).toBe(5);
    expect(doc.shots[1]?.startFrame).toBe(incoming.startFrame + 3);
    expect(doc.shots[0]?.handleOut).toBe(2); expect(doc.shots[1]?.handleIn).toBe(3);
    expect(doc.shots[1]?.transition.lengthFrames).toBe(5);
    expect(doc.shots.reduce((n, x) => n + x.lengthFrames, 0)).toBe(filmDurationFrames(clips));
  });
  it("hele kryssende lyd-/ordhendelser har absolutt og relativ tid", () => {
    expect(eventTime(9 / 24, 14 / 24, { startFrame: 0, lengthFrames: 12 }, { num: 24, den: 1 })).toEqual({
      absoluteStartFrame: 9, absoluteEndFrame: 14, startFrame: 9, endFrame: 14, lengthFrames: 5, crossesCut: true,
    });
    expect(eventTime(13 / 24, 14 / 24, { startFrame: 12, lengthFrames: 12 }, { num: 24, den: 1 }).startFrame).toBe(1);
  });
  it("tom film og scene under ett opptaksbilde gir ikke negativ lengde", () => {
    const { state, mainId } = seedProject(1);
    expect(buildInterchange(state, { productionId: mainId, language: "nb", occurrenceIds: [] }).lengthFrames).toBe(0);
    const takes = Object.fromEntries(Object.entries(state.takes).map(([id, take]) => [id, { ...take, durationFrames: 1 }]));
    const occurrences = Object.fromEntries(Object.entries(state.occurrences).map(([id, occurrence]) => [id, { ...occurrence, plannedMs: 1 }]));
    const s = { ...state, project: { ...state.project, fps: { num: 30, den: 1 } }, takes, occurrences };
    const doc = buildInterchange(s, { productionId: mainId, language: "nb", capture: { mode: "custom", fps: { num: 12, den: 1 } } });
    expect(doc.shots[0]?.lengthFrames).toBe(0); expect(doc.lengthFrames).toBe(0);
  });
  it("prosjektkode og versjonerte navn bevarer tillegg", () => {
    expect(suggestProjectCode("Ærlig Ørn på Åsen")).toBe("AERLIG-OERN-PAA-AASEN");
    expect(projectCodeValid("A".repeat(32))).toBe(true); expect(projectCodeValid("A".repeat(33))).toBe(false);
    expect(projectCodeValid("ABC-123")).toBe(true); expect(projectCodeValid("æ x")).toBe(false);
    expect(shotName("PROSJEKT", sceneCode("42A", 1), 10, 3)).toBe("PROSJEKT_SC042A_SH010_v003");
    expect(nextShotVersion([], "id")).toBe(1);
  });
  it("språk og spinoff bruker egne forekomst-ID-er; kollisjoner får egne SH", () => {
    const { state, mainId, spinoffId } = seedProject();
    const main = buildInterchange(state, { productionId: mainId, language: "nb" });
    const en = buildInterchange(state, { productionId: mainId, language: "en" });
    expect(en.shots.map(s => s.name)).toEqual(main.shots.map(s => s.name));
    const spin = buildInterchange(state, { productionId: spinoffId, language: "nb" });
    expect(spin.shots.some(s => main.shots.some(m => m.id === s.id))).toBe(false);
    expect(new Set(main.shots.map(s => s.name)).size).toBe(main.shots.length);
  });
  it("CSV har BOM, relative PNG-stier og håndtak etter lengde", () => {
    const { state, mainId } = seedProject(2); const doc = buildInterchange(state, { productionId: mainId, language: "nb" });
    const bytes = shotlistCsv(doc); expect([...bytes.slice(0, 3)]).toEqual([239, 187, 191]);
    expect(Object.keys(shotlistRows(doc)[0] ?? {}).slice(7, 10)).toEqual(["NB Frames", "Handle In", "Handle Out"]);
    expect(doc.shots.every(s => s.thumbnail.path.startsWith("thumbnails/") && s.thumbnail.path.endsWith(".png"))).toBe(true);
  });
  it("innstillinger har invers, angre og gjør om", () => {
    const { state } = seedProject(1);
    const command = { type: "SetInterchangeSettings" as const, code: "TEST-01", capture: { mode: "twos" as const, fps: { num: 12, den: 1 } } };
    const result = applyCommand(state, envelope(command)); if (!result.ok) throw new Error(result.error.message);
    expect(result.state.project.code).toBe("TEST-01"); expect(result.state.project.capture?.mode).toBe("twos");
    const undo = applyCommand(result.state, envelope(result.inverse)); if (!undo.ok) throw new Error(undo.error.message);
    expect(undo.state.project.code).toBe(null); expect(undo.state.project.capture?.mode).toBe("ones");
    const redo = applyCommand(undo.state, envelope(undo.inverse)); if (!redo.ok) throw new Error(redo.error.message);
    expect(redo.state.project.code).toBe("TEST-01"); expect(redo.state.project.capture?.fps.num).toBe(12);
  });
});