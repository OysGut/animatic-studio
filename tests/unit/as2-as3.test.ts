// @vitest-environment node
/**
 * AS2/AS3: bildesegmenter, krysstoning, aktivt tidsområde, «bare objektet», lydgrupper, forhåndslyttingsdemping
 * og forsøksvise manusredigeringer. Merket etter akseptansekriteriene (PHASE3_ASSET_STUDIO_DIFF.md G).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPOSITION,
  applyCommand,
  assetAudioGroups,
  assetLineIds,
  blocksOfVariant,
  compositionDuration,
  createDraft,
  defaultLayerFields,
  imageSegmentsOf,
  insertImageSegment,
  isDraftEmpty,
  layerFieldsOf,
  pushDraft,
  removeImageSegment,
  renderFrame,
  scriptView,
  setImageSegmentTransition,
  trialEditResult,
  type AudioClipFields,
  type FilmAudioItem,
  type LayerFields,
  type ProjectState,
} from "@/core";
import { scheduleAudio, type AudioBank } from "@/engine/audio/mixer";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

function media(s: ProjectState, assetId: string, versionId: string, mime = "image/png") {
  return {
    path: `${s.project.id}/${assetId}/${versionId}/f.${mime === "image/png" ? "png" : "mp3"}`,
    mimeType: mime,
    width: mime === "image/png" ? 400 : null,
    height: mime === "image/png" ? 800 : null,
    byteSize: 1000,
    sha256: "b".repeat(64),
    durationMs: mime === "image/png" ? null : 20000,
  };
}

/** En scene med karakteren Maja (fire varianter med ett bilde hver), ett lag og nøkkelbilder. */
function scene() {
  const seed = seedProject(2);
  const occ = scriptView(seed.state, seed.mainId)[1]!.occurrenceId;
  const o = seed.state.occurrences[occ]!;
  let s = seed.state;
  const assetId = tid<"asset">();
  s = mustApply(s, {
    type: "CreateAssets",
    assets: [
      {
        assetId,
        fields: { kind: "character", name: "Maja", names: [], description: "", category: "", tags: [] },
      },
    ],
  });
  const images: { assetId: string; assetVariantId: string; versionId: string }[] = [];
  for (const name of ["Glad", "Sint", "Trist", "Redd"]) {
    const variantId = tid<"asset_variant">();
    const versionId = tid<"asset_version">();
    s = mustApply(s, {
      type: "CreateAssetVariant",
      variantId,
      assetId,
      fields: { name, style: "animatic", appearance: "" },
    });
    s = mustApply(s, {
      type: "AddAssetVersion",
      versionId,
      variantId,
      media: media(s, assetId, versionId),
      note: "",
    });
    images.push({ assetId, assetVariantId: variantId, versionId });
  }
  const compositionId = tid<"composition">();
  s = mustApply(s, {
    type: "CreateComposition",
    compositionId,
    variantId: o.variantId,
    fields: { ...DEFAULT_COMPOSITION, durationFrames: 200 },
  });
  const layerId = tid<"composition_layer">();
  const base = defaultLayerFields(s, s.compositions[compositionId]!, { name: "Maja" });
  s = mustApply(s, {
    type: "AddLayers",
    layers: [
      {
        layerId,
        compositionId,
        fields: {
          ...base,
          assetId: assetId as never,
          assetVariantId: images[0]!.assetVariantId as never,
          versionId: images[0]!.versionId as never,
          keyframes: [
            { frame: 0, property: "x", value: 0, easing: "linear" },
            { frame: 200, property: "x", value: 200, easing: "linear" },
          ] as never,
        },
      },
    ],
  });
  return { s, occ, compositionId, layerId, assetId, images, seed };
}

function update(s: ProjectState, layerId: string, f: LayerFields): ProjectState {
  return mustApply(s, { type: "UpdateLayers", layers: [{ layerId: layerId as never, fields: f }] });
}

