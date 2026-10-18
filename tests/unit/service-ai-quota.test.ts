// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { userTextJobsInHour } from "@/adapters/ai/ai-gate.server";
import { runServiceAi } from "@/adapters/ai/service-ai.server";
import type { AnyClient } from "@/adapters/storage/project-rows";
vi.mock("@/adapters/ai/text.functions", () => ({
  lovableText: vi.fn(async () => ({ ok: true, text: "{}", model: "test", usage: { inputTokens: 1, outputTokens: 1 } })),
}));
type Row = { id?: string; project_id?: string; created_by?: string; kind?: string; created_at?: string; params?: { task?: string; keyOwner?: string } };
function database(rows: Row[]): AnyClient {
  return { from: () => {
    const filters: ((r: Row) => boolean)[] = [];
    const value = (r: Row, k: string) => k.startsWith("params->>") ? r.params?.[k.slice(9) as "task" | "keyOwner"] : r[k as keyof Row];
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => { filters.push((r) => value(r, k) === v); return q; },
      in: (k: string, vs: readonly unknown[]) => { filters.push((r) => vs.includes(value(r, k))); return q; },
      or: (expression: string) => {
        // Interpret the actual PostgREST predicate, so changing it breaks the quota regression.
        const match = /^params->>task.is.null,params->>task.not.in.\(([^)]+)\)$/.exec(expression);
        if (!match) throw new Error("Unexpected quota predicate");
        const excluded = match[1]?.split(",") ?? [];
        filters.push((r) => r.params?.task == null || !excluded.includes(r.params.task)); return q;
      },
      gte: (_k: string, v: string) => { filters.push((r) => (r.created_at ?? "") >= v); return q; },
      order: () => q, limit: () => q,
      insert: (r: Row) => { rows.push(r); return Promise.resolve({ error: null }); },
      update: () => q,
      then: (resolve: (v: unknown) => unknown) => {
        const selected = rows.filter((r) => filters.every((f) => f(r)));
        return Promise.resolve({ data: selected, count: selected.length, error: null }).then(resolve);
      },
    };
    return q;
  } } as unknown as AnyClient;
}
const jobs = (n: number, task: string, keyOwner: string): Row[] => Array.from({ length: n }, () => ({
  project_id: "p", created_by: "u", kind: "text", created_at: new Date(Date.now() - 120_000).toISOString(), params: { task, keyOwner },
}));
afterEach(() => vi.unstubAllEnvs());
describe("OG2: independent user and service quotas", () => {
  it("20 service jobs do not consume the user's 120 hourly calls, including user-triggered fallback", async () => {
    const rows = [...jobs(119, "general", "lovable"), ...jobs(10, "entity_analysis", "lovable"), ...jobs(10, "translation_align", "lovable")];
    const db = database(rows);
    const since = new Date(Date.now() - 3_600_000).toISOString();
    expect(await userTextJobsInHour(db, "u", since)).toBe(119);
    rows.push(...jobs(1, "script", "self"));
    expect(await userTextJobsInHour(db, "u", since)).toBe(120);
  });
  it("120 user calls do not consume the service's 20 daily runs or its lock", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-only");
    const rows = [...jobs(120, "general", "lovable"), ...jobs(19, "entity_analysis", "lovable")];
    const input = { admin: database(rows), projectId: "p", userId: "u", task: "translation_align" as const, system: "fixed", user: "fixture", maxTokens: 10 };
    expect(await runServiceAi(input)).toMatchObject({ ok: true });
    expect(await runServiceAi(input)).toMatchObject({ ok: false, retryable: false });
  });
});