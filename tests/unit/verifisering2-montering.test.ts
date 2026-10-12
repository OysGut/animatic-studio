// @vitest-environment node
/**
 * Verifisering av krav (DEC-0074): toveis navigasjon for alle materialtyper (REQ-0099), dialoglyd koblet
 * til replikker (REQ-0206), kamerabevegelsene ved avspilling (REQ-0192) og at en ny AI-versjon kommer ved
 * siden av den gamle, som kan tas i bruk igjen (REQ-0310) – prøvd mot domenekjernen.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPOSITION,
  applyMatrix,
  assembleSegments,
  blockAtFrame,
  blockSpans,
  cameraAt,
  chooseAttemptCommands,
  clipAtFrame,
  defaultLayerFields,
  filmAudio,
  filmClips,
  framesToSeconds,
  keysEvenly,
  latestVideoFor,
  orderedOccurrences,
  renderFrame,
  scriptView,
  type AudioClipFields,
  type CameraShot,
  type FilmClip,
  type ProjectState,
  type TakeMedia,
} from "@/core";
import { mustApply, seedProject, tid } from "../helpers/fixtures";

const FILM: TakeMedia = {
  fileName: "film.mp4",
  mimeType: "video/mp4",
  byteSize: 1000,
  width: 1920,
  height: 1080,
  fps: 25,
  durationMs: 8000,
  videoCodec: "avc",
  hasAudio: false,
};

function addTake(
  s: ProjectState,
  occurrenceId: string,
  kind: "imported_film" | "ai_video",
  opts: { segmentId?: string | null; activate?: boolean; status?: "approved" | "in_progress" } = {},
) {
  const takeId = tid<"take">();
  let st = mustApply(s, {
    type: "AddTake",
    takeId,
    occurrenceId: occurrenceId as never,
    segmentId: (opts.segmentId ?? null) as never,
    kind,
    status: opts.status ?? "approved",
    durationFrames: 200,
    mediaRef: `${s.project.id}/films/${takeId}/${kind}.mp4`,
    media: { ...FILM, fileName: `${kind}.mp4` },
  });
  if (opts.activate !== false)
    st = mustApply(st, { type: "SetActiveTake", occurrenceId: occurrenceId as never, takeId });
  return { s: st, takeId };
}

function addComposition(s: ProjectState, occurrenceId: string, durationFrames = 250) {
  const compositionId = tid<"composition">();
  const st = mustApply(s, {
    type: "CreateComposition",
    compositionId,
    variantId: s.occurrences[occurrenceId as never]!.variantId,
    fields: { ...DEFAULT_COMPOSITION, width: 1920, height: 1080, durationFrames },
  });
  return { s: st, compositionId };
}

/** Ett prosjekt med de fem materialtypene i mandat 8.4 (REQ-0099), én scene hver. */
function fiveMaterials() {
  const seed = seedProject(5);
  const occ = orderedOccurrences(seed.state, seed.mainId).map((o) => o.id as string);
  let s = seed.state;
  // 1. Planlagt animatic: ingen 2D-scene eller film, bare planlagt lengde (6 s)
  s = mustApply(s, { type: "SetPlannedDuration", occurrenceId: occ[1] as never, plannedMs: 6000 });
  // 2. Redigerbar 2D-scene
  s = addComposition(s, occ[0]!).s;
  // 3. AI-generert video
  s = addTake(s, occ[2]!, "ai_video").s;
  // 4. Importert ferdig film
  s = addTake(s, occ[3]!, "imported_film").s;
  // 5. Sammensatt scene: filmklipp + 2D-scene i samme klipp
  s = addComposition(s, occ[4]!).s;
  const film = addTake(s, occ[4]!, "imported_film");
  s = mustApply(film.s, {
    type: "SetSceneEdit",
    occurrenceId: occ[4] as never,
    activeTakeId: film.takeId,
    parts: [
      { partId: tid() as never, source: "take", takeId: film.takeId, inMs: 1000, outMs: 4000 },
      { partId: tid() as never, source: "composition", takeId: null, inMs: 0, outMs: 3000 },
    ],
  });
  return { s, mainId: seed.mainId, occ };
}