describe("AS2 – bildesegmenter (kriterium 1 og 2)", () => {
  it("1: fire bildevarianter i én tidslinje uten å duplisere karakteren", () => {
    const { s, layerId, images } = scene();
    let f = layerFieldsOf(s.layers[layerId as never]!);
    f = insertImageSegment(f, 50, images[1]!);
    f = insertImageSegment(f, 100, images[2]!);
    f = insertImageSegment(f, 150, images[3]!);
    const n = update(s, layerId, f);
    const segs = imageSegmentsOf(layerFieldsOf(n.layers[layerId as never]!), 200);
    expect(segs.map((x) => x.image?.versionId)).toEqual(images.map((i) => i.versionId));
    expect(Object.keys(n.layers)).toEqual(Object.keys(s.layers));
    expect(new Set(segs.map((x) => x.image?.assetId))).toEqual(new Set([images[0]!.assetId]));
  });

  it("2: animasjonen fortsetter gjennom et bytte og en krysstoning", () => {
    const { s, compositionId, layerId, images } = scene();
    let f = insertImageSegment(layerFieldsOf(s.layers[layerId as never]!), 100, images[1]!);
    f = setImageSegmentTransition(f, 1, 10);
    const n = update(s, layerId, f);
    const before = renderFrame(n, compositionId, 99, { view: "scene" }).items;
    const mid = renderFrame(n, compositionId, 104, { view: "scene" }).items;
    const after = renderFrame(n, compositionId, 120, { view: "scene" }).items;
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(1);
    expect(after[0]!.version?.id).toBe(images[1]!.versionId);
    // Krysstoning: begge bildene, opasitetene summerer til lagets, samme plassering (animasjonen er den samme)
    expect(mid).toHaveLength(2);
    expect(mid[0]!.version?.id).toBe(images[0]!.versionId);
    expect(mid[1]!.version?.id).toBe(images[1]!.versionId);
    expect(mid[0]!.opacity + mid[1]!.opacity).toBeCloseTo(1);
    expect(mid[0]!.matrix[4]).toBeCloseTo(mid[1]!.matrix[4]);
    expect(after[0]!.matrix[4]).toBeGreaterThan(before[0]!.matrix[4]);
  });

  it("fjerning fjerner byttet, aldri bildet i biblioteket", () => {
    const { s, layerId, images } = scene();
    const f = insertImageSegment(layerFieldsOf(s.layers[layerId as never]!), 100, images[1]!);
    const r = removeImageSegment(f, 1)!;
    expect(r.swaps).toHaveLength(0);
    const n = update(update(s, layerId, f), layerId, r);
    expect(n.assetVersions[images[1]!.versionId as never]?.removed).toBe(false);
  });
});

describe("AS2 – aktivt tidsområde (kriterium 3)", () => {
  it("3: laget tegnes bare i området, og scenens lengde endres ikke", () => {
    const { s, compositionId, layerId } = scene();
    const comp = s.compositions[compositionId]!;
    const len0 = compositionDuration(s, comp);
    const n = update(s, layerId, {
      ...layerFieldsOf(s.layers[layerId as never]!),
      activeRange: { from: 20, to: 80 },
    });
    expect(compositionDuration(n, n.compositions[compositionId]!)).toBe(len0);
    expect(renderFrame(n, compositionId, 10, { view: "camera" }).items).toHaveLength(0);
    expect(renderFrame(n, compositionId, 50, { view: "camera" }).items).toHaveLength(1);
    expect(renderFrame(n, compositionId, 81, { view: "camera" }).items).toHaveLength(0);
  });

  it("et ugyldig område avvises", () => {
    const { s, layerId } = scene();
    const r = applyCommand(
      s,
      envelope({
        type: "UpdateLayers",
        layers: [
          {
            layerId: layerId as never,
            fields: { ...layerFieldsOf(s.layers[layerId as never]!), activeRange: { from: 50, to: 10 } },
          },
        ],
      }),
    );
    expect(r.ok).toBe(false);
  });
});

