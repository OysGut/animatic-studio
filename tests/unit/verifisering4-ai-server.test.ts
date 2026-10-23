// @vitest-environment node
/**
 * Verifiseringsrunde 4 (DEC-0076): serverdelen av AI-bilder gjennom Lovable AI Gateway, med falsk database og
 * en simulert gateway (ingen ekte tjeneste kalles, ingen kreditter brukes).
 * - REQ-0565: bare redaktører og eiere; bekreftelse kreves; grenser per bruker per time og per prosjekt per
 *   døgn; hver generering logges i generation_jobs (modell, beskrivelse, forbilde, status, feil); resultatet
 *   lagres som fil for en ny versjon; nøkkelen brukes bare på serveren og kommer aldri i svaret eller loggen.
 * - REQ-0589: «Skriv beskrivelsen med AI» sender brukerens tekst og bildene til språkmodellen, logges som egen
 *   jobb og teller ikke i bildebudsjettet; bildemodellen får bildene med i samme rekkefølge som beskrivelsen.
 *
 * Kriteriene om ekte kall (kreditter i Lovable) kan ikke prøves her; se VISUAL_QA_DEC-0076.md.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
const ASSET = crypto.randomUUID();
const KEY = "lovable-hemmelig-nokkel-123";
const REF1 = `${P}/${ASSET}/${crypto.randomUUID()}/maja-1.png`;
const REF2 = `${P}/${crypto.randomUUID()}/${crypto.randomUUID()}/stil.png`;
/** Et lite, gyldig PNG-hode (1 × 1). */
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

function project(jobs: Record<string, unknown>[] = []): FakeDb {
  const db = fakeWriteDb(
    {
      schema_version: [{ version: 27 }],
      projects: [{ id: P, deleted_at: null, ai_month_limit: 50, ai_price_per_image: 2 }],
      project_members: [
        { project_id: P, user_id: OWNER, role: "owner", removed_at: null },
        { project_id: P, user_id: EDITOR, role: "editor", removed_at: null },
        { project_id: P, user_id: VIEWER, role: "viewer", removed_at: null },
      ],
      assets: [{ id: ASSET, project_id: P, kind: "character", visual_brief: "- Maja er sju år", revision: 3 }],
      asset_versions: [
        { project_id: P, media_path: REF1, mime_type: "image/png", byte_size: 3 },
        { project_id: P, media_path: REF2, mime_type: "image/png", byte_size: 3 },
      ],
      generation_jobs: jobs,
    },
    [REF1, REF2],
  );
  h.db = db;
  return db;
}

const ctx = (userId: string) => ({ userId, supabase: h.db });
const jobsOf = (db: FakeDb) => db.tables["generation_jobs"]!;

interface Sent {
  url: string;
  headers: Record<string, string>;
  form: FormData | null;
  json: Record<string, unknown> | null;
}
let sent: Sent[] = [];
let reply: () => Response = () =>
  Response.json({ data: [{ b64_json: btoa(String.fromCharCode(...PNG)) }] });

beforeEach(() => {
  sent = [];
  reply = () => Response.json({ data: [{ b64_json: btoa(String.fromCharCode(...PNG)) }] });
  vi.stubEnv("LOVABLE_API_KEY", KEY);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-secret");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    sent.push({
      url: String(url),
      headers: { ...(init.headers as Record<string, string>) },
      form: init.body instanceof FormData ? init.body : null,
      json:
        typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    });
    return reply();
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// Under full vitest-last kan første import av serverkoden ta over 5 s. Den lastes én gang her, med egen
// grense, så selve testene måler bare oppførselen og ikke importtiden (deterministisk, uten omkjøring).
beforeAll(async () => {
  await import("@/adapters/ai/generate-image.functions");
  await import("@/adapters/ai/write-prompt.functions");
}, 60_000);

async function image() {
  return (await import("@/adapters/ai/generate-image.functions")).generateImage as unknown as Fn;
}
async function writer() {
  return (await import("@/adapters/ai/write-prompt.functions")).writeImagePrompt as unknown as Fn;
}

const input = (over: Record<string, unknown> = {}) => ({
  projectId: P,
  assetId: ASSET,
  prompt:
    "Design a character for a 2D animated film. Name: Maja.\n\nATTACHED IMAGES\nImage 1: Maja.",
  referencePaths: [REF1],
  identityFirst: true,
  purpose: "cutout",
  variantId: null,
  provider: "lovable",
  model: null,
  approved: true,
  ...over,
});

