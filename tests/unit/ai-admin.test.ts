/**
 * DEC-0088 (Mars 15.10.2026): AI-tilkoblinger på adminsiden – bare administrator, av/på for alle brukere,
 * egne modeller med streng kontroll på serveren, ønsker om nye leverandører, status for bakgrunnsjobben og
 * at serveren avviser avslåtte modeller. Falsk database som i account-admin.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeWriteDb, type FakeDb } from "../helpers/verifisering3-db";
import { cronSummary } from "@/app/admin/cron-status";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@tanstack/react-start", async () => {
  const { serverFnStub } = await import("../helpers/verifisering3-db");
  return { createServerFn: serverFnStub(), createMiddleware: () => ({ server: () => ({}) }) };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return h.db;
  },
}));

type Fn = (a: { data?: unknown; context: unknown }) => Promise<Record<string, unknown>>;

const OYSTEIN = crypto.randomUUID();
const ALICE = crypto.randomUUID();
const EMAIL: Record<string, string> = {
  [OYSTEIN]: "oystein@gutu.no",
  [ALICE]: "alice@example.no",
};
const ctx = (u: string) => ({ userId: u, claims: { email: EMAIL[u] }, supabase: h.db });

function setup(extra: Record<string, Record<string, unknown>[]> = {}): FakeDb {
  const db = fakeWriteDb({
    app_admins: [],
    ai_model_settings: [],
    ai_provider_requests: [],
    app_status: [],
    ...extra,
  });
  h.db = db;
  return db;
}

/** Databasen før migrasjon 0034: tabellene finnes ikke (PostgREST svarer med feil). */
function withoutTables(db: FakeDb, missing: readonly string[]): FakeDb {
  const from = db.from.bind(db);
  const err = { message: "relation does not exist", code: "42P01" };
  const broken = () => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "neq", "order", "limit", "insert", "update", "delete", "in"])
      q[k] = () => q;
    q["maybeSingle"] = () => Promise.resolve({ data: null, error: err });
    q["then"] = (ok: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: err }).then(ok);
    return q;
  };
  (db as unknown as { from: (t: string) => unknown }).from = (t: string) =>
    missing.includes(t) ? broken() : from(t);
  return db;
}

const admin = () => import("@/adapters/account/admin.functions");
const fn = async (name: string) =>
  (await admin())[name as keyof Awaited<ReturnType<typeof admin>>] as unknown as Fn;

beforeEach(() => vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test"));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("DEC-0088 – bare administrator", () => {
  it("en vanlig bruker får verken oversikt eller endre noe", async () => {
    const db = setup();
    expect((await (await fn("fetchAiAdmin"))({ context: ctx(ALICE) }))["ok"]).toBe(false);
    const r = await (
      await fn("adminSetModelEnabled")
    )({ data: { provider: "fal", model: "*", enabled: false }, context: ctx(ALICE) });
    expect(r).toMatchObject({ ok: false, message: "Bare for administrator." });
    const c = await (
      await fn("adminSaveCustomModel")
    )({
      data: {
        provider: "fal",
        kind: "image",
        model: "fal-ai/bytedance/seedream/v5",
        label: "S5",
        priceUsd: 0.05,
        priceUnit: "image",
      },
      context: ctx(ALICE),
    });
    expect(c["ok"]).toBe(false);
    const q = await (
      await fn("adminAddProviderRequest")
    )({ data: { name: "Luma" }, context: ctx(ALICE) });
    expect(q["ok"]).toBe(false);
    expect(db.tables["ai_model_settings"]).toEqual([]);
    expect(db.tables["ai_provider_requests"]).toEqual([]);
  });
  it("administrator i app_admins har tilgang", async () => {
    setup({ app_admins: [{ user_id: ALICE }] });
    const o = await (await fn("fetchAiAdmin"))({ context: ctx(ALICE) });
    expect(o).toMatchObject({ ok: true, ready: true, settings: [], requests: [], cron: null });
  });
});

