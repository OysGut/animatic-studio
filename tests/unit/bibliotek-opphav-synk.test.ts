/**
 * DEC-0078: opphav per ressursversjon og stilprofiler i biblioteket (REQ-0121), og skillet mellom strukturell
 * plassering og innholdsmessig grunnlag med ressursversjoner (REQ-0022).
 */
import { describe, expect, it } from "vitest";
import {
  CONTENT_SYNC_FLAG,
  assetOrigins,
  compositionMaterialBasis,
  compositionResourceBasis,
  contentSyncByScene,
  contentSyncText,
  emptyStyleGuide,
  filmClips,
  layerFieldsOf,
  libraryStyleProfiles,
  mainProduction,
  orderedOccurrences,
  provenanceDetail,
  provenanceLabel,
  stillCommands,
  styleProfileMatches,
  takeMaterialBasis,
  takeResourceBasis,
  variantsOf,
  versionProvenance,
  versionProvenances,
  versionsOf,
  type GenerationJob,
  type ProjectState,
} from "@/core";
import { mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const fps = s0.project.fps;

const job = (resultPath: string, extra: Partial<GenerationJob> = {}): GenerationJob =>
  ({
    id: tid<"job">(),
    kind: "image",
    provider: "lovable",
    model: "openai/gpt-image-1",
    status: "done",
    resultPath,
    ...extra,
  }) as unknown as GenerationJob;

describe("opphav per ressursversjon (REQ-0121)", () => {
  const v = (mediaPath: string, note = "") => ({ mediaPath, note });

  it("AI-jobben med samme fil gir «laget med AI» med leverandør og modell", () => {
    const p = versionProvenance(
      v("p/a/v/bilde.png"),
      new Map([["p/a/v/bilde.png", job("p/a/v/bilde.png")]]),
    );
    expect(p).toMatchObject({
      origin: "ai",
      provider: "lovable",
      model: "openai/gpt-image-1",
      basis: "job",
    });
    expect(provenanceLabel(p)).toBe("AI · openai/gpt-image-1");
    expect(provenanceDetail(p)).toContain("leverandør: lovable");
  });

  it("uten jobb leses opphavet fra merknaden eller filnavnet", () => {
    expect(
      versionProvenance(v("p/a/v/x.png", "Generert med AI (google/gemini-image)")),
    ).toMatchObject({ origin: "ai", model: "google/gemini-image", basis: "note" });
    expect(
      versionProvenance(v("p/a/v/x.mp3", "Lest inn med AI (elevenlabs/eleven_multilingual_v2)")),
    ).toMatchObject({ origin: "ai", provider: "elevenlabs", model: "eleven_multilingual_v2" });
    expect(versionProvenance(v("p/a/v/x.png", "Frilagt fra v2 (skalert ned)"))).toMatchObject({
      origin: "cutout",
      fromNumber: 2,
    });
    expect(versionProvenance(v("p/a/v/x.png", "Harmonisert med filmens stil"))).toMatchObject({
      origin: "harmonized",
    });
    expect(versionProvenance(v("p/a/v/ai-2026-10-11.png"))).toMatchObject({
      origin: "ai",
      model: null,
      basis: "file_name",
    });
    const re = versionProvenance(v("p/a/v/maja.png", "Erstatter v3 (lastet opp på nytt)"));
    expect(re).toMatchObject({ origin: "upload", reupload: true, fromNumber: 3 });
    expect(provenanceLabel(re)).toBe("Lastet opp på nytt (fra v3)");
    expect(versionProvenance(v("p/a/v/maja.png"))).toMatchObject({
      origin: "upload",
      basis: "none",
    });
  });

  it("en harmoniseringsjobb gir «harmonisert»; feilede jobber teller ikke", () => {
    const h = job("p/x.png", { params: { operation: "harmonize" } });
    expect(versionProvenance(v("p/x.png"), new Map([["p/x.png", h]])).origin).toBe("harmonized");
    const ver = Object.values(s0.assetVersions)[0]!;
    const failed = job(ver.mediaPath, { status: "failed" });
    expect(versionProvenances(s0, [failed]).get(ver.id)!.origin).toBe("upload");
  });

  it("filteret: hver ressurs har opphavene til versjonene sine", () => {
    const ver = Object.values(s0.assetVersions).find((x) => x.mimeType.startsWith("image/"))!;
    const assetId = s0.assetVariants[ver.variantId]!.assetId;
    const without = versionProvenances(s0, []);
    expect(assetOrigins(s0, assetId, without).has("ai")).toBe(false);
    const withJob = versionProvenances(s0, [job(ver.mediaPath)]);
    expect(assetOrigins(s0, assetId, withJob).has("ai")).toBe(true);
  });
});

describe("stilprofiler i biblioteket (REQ-0121)", () => {
  const withProfiles = (): ProjectState => {
    let s = mustApply(s0, {
      type: "CreateStyleProfile",
      profileId: tid<"style_profile">(),
      fields: {
        name: "Filmens visuelle stil",
        isDefault: true,
        guide: { ...emptyStyleGuide(), premise: "Maja feirer jul på Dovre", mood: "Lunt" },
      },
    } as never);
    const poster = tid<"style_profile">();
    s = mustApply(s, {
      type: "CreateStyleProfile",
      profileId: poster,
      fields: { name: "Plakatstil", isDefault: false, guide: emptyStyleGuide() },
    } as never);
    s = mustApply(s, {
      type: "SetStyleAppliesTo",
      profileId: poster,
      appliesTo: ["poster", "character"],
    } as never);
    return s;
  };

  it("standardprofilen først, med hva hver profil gjelder for og hvor utfylt den er", () => {
    const list = libraryStyleProfiles(withProfiles());
    expect(list.map((p) => [p.profile.name, p.isDefault, p.usesLabel, p.filled])).toEqual([
      ["Filmens visuelle stil", true, "Alt annet", 2],
      ["Plakatstil", false, "Karakterer, Plakater", 0],
    ]);
    expect(list[0]!.summary).toBe("Maja feirer jul på Dovre");
    expect(styleProfileMatches(list[0]!, "dovre")).toBe(true);
    expect(styleProfileMatches(list[1]!, "plakat")).toBe(true);
    expect(styleProfileMatches(list[1]!, "dovre")).toBe(false);
  });

  it("fjernede profiler vises ikke", () => {
    const s = withProfiles();
    const poster = Object.values(s.styleProfiles).find((p) => !p.isDefault)!;
    const t = mustApply(s, {
      type: "SetStyleProfileRemoved",
      profileId: poster.id,
      removed: true,
    } as never);
    expect(libraryStyleProfiles(t).map((p) => p.profile.name)).toEqual(["Filmens visuelle stil"]);
  });
});

/** En 2D-scene med et lag låst til dagens versjon, et stillbilde av samme versjon og en ny godkjent versjon. */
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
  const clip = filmClips(s, main.id)[0]!;
  const stillId = tid<"take">();
  for (const c of stillCommands(
    clip,
    { takeId: stillId, mediaRef: oldV.mediaPath, ms: 2000, mode: "replace", fps },
    () => tid<"clip_part">(),
  )!)
    s = mustApply(s, c as never);
  const before = s;
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
  return { before, s, layer, oldV, newId, stillId, assetId: layer.assetId!, clip };
}

