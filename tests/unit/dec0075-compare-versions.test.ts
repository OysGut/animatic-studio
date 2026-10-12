// @vitest-environment node
/** Sammenligning av versjoner av en scene (DEC-0075, REQ-0318). */
import { describe, expect, it } from "vitest";
import {
  comparableVersions,
  compareLength,
  filmClips,
  idCreatedAt,
  newId,
  scriptView,
  sourceAt,
  splitParts,
  versionFrameAt,
  type TakeMedia,
} from "@/core";
import { mustApply, seedProject, tid } from "../helpers/fixtures";

const MEDIA: TakeMedia = {
  fileName: "opptak.mp4",
  mimeType: "video/mp4",
  byteSize: 1000,
  width: 1920,
  height: 1080,
  fps: 25,
  durationMs: 8000,
  videoCodec: "avc",
  hasAudio: true,
};

function setup() {
  const seed = seedProject(3);
  const occ = scriptView(seed.state, seed.mainId)[0]!.occurrenceId;
  const film = tid<"take">();
  const ai = tid<"take">();
  let s = mustApply(seed.state, {
    type: "AddTake",
    takeId: film,
    occurrenceId: occ as never,
    segmentId: null,
    kind: "imported_film",
    status: "approved",
    durationFrames: 200,
    mediaRef: `${seed.state.project.id}/films/${film}/opptak.mp4`,
    media: MEDIA,
  });
  s = mustApply(s, {
    type: "AddTake",
    takeId: ai,
    occurrenceId: occ as never,
    segmentId: null,
    kind: "ai_video",
    status: "reference",
    durationFrames: 125,
    mediaRef: `${seed.state.project.id}/films/${ai}/ai.mp4`,
  });
  return { ...seed, s, occ, film, ai };
}

describe("versjoner som kan sammenlignes (REQ-0318)", () => {
  it("lister animatic, importert film og AI-video med navn, type og lengde", () => {
    const { s, mainId, occ, film, ai } = setup();
    const vs = comparableVersions(s, mainId, occ, [
      { resultPath: s.takes[ai]!.mediaRef, createdAt: "2026-10-01T10:00:00.000Z" },
    ]);
    expect(vs.map((v) => v.kind)).toEqual(["animatic", "imported_film", "ai_video"]);
    const f = vs.find((v) => v.takeId === film)!;
    expect(f.label).toBe("opptak.mp4");
    expect(f.durationFrames).toBe(200);
    // Laget-tid: fra AI-jobben; ellers fra id-en (testens id-er har ingen tid)
    expect(vs.find((v) => v.takeId === ai)!.createdAt).toBe("2026-10-01T10:00:00.000Z");
    expect(f.createdAt).toBeNull();
    // Animaticen er i bruk (ingen versjon er valgt)
    expect(vs[0]!.inUse).toBe(true);
    expect(f.inUse).toBe(false);
  });

  it("hver versjon har et eget klipp fra bilde 0 som viser bare den versjonen", () => {
    const { s, mainId, occ, film } = setup();
    const s2 = mustApply(s, { type: "SetActiveTake", occurrenceId: occ as never, takeId: film });
    // Scene nr. 2 i filmen: versjonen starter likevel på 0
    const vs = comparableVersions(s2, mainId, occ);
    const fps = s2.project.fps;
    for (const v of vs) {
      expect(v.clip.startFrame).toBe(0);
      expect(v.clip.transition.kind).toBe("cut");
      expect(v.clip.durationFrames).toBe(v.durationFrames);
    }
    const f = vs.find((v) => v.takeId === film)!;
    expect(f.inUse).toBe(true);
    const src = sourceAt(f.clip, 50, fps);
    expect(src.kind === "take" && src.take.id).toBe(film);
    expect(src.kind === "take" && src.seconds).toBeCloseTo(2, 6);
    // Animaticen viser 2D-scenen eller tittelkort, ikke filmen
    expect(sourceAt(vs[0]!.clip, 0, fps).kind).not.toBe("take");
  });

  it("en klippet (sammensatt) scene er en egen versjon", () => {
    const { s, mainId, occ, film } = setup();
    const s2 = mustApply(s, { type: "SetActiveTake", occurrenceId: occ as never, takeId: film });
    const clip = filmClips(s2, mainId).find((c) => c.occurrenceId === occ)!;
    const parts = splitParts(clip, 80, s2.project.fps, () => newId())!;
    const s3 = mustApply(s2, {
      type: "SetSceneEdit",
      occurrenceId: occ as never,
      activeTakeId: film,
      parts,
    });
    const vs = comparableVersions(s3, mainId, occ);
    const edit = vs.find((v) => v.kind === "edit")!;
    expect(edit.label).toBe("Klippet versjon (2 deler)");
    expect(edit.inUse).toBe(true);
    expect(edit.clip.parts).toHaveLength(2);
    expect(edit.createdAt).not.toBeNull();
    // Filmen selv er ikke «i bruk» som hel versjon når scenen er klippet
    expect(vs.find((v) => v.takeId === film)!.inUse).toBe(false);
  });

  it("ukjent scene gir ingen versjoner", () => {
    const { s, mainId } = setup();
    expect(comparableVersions(s, mainId, tid())).toEqual([]);
  });
});

describe("felles avspilling", () => {
  it("samme tid fra start: den korteste holder siste bilde", () => {
    const total = compareLength({ durationFrames: 200 }, { durationFrames: 125 });
    expect(total).toBe(200);
    expect(versionFrameAt(125, 50, total, "time")).toBe(50);
    expect(versionFrameAt(125, 150, total, "time")).toBe(124);
    expect(versionFrameAt(200, 150, total, "time")).toBe(150);
  });

  it("samme andel: start mot start og slutt mot slutt", () => {
    const total = 200;
    expect(versionFrameAt(125, 0, total, "relative")).toBe(0);
    expect(versionFrameAt(125, 199, total, "relative")).toBe(124);
    expect(versionFrameAt(125, 100, total, "relative")).toBe(Math.round((100 / 199) * 124));
    expect(versionFrameAt(200, 100, total, "relative")).toBe(100);
    // Utenfor tidslinjen holdes endene
    expect(versionFrameAt(125, -5, total, "relative")).toBe(0);
    expect(versionFrameAt(125, 500, total, "time")).toBe(124);
  });
});

describe("opprettelsestid fra id", () => {
  it("UUID v7 gir tiden; andre id-er gir null", () => {
    const at = Date.UTC(2026, 9, 12, 8, 30);
    expect(idCreatedAt(newId(at))).toBe(new Date(at).toISOString());
    expect(idCreatedAt("ikke-en-id")).toBeNull();
  });
});
