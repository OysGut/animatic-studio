// @vitest-environment node
/** Lyd i filmen (M4 del 2, DEC-0044): kommandoer, plassering i filmen og regler for lengde og lydfiler. */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPOSITION,
  applyCommand,
  audioClipFieldsOf,
  defaultLayerFields,
  diffStates,
  filmAudio,
  filmClips,
  keyBetween,
  scriptView,
  secondsToFrames,
  stateFromRows,
  toRow,
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
    ...over,
  };
}

function fails(s: ProjectState, c: Command) {
  const r = applyCommand(s, envelope(c));
  expect(r.ok).toBe(false);
  return r.ok ? "" : r.error.message;
}

describe("lydklipp", () => {
  it("legges til, endres, fjernes og angres; inversene gir tilstanden tilbake", () => {
    const seed = seedProject(3);
    const { s: s0, assetId } = withSound(seed.state);
    const occ = scriptView(s0, seed.mainId)[0]!.occurrenceId;
    const clipId = tid<"audio_clip">();
    const add = applyCommand(
      s0,
      envelope({ type: "AddAudioClips", clips: [{ clipId, fields: fields(occ, assetId) }] }),
    );
    expect(add.ok).toBe(true);
    if (!add.ok) return;
    const s1 = add.state;
    expect(s1.audioClips[clipId]).toMatchObject({ offsetMs: 1000, lengthMs: 4000, removed: false });
    const upd = applyCommand(
      s1,
      envelope({
        type: "UpdateAudioClips",
        clips: [
          {
            clipId,
            fields: { ...audioClipFieldsOf(s1.audioClips[clipId]!), gainDb: -6.04, fadeInMs: 500 },
          },
        ],
      }),
    );
    expect(upd.ok).toBe(true);
    if (!upd.ok) return;
    expect(upd.state.audioClips[clipId]!.gainDb).toBe(-6);
    const back = applyCommand(upd.state, envelope(upd.inverse));
    expect(back.ok && back.state.audioClips[clipId]).toEqual(
      s1.audioClips[clipId] && { ...s1.audioClips[clipId]!, revision: 3 },
    );
    const undo = applyCommand(s1, envelope(add.inverse));
    expect(undo.ok && undo.state.audioClips[clipId]).toBe(undefined);
    const rm = mustApply(s1, { type: "SetAudioClipsRemoved", clipIds: [clipId], removed: true });
    expect(rm.audioClips[clipId]!.removed).toBe(true);
  });

  it("avviser ugyldige verdier og lydfiler som ikke er lyd", () => {
    const seed = seedProject(2);
    const { s, assetId } = withSound(seed.state);
    const occ = scriptView(s, seed.mainId)[0]!.occurrenceId;
    const add = (f: AudioClipFields) => ({
      type: "AddAudioClips" as const,
      clips: [{ clipId: tid<"audio_clip">(), fields: f }],
    });
    expect(fails(s, add(fields(occ, assetId, { gainDb: 20 })))).toMatch(/Volumet/);
    expect(fails(s, add(fields(occ, assetId, { lengthMs: 0 })))).toMatch(/lengde/);
    expect(fails(s, add(fields(occ, assetId, { offsetMs: -5 })))).toMatch(/start/);
    expect(fails(s, add(fields(occ, assetId, { kind: "noise" as never })))).toMatch(/lydtype/);
    // En vanlig ressurs (karakter) er ikke en lydfil
    const charId = tid<"asset">();
    const s2 = mustApply(s, {
      type: "CreateAssets",
      assets: [
        {
          assetId: charId,
          fields: {
            kind: "character",
            name: "Maja",
            names: [],
            description: "",
            category: "",
            tags: [],
          },
        },
      ],
    });
    expect(fails(s2, add(fields(occ, charId)))).toMatch(/ikke en lydfil/);
    // Replikk fra en annen scene
    const other = scriptView(s, seed.mainId)[1]!;
    const block = other.blocks.find((b) => b.kind === "dialogue")!;
    expect(fails(s, add(fields(occ, assetId, { blockId: block.id })))).toMatch(/annen scene/);
  });

  it("lydfiler må ha lydformat, og en lydfil kan ikke vises som lag", () => {
    const seed = seedProject(1);
    const { s, assetId, variantId } = withSound(seed.state);
    expect(
      fails(s, {
        type: "AddAssetVersion",
        versionId: tid(),
        variantId: variantId as never,
        media: {
          path: `${s.project.id}/x/y.png`,
          mimeType: "image/png",
          width: 1,
          height: 1,
          byteSize: 1,
          sha256: "b".repeat(64),
        },
        note: "",
      }),
    ).toMatch(/Lyden må være/);
    const occ = scriptView(s, seed.mainId)[0]!;
    const compId = tid<"composition">();
    const s2 = mustApply(s, {
      type: "CreateComposition",
      compositionId: compId,
      variantId: s.occurrences[occ.occurrenceId]!.variantId,
      fields: DEFAULT_COMPOSITION,
    });
    expect(
      fails(s2, {
        type: "AddLayers",
        layers: [
          {
            layerId: tid(),
            compositionId: compId,
            fields: defaultLayerFields(s2, s2.compositions[compId]!, { assetId }),
          },
        ],
      }),
    ).toMatch(/lydfil kan ikke vises som lag/);
  });

  it("scenen kan ikke angres bort mens det ligger lyd på den", () => {
    const seed = seedProject(1);
    const { s: s0, assetId } = withSound(seed.state);
    const sceneId = tid<"scene">();
    const variantId = tid<"scene_variant">();
    const occId = tid<"scene_occurrence">();
    const create = applyCommand(
      s0,
      envelope({
        type: "CreateScene",
        productionId: seed.mainId as never,
        sceneId,
        variantId,
        occurrenceId: occId,
        orderKey: keyBetween(Object.values(s0.occurrences)[0]!.orderKey, null),
        heading: { intExt: "INT.", location: "LÅVEN", time: "NATT" },
        blocks: [],
        productionNumber: null,
      }),
    );
    expect(create.ok).toBe(true);
    if (!create.ok) return;
    const s1 = mustApply(create.state, {
      type: "AddAudioClips",
      clips: [{ clipId: tid(), fields: fields(occId, assetId) }],
    });
    expect(fails(s1, create.inverse)).toMatch(/lyd/);
  });
});

