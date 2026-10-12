/** Arbeidsliste for oppdaterte ressurser (DEC-0072). */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  assetWorklist,
  filmClips,
  keepWorkItemCommand,
  mainProduction,
  stillCandidates,
  stillCommands,
  toRow,
  newVersionWorkItemCommands,
  versionsOf,
  assetVersionImpact,
  approveWithImpactCommands,
  variantsOf,
  layerFieldsOf,
  type GenerationJob,
  type ProjectState,
} from "@/core";
import { mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const fps = s0.project.fps;

function run(s: ProjectState, command: unknown) {
  return applyCommand(s, {
    id: "00000000-0000-7000-8000-00000000f0f4" as never,
    actor: "00000000-0000-7000-8000-000000000001" as never,
    at: new Date().toISOString(),
    command: command as never,
  });
}

/** En 2D-scene med et lag låst til dagens versjon, og en ny godkjent versjon av varianten. */
function setup() {
  const layer = Object.values(s0.layers).find(
    (l) =>
      !l.removed &&
      l.assetId &&
      variantsOf(s0, l.assetId).some((v) => versionsOf(s0, v.id).length > 0),
  )!;
  const variantId = variantsOf(s0, layer.assetId!).find((v) => versionsOf(s0, v.id).length)!.id;
  const oldV = versionsOf(s0, variantId)[0]!;
  let s = mustApply(s0, {
    type: "UpdateLayers",
    layers: [
      {
        layerId: layer.id,
        fields: { ...layerFieldsOf(layer), assetVariantId: variantId, versionId: oldV.id },
      },
    ],
  } as never);
  // Et stillbilde av samme versjon i første scene
  const clip = filmClips(s, main.id)[0]!;
  const stillId = tid<"take">();
  for (const c of stillCommands(
    clip,
    { takeId: stillId, mediaRef: oldV.mediaPath, ms: 2000, mode: "replace", fps },
    () => tid<"clip_part">(),
  )!)
    s = mustApply(s, c as never);
  const newId = tid<"asset_version">();
  s = mustApply(s, {
    type: "AddAssetVersion",
    versionId: newId,
    variantId,
    media: {
      path: `${s0.project.id}/${layer.assetId}/${newId}/ny.png`,
      mimeType: "image/png",
      width: 100,
      height: 100,
      byteSize: 10,
      sha256: "b".repeat(64),
    },
    note: "",
  } as never);
  s = mustApply(s, { type: "ApproveAssetVersion", variantId, versionId: newId } as never);
  return { s, layer, oldV, newId, stillId, assetId: layer.assetId! };
}

describe("arbeidsliste for oppdaterte ressurser", () => {
  it("lag og stillbilder med eldre versjon står på listen, og kan filtreres per ressurs", () => {
    expect(stillCandidates(s0).length).toBeGreaterThan(0);
    const { s, layer, oldV, newId, stillId, assetId } = setup();
    const list = assetWorklist(s, main.id);
    const lay = list.find((x) => x.kind === "layer" && x.targetId === layer.id)!;
    expect(lay).toMatchObject({ oldVersionId: oldV.id, newVersionId: newId, assetId });
    expect(list.find((x) => x.kind === "still" && x.targetId === stillId)).toBeTruthy();
    expect(assetWorklist(s, main.id, { assetId: "finnes-ikke" })).toEqual([]);
  });

  it("«Behold» fjerner posten til neste versjon, kan angres og lagres som reviewed_versions", () => {
    const { s, layer } = setup();
    const item = assetWorklist(s, main.id).find((x) => x.targetId === layer.id)!;
    const r = run(s, keepWorkItemCommand(s, item));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(assetWorklist(r.state, main.id).some((x) => x.targetId === layer.id)).toBe(false);
    expect(toRow("layers", r.state.layers[layer.id]!, s.project.id)["reviewed_versions"]).toEqual([
      item.newVersionId,
    ]);
    const back = mustApply(r.state, r.inverse as never);
    expect(assetWorklist(back, main.id).some((x) => x.targetId === layer.id)).toBe(true);
  });

  it("«Bruk ny versjon» låser laget til den nye; stillbildet blir ny versjon av scenen", () => {
    const { s, layer, newId, stillId } = setup();
    const list = assetWorklist(s, main.id);
    let t = s;
    for (const c of newVersionWorkItemCommands(
      t,
      list.find((x) => x.targetId === layer.id)!,
      null,
      () => tid<"clip_part">(),
    )!)
      t = mustApply(t, c as never);
    expect(t.layers[layer.id]!.versionId).toBe(newId);
    const stillItem = list.find((x) => x.targetId === stillId)!;
    const clip = filmClips(t, main.id).find((c) => c.occurrenceId === stillItem.occurrenceId)!;
    for (const c of newVersionWorkItemCommands(t, stillItem, clip, () => tid<"take">())!)
      t = mustApply(t, c as never);
    const after = filmClips(t, main.id).find((c) => c.occurrenceId === stillItem.occurrenceId)!;
    expect(after.parts[0]!.take!.mediaRef).toContain("/ny.png");
    expect(t.takes[stillId]).toBeTruthy(); // det gamle beholdes
    expect(assetWorklist(t, main.id).map((x) => [x.kind, x.label])).toEqual([]);
  });

  it("AI-video laget med eldre versjon (fra sporet) står på listen, men kan bare beholdes", () => {
    const { s, oldV } = setup();
    const clip = filmClips(s, main.id)[1]!;
    const takeId = tid<"take">();
    const path = `${s0.project.id}/films/${takeId}/ai-video.mp4`;
    let t = mustApply(s, {
      type: "AddTake",
      takeId,
      occurrenceId: clip.occurrenceId,
      segmentId: null,
      kind: "ai_video",
      status: "approved",
      durationFrames: 100,
      mediaRef: path,
      media: {
        fileName: "ai-video.mp4",
        mimeType: "video/mp4",
        byteSize: 1,
        width: 1280,
        height: 720,
        fps: 24,
        durationMs: 4000,
        videoCodec: null,
        hasAudio: false,
      },
    } as never);
    t = mustApply(t, {
      type: "SetSceneEdit",
      occurrenceId: clip.occurrenceId,
      activeTakeId: takeId,
      parts: [],
    } as never);
    const job = {
      resultPath: path,
      params: {
        trace: {
          v: 1,
          systemInstruction: null,
          modelParams: {},
          references: [{ path: oldV.mediaPath, versionId: oldV.id }],
          scriptVersion: null,
          blockRevisions: {},
          occurrenceId: clip.occurrenceId,
          segmentId: null,
        },
      },
    } as unknown as GenerationJob;
    const item = assetWorklist(t, main.id, { jobs: [job] }).find((x) => x.targetId === takeId)!;
    expect(item.kind).toBe("ai");
    expect(newVersionWorkItemCommands(t, item, clip, () => "x")).toBe(null);
    expect(run(t, keepWorkItemCommand(t, item)).ok).toBe(true);
  });

  it("bildeskifter og språkbilder med eldre versjon står også på listen (KI-106, KI-173)", () => {
    const { s, layer, oldV, newId } = setup();
    // Laget følger godkjent; et bildeskifte og et engelsk bilde er låst til den gamle
    const f = layerFieldsOf(s.layers[layer.id]!);
    const t = mustApply(s, {
      type: "UpdateLayers",
      layers: [
        {
          layerId: layer.id,
          fields: {
            ...f,
            versionId: null,
            swaps: [
              {
                frame: 10,
                assetId: layer.assetId,
                assetVariantId: oldV.variantId,
                versionId: oldV.id,
              },
            ],
            languageImages: [
              { language: "en", assetVariantId: oldV.variantId, versionId: oldV.id },
            ],
          },
        },
      ],
    } as never);
    const items = assetWorklist(t, main.id).filter((x) => x.targetId === layer.id);
    expect(items).toHaveLength(1);
    let u = t;
    for (const c of newVersionWorkItemCommands(u, items[0]!, null, () => tid<"clip_part">())!)
      u = mustApply(u, c as never);
    expect(u.layers[layer.id]!.swaps[0]!.versionId).toBe(newId);
    expect(u.layers[layer.id]!.languageImages![0]!.versionId).toBe(newId);
    expect(assetWorklist(u, main.id).some((x) => x.targetId === layer.id)).toBe(false);
  });

  it("godkjenning viser og oppdaterer også bilder for en språkversjon (KI-118)", () => {
    const layer = Object.values(s0.layers).find(
      (l) =>
        !l.removed &&
        l.assetId &&
        variantsOf(s0, l.assetId).some((v) => versionsOf(s0, v.id).length > 0),
    )!;
    const variantId = variantsOf(s0, layer.assetId!).find((v) => versionsOf(s0, v.id).length)!.id;
    const oldV = versionsOf(s0, variantId)[0]!;
    let s = mustApply(s0, {
      type: "UpdateLayers",
      layers: [
        {
          layerId: layer.id,
          fields: {
            ...layerFieldsOf(layer),
            languageImages: [{ language: "en", assetVariantId: variantId, versionId: oldV.id }],
          },
        },
      ],
    } as never);
    const nv = tid<"asset_version">();
    s = mustApply(s, {
      type: "AddAssetVersion",
      versionId: nv,
      variantId,
      media: {
        path: `${s0.project.id}/${layer.assetId}/${nv}/ny.png`,
        mimeType: "image/png",
        width: 10,
        height: 10,
        byteSize: 10,
        sha256: "c".repeat(64),
      },
      note: "",
    } as never);
    const impact = assetVersionImpact(s, main.id, variantId, nv);
    const lang = impact.flatMap((x) => x.layers).find((l) => l.source === "lang:en");
    expect(lang?.mode).toBe("locked");
    for (const c of approveWithImpactCommands(s, variantId, nv, impact, new Set()))
      s = mustApply(s, c as never);
    expect(s.layers[layer.id]!.languageImages![0]!.versionId).toBe(nv);
  });
});
