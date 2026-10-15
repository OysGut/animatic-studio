// @vitest-environment node
/**
 * Verifisering av krav (DEC-0075) i serverlogikken for AI-generering, med falsk database og falske
 * leverandørsvar (ingen ekte tjeneste kalles):
 * - REQ-0270/REQ-0566: egen API-nøkkel prøves hos leverandøren før den lagres, og lagres kryptert.
 * - REQ-0203: lyd fra ElevenLabs lagres som lydfil under ressursen, med jobblogg og spor.
 * - REQ-0302: jobber som går over taket eller budsjettet, startes ikke – heller ikke fra køen.
 * - REQ-0298: «for mange forespørsler» (429) gjør ikke jobben mislykket; køen prøver igjen.
 * - REQ-0263: et segment som venter på segmentet før, sendes med siste bilde derfra som startbilde.
 * - REQ-0289: køen og jobbene ligger i databasen; en ny serverprosess fortsetter der den forrige slapp.
 * - REQ-0285/REQ-0290: flere kandidater og massegenerering gir én jobb per kandidat/segment i køen.
 *
 * Serverfunksjonene kjøres gjennom en erstatning for createServerFn (validering + handler), med en fast
 * innlogget bruker. Nøklene krypteres og låses opp med den ekte nøkkelhvelvet.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lastFramePath } from "@/core";
import { fakeWriteDb, type FakeDb } from "../helpers/verifisering3-db";

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

type Fn = (a: { data: unknown; context: unknown }) => Promise<Record<string, unknown>>;

const P = crypto.randomUUID();
const OWNER = crypto.randomUUID();
const EDITOR = crypto.randomUUID();
const VIEWER = crypto.randomUUID();
const OCC = crypto.randomUUID();
const SEG1 = crypto.randomUUID();
const SEG2 = crypto.randomUUID();
const ASSET = crypto.randomUUID();
const GOOGLE_KEY = "AIza" + "x".repeat(35);
const ELEVEN_KEY = "sk_" + "e".repeat(40);

async function keyRow(id: string, user: string, provider: string, secret: string) {
  const { encryptKey } = await import("@/adapters/ai/key-vault.server");
  const sealed = await encryptKey(secret, { userId: user, provider, rowId: id });
  return {
    id,
    user_id: user,
    provider,
    ciphertext: sealed.ciphertext,
    iv: sealed.iv,
    key_version: sealed.version,
    status: "ok",
  };
}

async function project(over: { cap?: number | null; monthLimit?: number | null } = {}) {
  const db = fakeWriteDb({
    schema_version: [{ version: 27 }],
    projects: [{ id: P, deleted_at: null, ai_month_limit: over.monthLimit ?? null }],
    project_members: [
      { project_id: P, user_id: OWNER, role: "owner", removed_at: null },
      { project_id: P, user_id: EDITOR, role: "editor", removed_at: null },
      { project_id: P, user_id: VIEWER, role: "viewer", removed_at: null },
    ],
    scene_occurrences: [{ id: OCC, project_id: P }],
    production_segments: [
      { id: SEG1, occurrence_id: OCC, order_key: "a" },
      { id: SEG2, occurrence_id: OCC, order_key: "b" },
    ],
    assets: [{ id: ASSET, project_id: P, kind: "sound" }],
    ai_provider_keys: [
      await keyRow(crypto.randomUUID(), OWNER, "google", GOOGLE_KEY),
      await keyRow(crypto.randomUUID(), OWNER, "elevenlabs", ELEVEN_KEY),
    ],
    ai_account_limits:
      over.cap === undefined ? [] : [{ user_id: OWNER, monthly_cap_usd: over.cap }],
    generation_jobs: [],
  });
  h.db = db;
  return db;
}

const ctx = (userId: string) => ({ userId, supabase: h.db });

function videoInput(over: Record<string, unknown> = {}) {
  return {
    projectId: P,
    occurrenceId: OCC,
    segmentId: SEG1,
    prompt: "A troll walks through the snow. MAJA: «Hei!»",
    provider: "google",
    model: "veo-3.1-generate-preview",
    seconds: 8,
    aspect: "16:9",
    startImagePath: null,
    approved: true,
    ...over,
  };
}

async function videoFns() {
  const v = await import("@/adapters/ai/video.functions");
  return { start: v.startVideoGeneration as unknown as Fn };
}

/** Spionerer på leverandøradapterne i den modulinstansen serveren bruker. */
async function adapters() {
  const p = await import("@/adapters/ai/providers.server");
  return p;
}