describe("AS2 – forhåndsvisninger (kriterium 4)", () => {
  it("4: «bare objektet» tegner bare laget; «hele scenen» tegner alle", () => {
    const { s, compositionId, layerId } = scene();
    const comp = s.compositions[compositionId]!;
    const n = mustApply(s, {
      type: "AddLayers",
      layers: [
        {
          layerId: tid<"composition_layer">(),
          compositionId: compositionId as never,
          fields: defaultLayerFields(s, comp, { fill: "#204060", name: "Bakgrunn" }),
        },
      ],
    });
    const only = renderFrame(n, compositionId, 10, { view: "scene", onlyLayers: new Set([layerId]) });
    expect(only.items.map((i) => i.layerId)).toEqual([layerId]);
    expect(renderFrame(n, compositionId, 10, { view: "camera" }).items.length).toBe(2);
  });
});

describe("AS3 – lyd (kriterium 5 og 6)", () => {
  function withClips() {
    const x = scene();
    let s = x.s;
    const soundId = tid<"asset">();
    const vId = tid<"asset_variant">();
    const verId = tid<"asset_version">();
    s = mustApply(s, {
      type: "CreateAssets",
      assets: [
        { assetId: soundId, fields: { kind: "sound", name: "Lyd", names: [], description: "", category: "", tags: [] } },
      ],
    });
    s = mustApply(s, { type: "CreateAssetVariant", variantId: vId, assetId: soundId, fields: { name: "Lyd", style: "other", appearance: "" } });
    s = mustApply(s, { type: "AddAssetVersion", versionId: verId, variantId: vId, media: media(s, soundId, verId, "audio/mpeg"), note: "" });
    const variantId = s.occurrences[x.occ as never]!.variantId;
    const line = blocksOfVariant(s, variantId).find((b) => b.kind === "dialogue")!;
    const clip = (kind: AudioClipFields["kind"], blockId: string | null): AudioClipFields => ({
      occurrenceId: x.occ as never,
      kind,
      name: kind,
      assetId: soundId as never,
      assetVariantId: vId as never,
      versionId: verId as never,
      blockId: blockId as never,
      offsetMs: 0,
      sourceInMs: 0,
      lengthMs: 1000,
      gainDb: 0,
      fadeInMs: 0,
      fadeOutMs: 0,
      muted: false,
      continues: false,
      volumeKeys: [],
    });
    const dlg = tid<"audio_clip">();
    const music = tid<"audio_clip">();
    s = mustApply(s, {
      type: "AddAudioClips",
      clips: [
        { clipId: dlg, fields: clip("dialogue", line.id) },
        { clipId: music, fields: clip("music", null) },
      ],
    });
    return { ...x, s, dlg, music, line };
  }

  it("5: karakterens replikklyd og scenens felles lyd er separate grupper", () => {
    const { s, occ, assetId, dlg, music, line } = withClips();
    const g = assetAudioGroups(s, occ, assetId);
    expect(g.asset.map((c) => c.id)).toEqual([dlg]);
    expect(g.scene.map((c) => c.id)).toEqual([music]);
    expect(assetLineIds(s, occ, assetId)).toEqual([line.id]);
  });

  it("6: demping i forhåndslyttingen endrer ikke scenen og lekker ikke til vanlig avspilling", () => {
    const { s, dlg, music } = withClips();
    const items = Object.values(s.audioClips).map(
      (clip) =>
        ({
          clip,
          version: s.assetVersions[clip.versionId as never]!,
          start: 0,
          length: 1,
          sourceIn: 0,
          gain: 1,
          fadeIn: 0,
          fadeOut: 0,
          keys: [],
        }) as unknown as FilmAudioItem,
    );
    const started: string[] = [];
    const node = () => ({ connect: (n: unknown) => n, gain: { setValueAtTime() {}, linearRampToValueAtTime() {} } });
    const ctx = {
      currentTime: 0,
      createGain: node,
      createBufferSource: () => ({
        ...node(),
        buffer: null,
        playbackRate: { setValueAtTime() {} },
        start() {
          started.push("x");
        },
      }),
    } as unknown as BaseAudioContext;
    const bank = { get: () => ({ duration: 20 }) } as unknown as AudioBank;
    const dest = {} as AudioNode;
    // Forhåndslytting i studioet: dialogen dempet
    expect(scheduleAudio(ctx, dest, items, bank, { from: 0, startAt: 0, mutedClipIds: new Set([dlg]) })).toHaveLength(1);
    // Vanlig avspilling og eksport sender ikke dempingen: begge spilles
    expect(scheduleAudio(ctx, dest, items, bank, { from: 0, startAt: 0 })).toHaveLength(2);
    expect(s.audioClips[dlg as never]!.muted).toBe(false);
    expect(s.audioClips[music as never]!.muted).toBe(false);
  });
});

