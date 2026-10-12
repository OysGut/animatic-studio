// @vitest-environment node
/** Bakgrunnskøen for AI-video (DEC-0070, REQ-0291, REQ-0293, REQ-0504). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  filmClips,
  jobFromRow,
  jobProgress,
  mainProduction,
  queueOrder,
  sceneVideoWork,
  type GenerationJob,
} from "@/core";
import { encryptKey } from "@/adapters/ai/key-vault.server";
import {
  MAX_PARALLEL_PER_KEY,
  followUpRunningVideoJobs,
  markStoppedSyncJobs,
  pumpVideoQueue,
  resolveChain,
} from "@/adapters/ai/video-followup.server";
import type { AnyClient } from "@/adapters/storage/project-rows";
import { fakeDb } from "../helpers/fake-supabase";
import { fixture } from "../visual/fixture-state";

const P = "00000000-0000-7000-8000-0000000000p1".replace("p", "a");
const KEY_ID = "00000000-0000-7000-8000-00000000c001";
const OWNER = "00000000-0000-7000-8000-00000000u001".replace("u", "b");

describe("bakgrunnskøen følger opp videojobber uten åpen fane", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-secret");
    vi.stubEnv("ANIMATIC_KEY_ENCRYPTION_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("henter ferdige videoer til lagringen, stopper jobber som aldri startet, lar resten gå", async () => {
    const sealed = await encryptKey("key_runway_1234567890", {
      userId: OWNER,
      provider: "runway",
      rowId: KEY_ID,
    });
    const now = Date.now();
    const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
    const job = (id: string, extra: Record<string, unknown>) => ({
      id,
      project_id: P,
      kind: "video",
      provider: "runway",
      model: "gen4_turbo",
      status: "running",
      external_id: null,
      provider_key_id: KEY_ID,
      result_path: null,
      created_at: iso(60_000),
      ...extra,
    });
    const db = fakeDb({
      generation_jobs: [
        job("00000000-0000-7000-8000-00000000j001".replace("j", "d"), {
          external_id: "task-ferdig",
        }),
        job("00000000-0000-7000-8000-00000000j002".replace("j", "d"), {
          created_at: iso(20 * 60_000),
        }),
        job("00000000-0000-7000-8000-00000000j003".replace("j", "d"), {
          external_id: "task-pagar",
        }),
      ],
      ai_provider_keys: [
        {
          id: KEY_ID,
          user_id: OWNER,
          provider: "runway",
          ciphertext: sealed.ciphertext,
          iv: sealed.iv,
          key_version: sealed.version,
        },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/tasks/task-ferdig"))
          return new Response(
            JSON.stringify({ status: "SUCCEEDED", output: ["https://cdn.example.com/v.mp4"] }),
          );
        if (url.endsWith("/tasks/task-pagar"))
          return new Response(JSON.stringify({ status: "RUNNING", progress: 0.4 }));
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          headers: { "content-type": "video/mp4" },
        });
      }),
    );
    const r = await followUpRunningVideoJobs(db as unknown as AnyClient);
    expect(r).toEqual({ checked: 3, done: 1, failed: 1, running: 1 });
    expect(db.uploads).toHaveLength(1);
    expect(db.uploads[0]!.path).toMatch(new RegExp(`^${P}/films/[0-9a-f-]+/ai-video\\.mp4$`));
    const rows = (await db.from("generation_jobs").select("*")) as unknown as {
      data: { status: string; result_path: string | null }[];
    };
    expect(rows.data.map((x) => x.status)).toEqual(["done", "failed", "running"]);
    expect(rows.data[0]!.result_path).toBe(db.uploads[0]!.path);
  });

  it("stopper innenfor tidsbudsjettet", async () => {
    let t = 0;
    const db = fakeDb({
      generation_jobs: [1, 2, 3].map((n) => ({
        id: `00000000-0000-7000-8000-00000000000${n}`,
        project_id: P,
        kind: "video",
        status: "running",
        external_id: null,
        created_at: new Date().toISOString(),
      })),
    });
    const r = await followUpRunningVideoJobs(db as unknown as AnyClient, {
      budgetMs: 10,
      now: () => (t += 6),
    });
    expect(r.checked).toBeLessThan(3);
  });

  it("bilde- og lydjobber uten svar etter 15 minutter merkes som stoppet", async () => {
    const t = Date.parse("2026-10-12T10:00:00Z");
    const db = fakeDb({
      generation_jobs: [
        { id: "a", kind: "image", status: "running", created_at: "2026-10-12T09:30:00.000Z" },
        { id: "b", kind: "sound", status: "running", created_at: "2026-10-12T09:55:00.000Z" },
        { id: "c", kind: "video", status: "running", created_at: "2026-10-12T08:00:00.000Z" },
        { id: "d", kind: "image", status: "done", created_at: "2026-10-12T08:00:00.000Z" },
      ],
    });
    expect(await markStoppedSyncJobs(db as unknown as AnyClient, t)).toBe(1);
    const { data } = (await db.from("generation_jobs").select("*")) as unknown as {
      data: { id: string; status: string }[];
    };
    expect(data.map((r) => r.status)).toEqual(["lost", "running", "running", "done"]);
  });

  it("uten bakgrunnsjobb merker nettleseren bare sitt eget prosjekt (DEC-0073)", async () => {
    const t = Date.parse("2026-10-12T10:00:00Z");
    const db = fakeDb({
      generation_jobs: [
        {
          id: "a",
          project_id: "p1",
          kind: "image",
          status: "running",
          created_at: "2026-10-12T09:30:00.000Z",
        },
        {
          id: "b",
          project_id: "p2",
          kind: "image",
          status: "running",
          created_at: "2026-10-12T09:30:00.000Z",
        },
      ],
    });
    expect(await markStoppedSyncJobs(db as unknown as AnyClient, t, "p1")).toBe(1);
    const { data } = (await db.from("generation_jobs").select("*")) as unknown as {
      data: { id: string; status: string }[];
    };
    expect(data.map((r) => r.status)).toEqual(["lost", "running"]);
  });
});

describe("køen: rekkefølge, plass og fremdrift", () => {
  const j = (id: string, extra: Record<string, unknown>): GenerationJob =>
    jobFromRow({
      id,
      kind: "video",
      provider: "runway",
      model: "gen4_turbo",
      prompt: "x",
      status: "queued",
      created_at: "2026-10-12T10:00:00Z",
      created_by: "u",
      ...extra,
    });

  it("høy prioritet først, så rekkefølgen de ble lagt i kø", () => {
    const jobs = [
      j("a", { priority: 2, queue_position: 1 }),
      j("b", { priority: 1, queue_position: 5 }),
      j("c", { priority: 2, queue_position: 0 }),
      j("d", { priority: 3, queue_position: 0 }),
      j("e", { status: "running" }),
    ];
    expect(queueOrder(jobs).map((x) => x.id)).toEqual(["b", "c", "a", "d"]);
    expect(jobProgress(jobs[0]!, 0, jobs).label).toBe("I kø – nummer 3");
  });

  it("leverandørens fremdrift brukes når den finnes; ellers et anslag som sier at det er et anslag", () => {
    const t0 = Date.parse("2026-10-12T10:00:00Z");
    const reported = j("r", {
      status: "running",
      progress: 0.4,
      started_at: "2026-10-12T10:00:00Z",
    });
    expect(jobProgress(reported, t0 + 1000)).toMatchObject({ fraction: 0.4, reported: true });
    const guess = j("g", { status: "running", started_at: "2026-10-12T10:00:00Z" });
    const p = jobProgress(guess, t0 + 30_000);
    expect(p.reported).toBe(false);
    expect(p.label).toMatch(/^Anslag/);
    expect(jobProgress(guess, t0 + 60 * 60_000).label).toMatch(/lengre tid enn vanlig/);
  });
});

describe("køen sender jobber når det er ledig plass", () => {
  it("høyst tre samtidig per nøkkel; en jobb sendes bare én gang", async () => {
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < 2; i++)
      rows.push({
        id: `run-${i}`,
        project_id: "p1",
        kind: "video",
        status: "running",
        provider_key_id: "k1",
      });
    for (let i = 0; i < 4; i++)
      rows.push({
        id: `q-${i}`,
        project_id: "p1",
        kind: "video",
        status: "queued",
        provider_key_id: "k1",
        provider: "runway",
        model: "gen4_turbo",
        prompt: "p",
        reference_path: null,
        params: { seconds: 5 },
      });
    rows.push({
      id: "q-other",
      project_id: "p1",
      kind: "video",
      status: "queued",
      provider_key_id: null,
      provider: "runway",
      model: "gen4_turbo",
      prompt: "p",
      params: {},
    });
    rows.push({
      id: "q-deleted",
      project_id: "p2",
      kind: "video",
      status: "queued",
      provider_key_id: "k1",
      provider: "runway",
      model: "gen4_turbo",
      prompt: "p",
      params: {},
    });
    const db = fakeDb({
      generation_jobs: rows,
      ai_provider_keys: [],
      projects: [
        { id: "p1", deleted_at: null },
        { id: "p2", deleted_at: "2026-10-01T00:00:00Z" },
      ],
    });
    // Nøklene finnes ikke i den falske databasen: jobben som tas, feiler med «Nøkkelen er fjernet»
    await pumpVideoQueue(db as unknown as AnyClient);
    const status = Object.fromEntries(rows.map((r) => [r["id"], r["status"]]));
    expect(MAX_PARALLEL_PER_KEY).toBe(3);
    // Én ledig plass for k1: q-0 ble tatt (og feilet på manglende nøkkel, så plassen ble ledig igjen)
    expect(status["q-0"]).toBe("failed");
    expect(rows.find((r) => r["id"] === "q-0")!["error"]).toMatch(/Nøkkelen er fjernet/);
    expect(status["q-other"]).toBe("failed");
    // Slettet prosjekt: ikke sendt, ingen kostnad
    expect(status["q-deleted"]).toBe("failed");
    expect(rows.find((r) => r["id"] === "q-deleted")!["error"]).toMatch(/slettet/);
  });
});

describe("video for flere scener", () => {
  it("hver scene får inndeling og beskrivelse per segment, også uten lagret inndeling", () => {
    const s = fixture.state;
    const main = mainProduction(s)!;
    const clips = filmClips(s, main.id);
    for (const c of clips.slice(0, 4)) {
      const w = sceneVideoWork(s, main.id, c);
      expect(w.plan.length).toBeGreaterThan(0);
      expect(w.prompts).toHaveLength(w.plan.length);
      expect(w.prompts.every((p) => p.length > 20)).toBe(true);
      expect(w.withVideo.every((i) => i < w.plan.length)).toBe(true);
    }
  });
});

describe("sammenheng i køen (DEC-0071)", () => {
  const P1 = "p1";
  const prevSeg = "seg-1";
  const job = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
    id,
    project_id: P1,
    kind: "video",
    segment_id: prevSeg,
    status,
    created_at: "2026-10-12T10:00:00Z",
    ...extra,
  });

  it("venter mens forrige segment lages, og når siste bilde ikke er lagret ennå", async () => {
    const running = fakeDb({ generation_jobs: [job("a", "running")] });
    expect((await resolveChain(running as unknown as AnyClient, P1, prevSeg)).state).toBe("wait");
    const path =
      "00000000-0000-7000-8000-0000000000aa/films/00000000-0000-7000-8000-0000000000bb/ai-video.mp4";
    const doneNoFrame = fakeDb({ generation_jobs: [job("a", "done", { result_path: path })] });
    expect((await resolveChain(doneNoFrame as unknown as AnyClient, P1, prevSeg)).state).toBe(
      "wait",
    );
    const frame = path.replace("ai-video.mp4", "last-frame.png");
    const ready = fakeDb({ generation_jobs: [job("a", "done", { result_path: path })] }, [frame]);
    expect(await resolveChain(ready as unknown as AnyClient, P1, prevSeg)).toEqual({
      state: "ready",
      path: frame,
    });
  });

  it("feiler uten kostnad når segmentet før ikke fikk video; et nytt forsøk går foran en eldre video", async () => {
    const failed = fakeDb({ generation_jobs: [job("a", "failed")] });
    expect((await resolveChain(failed as unknown as AnyClient, P1, prevSeg)).state).toBe("failed");
    const path =
      "00000000-0000-7000-8000-0000000000aa/films/00000000-0000-7000-8000-0000000000bb/ai-video.mp4";
    const newer = fakeDb(
      {
        generation_jobs: [
          job("ny", "queued", { created_at: "2026-10-12T11:00:00Z" }),
          job("gammel", "done", { result_path: path }),
        ],
      },
      [path.replace("ai-video.mp4", "last-frame.png")],
    );
    expect((await resolveChain(newer as unknown as AnyClient, P1, prevSeg)).state).toBe("wait");
  });

  it("venter ikke for alltid når siste bilde aldri blir lagret (gjennomgang DEC-0071)", async () => {
    const path =
      "00000000-0000-7000-8000-0000000000aa/films/00000000-0000-7000-8000-0000000000bb/ai-video.mp4";
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const stale = fakeDb({
      generation_jobs: [job("a", "done", { result_path: path, finished_at: old })],
    });
    const r = await resolveChain(stale as unknown as AnyClient, P1, prevSeg);
    expect(r.state).toBe("failed");
    if (r.state === "failed") expect(r.message).toContain("kostet ingenting");
    const fresh = fakeDb({
      generation_jobs: [
        job("a", "done", { result_path: path, finished_at: new Date().toISOString() }),
      ],
    });
    expect((await resolveChain(fresh as unknown as AnyClient, P1, prevSeg)).state).toBe("wait");
  });
});

describe("køen telles på nytt etter at jobben er tatt (KI-175, DEC-0075)", () => {
  it("har en annen fane fylt den siste plassen samtidig, legges jobben tilbake i kø uten å sendes", async () => {
    const running = (id: string) => ({
      id,
      started_at: "2026-10-12T10:00:00.000Z",
      project_id: "p1",
      kind: "video",
      status: "running",
      provider_key_id: "k1",
      provider: "runway",
      model: "gen4_turbo",
      prompt: "p",
      params: {},
    });
    const rows: Record<string, unknown>[] = [
      running("r-1"),
      running("r-2"),
      { ...running("q-1"), status: "queued", priority: 2, queue_position: 1 },
    ];
    const base = fakeDb({
      generation_jobs: rows,
      ai_provider_keys: [],
      projects: [{ id: "p1", deleted_at: null }],
    }) as unknown as { from: (t: string) => Record<string, unknown> };
    let injected = false;
    const db = {
      ...base,
      from(t: string) {
        const b = base.from(t);
        if (t !== "generation_jobs") return b;
        const upd = (b["update"] as (p: Record<string, unknown>) => unknown).bind(b);
        b["update"] = (patch: Record<string, unknown>) => {
          // Den andre fanen tar sin jobb i samme øyeblikk
          if (patch["status"] === "running" && !injected) {
            injected = true;
            rows.push(running("annen-fane"));
          }
          return upd(patch);
        };
        return b;
      },
    };
    const sent = await pumpVideoQueue(db as unknown as AnyClient, { projectId: "p1" });
    expect(sent).toBe(0);
    const q = rows.find((r) => r["id"] === "q-1")!;
    expect(q["status"]).toBe("queued");
    expect(q["error"]).toBeUndefined();
  });
});
