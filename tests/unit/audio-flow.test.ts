// @vitest-environment node
/** Lyd over flere scener, volumpunkter, lyd i scenene rundt og AI-beskrivelser (DEC-0045). */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPOSITION,
  applyCommand,
  buildImagePrompt,
  filmAudio,
  filmClips,
  IMAGE_PURPOSE_FOR_KIND,
  imageRequestShape,
  neighbourSceneAudio,
  sceneWindowAudio,
  scriptView,
  secondsToFrames,
  stateFromRows,
  toRow,
  volumeKeyDbAt,
  type AudioClipFields,
  type Command,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

function withSound(s: ProjectState, durationMs = 8000) {
  const assetId = tid<"asset">();
  const variantId = tid<"asset_variant">();
  const versionId = tid<"asset_version">();
  s = mustApply(s, {
    type: "CreateAssets",
    assets: [
      {
        assetId,
        fields: { kind: "sound", name: "Vind", names: [], description: "", category: "", tags: [] },
      },
    ],
  });
  s = mustApply(s, {
    type: "CreateAssetVariant",
    variantId,
    assetId,
    fields: { name: "Lyd", style: "other", appearance: "" },
  });
  s = mustApply(s, {
    type: "AddAssetVersion",
    versionId,
    variantId,
    media: {
      path: `${s.project.id}/${assetId}/${versionId}/vind.mp3`,
      mimeType: "audio/mpeg",
      width: null,
      height: null,
      byteSize: 1000,
      sha256: "a".repeat(64),
      durationMs,
    },
    note: "",
  });
  return { s, assetId, variantId, versionId };
}

function fields(
  occurrenceId: string,
  assetId: string,
  over: Partial<AudioClipFields> = {},
): AudioClipFields {
  return {
    occurrenceId: occurrenceId as never,
    kind: "ambience",
    name: "Vind",
    assetId: assetId as never,
    assetVariantId: null,
    versionId: null,
    blockId: null,
    offsetMs: 1000,
    sourceInMs: 0,
    lengthMs: 4000,
    gainDb: 0,
    fadeInMs: 0,
    fadeOutMs: 0,
    muted: false,
    continues: false,
    volumeKeys: [],
    ...over,
  };
}

function fails(s: ProjectState, c: Command) {
  const r = applyCommand(s, envelope(c));
  expect(r.ok).toBe(false);
  return r.ok ? "" : r.error.message;
}

function withComposition(s: ProjectState, variantId: string, durationFrames: number) {
  return mustApply(s, {
    type: "CreateComposition",
    compositionId: tid(),
    variantId: variantId as never,
    fields: { ...DEFAULT_COMPOSITION, width: 1920, height: 1080, durationFrames },
  });
}

describe("lyd som løper videre", () => {
  it("uten «løper videre» kuttes lyden ved scenens slutt; med løper den inn i neste scene", () => {
    const seed = seedProject(3);
    const { s: s0, assetId } = withSound(seed.state, 60_000);
    const view = scriptView(s0, seed.mainId);
    const occ0 = view[0]!.occurrenceId;
    const occ1 = view[1]!.occurrenceId;
    // Første scene er 4 s lang (100 bilder à 25)
    let s = withComposition(s0, s0.occurrences[occ0]!.variantId, 100);
    const cut = tid<"audio_clip">();
    const run = tid<"audio_clip">();
    s = mustApply(s, {
      type: "AddAudioClips",
      clips: [
        { clipId: cut, fields: fields(occ0, assetId, { offsetMs: 1000, lengthMs: 10_000 }) },
        {
          clipId: run,
          fields: fields(occ0, assetId, {
            kind: "music",
            offsetMs: 0,
            lengthMs: 10_000,
            continues: true,
          }),
        },
      ],
    });
    const fps = s.project.fps;
    const clips = filmClips(s, seed.mainId);
    expect(clips[0]!.durationFrames).toBe(100);
    const items = filmAudio(s, clips, fps);
    const a = items.find((i) => i.clip.id === cut)!;
    const b = items.find((i) => i.clip.id === run)!;
    expect(a.length).toBeCloseTo(3, 6); // 1 s inn, scenen slutter ved 4 s
    expect(a.fullLength).toBeCloseTo(10, 6);
    expect(b.length).toBeCloseTo(10, 6);
    // I neste scene høres bare musikken, med negativ start
    const win = sceneWindowAudio(s, clips, occ1, fps);
    expect(win.map((i) => i.clip.id)).toEqual([run]);
    expect(win[0]!.start).toBeCloseTo(-4, 6);
  });

  it("lyd som løper videre gjør ikke en scene uten 2D-scene lengre", () => {
    const seed = seedProject(2);
    const { s: s0, assetId } = withSound(seed.state, 120_000);
    const occ = scriptView(s0, seed.mainId)[0]!.occurrenceId;
    const before = filmClips(s0, seed.mainId)[0]!.durationFrames;
    const s = mustApply(s0, {
      type: "AddAudioClips",
      clips: [
        {
          clipId: tid(),
          fields: fields(occ, assetId, { offsetMs: 0, lengthMs: 100_000, continues: true }),
        },
      ],
    });
    expect(filmClips(s, seed.mainId)[0]!.durationFrames).toBe(before);
    expect(before).toBeLessThan(secondsToFrames(100, s.project.fps));
  });
});