describe("AS1/AS3 – avbryt (kriterium 7 og 8)", () => {
  it("7/8: bilder og forsøksvise redigeringer lagres utenfor utkastet og overlever «Avbryt»", () => {
    const { s, occ, compositionId, assetId } = scene();
    let d = createDraft(s, occ, compositionId);
    // Biblioteket og notater kan ikke legges i utkastet ...
    const variantId = Object.values(s.assetVariants).find((v) => v.assetId === assetId)!.id;
    const versionId = tid<"asset_version">();
    const add = { type: "AddAssetVersion" as const, versionId, variantId, media: media(s, assetId, versionId), note: "" };
    expect(pushDraft(d, add).ok).toBe(false);
    // ... de skrives direkte
    let live = mustApply(s, add);
    const line = blocksOfVariant(live, live.occurrences[occ as never]!.variantId).find((b) => b.kind === "dialogue")!;
    const noteId = tid<"annotation">();
    live = mustApply(live, {
      type: "AddAnnotations",
      annotations: [
        {
          annotationId: noteId,
          blockId: line.id,
          variantId: null,
          start: 0,
          end: line.text.length,
          quote: line.text,
          text: "Forsøk",
          authorName: "Test",
          kind: "trial_edit",
          suggestedText: "Ny replikk",
        },
      ],
    });
    // «Avbryt»: utkastet forkastes
    d = createDraft(live, occ, compositionId);
    expect(isDraftEmpty(d)).toBe(true);
    expect(live.assetVersions[versionId as never]).toBeDefined();
    const note = live.annotations[noteId as never]!;
    expect(note.kind).toBe("trial_edit");
    expect(line.text).not.toBe("Ny replikk");
    expect(trialEditResult(note, line.text)).toBe("Ny replikk");
  });

  it("en forsøksvis redigering uten forslag avvises", () => {
    const { s, occ } = scene();
    const line = blocksOfVariant(s, s.occurrences[occ as never]!.variantId).find((b) => b.kind === "dialogue")!;
    const r = applyCommand(
      s,
      envelope({
        type: "AddAnnotations",
        annotations: [
          {
            annotationId: tid<"annotation">(),
            blockId: line.id,
            variantId: null,
            start: 0,
            end: 0,
            quote: "",
            text: "Forsøk",
            authorName: "Test",
            kind: "trial_edit",
          },
        ],
      }),
    );
    expect(r.ok).toBe(false);
  });

  it("forslaget for et utdrag settes inn der utdraget står", () => {
    const note = {
      kind: "trial_edit",
      suggestedText: "vet",
      quote: "tror",
      start: 4,
      end: 8,
    } as unknown as Parameters<typeof trialEditResult>[0];
    expect(trialEditResult(note, "Jeg tror det.")).toBe("Jeg vet det.");
    expect(trialEditResult(note, "Helt annen tekst")).toBeNull();
  });
});