describe("DEC-0088 – av og på for alle brukere", () => {
  it("leverandør og modell slås av (ny rad) og på igjen (samme rad)", async () => {
    const db = setup();
    const set = await fn("adminSetModelEnabled");
    expect(
      (
        await set({
          data: { provider: "runway", model: "*", enabled: false },
          context: ctx(OYSTEIN),
        })
      )["ok"],
    ).toBe(true);
    await set({
      data: { provider: "fal", model: "fal-ai/flux-pro/kontext", enabled: false },
      context: ctx(OYSTEIN),
    });
    await set({
      data: { provider: "fal", model: "fal-ai/flux-pro/kontext", enabled: true },
      context: ctx(OYSTEIN),
    });
    const rows = db.tables["ai_model_settings"]!;
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r["model"] === "*")).toMatchObject({
      provider: "runway",
      enabled: false,
      custom: false,
      updated_by: OYSTEIN,
    });
    expect(rows.find((r) => r["model"] === "fal-ai/flux-pro/kontext")!["enabled"]).toBe(true);
    const o = await (await fn("fetchAiAdmin"))({ context: ctx(OYSTEIN) });
    expect((o["settings"] as unknown[]).length).toBe(2);
  });
  it("ukjent leverandør eller modell avvises", async () => {
    const db = setup();
    const set = await fn("adminSetModelEnabled");
    expect(
      (
        await set({
          data: { provider: "midjourney", model: "*", enabled: false },
          context: ctx(OYSTEIN),
        })
      )["ok"],
    ).toBe(false);
    expect(
      (
        await set({
          data: { provider: "fal", model: "fal-ai/finnes-ikke", enabled: false },
          context: ctx(OYSTEIN),
        })
      )["ok"],
    ).toBe(false);
    await expect(
      set({ data: { provider: "fal", model: "*", enabled: "nei" }, context: ctx(OYSTEIN) }),
    ).rejects.toThrow();
    expect(db.tables["ai_model_settings"]).toEqual([]);
  });
});

describe("DEC-0088 – egne modeller", () => {
  const seedream = {
    provider: "fal",
    kind: "image",
    model: "fal-ai/bytedance/seedream/v5",
    label: "Seedream 5",
    priceUsd: 0.05,
    priceUnit: "image",
    note: "Testet 15.10.",
  };
  it("lagres som egen modell, kan endres, slås av og fjernes", async () => {
    const db = setup();
    const save = await fn("adminSaveCustomModel");
    const r = await save({ data: seedream, context: ctx(OYSTEIN) });
    expect(r["ok"]).toBe(true);
    expect(db.tables["ai_model_settings"]![0]).toMatchObject({
      provider: "fal",
      model: "fal-ai/bytedance/seedream/v5",
      custom: true,
      enabled: true,
      kind: "image",
      label: "Seedream 5",
      price_usd: 0.05,
      price_unit: "image",
    });
    await save({ data: { ...seedream, priceUsd: 0.06 }, context: ctx(OYSTEIN) });
    expect(db.tables["ai_model_settings"]).toHaveLength(1);
    expect(db.tables["ai_model_settings"]![0]!["price_usd"]).toBe(0.06);
    await (
      await fn("adminSetModelEnabled")
    )({ data: { provider: "fal", model: seedream.model, enabled: false }, context: ctx(OYSTEIN) });
    expect(db.tables["ai_model_settings"]![0]!["enabled"]).toBe(false);
    const rm = await (
      await fn("adminRemoveCustomModel")
    )({ data: { provider: "fal", model: seedream.model }, context: ctx(OYSTEIN) });
    expect(rm["ok"]).toBe(true);
    expect(db.tables["ai_model_settings"]).toEqual([]);
  });
  it.each([
    [{ provider: "lovable", model: "openai/gpt-image-3" }],
    [{ provider: "fal", model: "fal-ai/../../admin" }],
    [{ provider: "fal", model: "https://evil.example/x" }],
    [{ provider: "fal", model: "fal-ai/ny-familie/modell" }],
    [{ provider: "fal", model: "fal-ai/flux-pro/kontext" }],
    [{ kind: "sound" }],
    [{ priceUsd: 5000 }],
    [{ priceUnit: "second" }],
    [{ label: "x".repeat(121) }],
  ])("streng kontroll på serveren avviser %o", async (patch) => {
    const db = setup();
    const r = await (
      await fn("adminSaveCustomModel")
    )({ data: { ...seedream, ...patch }, context: ctx(OYSTEIN) });
    expect(r["ok"]).toBe(false);
    expect(typeof r["message"]).toBe("string");
    expect(db.tables["ai_model_settings"]).toEqual([]);
  });
  it("innebygde modeller kan ikke fjernes, bare slås av", async () => {
    setup();
    const rm = await (
      await fn("adminRemoveCustomModel")
    )({ data: { provider: "fal", model: "fal-ai/flux-pro/kontext" }, context: ctx(OYSTEIN) });
    expect(rm["ok"]).toBe(false);
  });
});

