/** N5 / DV5-rest: et resultat som er angret fra angrelisten, hoppes over av «Angre hele jobben». */
import { describe, expect, it, vi } from "vitest";
import { undoneLocally } from "@/core/dialogue/batch-undo";

const original = { type: "AddBlock", block: { id: "b1", text: "Hei" } };
const inverse = { type: "RemoveBlock", blockId: "b1" };

describe("undoneLocally", () => {
  it("angret uten gjentak gir sann, også med annen nøkkelrekkefølge", () => {
    expect(undoneLocally(original, inverse, [{ blockId: "b1", type: "RemoveBlock" }])).toBe(true);
  });
  it("angret og gjort om igjen gir usann; ingen senere kommando gir usann", () => {
    expect(undoneLocally(original, inverse, [inverse, { block: { text: "Hei", id: "b1" }, type: "AddBlock" }])).toBe(false);
    expect(undoneLocally(original, inverse, [])).toBe(false);
    expect(undoneLocally(original, inverse, [{ type: "RemoveBlock", blockId: "b2" }])).toBe(false);
  });
});

// Enkel falsk database: change_log, dialogue_batch_items og dialogue_batches i minnet.
function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
  const updates: { table: string; patch: Record<string, unknown>; id: unknown }[] = [];
  const rpc = vi.fn(async () => ({ error: null }));
  const from = (table: string) => {
    const filters: ((r: Record<string, unknown>) => boolean)[] = [];
    let patch: Record<string, unknown> | null = null;
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const q = {
      select: () => q,
      update: (p: Record<string, unknown>) => { patch = p; return q; },
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
      neq: (k: string, v: unknown) => { filters.push((r) => r[k] !== v); return q; },
      in: (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return q; },
      gt: (k: string, v: string) => { filters.push((r) => String(r[k]) > v); return q; },
      order: () => q,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: (v: unknown) => void) => {
        if (patch) { for (const r of rows()) { updates.push({ table, patch, id: r["id"] }); Object.assign(r, patch); } res({ data: null, error: null }); }
        else res({ data: rows(), error: null });
      },
    };
    return q;
  };
  return { db: { from, rpc } as never, updates, rpc };
}

vi.mock("@/adapters/storage/project-rows", () => ({ loadProjectState: vi.fn(async () => ({})), checkSchema: vi.fn() }));
vi.mock("@/adapters/ai/speech-run.server", () => ({ runSpeech: vi.fn() }));
vi.mock("@/adapters/ai/ai-gate.server", () => ({ memberRole: vi.fn(), ROLE_RANK: {} }));

describe("undoDialogueBatch hopper over lokalt angrede resultater", () => {
  it("merker elementet som angret uten konflikt og uten ny skriving", async () => {
    const P = "p1";
    const { db, updates, rpc } = fakeDb({
      dialogue_batches: [{ id: "j1", project_id: P, status: "done", lease_until: null }],
      dialogue_batch_items: [{ id: "i1", batch_id: "j1", status: "done", command_id: "c1", position: 0 }],
      change_log: [
        { id: "c1", project_id: P, command_type: "AddBlock", command: original, inverse, created_at: "2026-10-22T10:00:00Z" },
        { id: "c2", project_id: P, command_type: "RemoveBlock", command: inverse, inverse: original, created_at: "2026-10-22T10:01:00Z" },
      ],
    });
    const { undoDialogueBatch } = await import("@/adapters/storage/dialogue-batch.server");
    const result = await undoDialogueBatch(db, P, "j1", "00000000-0000-7000-8000-000000000001");
    expect(result).toEqual({ undone: 0, skipped: 1 });
    expect(rpc).not.toHaveBeenCalled();
    expect(updates).toEqual([{ table: "dialogue_batch_items", patch: { status: "undone", error: null, retryable: false }, id: "i1" }]);
  });
});
