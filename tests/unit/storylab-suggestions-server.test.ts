// @vitest-environment node
/** SL6: project-scoped read, filters, editor gate, ordering and hard row limit. */
import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ db: null as unknown, role: "editor", calls: [] as unknown[][] }));
vi.mock("@tanstack/react-start", async () => { const { serverFnStub } = await import("../helpers/verifisering3-db"); return { createServerFn: serverFnStub() }; });
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ get supabaseAdmin() { return h.db; } }));
vi.mock("@/adapters/ai/ai-gate.server", () => ({ memberRole: async () => h.role, ROLE_RANK: { viewer: 1, editor: 3, owner: 4 } }));
vi.mock("@/adapters/storage/project-rows", () => ({ checkSchema: async () => ({ kind: "ok", version: 39 }) }));
import { listStorySuggestions } from "@/adapters/storylab/sessions.functions";
const P = "00000000-0000-7000-8000-000000000001", SESSION = "00000000-0000-7000-8000-000000000002";
const invoke = (data: unknown) => (listStorySuggestions as unknown as (input: { data: unknown; context: unknown }) => Promise<{ ok: boolean; suggestions?: unknown[] }> )({ data, context: { supabase: {}, userId: "user" } });
beforeEach(() => {
  h.role = "editor"; h.calls = [];
  const rows = Array.from({ length: 505 }, (_, i) => ({ id: String(i), project_id: P, session_id: SESSION, turn_id: "turn", kind: "line", payload: { text: "X" }, status: "open", created_at: String(i).padStart(4, "0"), created_by: "author" }));
  rows.push({ ...rows[0], id: "foreign", project_id: "other" } as typeof rows[number]);
  h.db = { from: (table: string) => {
    h.calls.push(["from", table]); const filters: [string, unknown][] = []; let limit = Infinity; let descending = false;
    const q = { select: (columns: string) => { h.calls.push(["select", columns]); return q; }, eq: (key: string, value: unknown) => { filters.push([key, value]); h.calls.push(["eq", key, value]); return q; }, order: (key: string, opts: { ascending: boolean }) => { h.calls.push(["order", key, opts]); descending = !opts.ascending; return q; }, limit: (n: number) => { limit = n; h.calls.push(["limit", n]); return q; }, then: (resolve: (r: unknown) => unknown) => Promise.resolve({ data: rows.filter((r) => filters.every(([k, v]) => (r as Record<string, unknown>)[k] === v)).sort((a, b) => descending ? b.created_at.localeCompare(a.created_at) : 0).slice(0, limit), error: null }).then(resolve) }; return q;
  } };
});
it("reads only the project, newest first, at most 500, with the promised DTO", async () => {
  const r = await invoke({ projectId: P });
  expect(r.ok).toBe(true); expect(r.suggestions).toHaveLength(500);
  expect(r.suggestions?.[0]).toEqual({ id: "504", sessionId: SESSION, turnId: "turn", kind: "line", payload: { text: "X" }, status: "open", createdAt: "0504", createdBy: "author" });
  expect(h.calls).toContainEqual(["order", "created_at", { ascending: false }]); expect(h.calls).toContainEqual(["limit", 500]);
  expect(r.suggestions?.some((s) => (s as { id: string }).id === "foreign")).toBe(false);
});
it("validates and applies all optional filters", async () => {
  await invoke({ projectId: P, status: "open", sessionId: SESSION, kind: "line" });
  for (const [key, value] of [["status", "open"], ["session_id", SESSION], ["kind", "line"]]) expect(h.calls).toContainEqual(["eq", key, value]);
  await expect(invoke({ projectId: P, status: "wrong" })).rejects.toThrow();
  await expect(invoke({ projectId: P, kind: "wrong" })).rejects.toThrow();
  await expect(invoke({ projectId: P, sessionId: "wrong" })).rejects.toThrow();
});
it("denies viewers before any suggestion read", async () => {
  h.role = "viewer"; expect((await invoke({ projectId: P })).ok).toBe(false); expect(h.calls).toEqual([]);
});