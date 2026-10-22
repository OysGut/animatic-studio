// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
import { sweepShowcaseReservations } from "@/adapters/storage/orphan-cleanup.server";
import type { AnyClient } from "@/adapters/storage/project-rows";

const P = "11111111-1111-4111-8111-111111111111";
const A = "22222222-2222-4222-8222-222222222222";
const B = "33333333-3333-4333-8333-333333333333";

function fake(rows: { id: string; storage_key: string | null }[], failKeys: string[] = []) {
  const released: string[] = [];
  const removed: string[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "stale_showcase_reservations") return { data: rows, error: null };
    if (name === "release_stale_showcase_reservation") { released.push(String(args["p_reservation"])); return { data: true, error: null }; }
    return { data: null, error: { message: "unexpected" } };
  });
  const remove = vi.fn(async (keys: string[]) => {
    if (keys.some(k => failKeys.includes(k))) return { error: { message: "boom" } };
    removed.push(...keys); return { error: null };
  });
  return { admin: { rpc, storage: { from: () => ({ remove }) } } as unknown as AnyClient, released, removed };
}

it("sletter filen og frigjør utløpt reservasjon", async () => {
  const key = `${P}/shares/${A}/media.png`;
  const f = fake([{ id: A, storage_key: key }]);
  expect(await sweepShowcaseReservations(f.admin, P, () => {})).toEqual({ released: 1, kept: 0 });
  expect(f.removed).toEqual([key]);
  expect(f.released).toEqual([A]);
});

it("beholder reservasjonen ved slettefeil og logger uten nøkkel", async () => {
  const bad = `${P}/shares/${A}/media.png`;
  const good = `${P}/shares/${B}/media.png`;
  const f = fake([{ id: A, storage_key: bad }, { id: B, storage_key: good }], [bad]);
  const logs: unknown[] = [];
  expect(await sweepShowcaseReservations(f.admin, P, (m, meta) => logs.push([m, meta]))).toEqual({ released: 1, kept: 1 });
  expect(f.released).toEqual([B]);
  expect(JSON.stringify(logs)).not.toContain("shares/");
  expect(JSON.stringify(logs)).toContain(A);
});

it("sletter aldri utenfor shares/<id>/", async () => {
  const f = fake([{ id: A, storage_key: `${P}/source/original.png` }]);
  expect(await sweepShowcaseReservations(f.admin, P, () => {})).toEqual({ released: 0, kept: 1 });
  expect(f.removed).toEqual([]);
  expect(f.released).toEqual([]);
});

it("reservasjon uten fil (manusutdrag) frigjøres uten sletting", async () => {
  const f = fake([{ id: A, storage_key: null }]);
  expect(await sweepShowcaseReservations(f.admin, P, () => {})).toEqual({ released: 1, kept: 0 });
  expect(f.removed).toEqual([]);
});
