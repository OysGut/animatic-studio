// @vitest-environment node
/**
 * Verifisering av krav (DEC-0074): versjonering i hele datamodellen (REQ-0304) – manus, ressurser, lyd,
 * scener og genereringer har versjoner eller revisjoner, og materialet peker på versjonen det ble laget fra.
 */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  audioVersion,
  discrepancies,
  filmClips,
  orderedOccurrences,
  scriptView,
  type AudioClipFields,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

function soundAsset(s: ProjectState) {
  const assetId = tid<"asset">();
  const variantId = tid<"asset_variant">();
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
  return { s, assetId, variantId };
}

function addVersion(s: ProjectState, assetId: string, variantId: string, file: string) {
  const versionId = tid<"asset_version">();
  return {
    versionId,
    s: mustApply(s, {
      type: "AddAssetVersion",
      versionId,
      variantId: variantId as never,
      media: {
        path: `${s.project.id}/${assetId}/${versionId}/${file}`,
        mimeType: "audio/wav",
        width: null,
        height: null,
        byteSize: 100,
        sha256: "b".repeat(64),
        durationMs: 2000,
      },
      note: "",
    }),
  };
}

describe("REQ-0304 – versjonering i hele datamodellen", () => {
  it("REQ-0304: manus – hver tekstendring blir en ny blokkrevisjon; tidligere tekst finnes fortsatt", () => {
    const seed = seedProject(1);
    const block = scriptView(seed.state, seed.mainId)[0]!.blocks.find(
      (b) => b.kind === "dialogue",
    )!;
    let s = seed.state;
    for (const text of ["Andre utgave", "Tredje utgave"])
      s = mustApply(s, {
        type: "EditBlockText",
        productionId: seed.mainId as never,
        blockId: block.id,
        text,
      });
    const revs = s.blockRevisions
      .filter((r) => r.blockId === block.id)
      .sort((a, b) => a.rev - b.rev);
    expect(revs.map((r) => r.text)).toEqual([block.text, "Andre utgave", "Tredje utgave"]);
    expect(s.blocks[block.id]!.currentRev).toBe(revs[revs.length - 1]!.rev);
    expect(s.blocks[block.id]!.revision).toBeGreaterThan(seed.state.blocks[block.id]!.revision);
  });

  it("REQ-0304: ressurser og lyd – nye versjoner kommer i tillegg; et lydklipp kan låses til én versjon", () => {
    const seed = seedProject(1);
    const occ = orderedOccurrences(seed.state, seed.mainId)[0]!.id;
    const a = soundAsset(seed.state);
    const v1 = addVersion(a.s, a.assetId, a.variantId, "vind-1.wav");
    const fields = (versionId: string | null): AudioClipFields => ({
      occurrenceId: occ,
      kind: "ambience",
      name: "Vind",
      assetId: a.assetId as never,
      assetVariantId: a.variantId as never,
      versionId: versionId as never,
      blockId: null,
      offsetMs: 0,
      sourceInMs: 0,
      lengthMs: 2000,
      gainDb: 0,
      fadeInMs: 0,
      fadeOutMs: 0,
      muted: false,
      continues: false,
      volumeKeys: [],
    });
    const locked = tid<"audio_clip">();
    const following = tid<"audio_clip">();
    let s = mustApply(v1.s, {
      type: "AddAudioClips",
      clips: [
        { clipId: locked, fields: fields(v1.versionId) },
        { clipId: following, fields: fields(null) },
      ],
    });
    const v2 = addVersion(s, a.assetId, a.variantId, "vind-2.wav");
    s = v2.s;
    // Begge versjonene finnes, med eget nummer
    const numbers = [v1.versionId, v2.versionId].map((id) => s.assetVersions[id]!.number);
    expect(new Set(numbers).size).toBe(2);
    // Det låste klippet bruker fortsatt versjon 1; det ulåste følger nyeste
    expect(audioVersion(s, s.audioClips[locked]!)?.id).toBe(v1.versionId);
    expect(audioVersion(s, s.audioClips[following]!)?.id).toBe(v2.versionId);
  });

  it("REQ-0304: scener og genereringer – materialet husker manusversjonen det ble laget fra, så avvik oppdages", () => {
    const seed = seedProject(2);
    const occ = orderedOccurrences(seed.state, seed.mainId)[1]!;
    const block = scriptView(seed.state, seed.mainId)[1]!.blocks.find(
      (b) => b.kind === "dialogue",
    )!;
    const takeId = tid<"take">();
    let s = mustApply(seed.state, {
      type: "AddTake",
      takeId,
      occurrenceId: occ.id,
      segmentId: null,
      kind: "ai_video",
      status: "approved",
      durationFrames: 100,
      mediaRef: `${seed.state.project.id}/films/${takeId}/ai-video.mp4`,
      media: {
        fileName: "ai.mp4",
        mimeType: "video/mp4",
        byteSize: 1,
        width: 1280,
        height: 720,
        fps: 24,
        durationMs: 4000,
        videoCodec: null,
        hasAudio: false,
      },
    });
    s = mustApply(s, { type: "SetActiveTake", occurrenceId: occ.id, takeId });
    // Genereringen peker på blokkrevisjonene den ble laget fra
    expect(s.takes[takeId]!.producedFrom.blockRevisions[block.id]).toBe(
      s.blocks[block.id]!.currentRev,
    );
    expect(discrepancies(s, filmClips(s, seed.mainId), { spans: false })).toEqual([]);
    // Scenehodet (scenevarianten) og replikken endres: nye revisjoner
    const variantRev = s.variants[occ.variantId]!.revision;
    s = mustApply(s, {
      type: "EditSceneHeading",
      productionId: seed.mainId as never,
      variantId: occ.variantId,
      heading: { intExt: "EXT.", location: "NYTT STED", time: "NATT" },
    });
    expect(s.variants[occ.variantId]!.revision).toBeGreaterThan(variantRev);
    s = mustApply(s, {
      type: "EditBlockText",
      productionId: seed.mainId as never,
      blockId: block.id,
      text: "Ny replikk",
    });
    // Genereringen er uendret (versjonen den ble laget fra står fast), og avviket oppdages
    expect(s.takes[takeId]!.producedFrom.blockRevisions[block.id]).toBeLessThan(
      s.blocks[block.id]!.currentRev,
    );
    const d = discrepancies(s, filmClips(s, seed.mainId), { spans: false });
    expect(d.map((x) => x.occurrenceId)).toContain(occ.id);
  });

  it("REQ-0304: revisjonene brukes til å stoppe endringer på utdaterte versjoner (ADR-0004)", () => {
    const seed = seedProject(1);
    const block = scriptView(seed.state, seed.mainId)[0]!.blocks[0]!;
    const base = { [block.id]: seed.state.blocks[block.id]!.revision };
    const s = mustApply(seed.state, {
      type: "EditBlockText",
      productionId: seed.mainId as never,
      blockId: block.id,
      text: "Endret av en annen",
    });
    const stale = applyCommand(
      s,
      envelope(
        {
          type: "EditBlockText",
          productionId: seed.mainId as never,
          blockId: block.id,
          text: "Min endring på gammel versjon",
        },
        undefined,
        base,
      ),
    );
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("revision_conflict");
  });
});