describe("lyd i filmen", () => {
  it("følger scenen når den flyttes, og en scene uten 2D-scene blir minst så lang som lyden", () => {
    const seed = seedProject(3);
    const { s: s0, assetId } = withSound(seed.state, 60_000);
    const view = scriptView(s0, seed.mainId);
    const last = view[2]!.occurrenceId;
    const s1 = mustApply(s0, {
      type: "AddAudioClips",
      clips: [
        { clipId: tid(), fields: fields(last, assetId, { offsetMs: 2000, lengthMs: 40_000 }) },
      ],
    });
    const clips = filmClips(s1, seed.mainId);
    const fps = s1.project.fps;
    // Tittelkortet varer minst til lyden slutter (2 s + 40 s)
    expect(clips[2]!.durationFrames).toBeGreaterThanOrEqual(secondsToFrames(42, fps));
    const items = filmAudio(s1, clips, fps);
    expect(items).toHaveLength(1);
    expect(items[0]!.start).toBeCloseTo(clips[2]!.startFrame / 25 + 2, 6);
    // Flytt scenen først: lyden flytter med
    const moved = mustApply(s1, {
      type: "MoveOccurrence",
      occurrenceId: last as never,
      orderKey: keyBetween(null, s1.occurrences[view[0]!.occurrenceId]!.orderKey),
    });
    const c2 = filmClips(moved, seed.mainId);
    expect(c2[0]!.occurrenceId).toBe(last);
    expect(filmAudio(moved, c2, fps)[0]!.start).toBeCloseTo(2, 6);
  });

  it("lyd i deaktiverte scener og fjernet lyd er ikke med", () => {
    const seed = seedProject(2);
    const { s: s0, assetId } = withSound(seed.state);
    const occ = scriptView(s0, seed.mainId)[0]!.occurrenceId;
    const id = tid<"audio_clip">();
    let s = mustApply(s0, {
      type: "AddAudioClips",
      clips: [{ clipId: id, fields: fields(occ, assetId) }],
    });
    const off = mustApply(s, {
      type: "SetOccurrenceActive",
      occurrenceId: occ as never,
      active: false,
    });
    expect(filmAudio(off, filmClips(off, seed.mainId), off.project.fps)).toHaveLength(0);
    s = mustApply(s, { type: "SetAudioClipsRemoved", clipIds: [id], removed: true });
    expect(filmAudio(s, filmClips(s, seed.mainId), s.project.fps)).toHaveLength(0);
  });

  it("lagres og leses tilbake identisk (radformat)", () => {
    const seed = seedProject(1);
    const { s: s0, assetId } = withSound(seed.state);
    const occ = scriptView(s0, seed.mainId)[0]!.occurrenceId;
    const id = tid<"audio_clip">();
    const s = mustApply(s0, {
      type: "AddAudioClips",
      clips: [
        { clipId: id, fields: fields(occ, assetId, { gainDb: -3.5, fadeOutMs: 250, muted: true }) },
      ],
    });
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
    // Endringssettet går til tabellen audio_clips
    expect(Object.keys(diffStates(s0, s).inserts)).toContain("audio_clips");
  });
});

describe("volumkurve", () => {
  it("toner inn og ut, og deler overlappende toninger forholdsmessig", async () => {
    const { envelopeAt } = await import("@/engine/audio/mixer");
    const it0 = {
      clip: {} as never,
      version: null,
      start: 10,
      length: 4,
      sourceIn: 0,
      gain: 0.5,
      fadeIn: 1,
      fadeOut: 2,
    };
    expect(envelopeAt(it0, 9)).toBe(0);
    expect(envelopeAt(it0, 10)).toBe(0);
    expect(envelopeAt(it0, 10.5)).toBeCloseTo(0.25);
    expect(envelopeAt(it0, 11.5)).toBeCloseTo(0.5);
    expect(envelopeAt(it0, 13)).toBeCloseTo(0.25);
    expect(envelopeAt(it0, 14)).toBeCloseTo(0);
    // 3 + 3 s toning i et klipp på 4 s: hver blir 2 s
    const it1 = { ...it0, fadeIn: 3, fadeOut: 3, gain: 1 };
    expect(envelopeAt(it1, 12)).toBeCloseTo(1);
    expect(envelopeAt(it1, 11)).toBeCloseTo(0.5);
  });
});