const jobs = (db: FakeDb) => db.tables["generation_jobs"]!;

beforeEach(() => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-secret");
  vi.stubEnv("ANIMATIC_KEY_ENCRYPTION_KEY", "");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------- REQ-0270 / REQ-0566

describe("REQ-0270 REQ-0566 – egen API-nøkkel registreres og valideres", () => {
  async function save(provider: string, key: string, user = OWNER) {
    const f = (await import("@/adapters/ai/provider-keys.functions")) as unknown as {
      saveProviderKey: Fn;
    };
    return f.saveProviderKey({ data: { provider, key, label: "" }, context: ctx(user) });
  }

  it("REQ-0270: en nøkkel leverandøren avviser, lagres ikke; brukeren får en forklaring", async () => {
    const db = await project();
    const before = db.tables["ai_provider_keys"]!.length;
    const p = await adapters();
    const test = vi
      .spyOn(p.ADAPTERS.runway, "test")
      .mockRejectedValue(new p.ProviderError("Unauthorized", 401));
    const r = await save("runway", "key_" + "a".repeat(30));
    expect(test).toHaveBeenCalledWith("key_" + "a".repeat(30));
    expect(r["ok"]).toBe(false);
    expect(String(r["message"])).toMatch(/godtok ikke nøkkelen/);
    expect(db.tables["ai_provider_keys"]!.length).toBe(before);
  });

  it("REQ-0270 REQ-0566: en godkjent nøkkel lagres kryptert for brukeren; bare de fire siste tegnene kan vises", async () => {
    const db = await project();
    const p = await adapters();
    const secret = "key_" + "Hemmelig1234567890abcdWXYZ";
    vi.spyOn(p.ADAPTERS.runway, "test").mockResolvedValue(undefined as never);
    const r = await save("runway", secret, EDITOR);
    expect(r).toMatchObject({ ok: true, status: "ok" });
    const row = db.tables["ai_provider_keys"]!.find(
      (k) => k["user_id"] === EDITOR && k["provider"] === "runway",
    )!;
    expect(row).toBeDefined();
    expect(row["key_hint"]).toBe("…WXYZ");
    expect(row["status"]).toBe("ok");
    // Selve nøkkelen finnes ikke i klartekst noe sted i raden
    expect(JSON.stringify(row)).not.toContain("Hemmelig1234567890");
    const { decryptKey } = await import("@/adapters/ai/key-vault.server");
    expect(
      await decryptKey(row as never, {
        userId: EDITOR,
        provider: "runway",
        rowId: String(row["id"]),
      }),
    ).toBe(secret);
    // Raden er knyttet til brukeren: en annen bruker kan ikke låse den opp
    await expect(
      decryptKey(row as never, { userId: OWNER, provider: "runway", rowId: String(row["id"]) }),
    ).rejects.toThrow();
  });

  it("REQ-0270: kan nøkkelen ikke prøves nå (nettfeil), lagres den som «ikke prøvd» og sies tydelig", async () => {
    const db = await project();
    const p = await adapters();
    vi.spyOn(p.ADAPTERS.fal, "test").mockRejectedValue(new Error("fetch failed"));
    const r = await save("fal", "abcdefgh-1234:" + "b".repeat(20));
    expect(r).toMatchObject({ ok: true, status: "untested" });
    expect(String(r["message"])).toMatch(/kunne ikke prøves/);
    const row = db.tables["ai_provider_keys"]!.find((k) => k["provider"] === "fal")!;
    expect(row["status"]).toBe("untested");
  });

  it("REQ-0566: ugyldig format eller ukjent leverandør stoppes før noe sendes til leverandøren", async () => {
    await project();
    const p = await adapters();
    const test = vi.spyOn(p.ADAPTERS.openai, "test");
    expect(await save("openai", "sk-med mellomrom-1234567890")).toMatchObject({ ok: false });
    await expect(save("ukjent", "x".repeat(30))).rejects.toThrow(/Ukjent leverandør/);
    expect(test).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- REQ-0203

describe("REQ-0203 – lyd lages med tilkoblet leverandør og lagres som lydressurs med sporbarhet", () => {
  async function sound(over: Record<string, unknown> = {}, user = EDITOR) {
    const f = (await import("@/adapters/ai/sound.functions")) as unknown as { generateSound: Fn };
    return f.generateSound({
      data: {
        projectId: P,
        assetId: ASSET,
        prompt: "Wind howling over a snowy mountain",
        provider: "elevenlabs",
        model: "eleven_text_to_sound_v2",
        seconds: 5,
        loop: true,
        approved: true,
        ...over,
      },
      context: ctx(user),
    });
  }

  it("REQ-0203: lyden lagres under ressursen, og jobben logges med leverandør, modell, beskrivelse, pris og spor", async () => {
    const db = await project();
    const p = await adapters();
    const mp3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 1, 2, 3, 4]);
    const call = vi
      .spyOn(p.ADAPTERS.elevenlabs, "sound")
      .mockResolvedValue({ bytes: mp3, mimeType: "audio/mpeg" } as never);
    const r = await sound();
    expect(r["ok"]).toBe(true);
    // Eierens nøkkel brukes (redaktøren ba om lyden), med lengde og løkke
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ key: ELEVEN_KEY, seconds: 5, loop: true }),
    );
    const media = r["media"] as Record<string, unknown>;
    expect(String(media["path"])).toMatch(
      new RegExp(`^${P}/generated/${ASSET}/${r["versionId"]}/ai-lyd-`),
    );
    expect(media["mimeType"]).toBe("audio/mpeg");
    expect(media["byteSize"]).toBe(mp3.byteLength);
    expect(media["sha256"]).toMatch(/^[0-9a-f]{64}$/);
    expect(r["model"]).toBe("elevenlabs/eleven_text_to_sound_v2");
    expect(db.uploads).toEqual([
      expect.objectContaining({ bucket: "assets", path: media["path"], type: "audio/mpeg" }),
    ]);
    const job = jobs(db)[0]!;
    expect(job).toMatchObject({
      kind: "sound",
      provider: "elevenlabs",
      model: "eleven_text_to_sound_v2",
      prompt: "Wind howling over a snowy mountain",
      asset_id: ASSET,
      status: "done",
      result_path: media["path"],
      created_by: EDITOR,
      key_owner: OWNER,
      cost_usd: 0.06,
    });
    const trace = (job["params"] as Record<string, unknown>)["trace"] as Record<string, unknown>;
    expect(trace).toBeDefined();
    expect(trace["modelParams"]).toMatchObject({ seconds: 5, loop: true });
  });

  it("REQ-0203: uten bekreftelse av kostnaden, eller for et medlem som bare kan se, lages ingenting", async () => {
    const db = await project();
    const p = await adapters();
    const call = vi.spyOn(p.ADAPTERS.elevenlabs, "sound");
    await expect(sound({ approved: false })).rejects.toThrow(/bekreftes/);
    expect(await sound({}, VIEWER)).toMatchObject({ ok: false });
    expect(call).not.toHaveBeenCalled();
    expect(jobs(db)).toEqual([]);
  });

  it("REQ-0203: avvist kall fra leverandøren gir ingen lydfil, og jobben står som feilet", async () => {
    const db = await project();
    const p = await adapters();
    vi.spyOn(p.ADAPTERS.elevenlabs, "sound").mockRejectedValue(
      new p.ProviderError("invalid_api_key", 401),
    );
    const r = await sound();
    expect(r["ok"]).toBe(false);
    expect(db.uploads).toEqual([]);
    expect(jobs(db)[0]!["status"]).toBe("failed");
  });
});