describe("REQ-0022 – strukturell plassering og innholdsmessig grunnlag med ressursversjoner", () => {
  it("2D-scenen: låst lag er lagret grunnlag; et nytt godkjent bilde endrer det ikke", () => {
    const { s, layer, oldV, newId } = setup();
    const basis = compositionResourceBasis(s, layer.compositionId);
    const own = basis.find((b) => b.via === layer.id && b.source === "layer_locked")!;
    expect(own).toMatchObject({ versionId: oldV.id, number: oldV.number });
    expect(basis.some((b) => b.versionId === newId && b.via === layer.id)).toBe(false);
  });

  it("et lag som følger varianten, viser godkjent versjon og merkes «følger»", () => {
    const { s, layer, newId } = setup();
    const t = mustApply(s, {
      type: "UpdateLayers",
      layers: [
        { layerId: layer.id, fields: { ...layerFieldsOf(s.layers[layer.id]!), versionId: null } },
      ],
    } as never);
    const b = compositionResourceBasis(t, layer.compositionId).find((x) => x.via === layer.id)!;
    expect(b).toMatchObject({ source: "layer_follows", versionId: newId });
  });

  it("stillbilde: ressursversjonen er filen; importert film har ukjent ressursgrunnlag", () => {
    const { s, stillId, oldV, clip } = setup();
    expect(takeResourceBasis(s, s.takes[stillId]!)).toEqual([
      expect.objectContaining({ versionId: oldV.id, source: "still" }),
    ]);
    const filmId = tid<"take">();
    const t = mustApply(s, {
      type: "AddTake",
      takeId: filmId,
      occurrenceId: clip.occurrenceId,
      segmentId: null,
      kind: "imported_film",
      status: "approved",
      durationFrames: 48,
      mediaRef: `${s0.project.id}/films/${filmId}/film.mp4`,
      media: {
        fileName: "film.mp4",
        mimeType: "video/mp4",
        byteSize: 1,
        width: 1280,
        height: 720,
        fps: 24,
        durationMs: 2000,
        videoCodec: null,
        hasAudio: false,
      },
    } as never);
    expect(takeResourceBasis(t, t.takes[filmId]!)).toBe(null);
  });

  it("AI-video: ressursversjonene fra sporet til jobben", () => {
    const { s, oldV, clip } = setup();
    const takeId = tid<"take">();
    const path = `${s0.project.id}/films/${takeId}/ai-video.mp4`;
    const t = mustApply(s, {
      type: "AddTake",
      takeId,
      occurrenceId: clip.occurrenceId,
      segmentId: null,
      kind: "ai_video",
      status: "approved",
      durationFrames: 100,
      mediaRef: path,
    } as never);
    const j = job(path, {
      kind: "video",
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
    });
    expect(takeResourceBasis(t, t.takes[takeId]!, [j])).toEqual([
      expect.objectContaining({ versionId: oldV.id, source: "ai_reference" }),
    ]);
    expect(takeResourceBasis(t, t.takes[takeId]!, [])).toBe(null);
  });

  it("flytt og deaktivering endrer plasseringen, aldri grunnlaget (manuslinjer og ressursversjoner)", () => {
    const { s, stillId, layer } = setup();
    const occs = orderedOccurrences(s, main.id);
    const take = s.takes[stillId]!;
    const before = takeMaterialBasis(s, take);
    const compBefore = compositionMaterialBasis(s, layer.compositionId);
    let t = mustApply(s, {
      type: "MoveOccurrence",
      occurrenceId: take.occurrenceId,
      orderKey: occs.at(-1)!.orderKey + "z",
    } as never);
    t = mustApply(t, {
      type: "SetOccurrenceActive",
      occurrenceId: take.occurrenceId,
      active: false,
    } as never);
    const after = takeMaterialBasis(t, t.takes[stillId]!);
    expect(after.content).toEqual(before.content);
    expect(after.structure.occurrenceId).toBe(take.occurrenceId);
    expect(compositionMaterialBasis(t, layer.compositionId).content).toEqual(compBefore.content);
    expect(orderedOccurrences(t, main.id).map((o) => o.id)).not.toEqual(occs.map((o) => o.id));
  });

  it("scenen flagges når ressursen er oppdatert etter at den ble laget", () => {
    const { before, s, assetId, oldV, newId } = setup();
    expect(contentSyncByScene(before, main.id).size).toBe(0);
    const flags = contentSyncByScene(s, main.id, { assetId });
    expect(flags.size).toBeGreaterThan(0);
    const first = [...flags.values()][0]!;
    expect(first.assetIds).toEqual([assetId]);
    const text = contentSyncText(s, first);
    expect(text.startsWith(CONTENT_SYNC_FLAG)).toBe(true);
    expect(text).toContain(`v${oldV.number} → v${s.assetVersions[newId]!.number}`);
    expect(contentSyncByScene(s, main.id, { assetId: "finnes-ikke" }).size).toBe(0);
  });
});
