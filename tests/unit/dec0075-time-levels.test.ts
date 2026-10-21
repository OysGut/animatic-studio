// @vitest-environment node
/** Flernivå tidsmodell (DEC-0075, REQ-0105): filmtid ↔ scene ↔ del ↔ kilde, begge veier. */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPOSITION,
  FPS_23_976,
  clipTimeLevels,
  filmClips,
  filmDurationFrames,
  filmToLevels,
  filmToScene,
  levelsToFilm,
  partToScene,
  partKey,
  partToSource,
  playheadRows,
  sceneToFilm,
  sceneToPart,
  scriptView,
  sourceAt,
  sourceToFilm,
  sourceToScene,
  type TakeMedia,
} from "@/core";
import { mustApply, seedProject, tid } from "../helpers/fixtures";

const MEDIA: TakeMedia = {
  fileName: "film.mp4",
  mimeType: "video/mp4",
  byteSize: 1000,
  width: 1920,
  height: 1080,
  fps: 25,
  durationMs: 8000,
  videoCodec: "avc",
  hasAudio: true,
};

/** Tre scener; den andre er klippet av film (to utsnitt) og 2D-scenen. */
function setup() {
  const seed = seedProject(3);
  const view = scriptView(seed.state, seed.mainId);
  const occ = view[1]!.occurrenceId;
  const takeId = tid<"take">();
  let s = mustApply(seed.state, {
    type: "AddTake",
    takeId,
    occurrenceId: occ as never,
    segmentId: null,
    kind: "imported_film",
    status: "approved",
    durationFrames: 200,
    mediaRef: `${seed.state.project.id}/films/${takeId}/film.mp4`,
    media: MEDIA,
  });
  s = mustApply(s, {
    type: "CreateComposition",
    compositionId: tid(),
    variantId: s.occurrences[occ]!.variantId,
    fields: { ...DEFAULT_COMPOSITION, width: 1920, height: 1080, durationFrames: 250 },
  });
  s = mustApply(s, {
    type: "SetSceneEdit",
    occurrenceId: occ as never,
    activeTakeId: takeId,
    parts: [
      { partId: tid(), source: "take", takeId, inMs: 1000, outMs: 3000 },
      { partId: tid(), source: "composition", takeId: null, inMs: 4000, outMs: 6000 },
      { partId: tid(), source: "take", takeId, inMs: 5000, outMs: 7020 },
    ],
  });
  return { ...seed, s, occ, takeId };
}

describe("filmtid → scene, del og kilde", () => {
  it("samme kilde som avspillingen (sourceAt) og riktig del", () => {
    const { s, mainId, occ, takeId } = setup();
    const fps = s.project.fps;
    const clips = filmClips(s, mainId);
    const clip = clips.find((c) => c.occurrenceId === occ)!;
    expect(clip.parts.map((p) => p.durationFrames)).toEqual([50, 50, 51]);
    // Bilde 60 i scenen: del 2 (2D-scenen), bilde 10 i delen, 2D-bilde 100 + 10
    const at = filmToLevels(clips, clip.startFrame + 60, fps)!;
    expect(at.occurrenceId).toBe(occ);
    expect(at.clipIndex).toBe(1);
    expect(at.sceneFrame).toBe(60);
    expect(at.partIndex).toBe(1);
    expect(at.partFrame).toBe(10);
    expect(at.source).toEqual({ kind: "composition", frame: 110 });
    // Bilde 120: del 3, filmen fra 5 s
    const b = filmToLevels(clips, clip.startFrame + 120, fps)!;
    expect(b.partIndex).toBe(2);
    expect(b.source).toEqual({ kind: "take", takeId, ms: 5000 + (20 * 1000) / 25 });
    // Samme som avspillingen bruker
    for (const f of [0, 49, 50, 99, 100, 150]) {
      const lv = clipTimeLevels(clip, 1, clip.startFrame + f, fps);
      const src = sourceAt(clip, f, fps);
      if (src.kind === "take") expect(lv.source).toMatchObject({ ms: src.seconds * 1000 });
      else if (src.kind === "composition") expect(lv.source).toEqual(src);
    }
  });

  it("tom film gir null", () => {
    expect(filmToLevels([], 10, { num: 25, den: 1 })).toBeNull();
  });
});

