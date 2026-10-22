// @vitest-environment node
/** N1 (0088): global versjon lagres via reservasjon → filer → kontroll → commit, og rydder ved feil. */
import { describe, expect, it, vi } from "vitest";
import { storeGlobalVersionAtomically, sweepGlobalReservations } from "@/adapters/global/global-reservation.server";

const WS = "00000000-0000-4000-8000-00000000aaaa";
const KEY = `global/${WS}/ga/${"a".repeat(64)}.png`;
const params = () => ({ mime: "image/png", width: 1, height: 1, bytes: 1, sha256: "a".repeat(64), durationMs: null, note: "" });

function clients(opts: { commitError?: boolean; exists?: boolean; safe?: { committed: boolean; storage_key: string | null }[] } = {}) {
  const calls: string[] = [];
  const user = {
    rpc: vi.fn(async (fn: string) => {
      calls.push(fn);
      if (fn === "global_reserve_version") return { data: "r1", error: null };
      if (fn === "global_commit_version") return opts.commitError ? { data: null, error: { message: "nei" } } : { data: "v1", error: null };
      return { data: null, error: null };
    }),
  };
  const remove = vi.fn(async () => ({ error: null }));
  const admin = {
    rpc: vi.fn(async (fn: string) => {
      calls.push(fn);
      if (fn === "global_reservation_safe_keys") return { data: opts.safe ?? [{ committed: false, storage_key: KEY }], error: null };
      return { data: true, error: null };
    }),
    storage: { from: () => ({ remove, list: async (_f: string, o: { search: string }) => ({ data: opts.exists === false ? [] : [{ name: o.search }], error: null }) }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { committed_version_id: "v1" } }) }) }) }),
  };
  return { user, admin, remove, calls };
}

const run = (c: ReturnType<typeof clients>, put: () => Promise<void> = async () => {}) =>
  storeGlobalVersionAtomically({ user: c.user as never, admin: c.admin as never, actor: "u", variantId: "gv", keys: [KEY], put, params, log: () => {} });

describe("N1 atomisk global versjon", () => {
  it("reserverer før filen skrives og sluttfører etterpå", async () => {
    const c = clients();
    const put = vi.fn(async () => { c.calls.push("put"); });
    expect(await run(c, put)).toBe("v1");
    expect(c.calls).toEqual(["global_reserve_version", "put", "global_commit_version"]);
    expect(c.remove).not.toHaveBeenCalled();
  });

  it("kopieringsfeil: filen slettes og reservasjonen frigjøres", async () => {
    const c = clients();
    await expect(run(c, async () => { throw new Error("kopi"); })).rejects.toThrow("kopi");
    expect(c.remove).toHaveBeenCalledWith([KEY]);
    expect(c.calls.slice(-2)).toEqual(["global_reservation_safe_keys", "global_cancel_reservation"]);
    expect(c.calls).not.toContain("global_commit_version");
  });

  it("manglende fil: ingen commit, opprydding", async () => {
    const c = clients({ exists: false });
    await expect(run(c)).rejects.toThrow();
    expect(c.calls).not.toContain("global_commit_version");
    expect(c.calls).toContain("global_cancel_reservation");
  });

  it("feilet commit: filen slettes; filer som andre bruker (ikke i trygg liste) slettes ikke", async () => {
    const c = clients({ commitError: true, safe: [] });
    await expect(run(c)).rejects.toThrow("nei");
    expect(c.remove).not.toHaveBeenCalled();
    expect(c.calls).toContain("global_cancel_reservation");
  });

  it("tapt svar etter vellykket commit: ingenting slettes og versjonen returneres", async () => {
    const c = clients({ commitError: true, safe: [{ committed: true, storage_key: null }] });
    expect(await run(c)).toBe("v1");
    expect(c.remove).not.toHaveBeenCalled();
    expect(c.calls).not.toContain("global_cancel_reservation");
  });

  it("sweep: sletter filen først og frigjør bare når slettingen lyktes; fremmed sti beholdes", async () => {
    const remove = vi.fn(async (k: string[]) => ({ error: k[0]?.includes("feil") ? { message: "x" } : null }));
    const rpc = vi.fn(async (fn: string) => fn === "stale_global_reservations"
      ? { data: [
        { id: "a", storage_keys: [KEY] },
        { id: "b", storage_keys: [`global/${WS}/ga/feil.png`] },
        { id: "c", storage_keys: ["prosjekt/annet.png"] },
      ], error: null }
      : { data: true, error: null });
    const admin = { rpc, storage: { from: () => ({ remove }) } };
    expect(await sweepGlobalReservations(admin as never, WS, () => {})).toEqual({ released: 1, kept: 2 });
    expect(rpc).toHaveBeenCalledWith("release_stale_global_reservation", { p_reservation: "a" });
    expect(rpc).not.toHaveBeenCalledWith("release_stale_global_reservation", { p_reservation: "b" });
    expect(remove).not.toHaveBeenCalledWith(["prosjekt/annet.png"]);
  });
});
