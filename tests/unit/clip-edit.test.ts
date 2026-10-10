// @vitest-environment node
/** Montering del 4 (DEC-0048): deler av klipp (kutt, splitt), tidskoblinger, status for film, lang film. */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPOSITION,
  applyCommand,
  blockSpans,
  blocksOfVariant,
  cutsToRanges,
  editableParts,
  filmClips,
  filmTakeAudio,
  keyBetween,
  partAt,
  proposeCuts,
  removePart,
  scriptView,
  setPartSource,
  sourceAt,
  splitParts,
  stateFromRows,
  toRow,
  trimPart,
  type Command,
  type ProjectState,
  type TakeMedia,
} from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

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

function fails(s: ProjectState, c: Command) {
  const r = applyCommand(s, envelope(c));
  expect(r.ok).toBe(false);
  return r.ok ? "" : r.error.message;
}

function setup(sceneCount = 3) {
  const seed = seedProject(sceneCount);
  const view = scriptView(seed.state, seed.mainId);
  const occ = view[0]!.occurrenceId;
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
  s = mustApply(s, { type: "SetActiveTake", occurrenceId: occ as never, takeId });
  return { ...seed, s, occ, takeId, view };
}

const ids = (): string => tid();

describe("klipping", () => {
  it("splitter et filmklipp på avspillingshodet; begge deler bruker samme fil", () => {
    const { s, mainId, occ, takeId } = setup();
    const clip = filmClips(s, mainId)[0]!;
    expect(clip.parts).toHaveLength(1);
    const parts = splitParts(clip, 50, s.project.fps, ids)!;
    expect(parts.map((p) => [p.inMs, p.outMs])).toEqual([
      [0, 2000],
      [2000, 8000],
    ]);
    const s2 = mustApply(s, {
      type: "SetSceneEdit",
      occurrenceId: occ as never,
      activeTakeId: takeId,
      parts,
    });
    const c2 = filmClips(s2, mainId)[0]!;
    expect(c2.edited).toBe(true);
    expect(c2.parts.map((p) => p.startFrame)).toEqual([0, 50]);
    expect(c2.durationFrames).toBe(200);
    expect(c2.parts.every((p) => p.take?.mediaRef === s.takes[takeId]!.mediaRef)).toBe(true);
    // Kildetiden følger delen
    const src = sourceAt(c2, 60, s.project.fps);
    expect(src.kind === "take" && src.seconds).toBeCloseTo(2.4, 6);
    expect(partAt(c2, 49).part.id).toBe(c2.parts[0]!.id);
  });

  it("kutt og fjerning endrer lengden; angre gir delene tilbake", () => {
    const { s, mainId, occ, takeId } = setup();
    const clip = filmClips(s, mainId)[0]!;
    const split = splitParts(clip, 100, s.project.fps, ids)!;
    let st = mustApply(s, {
      type: "SetSceneEdit",
      occurrenceId: occ as never,
      activeTakeId: takeId,
      parts: split,
    });
    // Fjern midten av filmen: kutt slutten av del 1 og starten av del 2
    const trimmed = trimPart(trimPart(split, 0, { outMs: 3000 }, 8000), 1, { inMs: 5000 }, 8000);
    const r = applyCommand(
      st,
      envelope({
        type: "SetSceneEdit",
        occurrenceId: occ as never,
        activeTakeId: takeId,
        parts: trimmed,
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    st = r.state;
    expect(filmClips(st, mainId)[0]!.durationFrames).toBe(75 + 75);
    const removed = removePart(trimmed, 0)!;
    st = mustApply(st, {
      type: "SetSceneEdit",
      occurrenceId: occ as never,
      activeTakeId: takeId,
      parts: removed,
    });
    expect(filmClips(st, mainId)[0]!.durationFrames).toBe(75);
    expect(Object.values(st.clipParts).filter((p) => p.removed)).toHaveLength(1);
    // Angre den forrige endringen gir to deler igjen
    const back = mustApply(r.state, r.inverse!);
    expect(filmClips(back, mainId)[0]!.durationFrames).toBe(200);
    // «Hele klippet» (tom liste) fjerner alle delene, filmen beholdes
    const whole = mustApply(st, {
      type: "SetSceneEdit",
      occurrenceId: occ as never,
      activeTakeId: takeId,
      parts: [],
    });
    const c = filmClips(whole, mainId)[0]!;
    expect(c.edited).toBe(false);
    expect(c.source).toBe("film");
    expect(c.durationFrames).toBe(200);
  });

  it("delene kontrolleres mot kilden", () => {
    const { s, occ, takeId, view } = setup();
    const other = view[1]!.occurrenceId;
    expect(
      fails(s, {
        type: "SetSceneEdit",
        occurrenceId: occ as never,
        activeTakeId: takeId,
        parts: [{ partId: ids() as never, source: "take", takeId, inMs: 0, outMs: 9000 }],
      }),
    ).toMatch(/etter slutten av filmen/);
    expect(
      fails(s, {
        type: "SetSceneEdit",
        occurrenceId: other as never,
        activeTakeId: null,
        parts: [{ partId: ids() as never, source: "take", takeId, inMs: 0, outMs: 1000 }],
      }),
    ).toMatch(/annen scene/);
    expect(
      fails(s, {
        type: "SetSceneEdit",
        occurrenceId: other as never,
        activeTakeId: null,
        parts: [
          { partId: ids() as never, source: "composition", takeId: null, inMs: 0, outMs: 1000 },
        ],
      }),
    ).toMatch(/ingen 2D-scene/);
    expect(
      fails(s, {
        type: "SetSceneEdit",
        occurrenceId: occ as never,
        activeTakeId: takeId,
        parts: [{ partId: ids() as never, source: "take", takeId, inMs: 500, outMs: 500 }],
      }),
    ).toMatch(/ut må være etter inn/);
  });

  it("film og animatic kan settes sammen (animatic-rest), og lyden følger filmdelen", () => {
    const { s: s0, mainId, occ, takeId } = setup();
    const variant = s0.occurrences[occ]!.variantId;
    const s = mustApply(s0, {
      type: "CreateComposition",
      compositionId: tid(),
      variantId: variant,
      fields: { ...DEFAULT_COMPOSITION, width: 1920, height: 1080, durationFrames: 250 },
    });
    const parts = [
      { partId: ids() as never, source: "take" as const, takeId, inMs: 1000, outMs: 3000 },
      {
        partId: ids() as never,
        source: "composition" as const,
        takeId: null,
        inMs: 4000,
        outMs: 6000,
      },
    ];
    const st = mustApply(s, {
      type: "SetSceneEdit",
      occurrenceId: occ as never,
      activeTakeId: takeId,
      parts,
    });
    const c = filmClips(st, mainId)[0]!;
    expect(c.parts.map((p) => p.source)).toEqual(["take", "composition"]);
    expect(sourceAt(c, 60, st.project.fps)).toEqual({ kind: "composition", frame: 100 + 10 });
    const audio = filmTakeAudio(filmClips(st, mainId), st.project.fps);
    expect(audio).toHaveLength(1);
    expect(audio[0]!.sourceIn).toBeCloseTo(1, 6);
    expect(audio[0]!.length).toBeCloseTo(2, 6);
    // Bytt kilde for del 2 til filmen
    const swapped = setPartSource(parts, 1, { takeId }, 8000);
    expect(swapped[1]).toMatchObject({ source: "take", takeId, inMs: 4000, outMs: 6000 });
  });

  it("deler lagres og leses tilbake identisk", () => {
    const { s, occ, takeId, mainId } = setup();
    const parts = editableParts(filmClips(s, mainId)[0]!, ids)!;
    const st = mustApply(s, {
      type: "SetSceneEdit",
      occurrenceId: occ as never,
      activeTakeId: takeId,
      parts,
    });
    const p = Object.values(st.clipParts)[0]!;
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
      clip_parts: [toRow("clipParts", p, s.project.id)],
    });
    expect(back.clipParts[p.id]).toEqual(p);
  });
});

describe("tidskoblinger", () => {
  it("styrer når replikken skjer, følger scenen når den flyttes, og flagges når klippet er kuttet bort", () => {
    const { s: s0, mainId, view } = setup(3);
    const occ = view[1]!.occurrenceId;
    const variant = s0.occurrences[occ]!.variantId;
    const dialog = blocksOfVariant(s0, variant).find((b) => b.kind === "dialogue")!;
    const linkId = tid<"time_link">();
    let s = mustApply(s0, {
      type: "AddTimeLinks",
      links: [
        {
          linkId,
          fields: { occurrenceId: occ as never, blockId: dialog.id, startMs: 3000, endMs: 4000 },
        },
      ],
    });
    const clip = filmClips(s, mainId)[1]!;
    const sp = blockSpans(s, clip).find((x) => x.blockId === dialog.id)!;
    expect(sp.kind).toBe("time");
    expect(sp.startFrame).toBe(clip.startFrame + 75);
    expect(sp.endFrame).toBe(clip.startFrame + 100);
    // Karakternavnet følger replikken
    const charSpan = blockSpans(s, clip).find((x) => x.blockId !== dialog.id && x.kind === "time");
    expect(charSpan?.startFrame).toBe(sp.startFrame);
    // Flytt scenen først: lokal tid er uendret (REQ-0107)
    const moved = mustApply(s, {
      type: "MoveOccurrence",
      occurrenceId: occ as never,
      orderKey: keyBetween(null, s.occurrences[view[0]!.occurrenceId]!.orderKey),
    });
    const c2 = filmClips(moved, mainId).find((c) => c.occurrenceId === occ)!;
    expect(c2.startFrame).toBe(0);
    expect(blockSpans(moved, c2).find((x) => x.blockId === dialog.id)!.startFrame).toBe(75);
    // En kobling etter slutten av klippet er ikke dekket (REQ-0231)
    s = mustApply(s, {
      type: "UpdateTimeLinks",
      links: [
        {
          linkId,
          fields: { occurrenceId: occ as never, blockId: dialog.id, startMs: 999_000, endMs: null },
        },
      ],
    });
    expect(
      blockSpans(s, filmClips(s, mainId)[1]!).find((x) => x.blockId === dialog.id)!.uncovered,
    ).toBe(true);
    const r = applyCommand(
      s,
      envelope({ type: "SetTimeLinksRemoved", linkIds: [linkId], removed: true }),
    );
    expect(r.ok && r.state.timeLinks[linkId]!.removed).toBe(true);
    expect(r.ok && r.inverse).toEqual({
      type: "SetTimeLinksRemoved",
      linkIds: [linkId],
      removed: false,
    });
  });

  it("blokken må høre til scenen, og tidene må være gyldige", () => {
    const { s, view } = setup(2);
    const a = view[0]!.occurrenceId;
    const otherBlock = blocksOfVariant(s, s.occurrences[view[1]!.occurrenceId]!.variantId)[0]!;
    expect(
      fails(s, {
        type: "AddTimeLinks",
        links: [
          {
            linkId: tid(),
            fields: { occurrenceId: a as never, blockId: otherBlock.id, startMs: 0, endMs: null },
          },
        ],
      }),
    ).toMatch(/hører ikke til scenen/);
    const own = blocksOfVariant(s, s.occurrences[a]!.variantId)[0]!;
    expect(
      fails(s, {
        type: "AddTimeLinks",
        links: [
          {
            linkId: tid(),
            fields: { occurrenceId: a as never, blockId: own.id, startMs: 2000, endMs: 1000 },
          },
        ],
      }),
    ).toMatch(/etter starten/);
  });
});

describe("status og lang film", () => {
  it("status for importert film kan endres og angres", () => {
    const { s, takeId } = setup(1);
    const r = applyCommand(s, envelope({ type: "SetTakeStatus", takeId, status: "reference" }));
    expect(r.ok && r.state.takes[takeId]!.status).toBe("reference");
    expect(r.ok && r.inverse).toEqual({ type: "SetTakeStatus", takeId, status: "approved" });
  });

  it("foreslår delinger etter scenenes lengde og kontrollerer starttidene", () => {
    expect(proposeCuts([100, 300, 100], 10_000)).toEqual([0, 2000, 8000]);
    expect(cutsToRanges([0, 2000, 8000], 10_000)).toEqual([
      { inMs: 0, outMs: 2000 },
      { inMs: 2000, outMs: 8000 },
      { inMs: 8000, outMs: 10_000 },
    ]);
    expect(cutsToRanges([0, 5000, 4000], 10_000)).toBeNull();
    expect(cutsToRanges([0, 9990], 10_000)).toBeNull();
  });
});

describe("rettelser etter gjennomgang (DEC-0048)", () => {
  it("utpunktet for en urørt film går aldri forbi filmens lengde", () => {
    const seed = seedProject(1);
    const occ = scriptView(seed.state, seed.mainId)[0]!.occurrenceId;
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
      media: { ...MEDIA, durationMs: 7990 },
    });
    s = mustApply(s, { type: "SetActiveTake", occurrenceId: occ as never, takeId });
    const parts = editableParts(filmClips(s, seed.mainId)[0]!, ids)!;
    expect(parts[0]!.outMs).toBe(7990);
    // Delene kan lagres uten at kontrollen mot filmens lengde slår til
    expect(
      applyCommand(
        s,
        envelope({ type: "SetSceneEdit", occurrenceId: occ as never, activeTakeId: takeId, parts }),
      ).ok,
    ).toBe(true);
  });

  it("revisjonen økes alltid, også når delene er uendret", () => {
    const { s, occ, takeId, mainId } = setup(1);
    const parts = editableParts(filmClips(s, mainId)[0]!, ids)!;
    const a = mustApply(s, {
      type: "SetSceneEdit",
      occurrenceId: occ as never,
      activeTakeId: takeId,
      parts,
    });
    const b = mustApply(a, {
      type: "SetSceneEdit",
      occurrenceId: occ as never,
      activeTakeId: takeId,
      parts,
    });
    expect(b.occurrences[occ]!.revision).toBe(a.occurrences[occ]!.revision + 1);
  });

  it("uendrede deler kontrolleres ikke på nytt når 2D-scenen er blitt kortere", () => {
    const { s: s0, occ, takeId } = setup(1);
    const compositionId = tid<"composition">();
    const fields = { ...DEFAULT_COMPOSITION, width: 1920, height: 1080, durationFrames: 250 };
    let s = mustApply(s0, {
      type: "CreateComposition",
      compositionId,
      variantId: s0.occurrences[occ]!.variantId,
      fields,
    });
    const film = { partId: ids() as never, source: "take" as const, takeId, inMs: 0, outMs: 2000 };
    const anim = {
      partId: ids() as never,
      source: "composition" as const,
      takeId: null,
      inMs: 5000,
      outMs: 9000,
    };
    s = mustApply(s, {
      type: "SetSceneEdit",
      occurrenceId: occ as never,
      activeTakeId: takeId,
      parts: [film, anim],
    });
    // 2D-scenen blir 4 s: animatic-delen går nå forbi slutten
    s = mustApply(s, {
      type: "UpdateComposition",
      compositionId,
      fields: { ...fields, durationFrames: 100 },
    });
    // Å kutte filmdelen skal fortsatt gå
    const r = applyCommand(
      s,
      envelope({
        type: "SetSceneEdit",
        occurrenceId: occ as never,
        activeTakeId: takeId,
        parts: [{ ...film, outMs: 1500 }, anim],
      }),
    );
    expect(r.ok).toBe(true);
    // Men å endre animatic-delen kontrolleres
    expect(
      fails(s, {
        type: "SetSceneEdit",
        occurrenceId: occ as never,
        activeTakeId: takeId,
        parts: [film, { ...anim, inMs: 4000 }],
      }),
    ).toMatch(/etter slutten av 2D-scenen/);
  });

  it("angre av en ny manusblokk stoppes når blokken har en tidskobling", () => {
    const { s: s0, mainId, view } = setup(1);
    const occ = view[0]!.occurrenceId;
    const ins = applyCommand(
      s0,
      envelope({
        type: "InsertBlock",
        productionId: mainId as never,
        variantId: s0.occurrences[occ]!.variantId,
        block: { blockId: tid(), kind: "action", text: "Ny linje.", orderKey: "z" },
      }),
    );
    if (!ins.ok) throw new Error(ins.error.message);
    const blockId = Object.keys(ins.state.blocks).find((k) => !s0.blocks[k])!;
    const s = mustApply(ins.state, {
      type: "AddTimeLinks",
      links: [
        {
          linkId: tid(),
          fields: {
            occurrenceId: occ as never,
            blockId: blockId as never,
            startMs: 0,
            endMs: null,
          },
        },
      ],
    });
    const r = applyCommand(s, envelope(ins.inverse!));
    expect(r.ok ? null : r.error.code).toBe("referenced");
  });
});