describe("REQ-0099 – toveis navigasjon for alle materialtyper", () => {
  const { s, mainId, occ } = fiveMaterials();
  const clips = filmClips(s, mainId);
  const byOcc = new Map(clips.map((c) => [c.occurrenceId as string, c]));
  const cases: [string, FilmClip][] = [
    ["planlagt animatic", byOcc.get(occ[1]!)!],
    ["redigerbar 2D-scene", byOcc.get(occ[0]!)!],
    ["AI-generert video", byOcc.get(occ[2]!)!],
    ["importert ferdig film", byOcc.get(occ[3]!)!],
    ["sammensatt scene med flere klipp", byOcc.get(occ[4]!)!],
  ];

  it("REQ-0099: fixturen har de fem materialtypene", () => {
    const [planned, comp, ai, imported, mixed] = cases.map((c) => c[1]);
    expect(planned!.source).toBe("placeholder");
    expect(planned!.durationKind).toBe("planned");
    expect(planned!.durationFrames).toBe(150);
    expect(comp!.source).toBe("composition");
    expect(ai!.source).toBe("film");
    expect(ai!.take?.kind).toBe("ai_video");
    expect(imported!.source).toBe("film");
    expect(imported!.take?.kind).toBe("imported_film");
    expect(mixed!.edited).toBe(true);
    expect(mixed!.parts.map((p) => p.source)).toEqual(["take", "composition"]);
  });

  it.each(cases)(
    "REQ-0099: %s – klikk på en replikk eller handling flytter avspillingen dit, og samme blokk markeres",
    (_name, clip) => {
      const spans = blockSpans(s, clip);
      const blocks = scriptView(s, mainId).find((v) => v.occurrenceId === clip.occurrenceId)!;
      const clickable = blocks.blocks.filter((b) => b.kind === "action" || b.kind === "dialogue");
      expect(clickable.length).toBeGreaterThan(0);
      for (const b of clickable) {
        const span = spans.find((x) => x.blockId === b.id)!;
        expect(span).toBeDefined();
        // Klikk-til-tid: avspillingshodet settes på blokkens start (ClipPanel: onSeek(span.startFrame))
        const frame = span.startFrame;
        expect(frame).toBeGreaterThanOrEqual(clip.startFrame);
        expect(frame).toBeLessThan(clip.startFrame + clip.durationFrames);
        // Tid-til-markering: på det bildet vises denne scenen, og blokken markeres
        const at = clipAtFrame(clips, frame)!;
        expect(at.clip.occurrenceId).toBe(clip.occurrenceId);
        expect(blockAtFrame(blockSpans(s, at.clip), frame)?.blockId).toBe(b.id);
      }
    },
  );

  it.each(cases)(
    "REQ-0099: %s – gjennom hele klippet markeres blokkene i manusrekkefølge, aldri en blokk fra en annen scene",
    (_name, clip) => {
      const spans = blockSpans(s, clip);
      const order = new Map(spans.map((sp, i) => [sp.blockId, i]));
      let last = -1;
      let hits = 0;
      for (let f = clip.startFrame; f < clip.startFrame + clip.durationFrames; f++) {
        const at = clipAtFrame(clips, f)!;
        expect(at.clip.occurrenceId).toBe(clip.occurrenceId);
        const hit = blockAtFrame(blockSpans(s, at.clip), f);
        if (!hit) continue;
        hits++;
        const i = order.get(hit.blockId)!;
        expect(i).toBeGreaterThanOrEqual(last);
        last = i;
      }
      expect(hits).toBeGreaterThan(clip.durationFrames / 2);
    },
  );
});

// ---------------------------------------------------------------- REQ-0206

