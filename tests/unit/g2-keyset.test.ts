// @vitest-environment node
/** G-2 (A1): sidevis lesing bruker keyset (id > siste id), ikke OFFSET, og øyeblikksbildet brukes når det finnes. */
import { describe, expect, it } from "vitest";
import { fetchProjectTable, loadProjectSnapshot, type AnyClient } from "@/adapters/storage/project-rows";

type Row = Record<string, unknown>;

function pagingClient(rows: Row[], calls: string[]) {
  return {
    from() {
      let gt: string | null = null;
      let lim = Infinity;
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        gt: (_c: string, v: string) => ((gt = v), calls.push(`gt:${v}`), q),
        range: () => {
          throw new Error("OFFSET skal ikke brukes");
        },
        limit: (n: number) => ((lim = n), q),
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: rows.filter((r) => gt === null || String(r["id"]) > gt).slice(0, lim), error: null }).then(ok),
      };
      return q;
    },
    rpc: async () => ({ data: null, error: { message: "Could not find the function public.project_snapshot" } }),
  } as unknown as AnyClient;
}

describe("G-2 keyset", () => {
  it("leser 2 500 rader i tre sider med id > siste id", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: `id-${String(i).padStart(5, "0")}`, project_id: "p" }));
    const calls: string[] = [];
    const got = await fetchProjectTable(pagingClient(rows, calls), "scenes", "p");
    expect(got.map((r) => r["id"])).toEqual(rows.map((r) => r.id));
    expect(calls).toEqual(["gt:id-00999", "gt:id-01999"]);
  });

  it("øyeblikksbildet gir tabellene, log_seq og bare gjeldende historikk", async () => {
    const db = {
      rpc: async (name: string, args: Row) => {
        expect(name).toBe("project_snapshot");
        expect(args).toEqual({ p_project: "p", p_full_history: false });
        return {
          data: { project: { id: "p" }, log_seq: 7, history: "current", tables: [{ scenes: [{ id: "s" }] }, { mouth_tracks: [] }] },
          error: null,
        };
      },
    } as unknown as AnyClient;
    const snap = await loadProjectSnapshot(db, "p", { history: "current" });
    expect(snap.logSeq).toBe(7);
    expect(snap.via).toBe("snapshot");
    expect(snap.rows.scenes).toEqual([{ id: "s" }]);
    expect(snap.rows.script_blocks).toEqual([]);
    expect(snap.rows.history_partial).toBe(true);
  });
});