describe("rundtur", () => {
  it("hvert bilde i filmen: film → nivåer → film, del → scene, kilde → scene", () => {
    const { s, mainId } = setup();
    const fps = s.project.fps;
    const clips = filmClips(s, mainId);
    const total = filmDurationFrames(clips);
    for (let f = 0; f < total; f++) {
      const lv = filmToLevels(clips, f, fps)!;
      const clip = clips[lv.clipIndex]!;
      expect(sceneToFilm(clip, lv.sceneFrame)).toBe(f);
      expect(filmToScene(clip, f)).toBe(lv.sceneFrame);
      expect(partToScene(clip, lv.partId, lv.partFrame)).toBe(lv.sceneFrame);
      expect(sceneToPart(clip, lv.sceneFrame)).toEqual({
        partId: lv.partId,
        partIndex: lv.partIndex,
        partFrame: lv.partFrame,
      });
      expect(levelsToFilm(clips, lv)).toBe(f);
      if (lv.source.kind !== "placeholder") {
        expect(sourceToScene(clip, lv.source, fps)).toContain(lv.sceneFrame);
        expect(sourceToFilm(clips, lv.source, fps)).toContainEqual({
          occurrenceId: clip.occurrenceId,
          filmFrame: f,
        });
      }
    }
  });

  it("rundtur også med 23,976 bilder/s", () => {
    const { s, mainId, occ } = setup();
    const clip = filmClips(s, mainId).find((c) => c.occurrenceId === occ)!;
    for (let i = 0; i < clip.parts.length; i++)
      for (let o = 0; o < clip.parts[i]!.durationFrames; o++) {
        const key = partKey(clip, clip.parts[i]!);
        const src = partToSource(clip, key, o, FPS_23_976);
        expect(sourceToScene(clip, src, FPS_23_976)).toContain(partToScene(clip, key, o));
      }
  });

  it("kildetid som er kuttet bort finnes ikke i scenen; ukjent scene gir null", () => {
    const { s, mainId, occ, takeId } = setup();
    const fps = s.project.fps;
    const clips = filmClips(s, mainId);
    const clip = clips.find((c) => c.occurrenceId === occ)!;
    expect(sourceToScene(clip, { kind: "take", takeId, ms: 4000 }, fps)).toEqual([]);
    expect(sourceToScene(clip, { kind: "take", takeId, ms: 500 }, fps)).toEqual([]);
    expect(sourceToScene(clip, { kind: "composition", frame: 50 }, fps)).toEqual([]);
    expect(levelsToFilm(clips, { occurrenceId: tid(), partId: clip.parts[0]!.id!, partFrame: 0 })).toBeNull();
    expect(levelsToFilm(clips, { occurrenceId: occ, partId: tid(), partFrame: 0 })).toBeNull();
  });
});

describe("teknisk visning av avspillingshodet", () => {
  it("viser tid i film, scene, del og kilde; null utenfor scenen", () => {
    const { s, mainId, occ } = setup();
    const fps = s.project.fps;
    const clip = filmClips(s, mainId).find((c) => c.occurrenceId === occ)!;
    const rows = playheadRows(s, clip, clip.startFrame + 120, fps)!;
    const get = (l: string) => rows.find((r) => r.label === l)?.value ?? "";
    expect(get("Film")).toContain(`bilde ${clip.startFrame + 120}`);
    expect(get("I scenen")).toContain("bilde 120");
    expect(get("I del 3")).toContain("bilde 20");
    expect(get("I kilden")).toContain("5,8 s");
    expect(playheadRows(s, clip, clip.startFrame - 1, fps)).toBeNull();
    expect(playheadRows(s, clip, clip.startFrame + clip.durationFrames, fps)).toBeNull();
  });
});
