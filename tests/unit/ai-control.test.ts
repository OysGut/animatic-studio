// @vitest-environment node
/**
 * M5 del 2 (DEC-0053): AI-budsjett, forbruk, jobbstatus, inndeling i segmenter, automatisk beskrivelse og
 * egne beskrivelser som ikke forsvinner.
 */
import { describe, expect, it } from "vitest";
import {
  aiUsage,
  monthStartUtc,
  jobEffort,
  applyCommand,
  blocksOfVariant,
  buildScenePrompt,
  diffStates,
  filmClips,
  jobState,
  mainProduction,
  missingDialogue,
  planSegments,
  samePlan,
  segmentDialogue,
  segmentTimes,
  stateFromRows,
  keysEvenly,
  type Command,
  type GenerationJob,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const job = (over: Partial<GenerationJob>): GenerationJob => ({
  id: tid(),
  kind: "image",
  provider: "lovable",
  model: "m",
  prompt: "p",
  assetId: null,
  status: "done",
  error: null,
  resultPath: null,
  resultText: null,
  createdAt: "2026-10-05T10:00:00.000Z",
  finishedAt: null,
  createdBy: "u",
  estimatedCost: 2,
  occurrenceId: null,
  segmentId: null,
  ...over,
});

function fails(s: ProjectState, c: Command) {
  const r = applyCommand(s, envelope(c));
  expect(r.ok).toBe(false);
  return r.ok ? null : r.error;
}

describe("AI-budsjett og forbruk", () => {
  it("teller denne månedens jobber som ikke feilet, med anslått kostnad", () => {
    const now = new Date("2026-10-11T12:00:00Z");
    const u = aiUsage(
      { aiMonthLimit: 5, aiPricePerImage: 2 },
      [
        job({}),
        job({ status: "failed" }),
        job({ status: "running", estimatedCost: null }),
        job({ createdAt: "2026-09-30T23:00:00.000Z" }),
      ],
      monthStartUtc(now),
    );
    expect(u).toMatchObject({
      used: 2,
      limit: 5,
      remaining: 3,
      estimatedCost: 2,
      partlyUnknown: true,
      nextCost: 2,
    });
    expect(aiUsage({}, [], monthStartUtc(now))).toMatchObject({
      used: 0,
      limit: null,
      remaining: null,
      estimatedCost: null,
    });
  });

  it("innsatsnivået lagres med jobben (REQ-0275)", () => {
    expect(jobEffort(job({ params: { effort: "premium" } }))).toBe("premium");
    expect(jobEffort(job({}))).toBeNull();
    expect(jobEffort(job({ params: { effort: "x" } }))).toBeNull();
  });

  it("summerer API-kostnaden med egne nøkler denne måneden (REQ-0405, DEC-0075)", () => {
    const now = new Date("2026-10-11T12:00:00Z");
    const u = aiUsage(
      {},
      [
        job({ costUsd: 0.4 }),
        job({ kind: "prompt", costUsd: 0.01 }),
        job({ status: "failed", costUsd: 5 }),
        job({ createdAt: "2026-09-30T23:00:00.000Z", costUsd: 7 }),
        job({ costUsd: null }),
        job({ status: "queued", costUsd: 3 }),
      ],
      monthStartUtc(now),
    );
    expect(u.costUsd).toBeCloseTo(0.41);
    expect(aiUsage({}, [job({})], monthStartUtc(now)).costUsd).toBeNull();
  });

  it("en jobb som har stått som «pågår» lenge, er stoppet underveis", () => {
    const now = new Date("2026-10-11T12:00:00Z");
    expect(jobState(job({ status: "running", createdAt: "2026-10-11T11:55:00Z" }), now)).toBe(
      "running",
    );
    expect(jobState(job({ status: "running", createdAt: "2026-10-11T11:00:00Z" }), now)).toBe(
      "stale",
    );
    expect(jobState(job({ status: "failed" }), now)).toBe("failed");
  });

  it("SetAiBudget lagres på prosjektet, kan angres og leses tilbake fra databaseradene", () => {
    const { aiMonthLimit: _l, aiPricePerImage: _p, ...plain } = fixture.state.project;
    const start: ProjectState = { ...fixture.state, project: plain };
    let s = start;
    const r = applyCommand(
      s,
      envelope({ type: "SetAiBudget", monthLimit: 40, pricePerImage: 1.234 }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    expect(s.project).toMatchObject({ aiMonthLimit: 40, aiPricePerImage: 1.23 });
    const ch = diffStates(start, s);
    expect(ch.updates["projects"]?.[0]).toMatchObject({
      ai_month_limit: 40,
      ai_price_per_image: 1.23,
    });
    const back = mustApply(s, r.inverse);
    expect(back.project.aiMonthLimit).toBeUndefined();
    expect(diffStates(s, back).updates["projects"]?.[0]).toMatchObject({
      ai_month_limit: null,
      ai_price_per_image: null,
    });
    fails(s, { type: "SetAiBudget", monthLimit: -1, pricePerImage: null });
    fails(s, { type: "SetAiBudget", monthLimit: 1.5, pricePerImage: null });
    const empty = {
      productions: [],
      scenes: [],
      scene_variants: [],
      script_blocks: [],
      script_block_revisions: [],
      scene_occurrences: [],
      production_segments: [],
      takes: [],
    };
    const rows = {
      ...empty,
      project: {
        id: tid(),
        revision: 1,
        name: "P",
        fps_num: 25,
        fps_den: 1,
        ai_month_limit: 12,
        ai_price_per_image: "0.5",
      },
    };
    expect(stateFromRows(rows as never).project).toMatchObject({
      aiMonthLimit: 12,
      aiPricePerImage: 0.5,
    });
  });
});

function scene() {
  const s = fixture.state;
  const main = mainProduction(s)!;
  // En scene med replikker og uten inndeling fra før (fixturen har inndeling i scene 1)
  const clip = filmClips(s, main.id).find(
    (c) =>
      blocksOfVariant(s, c.variantId).some((b) => b.kind === "dialogue") &&
      !Object.values(s.segments).some((g) => g.occurrenceId === c.occurrenceId),
  )!;
  return { s, main, clip };
}

describe("inndeling i segmenter (REQ-0260/0267)", () => {
  it("segmentene følger blokkene, dekker hele scenen og endrer ikke manuset", () => {
    const { s, clip } = scene();
    const total = Math.round((clip.durationFrames / 25) * 1000);
    for (const max of [3, 5, 10, 60]) {
      const plan = planSegments(s, clip, max);
      expect(plan[0]!.startMs).toBe(0);
      expect(plan[plan.length - 1]!.endMs).toBe(total);
      for (let i = 1; i < plan.length; i++) expect(plan[i]!.startMs).toBe(plan[i - 1]!.endMs);
      // Alle blokker er med, i rekkefølge
      const ids = [...new Set(plan.flatMap((p) => p.blockIds))];
      const order = blocksOfVariant(s, clip.variantId)
        .filter((b) => b.kind !== "heading")
        .map((b) => b.id);
      expect(ids).toEqual(order);
    }
    expect(planSegments(s, clip, 60)).toHaveLength(Math.max(1, Math.ceil(total / 60000)));
  });

  it("lagrede segmenter gir samme tider som forslaget", () => {
    const { s, clip } = scene();
    const plan = planSegments(s, clip, 3);
    const times = segmentTimes(s, clip, plan);
    expect(samePlan(plan, times)).toBe(true);
    times.forEach((t, i) => {
      expect(Math.abs(t.startMs - plan[i]!.startMs)).toBeLessThanOrEqual(1);
      expect(Math.abs(t.endMs - plan[i]!.endMs)).toBeLessThanOrEqual(1);
    });
  });
});

describe("automatisk beskrivelse (REQ-0244–0249)", () => {
  it("er på engelsk, tar med replikkene ordrett og beskriver kontinuitet", () => {
    const { s, main, clip } = scene();
    const plan = planSegments(s, clip, 3);
    const p = buildScenePrompt(s, {
      clip,
      productionId: main.id,
      segment: plan[1] ?? plan[0]!,
      index: 1,
      count: Math.max(2, plan.length),
    });
    expect(p).toMatch(/Animated film shot for "/);
    expect(p).toMatch(/Continuity: start exactly where the previous segment ended/);
    expect(p).toMatch(/No on-screen text/);
    const whole = buildScenePrompt(s, {
      clip,
      productionId: main.id,
      segment: planSegments(s, clip, 120)[0]!,
      index: 0,
      count: 1,
    });
    expect(whole).toContain("«Hører du det? Det er noen ute i mørket.»");
    expect(whole).toContain("(hvisker): «Bare vinden.");
    expect(whole).toMatch(/word for word — do not translate/);
    expect(whole).not.toMatch(/Continuity:/);
    const dlg = segmentDialogue(s, clip.variantId, planSegments(s, clip, 120)[0]!.blockIds);
    expect(missingDialogue(whole, dlg)).toEqual([]);
    expect(missingDialogue("Something else", dlg)).toHaveLength(dlg.length);
  });
});

describe("egne beskrivelser (REQ-0252/0253/0256)", () => {
  function withSegments() {
    const { s, clip } = scene();
    const plan = planSegments(s, clip, 3);
    const keys = keysEvenly(plan.length);
    const segs = plan.map((p, i) => ({
      segmentId: tid<"production_segment">(),
      orderKey: keys[i]!,
      startBlockId: null,
      startMs: p.startMs,
      endMs: p.endMs,
      endBlockId: null,
    }));
    const s1 = mustApply(s, {
      type: "ReplaceSegments",
      occurrenceId: clip.occurrenceId,
      reason: "model_limit",
      removeSegmentIds: [],
      segments: segs,
    });
    return { s: s1, clip, segs };
  }

  it("lagres, endres, tilbakestilles og angres; forsvinner ikke ved ny inndeling", () => {
    const { s: s1, clip, segs } = withSegments();
    const promptId = tid<"generation_prompt">();
    const r = applyCommand(
      s1,
      envelope({
        type: "SetGenerationPrompt",
        promptId,
        occurrenceId: clip.occurrenceId,
        segmentId: segs[0]!.segmentId,
        text: "  My own words  ",
        basedOn: "auto",
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s2 = r.state;
    expect(s2.generationPrompts[promptId]).toMatchObject({
      text: "My own words",
      basedOn: "auto",
      removed: false,
    });
    // Ny inndeling avvises så lenge segmentet har en egen beskrivelse
    const e = fails(s2, {
      type: "ReplaceSegments",
      occurrenceId: clip.occurrenceId,
      reason: "model_limit",
      removeSegmentIds: segs.map((g) => g.segmentId),
      segments: [],
    });
    expect(e?.code).toBe("referenced");
    // Tilbakestill til automatisk, så kan inndelingen endres
    const s3 = mustApply(s2, {
      type: "SetGenerationPrompt",
      promptId,
      occurrenceId: clip.occurrenceId,
      segmentId: segs[0]!.segmentId,
      text: null,
      basedOn: "",
    });
    expect(s3.generationPrompts[promptId]!.removed).toBe(true);
    const r4 = applyCommand(
      s3,
      envelope({
        type: "ReplaceSegments",
        occurrenceId: clip.occurrenceId,
        reason: "model_limit",
        removeSegmentIds: segs.map((g) => g.segmentId),
        segments: [
          {
            segmentId: tid<"production_segment">(),
            orderKey: keysEvenly(1)[0]!,
            startBlockId: null,
            endBlockId: null,
            startMs: 0,
            endMs: 1000,
          },
        ],
      }),
    );
    expect(r4.ok).toBe(true);
    if (!r4.ok) return;
    expect(r4.state.generationPrompts[promptId]).toBeUndefined();
    const ch = diffStates(s3, r4.state);
    expect(ch.deletes["generation_prompts"]).toHaveLength(1);
    expect(ch.deletes["production_segments"]).toHaveLength(segs.length);
    // Angre gir de gamle segmentene tilbake
    const back = mustApply(r4.state, r4.inverse);
    expect(segs.every((g) => back.segments[g.segmentId])).toBe(true);
    // Angre av den første beskrivelsen fjerner den igjen
    const undone = mustApply(s2, r.inverse);
    expect(undone.generationPrompts[promptId]!.removed).toBe(true);
  });

  it("avviser beskrivelser for segmenter i en annen scene og to aktive beskrivelser per segment", () => {
    const { s: s1, clip, segs } = withSegments();
    const other = Object.values(s1.occurrences).find((o) => o.id !== clip.occurrenceId)!;
    fails(s1, {
      type: "SetGenerationPrompt",
      promptId: tid(),
      occurrenceId: other.id,
      segmentId: segs[0]!.segmentId,
      text: "x",
      basedOn: "",
    });
    const s2 = mustApply(s1, {
      type: "SetGenerationPrompt",
      promptId: tid(),
      occurrenceId: clip.occurrenceId,
      segmentId: segs[0]!.segmentId,
      text: "x",
      basedOn: "",
    });
    fails(s2, {
      type: "SetGenerationPrompt",
      promptId: tid(),
      occurrenceId: clip.occurrenceId,
      segmentId: segs[0]!.segmentId,
      text: "y",
      basedOn: "",
    });
    fails(s2, {
      type: "SetGenerationPrompt",
      promptId: tid(),
      occurrenceId: clip.occurrenceId,
      segmentId: segs[0]!.segmentId,
      text: "x".repeat(8001),
      basedOn: "",
    });
  });
});

describe("rettelser etter gjennomgang (DEC-0053)", () => {
  it("inndelingen hindrer ikke redigering av manuset, og nye replikker kommer med", () => {
    const { s, main, clip } = scene();
    const plan = planSegments(s, clip, 3);
    const keys = keysEvenly(plan.length);
    const s1 = mustApply(s, {
      type: "ReplaceSegments",
      occurrenceId: clip.occurrenceId,
      reason: "model_limit",
      removeSegmentIds: [],
      segments: plan.map((p, i) => ({
        segmentId: tid<"production_segment">(),
        orderKey: keys[i]!,
        startBlockId: null,
        endBlockId: null,
        startMs: p.startMs,
        endMs: p.endMs,
      })),
    });
    const dlg = blocksOfVariant(s1, clip.variantId).find((b) => b.kind === "dialogue")!;
    const r = applyCommand(
      s1,
      envelope({ type: "RemoveBlock", productionId: main.id as never, blockId: dlg.id }),
    );
    expect(r.ok).toBe(true);
    // Alle blokker er med i en av de lagrede segmentene
    const stored = Object.values(s1.segments)
      .filter((g) => g.occurrenceId === clip.occurrenceId)
      .sort((a, b) => (a.orderKey < b.orderKey ? -1 : 1));
    const times = segmentTimes(s1, clip, stored);
    const all = blocksOfVariant(s1, clip.variantId)
      .filter((b) => b.kind !== "heading")
      .map((b) => b.id);
    expect([...new Set(times.flatMap((t) => t.blockIds))].sort()).toEqual([...all].sort());
  });

  it("en ny inndeling med en utdatert liste over segmenter avvises (samtidige endringer)", () => {
    const { s, clip } = scene();
    const mk = () => ({
      segmentId: tid<"production_segment">(),
      orderKey: keysEvenly(1)[0]!,
      startBlockId: null,
      endBlockId: null,
      startMs: 0,
      endMs: 1000,
    });
    const s1 = mustApply(s, {
      type: "ReplaceSegments",
      occurrenceId: clip.occurrenceId,
      reason: "model_limit",
      removeSegmentIds: [],
      segments: [mk()],
    });
    const e = fails(s1, {
      type: "ReplaceSegments",
      occurrenceId: clip.occurrenceId,
      reason: "model_limit",
      removeSegmentIds: [],
      segments: [mk()],
    });
    expect(e?.code).toBe("revision_conflict");
    // Segmenter til generering må ha tid
    const seg = Object.values(s1.segments).find((g) => g.occurrenceId === clip.occurrenceId)!;
    fails(s1, {
      type: "ReplaceSegments",
      occurrenceId: clip.occurrenceId,
      reason: "model_limit",
      removeSegmentIds: [seg.id],
      segments: [{ ...mk(), startMs: undefined as never, endMs: undefined as never }],
    });
  });

  it("segmenter uten blokker deler scenen likt; tidskoblinger i uorden gir ikke negative tider", () => {
    const { s, clip } = scene();
    const even = segmentTimes(s, clip, [{}, {}, {}]);
    expect(even.map((x) => x.endMs - x.startMs).every((d) => d > 0)).toBe(true);
    expect(even[0]!.startMs).toBe(0);
    for (const max of [1, 2, 7])
      for (const p of planSegments(s, clip, max)) expect(p.endMs).toBeGreaterThan(p.startMs);
  });
});