function withSound(s: ProjectState) {
  const assetId = tid<"asset">();
  const variantId = tid<"asset_variant">();
  const versionId = tid<"asset_version">();
  s = mustApply(s, {
    type: "CreateAssets",
    assets: [
      {
        assetId,
        fields: {
          kind: "sound",
          name: "Opptak",
          names: [],
          description: "",
          category: "",
          tags: [],
        },
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
      path: `${s.project.id}/${assetId}/${versionId}/replikk.wav`,
      mimeType: "audio/wav",
      width: null,
      height: null,
      byteSize: 1000,
      sha256: "a".repeat(64),
      durationMs: 1500,
    },
    note: "",
  });
  return { s, assetId };
}

function dialogueClip(
  occurrenceId: string,
  assetId: string,
  blockId: string | null,
  offsetMs: number,
): AudioClipFields {
  return {
    occurrenceId: occurrenceId as never,
    kind: "dialogue",
    name: "Replikk",
    assetId: assetId as never,
    assetVariantId: null,
    versionId: null,
    blockId: blockId as never,
    offsetMs,
    sourceInMs: 0,
    lengthMs: 1500,
    gainDb: 0,
    fadeInMs: 0,
    fadeOutMs: 0,
    muted: false,
    continues: false,
    volumeKeys: [],
  };
}

describe("REQ-0206 – dialogopptak koblet til replikken", () => {
  function setup() {
    const seed = seedProject(2);
    const view = scriptView(seed.state, seed.mainId);
    const occ = view[1]!.occurrenceId;
    const dialogue = view[1]!.blocks.find((b) => b.kind === "dialogue")!;
    const sound = withSound(addComposition(seed.state, occ, 250).s);
    const assetId = sound.assetId;
    const clipId = tid<"audio_clip">();
    const s = mustApply(sound.s, {
      type: "AddAudioClips",
      clips: [{ clipId, fields: dialogueClip(occ, assetId, dialogue.id, 6000) }],
    });
    return { s, mainId: seed.mainId, occ, dialogue, clipId, assetId };
  }

  it("REQ-0206: klikk på replikken finner opptaket – avspillingen settes der opptaket ligger, og opptaket spilles der", () => {
    const { s, mainId, occ, dialogue, clipId } = setup();
    const clips = filmClips(s, mainId);
    const clip = clips.find((c) => c.occurrenceId === occ)!;
    const span = blockSpans(s, clip).find((x) => x.blockId === dialogue.id)!;
    expect(span.kind).toBe("linked");
    // 6 s inn i scenen à 25 bilder/s, og like lenge som opptaket (1,5 s)
    expect(span.startFrame).toBe(clip.startFrame + 150);
    expect(span.endFrame - span.startFrame).toBe(38);
    // Det som spilles på det bildet er nettopp dette opptaket
    const t = framesToSeconds(span.startFrame, s.project.fps);
    const playing = filmAudio(s, clips, s.project.fps).filter(
      (a) => a.start <= t + 1e-9 && t < a.start + a.length,
    );
    expect(playing.map((a) => a.clip.id)).toEqual([clipId]);
    expect(playing[0]!.clip.blockId).toBe(dialogue.id);
    // Og på det bildet markeres replikken
    expect(blockAtFrame(blockSpans(s, clip), span.startFrame)?.blockId).toBe(dialogue.id);
  });

  it("REQ-0206: flyttes opptaket på tidslinjen, følger replikken med; uten kobling er tiden bare et anslag", () => {
    const { s, mainId, occ, dialogue, clipId, assetId } = setup();
    const moved = mustApply(s, {
      type: "UpdateAudioClips",
      clips: [{ clipId, fields: dialogueClip(occ, assetId, dialogue.id, 2000) }],
    });
    const clip = filmClips(moved, mainId).find((c) => c.occurrenceId === occ)!;
    const span = blockSpans(moved, clip).find((x) => x.blockId === dialogue.id)!;
    expect(span.kind).toBe("linked");
    expect(span.startFrame).toBe(clip.startFrame + 50);
    // Karakternavnet over replikken følger opptaket
    const view = scriptView(moved, mainId).find((v) => v.occurrenceId === occ)!;
    const character = view.blocks.find((b) => b.kind === "character")!;
    expect(blockSpans(moved, clip).find((x) => x.blockId === character.id)!.startFrame).toBe(
      span.startFrame,
    );
    // Kontrollprøve: samme opptak uten replikk-kobling styrer ikke replikkens tid
    const unlinked = mustApply(s, {
      type: "UpdateAudioClips",
      clips: [{ clipId, fields: dialogueClip(occ, assetId, null, 2000) }],
    });
    const c2 = filmClips(unlinked, mainId).find((c) => c.occurrenceId === occ)!;
    expect(blockSpans(unlinked, c2).find((x) => x.blockId === dialogue.id)!.kind).toBe("estimate");
  });
});

// ---------------------------------------------------------------- REQ-0192

const W = 1000;
const H = 600;

function shot(
  from: CameraShot["from"],
  to: CameraShot["to"],
  curve: CameraShot["curve"] = null,
): CameraShot {
  return {
    id: "s1",
    name: "Bevegelse",
    startFrame: 0,
    endFrame: 50,
    from,
    to,
    curve,
    easing: "linear",
  };
}

/** En 2D-scene med ett lag (parallakse 1) med midten i (px, py), og kameraet satt med kommando. */
function sceneWith(camera: CameraShot, px = 500, py = 300) {
  const seed = seedProject(1);
  let s = mustApply(seed.state, {
    type: "SetProjectFormat",
    width: W,
    height: H,
    fps: { num: 25, den: 1 },
  });
  const o = orderedOccurrences(s, seed.mainId)[0]!;
  const compositionId = tid<"composition">();
  const fields = { name: "Kamera", width: W, height: H, durationFrames: 50, background: "#000000" };
  s = mustApply(s, { type: "CreateComposition", compositionId, variantId: o.variantId, fields });
  s = mustApply(s, {
    type: "UpdateComposition",
    compositionId,
    fields,
    camera: { shots: [camera] },
  });
  const base = defaultLayerFields(s, s.compositions[compositionId]!, { fill: "#ffffff" });
  const layerId = tid<"composition_layer">();
  s = mustApply(s, {
    type: "AddLayers",
    layers: [
      {
        layerId,
        compositionId,
        fields: {
          ...base,
          width: 20,
          height: 20,
          parallax: 1,
          transform: { ...base.transform, x: px, y: py },
        },
      },
    ],
  });
  return { s, compositionId, layerId };
}

/** Hvor lagets midtpunkt vises i bildet (avspilling/eksport bruker kameravisningen). */
function onScreen(s: ProjectState, compositionId: string, layerId: string, frame: number) {
  const it = renderFrame(s, compositionId, frame, { view: "camera" }).items.find(
    (x) => x.layerId === layerId,
  )!;
  return applyMatrix(it.matrix, 0, 0);
}

function close(p: { x: number; y: number }, x: number, y: number) {
  expect(p.x).toBeCloseTo(x, 6);
  expect(p.y).toBeCloseTo(y, 6);
}

describe("REQ-0192 – kamerabevegelsene gir forventet bilde ved avspilling", () => {
  it("REQ-0192: panorering – kameraet glir sidelengs, og motivet flytter seg motsatt vei i bildet", () => {
    const { s, compositionId, layerId } = sceneWith(
      shot({ x: 500, y: 300, zoom: 1, rotation: 0 }, { x: 700, y: 300, zoom: 1, rotation: 0 }),
    );
    close(onScreen(s, compositionId, layerId, 0), 500, 300);
    close(onScreen(s, compositionId, layerId, 25), 400, 300);
    close(onScreen(s, compositionId, layerId, 50), 300, 300);
  });

  it("REQ-0192: tilt – kameraet vipper opp, og motivet glir ned i bildet", () => {
    const { s, compositionId, layerId } = sceneWith(
      shot({ x: 500, y: 300, zoom: 1, rotation: 0 }, { x: 500, y: 100, zoom: 1, rotation: 0 }),
    );
    close(onScreen(s, compositionId, layerId, 0), 500, 300);
    close(onScreen(s, compositionId, layerId, 25), 500, 400);
    close(onScreen(s, compositionId, layerId, 50), 500, 500);
  });

  it("REQ-0192: zoom – motivet forstørres jevnt rundt bildets midte", () => {
    const { s, compositionId, layerId } = sceneWith(
      shot({ x: 500, y: 300, zoom: 1, rotation: 0 }, { x: 500, y: 300, zoom: 4, rotation: 0 }),
      550,
      300,
    );
    const scaleAt = (f: number) => {
      const it = renderFrame(s, compositionId, f, { view: "camera" }).items[0]!;
      return Math.hypot(it.matrix[0], it.matrix[1]);
    };
    expect(scaleAt(0)).toBeCloseTo(1, 6);
    expect(scaleAt(25)).toBeCloseTo(2, 6); // geometrisk: halvveis mellom 1× og 4× er 2×
    expect(scaleAt(50)).toBeCloseTo(4, 6);
    close(onScreen(s, compositionId, layerId, 50), 500 + 50 * 4, 300);
  });

  it("REQ-0192: rotasjon – kameraet roterer, og motivet dreier rundt bildets midte", () => {
    const { s, compositionId, layerId } = sceneWith(
      shot({ x: 500, y: 300, zoom: 1, rotation: 0 }, { x: 500, y: 300, zoom: 1, rotation: 90 }),
      600,
      300,
    );
    close(onScreen(s, compositionId, layerId, 0), 600, 300);
    // Kameraet dreier med klokka (90°): det som lå til høyre for midten, ligger nå over den
    close(onScreen(s, compositionId, layerId, 50), 500, 200);
    const mid = onScreen(s, compositionId, layerId, 25);
    expect(Math.hypot(mid.x - 500, mid.y - 300)).toBeCloseTo(100, 6);
    expect((Math.atan2(mid.y - 300, mid.x - 500) * 180) / Math.PI).toBeCloseTo(-45, 6);
  });

  it("REQ-0192: posisjonsbevegelse – kameraet følger en kurvet bane i begge retninger", () => {
    const curve = { c1x: 500, c1y: 0, c2x: 900, c2y: 0 };
    const { s, compositionId, layerId } = sceneWith(
      shot(
        { x: 500, y: 300, zoom: 1, rotation: 0 },
        { x: 900, y: 300, zoom: 1, rotation: 0 },
        curve,
      ),
    );
    const c = s.compositions[compositionId]!;
    // Bézier halvveis: x = (500 + 3·500 + 3·900 + 900) / 8 = 700, y = (300 + 0 + 0 + 300) / 8 = 75
    const cam = cameraAt(c, 25);
    expect(cam.x).toBeCloseTo(700, 6);
    expect(cam.y).toBeCloseTo(75, 6);
    // Motivet (i 500, 300) vises forskjøvet like mye motsatt vei
    close(onScreen(s, compositionId, layerId, 25), 500 - 200, 300 + 225);
    close(onScreen(s, compositionId, layerId, 50), 100, 300);
  });

  it("REQ-0192: bevegelsene kan kombineres i ett utsnitt og holdes etter at utsnittet er slutt", () => {
    const { s, compositionId, layerId } = sceneWith({
      ...shot({ x: 500, y: 300, zoom: 1, rotation: 0 }, { x: 600, y: 200, zoom: 2, rotation: 30 }),
      endFrame: 40,
    });
    const end = onScreen(s, compositionId, layerId, 40);
    close(onScreen(s, compositionId, layerId, 49), end.x, end.y);
    // Motivet i (500, 300) sett fra kameraet i (600, 200) med zoom 2 og 30° rotasjon
    const r = (-30 * Math.PI) / 180;
    const dx = (500 - 600) * 2;
    const dy = (300 - 200) * 2;
    close(
      end,
      500 + Math.cos(r) * dx - Math.sin(r) * dy,
      300 + Math.sin(r) * dx + Math.cos(r) * dy,
    );
  });
});

// ---------------------------------------------------------------- REQ-0310

describe("REQ-0310 – ny AI-versjon ved siden av den gamle", () => {
  /** «Sett sammen scenen av AI-videoene» slik SceneVideoSection gjør det. */
  function assemble(s: ProjectState, occ: string, segmentId: string) {
    const r = assembleSegments(s, occ, [{ segmentId, startMs: 0, endMs: 8000 }], () => tid(), {
      fill: false,
    })!;
    expect(r).not.toBeNull();
    return mustApply(s, {
      type: "SetSceneEdit",
      occurrenceId: occ as never,
      activeTakeId: null,
      parts: r.parts,
    });
  }

  it("REQ-0310: en ny video fra «Oppdater med AI» kommer ved siden av den gamle; den gamle kan tas i bruk igjen", () => {
    const seed = seedProject(2);
    const occ = orderedOccurrences(seed.state, seed.mainId)[1]!.id as string;
    let s = addComposition(seed.state, occ, 200).s;
    const segmentId = tid<"production_segment">();
    s = mustApply(s, {
      type: "ReplaceSegments",
      occurrenceId: occ,
      reason: "model_limit",
      removeSegmentIds: [],
      segments: [
        {
          segmentId,
          orderKey: keysEvenly(1)[0]!,
          startBlockId: null,
          endBlockId: null,
          startMs: 0,
          endMs: 8000,
        },
      ],
    } as never);
    // Første video: valgt og satt sammen til scenen
    const v1 = addTake(s, occ, "ai_video", { segmentId, activate: false, status: "in_progress" });
    s = v1.s;
    for (const c of chooseAttemptCommands(s, v1.takeId)) s = mustApply(s, c as never);
    s = assemble(s, occ, segmentId);
    const usedTakes = (st: ProjectState) =>
      filmClips(st, seed.mainId)
        .find((c) => c.occurrenceId === occ)!
        .parts.map((p) => p.take?.id ?? null)
        .filter((x) => x !== null);
    expect(usedTakes(s)).toEqual([v1.takeId]);
    const before = s;

    // Oppdateringen: den nye videoen legges inn slik AI-jobbene gjør (claimVideo: AddTake, «in_progress»)
    const v2 = addTake(s, occ, "ai_video", { segmentId, activate: false, status: "in_progress" });
    s = v2.s;
    // Begge finnes; den gamle er urørt, og filmen er ikke byttet ut av seg selv
    expect(s.takes[v1.takeId]).toEqual(before.takes[v1.takeId]);
    expect(s.takes[v2.takeId]).toBeDefined();
    expect(usedTakes(s)).toEqual([v1.takeId]);

    // Brukeren velger den nye og setter sammen scenen
    for (const c of chooseAttemptCommands(s, v2.takeId)) s = mustApply(s, c as never);
    s = assemble(s, occ, segmentId);
    expect(usedTakes(s)).toEqual([v2.takeId]);
    expect(s.takes[v1.takeId]).toBeDefined();

    // … og kan ta den gamle i bruk igjen
    for (const c of chooseAttemptCommands(s, v1.takeId)) s = mustApply(s, c as never);
    expect(latestVideoFor(s, occ, segmentId)?.id).toBe(v1.takeId);
    s = assemble(s, occ, segmentId);
    expect(usedTakes(s)).toEqual([v1.takeId]);
    expect(s.takes[v2.takeId]).toBeDefined();
  });
});