// ---------------------------------------------------------------- REQ-0565

describe("REQ-0565 – AI-bilder gjennom Lovable AI Gateway (simulert)", () => {
  it("REQ-0565: uten bekreftelse sendes ingenting (forespørselen avvises før noe annet skjer)", async () => {
    const db = project();
    const gen = await image();
    await expect(gen({ data: input({ approved: false }), context: ctx(EDITOR) })).rejects.toThrow(
      /bekreftes/,
    );
    expect(sent).toEqual([]);
    expect(jobsOf(db)).toEqual([]);
  });

  it("REQ-0565: bare redaktører og eiere kan generere – et medlem som bare kan se, får nei", async () => {
    const db = project();
    const gen = await image();
    const r = await gen({ data: input(), context: ctx(VIEWER) });
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/ikke tilgang/) });
    expect(sent).toEqual([]);
    expect(jobsOf(db)).toEqual([]);
    for (const user of [EDITOR, OWNER])
      expect(await gen({ data: input(), context: ctx(user) })).toMatchObject({ ok: true });
  });

  it("REQ-0565: grense per bruker per time og per prosjekt per døgn – ingen jobb og ingen sending over grensen", async () => {
    const { MAX_PER_USER_PER_HOUR, MAX_PER_PROJECT_PER_DAY } =
      await import("@/adapters/ai/generate-image.functions");
    const now = new Date().toISOString();
    const done = (user: string) => ({
      id: crypto.randomUUID(),
      project_id: P,
      kind: "image",
      status: "done",
      created_by: user,
      created_at: now,
    });
    let db = project(Array.from({ length: MAX_PER_USER_PER_HOUR }, () => done(EDITOR)));
    const gen = await image();
    const r1 = await gen({ data: input(), context: ctx(EDITOR) });
    expect(r1).toMatchObject({ ok: false, message: expect.stringMatching(/i timen er nådd/) });
    expect(sent).toEqual([]);
    // En annen redaktør (eieren) kan fortsatt
    expect(await gen({ data: input(), context: ctx(OWNER) })).toMatchObject({ ok: true });
    sent = [];
    db = project(
      Array.from({ length: MAX_PER_PROJECT_PER_DAY }, (_, i) => done(i % 2 ? OWNER : VIEWER)),
    );
    const r2 = await gen({ data: input(), context: ctx(EDITOR) });
    expect(r2).toMatchObject({ ok: false, message: expect.stringMatching(/i døgnet er nådd/) });
    expect(sent).toEqual([]);
    expect(jobsOf(db).length).toBe(MAX_PER_PROJECT_PER_DAY);
  });

  it("REQ-0565: genereringen logges (modell, beskrivelse, forbilde, status), bildet lagres som fil for en ny versjon, og nøkkelen bare brukes mot tjenesten", async () => {
    const db = project();
    const gen = await image();
    const r = await gen({ data: input(), context: ctx(EDITOR) });
    expect(r).toMatchObject({ ok: true, model: "openai/gpt-image-2.5-sunburst" });
    // Én forespørsel til gatewayen, med nøkkelen i hodet og bildet med
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe("https://ai.gateway.lovable.dev/v1/images/edits");
    expect(sent[0]!.headers["Authorization"]).toBe(`Bearer ${KEY}`);
    expect(sent[0]!.form!.get("prompt")).toBe(input().prompt);
    expect(sent[0]!.form!.get("image")).toBeInstanceOf(File);
    // Loggen
    const [job] = jobsOf(db);
    expect(job).toMatchObject({
      kind: "image",
      provider: "lovable",
      model: "openai/gpt-image-2.5-sunburst",
      prompt: input().prompt,
      asset_id: ASSET,
      reference_path: REF1,
      status: "done",
      created_by: EDITOR,
      estimated_cost: 2,
    });
    expect(String(job!["result_path"])).toMatch(
      new RegExp(`^${P}/generated/${ASSET}/[0-9a-f-]{36}/ai-.*\\.png$`),
    );
    // Filen i lagringen er den nye versjonens fil (klienten lagrer versjonen med AddAssetVersion)
    const media = (r as { media: { path: string; width: number; byteSize: number } }).media;
    expect(db.uploads.map((u) => u.path)).toEqual([media.path]);
    expect(media.path).toBe(job!["result_path"]);
    expect(media).toMatchObject({ width: 1, byteSize: PNG.byteLength });
    // Nøkkelen finnes aldri i svaret eller i loggen
    expect(JSON.stringify(r)).not.toContain(KEY);
    expect(JSON.stringify(jobsOf(db))).not.toContain(KEY);
  });

  it("REQ-0565: et avslag fra tjenesten logges som feilet med årsak, og ingen fil lagres", async () => {
    const db = project();
    reply = () => new Response('{"error":{"message":"Payment required"}}', { status: 402 });
    const gen = await image();
    const r = await gen({ data: input(), context: ctx(EDITOR) });
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/kredittene/) });
    expect(jobsOf(db)[0]).toMatchObject({ status: "failed", error: expect.stringMatching(/402/) });
    expect(db.uploads).toEqual([]);
  });

  it("REQ-0565: uten nøkkel på serveren (AI ikke slått på) sendes ingenting", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "");
    const db = project();
    const gen = await image();
    const r = await gen({ data: input(), context: ctx(EDITOR) });
    expect(r).toMatchObject({
      ok: false,
      message: expect.stringMatching(/innebygde AI-en er ikke slått på/),
    });
    expect(sent).toEqual([]);
    expect(jobsOf(db)).toEqual([]);
  });
});

