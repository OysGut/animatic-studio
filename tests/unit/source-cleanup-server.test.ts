// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ admin: null as unknown }));
vi.mock("@tanstack/react-start", async () => {
  const { serverFnStub } = await import("../helpers/verifisering3-db");
  return { createServerFn: serverFnStub() };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ get supabaseAdmin() { return h.admin; } }));
import { previewAiSourceCleanup, confirmAiSourceCleanup } from "@/adapters/ai/source-cleanup.functions";
const P = "00000000-0000-7000-8000-000000000001";
const USER = "00000000-0000-7000-8000-000000000002";
type Row = Record<string, unknown>;
function setup(role = "owner", active = false) {
  const removed = vi.fn(async (_paths: string[]) => ({ error: null }));
  const refs: Row[] = [];
  const user = { from: () => {
    const q = { select: () => q, eq: () => q, is: () => q, maybeSingle: async () => ({ data: { role }, error: null }) };
    return q;
  } };
  h.admin = { from: (table: string) => {
    const q = { select: () => q, eq: () => q, limit: async () => ({ data: table === "generation_jobs" ? [{ status: active ? "running" : "done", params: {}, result_path: `${P}/generated/movie.mp4` }] : table === "asset_versions" ? refs : [], error: null }) };
    return q;
  }, storage: { from: () => ({ remove: removed, list: async (folder: string) => ({ data: folder.endsWith("/temp/ai-source") ? [{ id: "file", name: "old.mp4", created_at: "2025-01-01", metadata: { size: 100 } }] : [], error: null }) }) } };
  const context = { supabase: user, userId: USER };
  type Call = (input: { data: unknown; context: unknown }) => Promise<unknown>;
  return { refs, removed, preview: () => (previewAiSourceCleanup as unknown as Call)({ data: { projectId: P }, context }), confirm: (paths: string[]) => (confirmAiSourceCleanup as unknown as Call)({ data: { projectId: P, paths }, context }) };
}
beforeEach(() => vi.clearAllMocks());
it("KI-207 preview does not delete, and nonowners cannot list candidates", async () => {
  const owner = setup();
  expect(await owner.preview()).toEqual([{ path: `${P}/temp/ai-source/old.mp4`, bytes: 100 }]);
  expect(owner.removed).not.toHaveBeenCalled();
  await expect(setup("editor").preview()).rejects.toThrow();
});
it("KI-207 confirmation rechecks new references and blocks changed candidates", async () => {
  const s = setup(); const path = `${P}/temp/ai-source/old.mp4`;
  await s.preview(); s.refs.push({ media_path: path });
  await expect(s.confirm([path])).rejects.toThrow();
  expect(s.removed).not.toHaveBeenCalled();
  s.refs.length = 0; await s.confirm([path]);
  expect(s.removed).toHaveBeenCalledWith([path]);
});
it("KI-207 active jobs and finished-film paths cannot be deleted", async () => {
  const s = setup("owner", true);
  expect(await s.preview()).toEqual([]);
  await expect(s.confirm([`${P}/generated/movie.mp4`])).rejects.toThrow();
  expect(s.removed).not.toHaveBeenCalled();
});