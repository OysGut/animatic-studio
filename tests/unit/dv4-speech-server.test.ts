// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeWriteDb } from "../helpers/verifisering3-db";
const h = vi.hoisted(() => ({ db: null as unknown, role: "editor", speech: vi.fn(), models: vi.fn(), voices: vi.fn() }));
vi.mock("@tanstack/react-start", async () => ({ createServerFn: (await import("../helpers/verifisering3-db")).serverFnStub() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ get supabaseAdmin() { return h.db; } }));
vi.mock("@/adapters/ai/ai-gate.server", () => ({ ROLE_RANK: { editor: 3, viewer: 1 }, memberRole: async () => h.role, projectKey: async () => ({ id: "key", user_id: "owner", provider: "elevenlabs" }), overProjectBudget: async () => null, overAccountCap: async () => null }));
vi.mock("@/adapters/account/ai-models.server", () => ({ modelGate: async () => ({ message: null }) }));
vi.mock("@/adapters/ai/key-vault.server", () => ({ decryptKey: async () => "mock-only" }));
vi.mock("@/adapters/ai/providers.server", () => ({ ADAPTERS: { elevenlabs: { speech: h.speech, speechModels: h.models, voices: h.voices } }, ProviderError: class extends Error {}, scrubSecret: (s: string) => s.replaceAll("mock-only", "redacted") }));
const P = "00000000-0000-7000-8000-00000000f001", B = "00000000-0000-7000-8000-00000000f002";
const input = { projectId: P, blockId: B, voiceId: "voice", modelId: "eleven_v3", language: "no", settings: { stability: 0.5 }, scriptRevision: 7, approved: true };
async function call(over = {}) {
  const { generateSpeech } = await import("@/adapters/ai/speech.functions");
  return (generateSpeech as unknown as (x: unknown) => Promise<{ ok: boolean }> )({ data: { ...input, ...over }, context: { userId: "editor", supabase: h.db } });
}
beforeEach(() => {
  h.role = "editor"; h.speech.mockReset().mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]) });
  h.models.mockReset().mockResolvedValue([{ modelId: "eleven_v3", languages: [{ code: "no", name: "Norwegian" }], maxCharacters: 5000 }]);
  h.voices.mockReset().mockResolvedValue([{ voiceId: "voice" }]);
  h.db = fakeWriteDb({ schema_version: [{ version: 60 }], projects: [{ id: P, deleted_at: null }], script_blocks: [{ id: B, project_id: P, kind: "dialogue", text: "Hemmelig replikk", removed: false, current_rev: 7 }] });
});
describe("DV4 server cost and manuscript boundary", () => {
  it("requires explicit approval and never calls a provider without it", async () => { await expect(call({ approved: false })).rejects.toThrow(); expect(h.speech).not.toHaveBeenCalled(); });
  it("rejects viewers before reading account capabilities", async () => { h.role = "viewer"; expect((await call()).ok).toBe(false); expect(h.models).not.toHaveBeenCalled(); expect(h.speech).not.toHaveBeenCalled(); });
  it("rejects changed manuscript revisions before generating", async () => { expect((await call({ scriptRevision: 6 })).ok).toBe(false); expect(h.speech).not.toHaveBeenCalled(); });
  it("rejects unsupported spoken languages without fallback", async () => { expect((await call({ language: "es" })).ok).toBe(false); expect(h.speech).not.toHaveBeenCalled(); });
  it("stores provenance but never the manuscript text in job logs", async () => {
    expect((await call()).ok).toBe(true); expect(h.speech).toHaveBeenCalledTimes(1);
    const db = h.db as ReturnType<typeof fakeWriteDb>; const jobs = db.tables["generation_jobs"] ?? [];
    expect(jobs).toHaveLength(1); expect(jobs[0]?.["prompt"]).toBe("");
    expect(JSON.stringify(jobs)).not.toContain("Hemmelig replikk");
    expect(jobs[0]?.["params"]).toMatchObject({ scriptRevision: 7, language: "no", settings: { stability: 0.5 } });
  });
});