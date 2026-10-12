/** Rådgivende kvalitetskontroll for AI-video (mandat 19.8, REQ-0287, REQ-0288, DEC-0071). */
import { describe, expect, it } from "vitest";
import {
  QUALITY_DISCLAIMER,
  filmClips,
  jobFromRow,
  keysEvenly,
  mainProduction,
  orderedOccurrences,
  sceneVideoWork,
  videoQualityChecks,
} from "@/core";
import { mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const occ = orderedOccurrences(s0, main.id).find(
  (o) => o.active && !Object.values(s0.segments).some((g) => g.occurrenceId === o.id),
)!;

function setup(mediaOver: Record<string, unknown> = {}) {
  const segId = tid<"production_segment">();
  let s = mustApply(s0, {
    type: "ReplaceSegments",
    occurrenceId: occ.id,
    reason: "model_limit",
    removeSegmentIds: [],
    segments: [
      {
        segmentId: segId,
        orderKey: keysEvenly(1)[0]!,
        startBlockId: null,
        endBlockId: null,
        startMs: 0,
        endMs: 6000,
      },
    ],
  } as never);
  const takeId = tid<"take">();
  s = mustApply(s, {
    type: "AddTake",
    takeId,
    occurrenceId: occ.id,
    segmentId: segId,
    kind: "ai_video",
    status: "in_progress",
    durationFrames: 150,
    mediaRef: `${s0.project.id}/films/${takeId}/ai-video.mp4`,
    media: {
      fileName: "v.mp4",
      mimeType: "video/mp4",
      byteSize: 10,
      width: s0.project.frameWidth,
      height: s0.project.frameHeight,
      fps: 24,
      durationMs: 6000,
      videoCodec: null,
      hasAudio: true,
      ...mediaOver,
    },
  } as never);
  const clip = filmClips(s, main.id).find((c) => c.occurrenceId === occ.id)!;
  return { s, clip, take: s.takes[takeId]! };
}

describe("kvalitetskontroll", () => {
  it("gir én vurdering per kriterium, og ukjent der beskrivelsen ikke er kjent", () => {
    const { s, clip, take } = setup();
    const checks = videoQualityChecks(s, main.id, clip, take, null);
    expect(checks.map((c) => c.criterion)).toEqual([
      "script",
      "characters",
      "style",
      "continuity",
      "camera",
      "technical",
    ]);
    expect(checks.find((c) => c.criterion === "script")!.status).toBe("unknown");
    expect(checks.find((c) => c.criterion === "technical")!.status).toBe("ok");
    expect(QUALITY_DISCLAIMER).toMatch(/Rådgivende/);
  });

  it("merker manglende replikker, manglende startbilde og feil format", () => {
    const { s, clip, take } = setup({ width: 720, height: 1280, durationMs: 3000 });
    const work = sceneVideoWork(s, main.id, clip);
    const job = jobFromRow({
      id: "j",
      kind: "video",
      provider: "runway",
      model: "gen4_turbo",
      prompt: "Animated film shot.",
      status: "done",
      created_at: "2026-10-12T10:00:00Z",
      created_by: "u",
      reference_path: null,
    });
    const checks = videoQualityChecks(s, main.id, clip, take, job);
    const hasDialogue = work.plan[0]!.blockIds.some((id) => s.blocks[id]?.kind === "dialogue");
    if (hasDialogue) expect(checks.find((c) => c.criterion === "script")!.status).toBe("warn");
    expect(checks.find((c) => c.criterion === "characters")!.status).toBe("warn");
    const tech = checks.find((c) => c.criterion === "technical")!;
    expect(tech.status).toBe("warn");
    expect(tech.text).toMatch(/kortere/);
    expect(tech.text).toMatch(/format/);
  });
});