// ---------------------------------------------------------------- REQ-0302

describe("REQ-0302 – jobber som vil overskride gjeldende ramme, startes ikke", () => {
  it("REQ-0302: nøkkeleierens månedstak – en video som ville gått over, startes ikke og etterlater ingen jobb", async () => {
    const db = await project({ cap: 5 });
    jobs(db).push({
      id: crypto.randomUUID(),
      project_id: P,
      kind: "video",
      status: "done",
      key_owner: OWNER,
      cost_usd: 3,
      created_at: new Date().toISOString(),
    });
    const p = await adapters();
    const start = vi.spyOn(p.ADAPTERS.google, "startVideo");
    const { start: startVideo } = await videoFns();
    // Veo 3.1: 0,40 USD/s × 8 s = 3,20 USD; 3 + 3,20 > 5
    const r = await startVideo({ data: videoInput(), context: ctx(EDITOR) });
    expect(r["ok"]).toBe(false);
    expect(String(r["message"])).toMatch(/Kostnadstaket/);
    expect(start).not.toHaveBeenCalled();
    expect(jobs(db).length).toBe(1);
    // Innenfor taket (4 s = 1,60 USD) startes den
    start.mockResolvedValue("operations/abc" as never);
    const ok = await startVideo({ data: videoInput({ seconds: 4 }), context: ctx(EDITOR) });
    expect(ok).toMatchObject({ ok: true, costUsd: 1.6 });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("REQ-0302: prosjektets budsjett (antall genereringer per måned) stopper også jobben", async () => {
    const db = await project({ monthLimit: 1 });
    jobs(db).push({
      id: crypto.randomUUID(),
      project_id: P,
      kind: "image",
      status: "done",
      created_at: new Date().toISOString(),
    });
    const p = await adapters();
    const start = vi.spyOn(p.ADAPTERS.google, "startVideo");
    const { start: startVideo } = await videoFns();
    const r = await startVideo({ data: videoInput(), context: ctx(OWNER) });
    expect(r).toMatchObject({ ok: false });
    expect(String(r["message"])).toMatch(/budsjett/);
    expect(start).not.toHaveBeenCalled();
    expect(jobs(db).length).toBe(1);
  });

  it("REQ-0302: lyd over taket startes ikke", async () => {
    const db = await project({ cap: 0.01 });
    const p = await adapters();
    const call = vi.spyOn(p.ADAPTERS.elevenlabs, "sound");
    const f = (await import("@/adapters/ai/sound.functions")) as unknown as { generateSound: Fn };
    const r = await f.generateSound({
      data: {
        projectId: P,
        assetId: ASSET,
        prompt: "Door creak",
        provider: "elevenlabs",
        model: "eleven_text_to_sound_v2",
        seconds: 5,
        approved: true,
      },
      context: ctx(OWNER),
    });
    expect(r).toMatchObject({ ok: false });
    expect(String(r["message"])).toMatch(/Kostnadstaket/);
    expect(call).not.toHaveBeenCalled();
    expect(jobs(db)).toEqual([]);
  });

  it("REQ-0302: taket senkes mens jobben venter i køen – køen sender den ikke, og den koster ingenting", async () => {
    const db = await project({ cap: 100 });
    const p = await adapters();
    const start = vi.spyOn(p.ADAPTERS.google, "startVideo").mockResolvedValue("op/1" as never);
    // Fyll nøkkelens tre plasser, så den nye jobben blir stående i køen
    for (let i = 0; i < 3; i++)
      jobs(db).push({
        id: crypto.randomUUID(),
        project_id: P,
        kind: "video",
        status: "running",
        provider_key_id: db.tables["ai_provider_keys"]![0]!["id"],
        key_owner: OWNER,
        cost_usd: 0,
        created_at: new Date().toISOString(),
      });
    const { start: startVideo } = await videoFns();
    const r = await startVideo({ data: videoInput({ queue: true }), context: ctx(EDITOR) });
    expect(r).toMatchObject({ ok: true, queued: true });
    const queued = jobs(db).find((j) => j["id"] === r["jobId"])!;
    expect(queued["status"]).toBe("queued");
    // Eieren senker taket til under det jobben vil koste; plassene blir ledige
    db.tables["ai_account_limits"]![0]!["monthly_cap_usd"] = 1;
    for (const j of jobs(db)) if (j["status"] === "running") j["status"] = "done";
    const { pumpVideoQueue } = await import("@/adapters/ai/video-followup.server");
    expect(await pumpVideoQueue(db as never, { projectId: P })).toBe(0);
    expect(start).not.toHaveBeenCalled();
    expect(queued["status"]).toBe("failed");
    expect(String(queued["error"])).toMatch(/Kostnadstaket.*kostet ingenting/);
  });
});

// ---------------------------------------------------------------- REQ-0298

describe("REQ-0298 – ratebegrensning (429) gjør ikke jobben mislykket; køen prøver igjen", () => {
  async function queuedJob(db: FakeDb) {
    const id = crypto.randomUUID();
    jobs(db).push({
      id,
      project_id: P,
      kind: "video",
      provider: "google",
      model: "veo-3.1-generate-preview",
      prompt: "A troll",
      reference_path: null,
      status: "queued",
      priority: 2,
      queue_position: 1,
      provider_key_id: db.tables["ai_provider_keys"]![0]!["id"],
      key_owner: OWNER,
      cost_usd: 3.2,
      params: { seconds: 8, aspect: "16:9" },
      created_at: new Date().toISOString(),
    });
    return jobs(db).find((j) => j["id"] === id)!;
  }

  it("REQ-0298: 429 ved sending legger jobben tilbake i køen; neste runde sender den", async () => {
    const db = await project();
    const job = await queuedJob(db);
    const p = await adapters();
    const start = vi
      .spyOn(p.ADAPTERS.google, "startVideo")
      .mockRejectedValueOnce(new p.ProviderError("RESOURCE_EXHAUSTED", 429))
      .mockResolvedValueOnce("operations/ok" as never);
    const { pumpVideoQueue } = await import("@/adapters/ai/video-followup.server");
    expect(await pumpVideoQueue(db as never, { projectId: P })).toBe(0);
    expect(job["status"]).toBe("queued");
    expect(job["started_at"]).toBe(null);
    expect(job["error"]).toBeUndefined();
    // Neste runde i køen
    expect(await pumpVideoQueue(db as never, { projectId: P })).toBe(1);
    expect(start).toHaveBeenCalledTimes(2);
    expect(job).toMatchObject({ status: "running", external_id: "operations/ok" });
  });

  it("REQ-0297 REQ-0302: det automatiske nye forsøket etter 429 respekterer kostnadstaket", async () => {
    const db = await project({ cap: 100 });
    const job = await queuedJob(db);
    const p = await adapters();
    const start = vi
      .spyOn(p.ADAPTERS.google, "startVideo")
      .mockRejectedValueOnce(new p.ProviderError("RESOURCE_EXHAUSTED", 429));
    const { pumpVideoQueue } = await import("@/adapters/ai/video-followup.server");
    await pumpVideoQueue(db as never, { projectId: P });
    expect(job["status"]).toBe("queued");
    // Taket senkes før neste runde: jobben sendes ikke igjen, og den har ikke kostet noe
    db.tables["ai_account_limits"]![0]!["monthly_cap_usd"] = 1;
    expect(await pumpVideoQueue(db as never, { projectId: P })).toBe(0);
    expect(start).toHaveBeenCalledTimes(1);
    expect(job["status"]).toBe("failed");
    expect(String(job["error"])).toMatch(/kostet ingenting/);
  });

  it("REQ-0298: 429 under oppfølging lar jobben fortsatt gå; et varig avslag (403) gjør den mislykket", async () => {
    const db = await project();
    const job = await queuedJob(db);
    Object.assign(job, {
      status: "running",
      external_id: "operations/x",
      started_at: new Date().toISOString(),
    });
    const p = await adapters();
    const poll = vi
      .spyOn(p.ADAPTERS.google, "pollVideo")
      .mockRejectedValueOnce(new p.ProviderError("Too Many Requests", 429));
    const { followUpVideoJob } = await import("@/adapters/ai/video-followup.server");
    expect(await followUpVideoJob(db as never, P, String(job["id"]))).toEqual({
      state: "running",
    });
    expect(job["status"]).toBe("running");
    // Kontrollprøve: et varig avslag er ikke en ratebegrensning
    poll.mockRejectedValueOnce(new p.ProviderError("Forbidden", 403));
    expect((await followUpVideoJob(db as never, P, String(job["id"])))["state"]).toBe("failed");
    expect(job["status"]).toBe("failed");
  });
});

describe("REQ-0649 – en ferdig video hentes inn selv om prosjektet var lukket i timevis (DEC-0086)", () => {
  async function runningJob(db: FakeDb, ageMs: number, status = "running") {
    const id = crypto.randomUUID();
    const t = new Date(Date.now() - ageMs).toISOString();
    jobs(db).push({
      id,
      project_id: P,
      kind: "video",
      provider: "google",
      model: "veo-3.1-generate-preview",
      prompt: "A troll",
      reference_path: null,
      status,
      provider_key_id: db.tables["ai_provider_keys"]![0]!["id"],
      key_owner: OWNER,
      cost_usd: 3.2,
      external_id: "operations/old",
      params: {},
      created_at: t,
      started_at: t,
    });
    return jobs(db).find((j) => j["id"] === id)!;
  }
  const doneVideo = {
    state: "done",
    bytes: new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]),
    mimeType: "video/mp4",
  } as never;

  it("REQ-0649: leverandøren spørres før tidsgrensen; en video ferdig for fire timer siden lagres", async () => {
    const db = await project();
    const job = await runningJob(db, 4 * 60 * 60 * 1000);
    const p = await adapters();
    const poll = vi.spyOn(p.ADAPTERS.google, "pollVideo").mockResolvedValue(doneVideo);
    const { followUpVideoJob } = await import("@/adapters/ai/video-followup.server");
    expect((await followUpVideoJob(db as never, P, String(job["id"])))["state"]).toBe("done");
    expect(poll).toHaveBeenCalledTimes(1);
    expect(job["status"]).toBe("done");
  });

  it("REQ-0649: først etter sju dager uten resultat merkes jobben «Betalt, ikke lagret»", async () => {
    const db = await project();
    const job = await runningJob(db, 8 * 24 * 60 * 60 * 1000);
    const p = await adapters();
    vi.spyOn(p.ADAPTERS.google, "pollVideo").mockResolvedValue({ state: "running" } as never);
    const { followUpVideoJob } = await import("@/adapters/ai/video-followup.server");
    expect((await followUpVideoJob(db as never, P, String(job["id"])))["state"]).toBe("failed");
    expect(job["status"]).toBe("lost");
  });

  it("REQ-0649: «Hent videoen igjen» henter en tapt video uten å bestille den på nytt; bare for redaktører", async () => {
    const db = await project();
    const job = await runningJob(db, 5 * 60 * 60 * 1000, "lost");
    const p = await adapters();
    const start = vi.spyOn(p.ADAPTERS.google, "startVideo");
    vi.spyOn(p.ADAPTERS.google, "pollVideo").mockResolvedValue(doneVideo);
    const v = await import("@/adapters/ai/video.functions");
    const refetch = v.refetchVideoJob as unknown as Fn;
    const denied = (await refetch({
      data: { projectId: P, jobId: String(job["id"]) },
      context: ctx(VIEWER),
    })) as { state: string };
    expect(denied.state).toBe("failed");
    expect(job["status"]).toBe("lost");
    const r = (await refetch({
      data: { projectId: P, jobId: String(job["id"]) },
      context: ctx(EDITOR),
    })) as { state: string };
    expect(r.state).toBe("done");
    expect(job["status"]).toBe("done");
    expect(start).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- REQ-0263

describe("REQ-0263 – siste bilde fra forrige segment sendes som startbilde til neste", () => {
  it("REQ-0263: jobben venter til forrige segment har video og siste bilde, og sendes så med det bildet", async () => {
    const db = await project();
    const p = await adapters();
    const start = vi.spyOn(p.ADAPTERS.google, "startVideo").mockResolvedValue("op/2" as never);
    const { start: startVideo } = await videoFns();
    // Segment 1 lages; segment 2 legges i kø med sammenheng
    const first = await startVideo({ data: videoInput(), context: ctx(EDITOR) });
    expect(first["ok"]).toBe(true);
    const second = await startVideo({
      data: videoInput({ segmentId: SEG2, queue: true, chainAfter: SEG1 }),
      context: ctx(EDITOR),
    });
    expect(second).toMatchObject({ ok: true, queued: true });
    const job2 = jobs(db).find((j) => j["id"] === second["jobId"])!;
    expect(job2["status"]).toBe("queued");
    expect(start).toHaveBeenCalledTimes(1);
    // Forrige segment er ferdig, men siste bilde er ikke lagret ennå: venter fortsatt
    const job1 = jobs(db).find((j) => j["id"] === first["jobId"])!;
    const result = `${P}/films/${crypto.randomUUID()}/ai-video.mp4`;
    Object.assign(job1, {
      status: "done",
      result_path: result,
      finished_at: new Date().toISOString(),
    });
    const { pumpVideoQueue } = await import("@/adapters/ai/video-followup.server");
    expect(await pumpVideoQueue(db as never, { projectId: P })).toBe(0);
    expect(job2["status"]).toBe("queued");
    // Siste bilde lagres (nettleseren gjør det når videoen legges inn)
    const frame = lastFramePath(result)!;
    db.files.add(frame);
    expect(await pumpVideoQueue(db as never, { projectId: P })).toBe(1);
    expect(job2).toMatchObject({ status: "running", reference_path: frame });
    const req = start.mock.calls[1]![0] as { image: { url: string; blob: Blob } | null };
    expect(req.image).not.toBe(null);
    expect(req.image!.url).toContain(frame);
    expect(req.image!.blob.size).toBeGreaterThan(0);
  });

  it("REQ-0263: et segment kan bare vente på segmentet like før i samme scene (ikke seg selv)", async () => {
    await project();
    const { start: startVideo } = await videoFns();
    const self = await startVideo({
      data: videoInput({ segmentId: SEG2, queue: true, chainAfter: SEG2 }),
      context: ctx(EDITOR),
    });
    expect(self).toMatchObject({ ok: false });
    const wrong = await startVideo({
      data: videoInput({ segmentId: SEG1, queue: true, chainAfter: SEG2 }),
      context: ctx(EDITOR),
    });
    expect(wrong).toMatchObject({ ok: false });
  });
});

// ---------------------------------------------------------------- REQ-0285 / REQ-0290

describe("REQ-0285 REQ-0290 – kandidater og massegenerering gir én jobb per video", () => {
  it("REQ-0285: med tre kandidater kan tre videoer for samme segment være i arbeid, men ikke en fjerde", async () => {
    const db = await project();
    const p = await adapters();
    vi.spyOn(p.ADAPTERS.google, "startVideo").mockResolvedValue("op" as never);
    const { start: startVideo } = await videoFns();
    for (let i = 0; i < 3; i++)
      expect(
        await startVideo({ data: videoInput({ candidates: 3, seconds: 4 }), context: ctx(EDITOR) }),
      ).toMatchObject({ ok: true });
    const fourth = await startVideo({
      data: videoInput({ candidates: 3, seconds: 4 }),
      context: ctx(EDITOR),
    });
    expect(fourth).toMatchObject({ ok: false });
    expect(String(fourth["message"])).toMatch(/lages allerede/);
    expect(jobs(db).filter((j) => j["segment_id"] === SEG1).length).toBe(3);
  });

  it("REQ-0290: 15 scener lagt i kø gir 15 ventende jobber, sendt høyst tre om gangen per nøkkel", async () => {
    const db = await project();
    const occs = Array.from({ length: 15 }, () => crypto.randomUUID());
    for (const o of occs) db.tables["scene_occurrences"]!.push({ id: o, project_id: P });
    const p = await adapters();
    const start = vi.spyOn(p.ADAPTERS.google, "startVideo").mockResolvedValue("op" as never);
    const { start: startVideo } = await videoFns();
    for (const o of occs) {
      const r = await startVideo({
        data: videoInput({ occurrenceId: o, segmentId: null, queue: true, seconds: 4 }),
        context: ctx(EDITOR),
      });
      expect(r).toMatchObject({ ok: true, queued: true });
    }
    const all = jobs(db).filter((j) => j["kind"] === "video");
    expect(all.length).toBe(15);
    expect(new Set(all.map((j) => j["occurrence_id"]))).toEqual(new Set(occs));
    expect(all.filter((j) => j["status"] === "running").length).toBe(3);
    expect(all.filter((j) => j["status"] === "queued").length).toBe(12);
    expect(start).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------- REQ-0289

describe("REQ-0289 – køen tåler omstart uten tap av jobber eller status", () => {
  it("REQ-0289: en ny serverprosess (uten minne fra den forrige) henter inn ferdige videoer og sender resten av køen", async () => {
    const db = await project();
    let p = await adapters();
    vi.spyOn(p.ADAPTERS.google, "startVideo").mockImplementation(
      async () => `operations/${crypto.randomUUID()}` as never,
    );
    const { start: startVideo } = await videoFns();
    const occs = Array.from({ length: 5 }, () => crypto.randomUUID());
    for (const o of occs) db.tables["scene_occurrences"]!.push({ id: o, project_id: P });
    for (const o of occs)
      await startVideo({
        data: videoInput({ occurrenceId: o, segmentId: null, queue: true, seconds: 4 }),
        context: ctx(EDITOR),
      });
    const snapshot = () => jobs(db).map((j) => [j["id"], j["status"]] as const);
    expect(snapshot().filter(([, s]) => s === "running").length).toBe(3);
    expect(snapshot().filter(([, s]) => s === "queued").length).toBe(2);
    const ids = snapshot().map(([id]) => id);

    // «Omstart»: alle moduler lastes på nytt; bare databasen er igjen
    vi.restoreAllMocks();
    vi.resetModules();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    p = await adapters();
    const start2 = vi
      .spyOn(p.ADAPTERS.google, "startVideo")
      .mockImplementation(async () => `operations/${crypto.randomUUID()}` as never);
    vi.spyOn(p.ADAPTERS.google, "pollVideo").mockResolvedValue({
      state: "done",
      bytes: new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]),
      mimeType: "video/mp4",
    } as never);
    const fresh = await import("@/adapters/ai/video-followup.server");
    // Bakgrunnskøen: følger opp de tre som kjørte, så sender den de to som ventet
    const sum = await fresh.followUpRunningVideoJobs(db as never);
    expect(sum).toMatchObject({ checked: 3, done: 3 });
    expect(await fresh.pumpVideoQueue(db as never)).toBe(2);
    expect(start2).toHaveBeenCalledTimes(2);
    // Ingen jobb er borte, og ingen er sendt to ganger
    expect(
      jobs(db)
        .map((j) => j["id"])
        .sort(),
    ).toEqual([...ids].sort());
    const st = jobs(db).map((j) => j["status"]);
    expect(st.filter((s) => s === "done").length).toBe(3);
    expect(st.filter((s) => s === "running").length).toBe(2);
    for (const j of jobs(db).filter((x) => x["status"] === "done"))
      expect(String(j["result_path"])).toMatch(
        new RegExp(`^${P}/generated/films/[0-9a-f-]{36}/ai-video\\.mp4$`),
      );
    // En ny runde etter enda en omstart gjør ingenting dobbelt
    expect(await fresh.pumpVideoQueue(db as never)).toBe(0);
    expect(start2).toHaveBeenCalledTimes(2);
  });
});
