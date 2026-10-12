// @vitest-environment node
/** AI-video som ny versjon av scenen (DEC-0069, REQ-0180, REQ-0291). */
import { describe, expect, it } from "vitest";
import {
  CLAIM_GRACE_MS,
  aiUpdatePlan,
  sceneVideoWork,
  assembleSegments,
  assemblyUsesChosen,
  compositionOfVariant,
  chainStartPath,
  chooseAttemptCommands,
  videoAttempts,
  lastFramePath,
  takeIdFromLastFrame,
  keysEvenly,
  activeFilmTake,
  filmClips,
  latestVideoFor,
  mainProduction,
  orderedOccurrences,
  segmentVideoParts,
  takeIdFromResultPath,
  unclaimedVideoJobs,
  videoDurationFor,
  videoStartImages,
  type GenerationJob,
} from "@/core";
import { mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
// En scene uten segmenter til generering fra før
const occ = orderedOccurrences(s0, main.id).find(
  (o) => o.active && !Object.values(s0.segments).some((g) => g.occurrenceId === o.id),
)!;
const media = {
  fileName: "AI-video (runway).mp4",
  mimeType: "video/mp4",
  byteSize: 1000,
  width: 1280,
  height: 720,
  fps: 24,
  durationMs: 5000,
  videoCodec: null,
  hasAudio: false,
};

function withSegments(n: number) {
  const ids = Array.from({ length: n }, () => tid<"production_segment">());
  const keys = keysEvenly(n);
  const s = mustApply(s0, {
    type: "ReplaceSegments",
    occurrenceId: occ.id,
    reason: "model_limit",
    removeSegmentIds: Object.values(s0.segments)
      .filter((g) => g.occurrenceId === occ.id && g.reason === "model_limit")
      .map((g) => g.id),
    segments: ids.map((id, i) => ({
      segmentId: id,
      orderKey: keys[i]!,
      startBlockId: null,
      endBlockId: null,
      startMs: i * 4000,
      endMs: (i + 1) * 4000,
    })),
  } as never);
  return { s, ids };
}

function addVideo(s: typeof s0, segmentId: string | null, path?: string) {
  const takeId = tid<"take">();
  return {
    takeId,
    s: mustApply(s, {
      type: "AddTake",
      takeId,
      occurrenceId: occ.id,
      segmentId: segmentId as never,
      kind: "ai_video",
      status: "in_progress",
      durationFrames: 125,
      mediaRef: path ?? `${s0.project.id}/films/${takeId}/ai-video.mp4`,
      media,
    }),
  };
}

describe("AI-video", () => {
  it("legges til som egen versjon med filinformasjon og kan spilles som film", () => {
    const { s, takeId } = addVideo(s0, null);
    expect(s.takes[takeId]!.kind).toBe("ai_video");
    expect(s.takes[takeId]!.media?.durationMs).toBe(5000);
    expect(activeFilmTake(s, takeId)?.id).toBe(takeId);
    // 2D-scenen er uendret (REQ-0180)
    expect(s.compositions).toEqual(s0.compositions);
  });

  it("lengden modellen kan lage nærmest segmentet", () => {
    expect(videoDurationFor(3.2, [4, 6, 8])).toBe(4);
    expect(videoDurationFor(6.1, [4, 6, 8])).toBe(6);
    expect(videoDurationFor(6.5, [4, 6, 8])).toBe(8);
    expect(videoDurationFor(12, [5, 10])).toBe(10);
    expect(videoDurationFor(4.1, [])).toBe(4);
  });

  it("scenen settes sammen av segmentenes videoer i rekkefølge, klippet til segmentet", () => {
    const { s: s1, ids } = withSegments(2);
    expect(
      segmentVideoParts(
        s1,
        occ.id,
        ids.map((id, i) => ({ segmentId: id, startMs: i * 4000, endMs: (i + 1) * 4000 })),
        () => tid(),
      ),
    ).toBe(null);
    let s = addVideo(s1, ids[0]!).s;
    const second = addVideo(s, ids[1]!);
    s = second.s;
    const parts = segmentVideoParts(
      s,
      occ.id,
      ids.map((id, i) => ({ segmentId: id, startMs: i * 4000, endMs: (i + 1) * 4000 })),
      () => tid(),
    )!;
    expect(parts.map((p) => p.takeId)).toEqual([
      latestVideoFor(s, occ.id, ids[0]!)!.id,
      second.takeId,
    ]);
    expect(parts.every((p) => p.inMs === 0 && p.outMs === 4000)).toBe(true);
    const edited = mustApply(s, {
      type: "SetSceneEdit",
      occurrenceId: occ.id,
      activeTakeId: null,
      parts,
    });
    const clip = filmClips(edited, main.id).find((c) => c.occurrenceId === occ.id)!;
    expect(clip.parts.map((p) => p.take?.id)).toEqual(parts.map((p) => p.takeId));
  });

  it("ferdige videoer som ikke er lagt inn, finnes igjen; jobben bestemmer versjons-ID-en", () => {
    const takeId = tid<"take">();
    const path = `${s0.project.id}/films/${takeId}/ai-video.mp4`;
    expect(takeIdFromResultPath(path)).toBe(takeId);
    expect(takeIdFromResultPath(`${s0.project.id}/x/${takeId}/a.mp4`)).toBe(null);
    const old = new Date(Date.now() - CLAIM_GRACE_MS - 1000).toISOString();
    const job = {
      id: tid(),
      kind: "video",
      provider: "runway",
      model: "gen4_turbo",
      prompt: "p",
      assetId: null,
      status: "done",
      error: null,
      resultPath: path,
      resultText: null,
      createdAt: old,
      finishedAt: old,
      createdBy: "u",
      estimatedCost: null,
      occurrenceId: occ.id,
      segmentId: null,
    } as GenerationJob;
    expect(unclaimedVideoJobs(s0, [job], new Date())).toHaveLength(1);
    const { s } = addVideo(s0, null, path);
    expect(unclaimedVideoJobs(s, [job], new Date())).toHaveLength(0);
  });

  it("startbilder: bildene i scenens 2D-scene og godkjente bilder i scenen, uten dubletter", () => {
    const first = orderedOccurrences(s0, main.id)[0]!;
    const imgs = videoStartImages(s0, main.id, first.id);
    expect(imgs.length).toBeGreaterThan(0);
    expect(new Set(imgs.map((v) => v.id)).size).toBe(imgs.length);
    expect(imgs.every((v) => v.mimeType.startsWith("image/"))).toBe(true);
  });

  it("sammenheng: neste segment starter fra siste bilde i videoen til segmentet før", () => {
    const { s, ids } = withSegments(3);
    expect(chainStartPath(s, occ.id, ids, 0)).toBe(null);
    expect(chainStartPath(s, occ.id, ids, 1)).toBe(null);
    const v = addVideo(s, ids[0]!);
    const p = chainStartPath(v.s, occ.id, ids, 1);
    expect(p).toBe(`${s0.project.id}/films/${v.takeId}/last-frame.png`);
    expect(takeIdFromLastFrame(s0.project.id, p!)).toBe(v.takeId);
    expect(takeIdFromLastFrame("00000000-0000-7000-8000-000000000000", p!)).toBe(null);
    expect(chainStartPath(v.s, occ.id, ids, 2)).toBe(null);
    expect(lastFramePath("ugyldig/sti.mp4")).toBe(null);
    expect(takeIdFromLastFrame(s0.project.id, `${s0.project.id}/films/x/../last-frame.png`)).toBe(
      null,
    );
  });

  it("forsøk sammenlignes, og det valgte brukes for segmentet uten at andre slettes", () => {
    const { s, ids } = withSegments(2);
    const v1 = addVideo(s, ids[0]!);
    const v2 = addVideo(v1.s, ids[0]!);
    const v3 = addVideo(v2.s, ids[1]!);
    let st = v3.s;
    expect(videoAttempts(st, occ.id, ids[0]!).map((t) => t.id)).toEqual([v2.takeId, v1.takeId]);
    expect(videoAttempts(st, occ.id, null)).toHaveLength(3);
    // Nyeste brukes til ett er valgt
    expect(latestVideoFor(st, occ.id, ids[0]!)?.id).toBe(v2.takeId);
    for (const c of chooseAttemptCommands(st, v1.takeId)) st = mustApply(st, c as never);
    expect(latestVideoFor(st, occ.id, ids[0]!)?.id).toBe(v1.takeId);
    // Velg det andre: det første mister godkjenningen
    for (const c of chooseAttemptCommands(st, v2.takeId)) st = mustApply(st, c as never);
    expect(st.takes[v1.takeId]!.status).toBe("in_progress");
    expect(st.takes[v2.takeId]!.status).toBe("approved");
    expect(Object.keys(st.takes)).toEqual(
      expect.arrayContaining([v1.takeId, v2.takeId, v3.takeId]),
    );
    // Allerede valgt: ingen endring
    expect(chooseAttemptCommands(st, v2.takeId)).toEqual([]);
    // Andre segmenter berøres ikke
    expect(st.takes[v3.takeId]!.status).toBe("in_progress");
  });

  it("hybrid sammensetting: 2D-animatic der video mangler og for resten av korte videoer", () => {
    // Scenen med 2D-scene i fixturen
    const o = orderedOccurrences(s0, main.id).find(
      (x) => x.active && compositionOfVariant(s0, x.variantId),
    )!;
    const comp = compositionOfVariant(s0, o.variantId)!;
    const fps = s0.project.fps.num / s0.project.fps.den;
    const compMs = Math.round((comp.durationFrames / fps) * 1000);
    const step = Math.floor(compMs / 3);
    const ids = [0, 1, 2].map(() => tid<"production_segment">());
    const keys = keysEvenly(3);
    // Egne beskrivelser tilbakestilles, så inndelingen kan byttes
    let st = s0;
    for (const p of Object.values(s0.generationPrompts).filter(
      (x) => x.occurrenceId === o.id && !x.removed,
    ))
      st = mustApply(st, {
        type: "SetGenerationPrompt",
        promptId: p.id,
        occurrenceId: o.id,
        segmentId: p.segmentId,
        text: null,
        basedOn: "",
      } as never);
    st = mustApply(st, {
      type: "ReplaceSegments",
      occurrenceId: o.id,
      reason: "model_limit",
      removeSegmentIds: Object.values(st.segments)
        .filter((g) => g.occurrenceId === o.id && g.reason === "model_limit")
        .map((g) => g.id),
      segments: ids.map((id, i) => ({
        segmentId: id,
        orderKey: keys[i]!,
        startBlockId: null,
        endBlockId: null,
        startMs: i * step,
        endMs: (i + 1) * step,
      })),
    } as never);
    const takeId = tid<"take">();
    st = mustApply(st, {
      type: "AddTake",
      takeId,
      occurrenceId: o.id,
      segmentId: ids[0] as never,
      kind: "ai_video",
      status: "in_progress",
      durationFrames: 24,
      mediaRef: `${s0.project.id}/films/${takeId}/ai-video.mp4`,
      media: { ...media, durationMs: Math.max(100, step - 500) },
    });
    const segs = ids.map((id, i) => ({ segmentId: id, startMs: i * step, endMs: (i + 1) * step }));
    const pid = () => tid<"clip_part">();
    expect(assembleSegments(st, o.id, segs, pid, { fill: false })).toBe(null);
    const r = assembleSegments(st, o.id, segs, pid, { fill: true })!;
    expect(r.filledSegments).toBe(2);
    expect(r.paddedSegments).toBe(1);
    expect(r.parts.map((p) => p.source)).toEqual([
      "take",
      "composition",
      "composition",
      "composition",
    ]);
    expect(r.parts[1]).toMatchObject({ inMs: step - 500, outMs: step });
    expect(r.parts[3]).toMatchObject({ inMs: 2 * step, outMs: 3 * step });
    st = mustApply(st, {
      type: "SetSceneEdit",
      occurrenceId: o.id,
      activeTakeId: null,
      parts: r.parts,
    } as never);
    expect(assemblyUsesChosen(st, o.id, ids)).toBe(true);
    // Nytt forsøk for segment 1 blir valgt: sammensetningen er utdatert (REQ-0266)
    const t2 = tid<"take">();
    st = mustApply(st, {
      type: "AddTake",
      takeId: t2,
      occurrenceId: o.id,
      segmentId: ids[0] as never,
      kind: "ai_video",
      status: "approved",
      durationFrames: 24,
      mediaRef: `${s0.project.id}/films/${t2}/ai-video.mp4`,
      media,
    });
    expect(assemblyUsesChosen(st, o.id, ids)).toBe(false);
  });

  it("oppdatering med AI: bare segmentene endringen berører, og ingen ny video for notater", () => {
    const { s, ids } = withSegments(3);
    const v0 = addVideo(s, ids[0]!);
    const v2 = addVideo(v0.s, ids[2]!);
    const st = v2.s;
    const clip = filmClips(st, main.id).find((c) => c.occurrenceId === occ.id)!;
    const work = sceneVideoWork(st, main.id, clip);
    const inFirst = work.plan[0]!.blockIds[0];
    const inSecond = work.plan[1]!.blockIds[0];
    if (!inFirst || !inSecond) throw new Error("Fixturen mangler tekst i segment 1 og 2");
    const ch = (blockId: string, blockKind = "action") => ({ blockId, blockKind, kind: "changed" });
    const p1 = aiUpdatePlan(st, main.id, clip, [ch(inFirst)], [v0.takeId, v2.takeId]);
    expect(p1.segments).toEqual([0]);
    expect(p1.localOnly).toBe(false);
    // Segment 2 har ingen video: ingenting å oppdatere der
    expect(aiUpdatePlan(st, main.id, clip, [ch(inSecond)], []).segments).toEqual([]);
    // Bare notater: synes ikke i bildet
    expect(aiUpdatePlan(st, main.id, clip, [ch(inFirst, "note")], []).localOnly).toBe(true);
    // Fjernet linje uten plass i tiden: alle segmenter med video tas med
    expect(aiUpdatePlan(st, main.id, clip, [ch("finnes-ikke")], []).segments).toEqual([0, 2]);
  });
});
