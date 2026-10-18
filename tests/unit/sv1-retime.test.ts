// @vitest-environment node
/** SV1 (B-041): endring av scenevarighet – fem metoder, avrunding, låste tidsrom, fyll, kommando og kopi. */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPOSITION,
  applyCommand,
  backupIdMap,
  defaultLayerFields,
  distributeLargestRemainder,
  emptyProjectState,
  filmClips,
  makeBackup,
  paddingAt,
  parseBackup,
  planRetime,
  retimeHasTimedContent,
  renderFrame,
  restoredState,
  scriptView,
  FPS_25,
  type AudioClipFields,
  type BackupData,
  type Composition,
  type ProjectRows,
  type ProjectState,
  type Row,
} from "@/core";
import { drawFrame } from "@/engine/compositor/canvas";
import { drawFilmFrame } from "@/engine/compositor/film";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";
import { SoftCanvas } from "../helpers/soft-canvas";
import { fixture } from "../visual/fixture-state";

const MS = 40; // 25 bilder/s

function withSound(s: ProjectState) {
  const assetId = tid<"asset">();
  const variantId = tid<"asset_variant">();
  const versionId = tid<"asset_version">();
  s = mustApply(s, {
    type: "CreateAssets",
    assets: [
      {
        assetId,
        fields: { kind: "sound", name: "Lyd", names: [], description: "", category: "", tags: [] },
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
      path: `${s.project.id}/${assetId}/${versionId}/lyd.mp3`,
      mimeType: "audio/mpeg",
      width: null,
      height: null,
      byteSize: 1000,
      sha256: "a".repeat(64),
      durationMs: 20000,
    },
    note: "",
  });
  return { s, assetId };
}

function clip(
  occurrenceId: string,
  assetId: string,
  over: Partial<AudioClipFields>,
): AudioClipFields {
  return {
    occurrenceId: occurrenceId as never,
    kind: "dialogue",
    name: "Replikk",
    assetId: assetId as never,
    assetVariantId: null,
    versionId: null,
    blockId: null,
    offsetMs: 0,
    sourceInMs: 0,
    lengthMs: 1000,
    gainDb: 0,
    fadeInMs: 0,
    fadeOutMs: 0,
    muted: false,
    continues: false,
    volumeKeys: [],
    ...over,
  };
}

/** En scene på 8 s (200 bilder) med ett lag og nøkkelbilder på 50 og 150. */
function scene(opts: { clips?: Partial<AudioClipFields>[] } = {}) {
  const seed = seedProject(2);
  const occ = scriptView(seed.state, seed.mainId)[1]!.occurrenceId;
  const o = seed.state.occurrences[occ]!;
  const { s: s1, assetId } = withSound(seed.state);
  let s = s1;
  const compositionId = tid<"composition">();
  s = mustApply(s, {
    type: "CreateComposition",
    compositionId,
    variantId: o.variantId,
    fields: { ...DEFAULT_COMPOSITION, durationFrames: 200, background: "#101114" },
  });
  const layerId = tid<"composition_layer">();
  const bgId = tid<"composition_layer">();
  const c = s.compositions[compositionId]!;
  s = mustApply(s, {
    type: "AddLayers",
    layers: [
      {
        layerId: bgId,
        compositionId,
        fields: { ...defaultLayerFields(s, c, { fill: "#204060" }), kind: "background" },
      },
      {
        layerId,
        compositionId,
        fields: {
          ...defaultLayerFields(s, c, { fill: "#c08040" }),
          kind: "foreground",
          width: 200,
          height: 200,
          keyframes: [
            { frame: 50, property: "x", value: 100, easing: "linear" },
            { frame: 150, property: "x", value: 900, easing: "linear" },
          ],
        },
      },
    ],
  });
  const clipIds: string[] = [];
  if (opts.clips?.length) {
    const list = opts.clips.map((f) => ({
      clipId: tid<"audio_clip">(),
      fields: clip(occ, assetId, f),
    }));
    s = mustApply(s, { type: "AddAudioClips", clips: list });
    clipIds.push(...list.map((x) => x.clipId));
  }
  return { s, occ, compositionId, layerId, bgId, clipIds, mainId: seed.mainId };
}

const comp = (s: ProjectState, id: string): Composition => s.compositions[id]!;
const keys = (s: ProjectState, layerId: string) => s.layers[layerId]!.keyframes.map((k) => k.frame);

function applyPlan(s: ProjectState, plan: ReturnType<typeof planRetime>) {
  expect(plan.ok).toBe(true);
  if (!plan.ok) throw new Error(plan.reason);
  return mustApply(s, plan.command);
}

describe("SV1 – avrunding (største rest)", () => {
  it("§11: 1/2/3 s pauser + 3 s gir 0,5/1/1,5 s", () => {
    expect(distributeLargestRemainder(3000, [1000, 2000, 3000])).toEqual([500, 1000, 1500]);
    expect(distributeLargestRemainder(-3000, [1000, 2000, 3000])).toEqual([-500, -1000, -1500]);
  });

  it("summen er alltid eksakt den nye tiden", () => {
    for (const [total, w] of [
      [75, [25, 50, 75]],
      [7, [1, 1, 1]],
      [-13, [10, 3, 7, 1]],
      [101, [33, 33, 34]],
    ] as const) {
      const out = distributeLargestRemainder(total, w);
      expect(out.reduce((a, b) => a + b, 0)).toBe(total);
      for (const x of out) expect(Number.isInteger(x)).toBe(true);
    }
  });
});

describe("SV1 – metode 3: fordel på pausene", () => {
  it("§11 i scenen: tale står fast, mellomrommene vokser proporsjonalt og summen stemmer", () => {
    // Mellomrom 0–1 s, tale 1–2 s, mellomrom 2–4 s, tale 4–5 s, mellomrom 5–8 s
    const { s, occ, clipIds } = scene({
      clips: [
        { offsetMs: 1000, lengthMs: 1000 },
        { offsetMs: 4000, lengthMs: 1000 },
      ],
    });
    const plan = planRetime(s, occ, { targetFrames: 275, method: "pauses", keepAmbience: true });
    expect(plan.ok).toBe(true);
    const lens = plan.report.gapsBefore.map((g) => g.endFrame - g.startFrame);
    expect(lens).toEqual([25, 50, 75]);
    const after = plan.report.gapsAfter.map((g) => g.endFrame - g.startFrame);
    expect(after.reduce((a, b) => a + b, 0)).toBe(150 + 75);
    // 0,5 / 1 / 1,5 s innenfor ett bilde
    const grown = after.map((x, i) => (x - lens[i]!) * MS);
    [500, 1000, 1500].forEach((want, i) =>
      expect(Math.abs(grown[i]! - want)).toBeLessThanOrEqual(MS),
    );
    const n = applyPlan(s, plan);
    const a = n.audioClips[clipIds[0]!]!;
    const b = n.audioClips[clipIds[1]!]!;
    // Talelyden endrer aldri lengde eller hastighet
    expect([a.lengthMs, b.lengthMs]).toEqual([1000, 1000]);
    expect(a.speed ?? 1).toBe(1);
    expect(a.offsetMs).toBe((25 + after[0]! - 25) * MS);
    expect(b.offsetMs - (a.offsetMs + 1000)).toBe(after[1]! * MS);
  });

  it("§13: for lite fleksibel tid gir ok:false uten kommando", () => {
    const { s, occ } = scene({
      clips: [
        { offsetMs: 0, lengthMs: 3000 },
        { offsetMs: 3200, lengthMs: 4800 },
      ],
    });
    const plan = planRetime(s, occ, { targetFrames: 100, method: "pauses", keepAmbience: true });
    expect(plan.ok).toBe(false);
    expect("command" in plan).toBe(false);
    if (!plan.ok) expect(plan.reason).toMatch(/fleksibel/);
  });
});

describe("SV1 – metode 1 og 2: start og slutt", () => {
  it("forlengelse krever valg av fyll; slutt flytter ingenting og lagrer fyllet", () => {
    const { s, occ, compositionId, layerId } = scene();
    expect(planRetime(s, occ, { targetFrames: 250, method: "end", keepAmbience: true }).ok).toBe(
      false,
    );
    const n = applyPlan(
      s,
      planRetime(s, occ, { targetFrames: 250, method: "end", fill: "black", keepAmbience: true }),
    );
    expect(comp(n, compositionId).durationFrames).toBe(250);
    expect(keys(n, layerId)).toEqual([50, 150]);
    expect(comp(n, compositionId).timing?.padding.end).toEqual({ frames: 50, fill: "black" });
  });

  it("start forskyver alt innhold, også lyden", () => {
    const { s, occ, compositionId, layerId, clipIds } = scene({
      clips: [{ offsetMs: 1000, kind: "dialogue" }],
    });
    const n = applyPlan(
      s,
      planRetime(s, occ, {
        targetFrames: 275,
        method: "start",
        fill: "freeze",
        keepAmbience: true,
      }),
    );
    expect(keys(n, layerId)).toEqual([125, 225]);
    expect(n.audioClips[clipIds[0]!]!.offsetMs).toBe(1000 + 75 * MS);
    expect(comp(n, compositionId).timing?.padding.start).toEqual({ frames: 75, fill: "freeze" });
  });

  it("atmosfære som spiller til slutten, fortsetter i ny tid (kan slås av)", () => {
    const { s, occ, clipIds } = scene({
      clips: [{ kind: "ambience", offsetMs: 0, lengthMs: 8000 }],
    });
    const on = applyPlan(
      s,
      planRetime(s, occ, { targetFrames: 250, method: "end", fill: "freeze", keepAmbience: true }),
    );
    expect(on.audioClips[clipIds[0]!]!.lengthMs).toBe(10000);
    const off = applyPlan(
      s,
      planRetime(s, occ, { targetFrames: 250, method: "end", fill: "freeze", keepAmbience: false }),
    );
    expect(off.audioClips[clipIds[0]!]!.lengthMs).toBe(8000);
  });

  it("forkorting i start: nøkkelbilder og musikk trimmes og rapporteres; tale gir ok:false", () => {
    const music = scene({ clips: [{ kind: "music", offsetMs: 0, lengthMs: 5000 }] });
    const plan = planRetime(music.s, music.occ, {
      targetFrames: 125,
      method: "start",
      keepAmbience: true,
    });
    expect(plan.ok).toBe(true);
    expect(plan.report.trimmed.some((t) => t.kind === "keyframe")).toBe(true);
    expect(plan.report.trimmed.some((t) => t.kind === "audioClip")).toBe(true);
    const n = applyPlan(music.s, plan);
    expect(keys(n, music.layerId)).toEqual([75]);
    expect(n.audioClips[music.clipIds[0]!]!.offsetMs).toBe(0);
    expect(n.audioClips[music.clipIds[0]!]!.sourceInMs).toBe(3000);
    expect(n.audioClips[music.clipIds[0]!]!.lengthMs).toBe(2000);

    const talk = scene({ clips: [{ kind: "dialogue", offsetMs: 500, lengthMs: 1000 }] });
    const bad = planRetime(talk.s, talk.occ, {
      targetFrames: 150,
      method: "start",
      keepAmbience: true,
    });
    expect(bad.ok).toBe(false);
  });

  it("forkorting i slutt som kutter tale gir ok:false", () => {
    const { s, occ } = scene({ clips: [{ kind: "narration", offsetMs: 6000, lengthMs: 1500 }] });
    expect(planRetime(s, occ, { targetFrames: 160, method: "end", keepAmbience: true }).ok).toBe(
      false,
    );
  });
});

describe("SV1 – metode 4 og 5: strekk", () => {
  it("5: visuell tid skaleres, lyden står helt urørt", () => {
    const { s, occ, layerId, clipIds } = scene({ clips: [{ offsetMs: 2000, lengthMs: 1000 }] });
    const n = applyPlan(
      s,
      planRetime(s, occ, { targetFrames: 400, method: "stretch_visual", keepAmbience: true }),
    );
    expect(keys(n, layerId)).toEqual([100, 300]);
    expect(n.audioClips[clipIds[0]!]).toEqual(s.audioClips[clipIds[0]!]);
  });

  it("4: lydens start følger med; tale endrer aldri hastighet, og uten ordkobling rapporteres det", () => {
    const { s, occ, clipIds } = scene({ clips: [{ offsetMs: 2000, lengthMs: 1000 }] });
    const plan = planRetime(s, occ, {
      targetFrames: 400,
      method: "stretch_all",
      keepAmbience: true,
    });
    expect(plan.report.audioNotFitting.map((a) => a.id)).toEqual([clipIds[0]]);
    const n = applyPlan(s, plan);
    const a = n.audioClips[clipIds[0]!]!;
    expect(a.offsetMs).toBe(4000);
    expect(a.lengthMs).toBe(1000);
    expect(a.speed ?? 1).toBe(1);
  });

  it("låste tidsrom står fast ved strekk", () => {
    const { s, occ, compositionId, layerId } = scene();
    const c = comp(s, compositionId);
    const locked = mustApply(s, {
      type: "UpdateComposition",
      compositionId,
      fields: {
        name: c.name,
        width: c.width,
        height: c.height,
        durationFrames: 200,
        background: c.background,
      },
      timing: {
        lockedRanges: [{ id: "l1", startFrame: 0, endFrame: 100, label: "Dans" }],
        padding: { start: null, end: null },
      },
    });
    const n = applyPlan(
      locked,
      planRetime(locked, occ, { targetFrames: 300, method: "stretch_visual", keepAmbience: true }),
    );
    // 0–100 står fast; 100–200 strekkes til 100–300
    expect(keys(n, layerId)).toEqual([50, 200]);
    expect(comp(n, compositionId).timing?.lockedRanges[0]).toMatchObject({
      startFrame: 0,
      endFrame: 100,
    });
    // Forkorting i start inn i det låste tidsrommet stoppes
    const cut = planRetime(locked, occ, { targetFrames: 150, method: "start", keepAmbience: true });
    expect(cut.ok).toBe(false);
    expect(cut.report.lockedConflicts.map((x) => x.id)).toEqual(["l1"]);
  });

  it("sammenfallende punkter ved kraftig forkorting rapporteres, ingen slettes", () => {
    const { s, occ, compositionId, layerId } = scene();
    const l = s.layers[layerId]!;
    const s2 = mustApply(s, {
      type: "UpdateLayers",
      layers: [
        {
          layerId,
          fields: {
            ...defaultLayerFields(s, comp(s, compositionId), { fill: "#000000" }),
            ...l,
            keyframes: [10, 11, 12].map((frame) => ({
              frame,
              property: "x" as const,
              value: frame,
              easing: "linear" as const,
            })),
          } as never,
        },
      ],
    });
    const plan = planRetime(s2, occ, {
      targetFrames: 20,
      method: "stretch_visual",
      keepAmbience: true,
    });
    expect(plan.ok).toBe(true);
    expect(plan.report.collisions.length).toBeGreaterThan(0);
    const n = applyPlan(s2, plan);
    const f = keys(n, layerId);
    expect(f).toHaveLength(3);
    expect(new Set(f).size).toBe(3);
  });
});

describe("SV1 – RetimeScene", () => {
  it("én kommando; inversen gir tilstanden tilbake, og gjør om virker", () => {
    const { s, occ, compositionId, layerId, clipIds } = scene({ clips: [{ offsetMs: 2000 }] });
    const plan = planRetime(s, occ, {
      targetFrames: 300,
      method: "start",
      fill: "background",
      keepAmbience: true,
    });
    expect(plan.ok && plan.command.type).toBe("RetimeScene");
    if (!plan.ok) return;
    const r = applyCommand(s, envelope(plan.command));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const undo = applyCommand(r.state, envelope(r.inverse));
    expect(undo.ok).toBe(true);
    if (!undo.ok) return;
    expect(comp(undo.state, compositionId).durationFrames).toBe(200);
    expect(comp(undo.state, compositionId).timing).toBeUndefined();
    expect(keys(undo.state, layerId)).toEqual([50, 150]);
    expect(undo.state.audioClips[clipIds[0]!]!.offsetMs).toBe(2000);
    const redo = applyCommand(undo.state, envelope(undo.inverse));
    expect(redo.ok && comp(redo.state, compositionId).durationFrames).toBe(300);
    expect(redo.ok && keys(redo.state, layerId)).toEqual([150, 250]);
  });

  it("avviser trinn som ikke er tidsendringer", () => {
    const { s, occ, compositionId } = scene();
    const r = applyCommand(
      s,
      envelope({
        type: "RetimeScene",
        occurrenceId: occ as never,
        compositionId: compositionId as never,
        steps: [
          { type: "SetCompositionRemoved", compositionId: compositionId as never, removed: true },
        ],
      }),
    );
    expect(r.ok).toBe(false);
  });

  it("planlagt lengde følger den nye varigheten", () => {
    const { s, occ } = scene();
    const s2 = mustApply(s, {
      type: "SetPlannedDuration",
      occurrenceId: occ as never,
      plannedMs: 8000,
    });
    const n = applyPlan(
      s2,
      planRetime(s2, occ, { targetFrames: 300, method: "stretch_visual", keepAmbience: true }),
    );
    expect(n.occurrences[occ]!.plannedMs).toBe(12000);
  });
});

describe("SV1 – fyll i ny tid: forhåndsvisning og eksport gir samme bilde", () => {
  for (const fill of ["freeze", "background", "black"] as const) {
    it(`${fill}`, () => {
      const { s, occ, compositionId, mainId } = scene();
      const n = applyPlan(
        s,
        planRetime(s, occ, { targetFrames: 250, method: "start", fill, keepAmbience: true }),
      );
      const c = comp(n, compositionId);
      expect(paddingAt(c, 10).kind).toBe(fill === "freeze" ? "content" : fill);
      // Forhåndsvisningen (PreviewWindow) tegner renderFrame i kameravisning
      const W = 192;
      const H = 108;
      const preview = new SoftCanvas(W, H);
      const pctx = preview.getContext() as unknown as CanvasRenderingContext2D;
      pctx.fillStyle = "#000";
      pctx.fillRect(0, 0, W, H);
      drawFrame(pctx, renderFrame(n, compositionId, 10, { view: "camera" }), {
        view: [W / c.width, 0, 0, H / c.height, 0, 0],
        images: new Map(),
        placeholders: false,
      });
      // Eksporten tegner filmbildet
      const clips = filmClips(n, mainId);
      const at = clips.find((x) => x.compositionId === compositionId)!;
      const film = new SoftCanvas(W, H);
      drawFilmFrame(
        film.getContext() as unknown as CanvasRenderingContext2D,
        n,
        clips,
        at.startFrame + 10,
        {
          width: W,
          height: H,
          images: new Map(),
          placeholders: false,
        },
      );
      for (const [x, y] of [
        [5, 5],
        [96, 54],
        [150, 90],
      ] as const)
        expect(film.pixel(x, y)).toEqual(preview.pixel(x, y));
      if (fill === "black") expect(film.pixel(96, 54).slice(0, 3)).toEqual([0, 0, 0]);
      // Bakgrunn: forgrunnslaget er skjult; frys: samme bilde som første innholdsbilde
      const items = renderFrame(n, compositionId, 10, { view: "camera" }).items.length;
      if (fill === "background") expect(items).toBe(1);
      if (fill === "freeze")
        expect(renderFrame(n, compositionId, 10, { view: "camera" })).toEqual(
          renderFrame(n, compositionId, 75, { view: "camera" }),
        );
    });
  }
});

describe("SV1 – sikkerhetskopi", () => {
  it("timing følger med gjennom eksport og gjenoppretting", async () => {
    const timing = {
      lockedRanges: [{ id: "l1", startFrame: 5, endFrame: 20, label: "Sang" }],
      padding: { start: { frames: 10, fill: "freeze" }, end: null },
    };
    const rows = {
      project: fixture.project,
      ...fixture.rows,
      compositions: (fixture.rows["compositions"] as Row[]).map((r, i) =>
        i === 0 ? { ...r, timing } : r,
      ),
    } as unknown as ProjectRows;
    const b = parseBackup(
      JSON.parse(
        JSON.stringify(
          makeBackup({
            rows,
            scriptVersions: [],
            importedDocuments: [],
            changeLog: [],
            generationJobs: [],
            schemaVersion: 42,
            createdAt: "2026-10-18T12:00:00Z",
            include: new Set() as unknown as ReadonlySet<never>,
          }),
        ),
      ) as BackupData,
      42,
    );
    const NEW_PROJECT = "01900000-0000-7000-8000-00000042aaaa";
    const NEW_MAIN = "01900000-0000-7000-8000-00000042bbbb";
    const base0 = emptyProjectState({
      id: NEW_PROJECT as never,
      revision: 1,
      name: "Gjenopprettet",
      fps: FPS_25,
      frameWidth: 1920,
      frameHeight: 1080,
      primaryLanguage: "nb",
    });
    const base = {
      ...base0,
      productions: {
        [NEW_MAIN]: {
          id: NEW_MAIN as never,
          revision: 1,
          kind: "main" as const,
          name: "Hovedfilm",
          parentProductionId: null,
          fps: FPS_25,
        },
      },
    };
    const map = await backupIdMap(b, NEW_PROJECT, NEW_MAIN);
    const restored = restoredState(b, map, base, "01900000-0000-7000-8000-00000042cccc");
    const oldId = String((fixture.rows["compositions"] as Row[])[0]!["id"]);
    const c = restored.compositions[map.get(oldId)!]!;
    expect(c.timing).toEqual(timing);
  });
});

describe("SV1 – «Fra manus» uten metodevalg bare i scener uten tidspunkter", () => {
  it("en scene med nøkkelbilder har innhold med tidspunkter", () => {
    const { s, occ } = scene();
    expect(retimeHasTimedContent(s, occ)).toBe(true);
  });

  it("en scene uten nøkkelbilder, lyd eller koblinger kan endres direkte", () => {
    const seed = seedProject(2);
    const occ = scriptView(seed.state, seed.mainId)[1]!.occurrenceId;
    const o = seed.state.occurrences[occ]!;
    const s = mustApply(seed.state, {
      type: "CreateComposition",
      compositionId: tid<"composition">(),
      variantId: o.variantId,
      fields: { ...DEFAULT_COMPOSITION, durationFrames: 200, background: "#101114" },
    });
    expect(retimeHasTimedContent(s, occ)).toBe(false);
  });
});