describe("DEC-0088 – ønsker om nye leverandører", () => {
  it("lagres med status «åpen», og administrator kan endre status", async () => {
    const db = setup();
    const add = await fn("adminAddProviderRequest");
    const r = await add({
      data: {
        name: "Luma AI",
        website: "https://lumalabs.ai",
        docsUrl: "https://docs.lumalabs.ai/",
        note: "Ray 3 for video",
      },
      context: ctx(OYSTEIN),
    });
    expect(r["ok"]).toBe(true);
    const row = db.tables["ai_provider_requests"]![0]!;
    expect(row).toMatchObject({
      name: "Luma AI",
      website: "https://lumalabs.ai/",
      docs_url: "https://docs.lumalabs.ai/",
      status: "open",
      created_by: OYSTEIN,
    });
    const set = await fn("adminSetProviderRequestStatus");
    expect(
      (await set({ data: { id: row["id"], status: "done" }, context: ctx(OYSTEIN) }))["ok"],
    ).toBe(true);
    expect(row["status"]).toBe("done");
    await expect(
      set({ data: { id: row["id"], status: "slettet" }, context: ctx(OYSTEIN) }),
    ).rejects.toThrow();
    const o = await (await fn("fetchAiAdmin"))({ context: ctx(OYSTEIN) });
    expect((o["requests"] as { name: string; status: string }[])[0]).toMatchObject({
      name: "Luma AI",
      status: "done",
    });
  });
  it("navn må finnes og nettadresser må være http(s)", async () => {
    const db = setup();
    const add = await fn("adminAddProviderRequest");
    expect((await add({ data: { name: " " }, context: ctx(OYSTEIN) }))["ok"]).toBe(false);
    expect(
      (await add({ data: { name: "X", website: "javascript:alert(1)" }, context: ctx(OYSTEIN) }))[
        "ok"
      ],
    ).toBe(false);
    expect(db.tables["ai_provider_requests"]).toEqual([]);
  });
});

describe("DEC-0088 – eldre database (før migrasjon 0034)", () => {
  it("adminsiden sier at databasen må oppdateres; ingenting skrives", async () => {
    withoutTables(setup(), ["ai_model_settings", "ai_provider_requests", "app_status"]);
    const o = await (await fn("fetchAiAdmin"))({ context: ctx(OYSTEIN) });
    expect(o).toMatchObject({ ok: true, ready: false });
    expect(String(o["message"])).toMatch(/migrasjon 0034/);
    const r = await (
      await fn("adminSetModelEnabled")
    )({ data: { provider: "fal", model: "*", enabled: false }, context: ctx(OYSTEIN) });
    expect(r["ok"]).toBe(false);
    expect(String(r["message"])).toMatch(/0034/);
  });
  it("innstillingene for appen: tom liste (katalogen som før), og kontrollen slipper alt gjennom", async () => {
    const db = withoutTables(setup(), ["ai_model_settings"]);
    const { fetchAiModelSettings } = await import("@/adapters/account/ai-models.functions");
    const r = await (fetchAiModelSettings as unknown as Fn)({ context: ctx(ALICE) });
    expect(r).toEqual({ ready: false, settings: [] });
    const { modelGate } = await import("@/adapters/account/ai-models.server");
    expect((await modelGate(db as never, "fal", "fal-ai/flux-pro/kontext")).message).toBeNull();
  });
});