describe("volumpunkter", () => {
  it("interpolerer rett linje mellom punktene og holder nivået utenfor", () => {
    const keys = [
      { t: 1, db: 0 },
      { t: 3, db: -20 },
    ];
    expect(volumeKeyDbAt([], 5)).toBe(0);
    expect(volumeKeyDbAt(keys, 0)).toBe(0);
    expect(volumeKeyDbAt(keys, 2)).toBeCloseTo(-10);
    expect(volumeKeyDbAt(keys, 9)).toBe(-20);
  });

  it("ganges inn i volumkurven", async () => {
    const { envelopeAt } = await import("@/engine/audio/mixer");
    const it0 = {
      clip: {} as never,
      version: null,
      start: 10,
      length: 4,
      sourceIn: 0,
      gain: 1,
      fadeIn: 0,
      fadeOut: 0,
      keys: [
        { t: 0, db: 0 },
        { t: 2, db: -20 },
      ],
      fullLength: 4,
    };
    expect(envelopeAt(it0, 10)).toBeCloseTo(1);
    expect(envelopeAt(it0, 12)).toBeCloseTo(0.1);
    expect(envelopeAt(it0, 11)).toBeCloseTo(Math.pow(10, -10 / 20));
  });

  it("valideres, sorteres og lagres identisk", () => {
    const seed = seedProject(1);
    const { s: s0, assetId } = withSound(seed.state);
    const occ = scriptView(s0, seed.mainId)[0]!.occurrenceId;
    const bad = (volumeKeys: AudioClipFields["volumeKeys"]) =>
      fails(s0, {
        type: "AddAudioClips",
        clips: [{ clipId: tid(), fields: fields(occ, assetId, { volumeKeys }) }],
      });
    expect(bad([{ t: 0, db: 20 }])).toMatch(/volumpunkt/);
    expect(bad([{ t: 0.5, db: 0 }])).toMatch(/volumpunkt/);
    expect(
      bad([
        { t: 10, db: 0 },
        { t: 10, db: -3 },
      ]),
    ).toMatch(/samme tid/);
    const id = tid<"audio_clip">();
    const s = mustApply(s0, {
      type: "AddAudioClips",
      clips: [
        {
          clipId: id,
          fields: fields(occ, assetId, {
            continues: true,
            volumeKeys: [
              { t: 2000, db: -12 },
              { t: 0, db: 0 },
            ],
          }),
        },
      ],
    });
    expect(s.audioClips[id]!.volumeKeys.map((k) => k.t)).toEqual([0, 2000]);
    const row = toRow("audioClips", s.audioClips[id]!, s.project.id);
    const back = stateFromRows({
      project: { id: s.project.id, name: "x", fps_num: 25, fps_den: 1, revision: 1 },
      productions: [],
      scenes: [],
      scene_variants: [],
      script_blocks: [],
      script_block_revisions: [],
      scene_occurrences: [],
      production_segments: [],
      takes: [],
      audio_clips: [row],
    });
    expect(back.audioClips[id]).toEqual(s.audioClips[id]);
  });
});

describe("lyd i scenene rundt", () => {
  it("finner lyden i scenen før og etter, og ingenting utenfor filmen", () => {
    const seed = seedProject(3);
    const { s: s0, assetId } = withSound(seed.state);
    const view = scriptView(s0, seed.mainId);
    const first = tid<"audio_clip">();
    const s = mustApply(s0, {
      type: "AddAudioClips",
      clips: [{ clipId: first, fields: fields(view[0]!.occurrenceId, assetId) }],
    });
    const clips = filmClips(s, seed.mainId);
    const mid = view[1]!.occurrenceId;
    const prev = neighbourSceneAudio(s, clips, mid, -1);
    expect(prev.clip?.occurrenceId).toBe(view[0]!.occurrenceId);
    expect(prev.audio.map((a) => a.id)).toEqual([first]);
    expect(neighbourSceneAudio(s, clips, mid, 1).audio).toEqual([]);
    expect(neighbourSceneAudio(s, clips, mid, -2).clip).toBeNull();
  });
});

describe("AI-beskrivelse", () => {
  const asset = {
    kind: "character" as const,
    name: "Jula",
    description: "A small troll girl with red hair",
    category: "",
    tags: ["troll", "winter"],
  };
  it("bygges fra ressurs, variant og stil, med frilagt bakgrunn for figurer", () => {
    const p = buildImagePrompt({
      asset,
      variant: { name: "Vinter", style: "illustrated", appearance: "wool hat" },
      filmTitle: "Jula på Dovre",
      withReference: true,
    });
    expect(p).toContain("Jula");
    expect(p).toContain("red hair");
    expect(p).toContain("wool hat");
    expect(p).toContain("Jula på Dovre");
    expect(p).toContain("troll, winter");
    expect(p).toMatch(/transparent background/);
    expect(p).toMatch(/reference image/);
    expect(IMAGE_PURPOSE_FOR_KIND.character).toBe("cutout");
    expect(imageRequestShape("cutout").background).toBe("transparent");
  });
  it("steder blir hele bakgrunner i bredformat uten forbilde-tekst", () => {
    const p = buildImagePrompt({
      asset: { ...asset, kind: "location", name: "Dovre", description: "", tags: [] },
      variant: null,
      withReference: false,
    });
    expect(p).toMatch(/Wide establishing view/);
    expect(p).not.toMatch(/reference image/);
    expect(p).not.toMatch(/Description:/);
    expect(imageRequestShape("background").size).toBe("1536x1024");
  });
});