// ---------------------------------------------------------------- REQ-0589

describe("REQ-0589 – «Skriv beskrivelsen med AI» og bildene som sendes med (simulert)", () => {
  it("REQ-0589: språkmodellen får teksten og bildene, kallet logges som egen jobb og teller ikke i bildebudsjettet", async () => {
    const db = project();
    reply = () =>
      Response.json({
        choices: [
          { message: { content: "FILM\nA winter tale.\n\nTHIS IMAGE\nMaja, ten years old." } },
        ],
      });
    const write = await writer();
    const r = await write({
      data: {
        projectId: P,
        assetId: ASSET,
        brief: "FILM\nJula på Dovre\n\nTHIS IMAGE\nMaja",
        purpose: "cutout",
        images: [
          { path: REF1, label: "the current design of Maja (v1)" },
          { path: REF2, label: "approved style reference" },
        ],
        approved: true,
      },
      context: ctx(EDITOR),
    });
    expect(r).toMatchObject({ ok: true, prompt: expect.stringContaining("THIS IMAGE") });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe("https://ai.gateway.lovable.dev/v1/chat/completions");
    const user = (sent[0]!.json!["messages"] as { role: string; content: unknown }[])[1]!;
    const parts = user.content as { type: string; text?: string; image_url?: { url: string } }[];
    expect(parts[0]!.text).toContain("Jula på Dovre");
    expect(parts.filter((p) => p.type === "image_url")).toHaveLength(2);
    expect(parts.filter((p) => p.type === "text").map((p) => p.text)).toEqual(
      expect.arrayContaining(["Image 1:", "Image 2:"]),
    );
    const [job] = jobsOf(db);
    expect(job).toMatchObject({ kind: "prompt", status: "done", reference_paths: [REF1, REF2] });
    // Bildebudsjettet teller ikke «prompt»-jobber (samme filter som i grensene og oversikten)
    const { aiUsage, jobFromRow } = await import("@/core");
    const usage = aiUsage(
      { aiMonthLimit: 50, aiPricePerImage: 2 },
      jobsOf(db).map(jobFromRow),
      new Date(),
    );
    expect(usage.used).toBe(0);
  });

  it("REQ-0589: bildemodellen får dagens bilde og stilforbildet i samme rekkefølge som beskrivelsen omtaler dem", async () => {
    project();
    const gen = await image();
    const r = await gen({
      data: input({
        referencePaths: [REF1, REF2],
        prompt:
          "THIS IMAGE\nMaja.\n\nATTACHED IMAGES\nImage 1: the current design of Maja (v1).\nImage 2: approved style reference.",
      }),
      context: ctx(EDITOR),
    });
    expect(r).toMatchObject({ ok: true });
    const form = sent[0]!.form!;
    expect(form.getAll("image[]").map((f) => (f as File).name)).toEqual([
      "reference-1.png",
      "reference-2.png",
    ]);
    expect(String(form.get("prompt"))).toMatch(
      /Image 1: the current design.*\nImage 2: approved style/s,
    );
  });
});