describe("DEC-0088 – serveren avviser avslåtte modeller", () => {
  it("modelGate gir melding for avslått leverandør og modell, og innstillingene videre", async () => {
    const db = setup({
      ai_model_settings: [
        { provider: "google", model: "*", enabled: false, custom: false },
        { provider: "fal", model: "fal-ai/flux-pro/kontext", enabled: false, custom: false },
      ],
    });
    const { modelGate } = await import("@/adapters/account/ai-models.server");
    expect((await modelGate(db as never, "google", "veo-3.1-generate-preview")).message).toMatch(
      /AI-leverandøren/,
    );
    const g = await modelGate(db as never, "fal", "fal-ai/flux-pro/kontext");
    expect(g.message).toMatch(/AI-modellen/);
    expect(g.settings).toHaveLength(2);
    expect(
      (await modelGate(db as never, "fal", "fal-ai/bytedance/seedream/v4.5")).message,
    ).toBeNull();
  });
  it("lydgenerering med avslått ElevenLabs stoppes før nøkkel og kostnad", async () => {
    const P = crypto.randomUUID();
    const A = crypto.randomUUID();
    const db = setup({
      ai_model_settings: [{ provider: "elevenlabs", model: "*", enabled: false, custom: false }],
      schema_version: [{ version: 34 }],
      projects: [{ id: P, name: "Jula på Dovre", deleted_at: null, ai_month_limit: null }],
      project_members: [{ project_id: P, user_id: ALICE, role: "owner", removed_at: null }],
      assets: [{ id: A, project_id: P, kind: "sound" }],
      generation_jobs: [],
    });
    const { generateSound } = await import("@/adapters/ai/sound.functions");
    const r = await (generateSound as unknown as Fn)({
      data: {
        projectId: P,
        assetId: A,
        prompt: "Vind i fjellet",
        provider: "elevenlabs",
        model: "eleven_text_to_sound_v2",
        seconds: 5,
        loop: false,
        approved: true,
      },
      context: ctx(ALICE),
    });
    expect(r["ok"]).toBe(false);
    expect(String(r["message"])).toMatch(/slått av denne AI-leverandøren/);
    expect(db.tables["generation_jobs"]).toEqual([]);
  });
});

describe("DEC-0088 – status for bakgrunnsjobben", () => {
  const run = {
    at: "2026-10-15T12:00:00.000Z",
    durationMs: 1200,
    stopped: 0,
    sent: 2,
    purged: 1,
    checked: 3,
    done: 1,
    failed: 0,
    running: 2,
    skipped: null,
    error: null,
  };
  it("siste kjøring lagres (ny rad, så samme rad) og leses tilbake", async () => {
    const db = setup();
    const m = await import("@/adapters/account/ai-models.server");
    await m.recordCronRun(db as never, run);
    await m.recordCronRun(db as never, { ...run, sent: 5, error: "x".repeat(2000) });
    expect(db.tables["app_status"]).toHaveLength(1);
    const back = await m.readCronRun(db as never);
    expect(back).toMatchObject({ sent: 5, done: 1, purged: 1 });
    expect(back!.error!.length).toBe(1000);
    const o = await (await fn("fetchAiAdmin"))({ context: ctx(OYSTEIN) });
    expect(o["cron"]).toMatchObject({ sent: 5 });
  });
  it("lagringen feiler aldri, heller ikke uten tabellen", async () => {
    const db = withoutTables(setup(), ["app_status"]);
    const m = await import("@/adapters/account/ai-models.server");
    await expect(m.recordCronRun(db as never, run)).resolves.toBeUndefined();
    expect(await m.readCronRun(db as never)).toBeNull();
  });
  it("teksten på adminsiden og advarselen etter 10 minutter", () => {
    const now = Date.parse(run.at) + 3 * 60_000;
    const s = cronSummary(run, now);
    expect(s.text).toMatch(/^Bakgrunnsjobb: sist kjørt kl\. .+ \(for 3 minutter siden\)/);
    expect(s.text).toContain("2 sendt · 1 videoer hentet · 1 kontoer slettet");
    expect(s.stale).toBe(false);
    expect(s.warning).toBeNull();
    const late = cronSummary(run, Date.parse(run.at) + 11 * 60_000);
    expect(late.stale).toBe(true);
    expect(late.warning).toMatch(/Sjekk at appen er publisert og jobben er satt opp i Animatic Studio/);
    const never = cronSummary(null);
    expect(never.stale).toBe(true);
    expect(never.text).toMatch(/har ikke kjørt ennå/);
    expect(cronSummary({ ...run, error: "Tidsavbrudd" }, now).error).toBe("Tidsavbrudd");
  });
});
