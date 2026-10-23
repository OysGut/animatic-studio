// @vitest-environment node
/**
 * Øystein 23.10: «Skriv med AI» bygger alltid på manusets beskrivelse (faktaarket). Falsk database og falsk
 * tekstmodell – ingen betalte kall.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  containsFactSheet,
  FACT_SHEET_HEADING,
  promptWithFactSheet,
  VISUAL_BRIEF_SYSTEM,
  PROMPT_WRITER_SYSTEM,
  withFactSheet,
  writeWithAiCalls,
} from "@/core";
import { fakeWriteDb } from "../helpers/verifisering3-db";

const h = vi.hoisted(() => ({
  db: null as unknown,
  sheet: "" as string,
  saved: [] as string[],
  saveFails: false,
}));

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
vi.mock("@/adapters/storage/fact-sheet.server", async (orig) => {
  const real = await orig<typeof import("@/adapters/storage/fact-sheet.server")>();
  return {
    ...real,
    loadFactSheetSubject: async () =>
      h.sheet
        ? { sheet: h.sheet, revision: 4, study: null }
        : {
            sheet: "",
            revision: 4,
            study: { text: "SUBJECT: Maja (character)\n\nSCREENPLAY EXCERPTS (story order):\n- MAJA: \"Jeg er sju!\"", images: [] },
          },
    saveFactSheet: async (_a: unknown, _p: string, _u: string, _id: string, text: string) => {
      if (h.saveFails) return { ok: false, message: "lagring feilet" };
      h.saved.push(text);
      h.sheet = text;
      return {
        ok: true,
        revision: 5,
        saved: { commandId: "cmd-1", inverse: { type: "SetAssetVisualBrief", assetId: "a", text: "" }, affected: ["a"] },
      };
    },
  };
});

const P = crypto.randomUUID();
const EDITOR = crypto.randomUUID();
const ASSET = crypto.randomUUID();
type Fn = (a: { data: unknown; context: unknown }) => Promise<Record<string, unknown>>;

let calls: { system: string; text: string }[] = [];
let studyReply: () => Response;
const ok = (text: string) => Response.json({ choices: [{ message: { content: text } }] });

function setup() {
  h.db = fakeWriteDb(
    {
      schema_version: [{ version: 89 }],
      projects: [{ id: P, deleted_at: null, ai_month_limit: 50 }],
      project_members: [{ project_id: P, user_id: EDITOR, role: "editor", removed_at: null }],
      assets: [{ id: ASSET, project_id: P, kind: "character" }],
      asset_versions: [],
      generation_jobs: [],
    },
    [],
  );
}
const jobs = () => (h.db as { tables: Record<string, Record<string, unknown>[]> }).tables["generation_jobs"]!;

beforeAll(async () => {
  await import("@/adapters/ai/write-prompt.functions");
}, 60_000);
beforeEach(() => {
  setup();
  h.sheet = "";
  h.saved = [];
  h.saveFails = false;
  calls = [];
  studyReply = () => ok("- Seven-year-old girl\n- Red knitted cap");
  vi.stubEnv("LOVABLE_API_KEY", "test-key");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { messages: { content: unknown }[] };
    const system = String(body.messages[0]!.content);
    const text = String((body.messages[1]!.content as { text?: string }[])[0]!.text);
    calls.push({ system, text });
    return system === VISUAL_BRIEF_SYSTEM ? studyReply() : ok("A full-figure cut-out of Maja.");
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function write(brief: string) {
  const fn = (await import("@/adapters/ai/write-prompt.functions")).writeImagePrompt as unknown as Fn;
  return fn({
    data: { projectId: P, assetId: ASSET, task: "prompt", brief, purpose: "cutout", images: [], approved: true },
    context: { userId: EDITOR, supabase: h.db },
  });
}

describe("Faktaarket alltid – serveren (falsk tekstmodell)", () => {
  it("mangler faktaark → studie først, lagret på ressursen, deretter prompt med faktaarket", async () => {
    const r = await write("Maja i vinterklær");
    expect(r["ok"]).toBe(true);
    expect(calls.map((c) => c.system)).toEqual([VISUAL_BRIEF_SYSTEM, PROMPT_WRITER_SYSTEM]);
    expect(calls[0]!.text).toContain("SCREENPLAY EXCERPTS");
    expect(h.saved).toEqual(["- Seven-year-old girl\n- Red knitted cap"]);
    expect(calls[1]!.text).toContain(FACT_SHEET_HEADING);
    expect(calls[1]!.text).toContain("- Red knitted cap");
    expect(calls[1]!.text).toContain("Maja i vinterklær");
    // Angresteget for klienten
    expect(r["factSheet"]).toMatchObject({ commandId: "cmd-1" });
    // Sporbarhet: egen jobb for studien, og prompt-jobben refererer faktaarkets versjon
    const [study, prompt] = jobs();
    expect((study!["params"] as { trace: { systemInstruction: string } }).trace.systemInstruction).toBe("visual-brief");
    const ref = (prompt!["params"] as { factSheet: Record<string, unknown> }).factSheet;
    expect(ref).toMatchObject({ assetRevision: 5, studyJobId: study!["id"] });
    expect(String(ref["digest"])).toMatch(/^[0-9a-f]{64}$/);
  });

  it("finnes faktaark → ingen ny studie, og faktaarket er med selv når feltet er redigert", async () => {
    h.sheet = "- Seven-year-old girl\n- Red knitted cap";
    const r = await write("Helt egen tekst skrevet av brukeren");
    expect(r["ok"]).toBe(true);
    expect(calls.map((c) => c.system)).toEqual([PROMPT_WRITER_SYSTEM]);
    expect(calls[0]!.text).toContain(FACT_SHEET_HEADING);
    expect(calls[0]!.text).toContain("- Seven-year-old girl");
    expect(calls[0]!.text).toContain("Helt egen tekst skrevet av brukeren");
    expect(h.saved).toEqual([]);
    expect(r["factSheet"]).toBeUndefined();
  });

  it("studien feiler → ingen prompt, tydelig melding med «Prøv igjen»", async () => {
    studyReply = () => ok("ingen linjer her");
    const r = await write("Maja");
    expect(r["ok"]).toBe(false);
    expect(r["retry"]).toBe(true);
    expect(calls.map((c) => c.system)).toEqual([VISUAL_BRIEF_SYSTEM]);
    expect(h.saved).toEqual([]);
  });

  it("lagringen feiler → ingen prompt", async () => {
    h.saveFails = true;
    const r = await write("Maja");
    expect(r["ok"]).toBe(false);
    expect(calls.map((c) => c.system)).toEqual([VISUAL_BRIEF_SYSTEM]);
  });
});

describe("Faktaarket alltid – regelen i kjernen", () => {
  const sheet = "- Seven-year-old girl\n- Red knitted cap";
  it("kostnadslinjen viser begge kallene når faktaarket mangler, ellers bare teksten", () => {
    expect(writeWithAiCalls({})).toEqual(["study", "prompt"]);
    expect(writeWithAiCalls({ visualBrief: "  " })).toEqual(["study", "prompt"]);
    expect(writeWithAiCalls({ visualBrief: sheet })).toEqual(["prompt"]);
  });
  it("faktaarket legges til når teksten ikke har det, og aldri to ganger", () => {
    const once = withFactSheet("My text", sheet);
    expect(once.startsWith(FACT_SHEET_HEADING)).toBe(true);
    expect(once.endsWith("My text")).toBe(true);
    expect(withFactSheet(once, sheet)).toBe(once);
    expect(containsFactSheet("seven-year-old girl wearing a RED knitted cap", sheet)).toBe(true);
    expect(withFactSheet("Only a cap", "")).toBe("Only a cap");
  });
  it("for lang tekst: brukerens tekst kortes, aldri faktaarket", () => {
    const out = withFactSheet("x".repeat(500), sheet, 300);
    expect(out.length).toBe(300);
    expect(out).toContain("- Red knitted cap");
  });
  it("rekkefølgen: studie → lagring → tekst; feil stopper før teksten", async () => {
    const order: string[] = [];
    const r = await promptWithFactSheet({
      existing: null,
      study: async () => (order.push("study"), { ok: true, text: sheet, jobId: "j1" }),
      save: async () => (order.push("save"), { ok: true, ref: { assetRevision: 2, digest: "d" }, saved: 1 }),
      write: async (s, ref) => (order.push("write"), { s, ref }),
    });
    expect(order).toEqual(["study", "save", "write"]);
    expect(r).toMatchObject({ ok: true, result: { s: sheet, ref: { studyJobId: "j1", assetRevision: 2 } } });
    const failed = await promptWithFactSheet({
      existing: null,
      study: async () => ({ ok: false, message: "nei" }),
      save: async () => { throw new Error("skal ikke kalles"); },
      write: async () => { throw new Error("skal ikke kalles"); },
    });
    expect(failed).toEqual({ ok: false, stage: "study", message: "nei" });
  });
});

describe("Faktaarket alltid – lagret merke «laget automatisk»", async () => {
  const { fixture } = await import("../visual/fixture-state");
  const { mustApply } = await import("../helpers/fixtures");
  const { needsSchema89 } = await import("@/adapters/storage/commands.functions");
  const s0 = fixture.state;
  const maja = Object.values(s0.assets).find((a) => a.name === "Maja")!;
  it("SetAssetVisualBrief med autoAt merker arket, og angring fjerner både tekst og merke", async () => {
    const { applyCommand } = await import("@/core");
    const cmd = { type: "SetAssetVisualBrief" as const, assetId: maja.id, text: "- Red cap", autoAt: "2026-10-23T02:00:00.000Z" };
    const s = mustApply(s0, cmd);
    expect(s.assets[maja.id]!.visualBrief).toBe("- Red cap");
    expect(s.assets[maja.id]!.visualBriefAuto).toBe("2026-10-23T02:00:00.000Z");
    expect(needsSchema89(cmd)).toBe(true);
    const r = applyCommand(s, { id: "c2" as never, actor: "u" as never, at: "2026-10-23T02:01:00.000Z", command: { type: "SetAssetVisualBrief", assetId: maja.id, text: "- Red cap" } });
    expect(r.ok && r.state.assets[maja.id]!.visualBriefAuto).toBeUndefined();
    const undo = applyCommand(s, { id: "c3" as never, actor: "u" as never, at: "2026-10-23T02:01:00.000Z", command: { type: "SetAssetVisualBrief", assetId: maja.id, text: maja.visualBrief ?? "" } });
    expect(undo.ok && undo.state.assets[maja.id]!.visualBriefAuto).toBeUndefined();
  });
});
