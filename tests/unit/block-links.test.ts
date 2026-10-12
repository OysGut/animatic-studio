/** Replikkens koblinger (DEC-0072, REQ-0095/0099): opptak, tidspunkt, 2D-hendelse og filmklipp. */
import { describe, expect, it } from "vitest";
import {
  blockLinks,
  blocksOfVariant,
  compositionOfVariant,
  mainProduction,
  orderedOccurrences,
} from "@/core";
import { mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const occ = orderedOccurrences(s0, main.id).find(
  (o) => o.active && compositionOfVariant(s0, o.variantId),
)!;
const blocks = blocksOfVariant(s0, occ.variantId).filter((b) => b.kind !== "heading");
const line = blocks.find((b) => b.kind === "dialogue") ?? blocks[0]!;
const sound = Object.values(s0.assets).find((a) => a.kind === "sound")!;
const layer = Object.values(s0.layers).find(
  (l) => l.compositionId === compositionOfVariant(s0, occ.variantId)!.id && !l.removed,
)!;

describe("koblinger for en manuslinje", () => {
  it("alle fire typer vises; andre linjer og fjernede koblinger er ikke med", () => {
    const before = blockLinks(s0, line.id, main.id);
    const audioId = tid<"audio_clip">();
    const timeId = tid<"time_link">();
    const eventId = tid<"time_link">();
    const takeId = tid<"take">();
    let s = mustApply(s0, {
      type: "AddAudioClips",
      clips: [
        {
          clipId: audioId,
          fields: {
            occurrenceId: occ.id,
            kind: "dialogue",
            name: "Maja – opptak",
            assetId: sound.id,
            assetVariantId: null,
            versionId: null,
            blockId: line.id,
            offsetMs: 500,
            sourceInMs: 0,
            lengthMs: 1000,
            gainDb: 0,
            fadeInMs: 0,
            fadeOutMs: 0,
            muted: false,
            continues: false,
            volumeKeys: [],
          },
        },
      ],
    } as never);
    s = mustApply(s, {
      type: "AddTimeLinks",
      links: [
        {
          linkId: timeId,
          fields: { occurrenceId: occ.id, blockId: line.id, startMs: 400, endMs: null },
        },
        {
          linkId: eventId,
          fields: {
            occurrenceId: occ.id,
            blockId: line.id,
            startMs: 800,
            endMs: null,
            layerId: layer.id,
          },
        },
      ],
    } as never);
    s = mustApply(s, {
      type: "AddTake",
      takeId,
      occurrenceId: occ.id,
      segmentId: null,
      kind: "imported_film",
      status: "approved",
      durationFrames: 100,
      mediaRef: `${s0.project.id}/films/${takeId}/f.mp4`,
      media: {
        fileName: "f.mp4",
        mimeType: "video/mp4",
        byteSize: 1,
        width: 1920,
        height: 1080,
        fps: 25,
        durationMs: 4000,
        videoCodec: null,
        hasAudio: true,
      },
    } as never);
    const l = blockLinks(s, line.id, main.id);
    expect(l.recordings).toHaveLength(before.recordings.length + 1);
    expect(l.recordings.map((a) => a.id)).toContain(audioId);
    expect(l.times.map((t) => t.id)).toContain(timeId);
    expect(l.events.map((e) => e.link.id)).toContain(eventId);
    expect(l.events.find((e) => e.link.id === eventId)!.layerName).toBe(layer.name);
    expect(l.films.find((f) => f.take.id === takeId)?.how).toBe("scene");
    // Med manusdekning som ikke omfatter linjen, er filmen ikke koblet
    const other = blocks.find((b) => b.id !== line.id)!;
    const narrowed = mustApply(s, {
      type: "SetTakeCoverage",
      takeId,
      coverage: { startBlockId: other.id, endBlockId: other.id },
    } as never);
    expect(blockLinks(narrowed, line.id, main.id).films.some((f) => f.take.id === takeId)).toBe(
      false,
    );
    expect(
      blockLinks(narrowed, other.id, main.id).films.find((f) => f.take.id === takeId)?.how,
    ).toBe("coverage");
    // Fjernede koblinger vises ikke
    const removed = mustApply(s, {
      type: "SetTimeLinksRemoved",
      linkIds: [timeId],
      removed: true,
    } as never);
    expect(blockLinks(removed, line.id, main.id).times.some((t) => t.id === timeId)).toBe(false);
  });
});
