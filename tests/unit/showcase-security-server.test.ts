// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ admin: null as unknown }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => h.admin }));
vi.mock("@tanstack/react-start", async () => ({ createServerFn: (await import("../helpers/verifisering3-db")).serverFnStub() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ get supabaseAdmin() { return h.admin; } }));
import { createShowcaseItem, getShowcaseFeed } from "@/adapters/community/showcase.functions";
import { completeShowcaseCopy } from "@/adapters/community/showcase-copy.server";
import type { AnyClient } from "@/adapters/storage/project-rows";
const P = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const SOURCE = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";
const target = `${P}/shares/${ID}/media.png`;
type Call = (input: { data?: unknown; context?: unknown }) => Promise<unknown>;
const callCreate = createShowcaseItem as unknown as Call;
const callFeed = getShowcaseFeed as unknown as Call;
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "public-test"); vi.stubEnv("SUPABASE_URL", "https://public.test"); });
function fixture(deny = false, copyFails = false, insertFails = false) {
  const events: string[] = [];
  const copy = vi.fn(async () => { events.push("copy"); return { error: copyFails ? { message: "copy failed" } : null }; });
  const remove = vi.fn(async () => { events.push("remove"); return { error: null }; });
  const sign = vi.fn(async () => ({ data: { signedUrl: "https://media.test/signed" }, error: null }));
  const rpc = vi.fn(async (name: string) => {
    events.push(name);
    return { data: name === "create_showcase_item" ? ID : name === "showcase_item_outcome" ? false : null, error: name === "create_showcase_item" && insertFails ? { message: "insert failed" } : null };
  });
  h.admin = { rpc, storage: { from: () => ({ copy, remove, createSignedUrl: sign }) } };
  const userRpc = vi.fn(async (name: string, _args: Record<string, unknown>) => {
    events.push(name);
    return name === "prepare_showcase_item"
      ? { data: deny ? null : { id: ID, source_key: `${P}/source/registered.png`, storage_key: target }, error: deny ? { message: "forbidden" } : null }
      : { data: [{ id: ID, status: "pending" }], error: null };
  });
  const context = { supabase: { rpc: userRpc }, userId: USER };
  const data = { projectId: P, kind: "character", title: "Reven", text: "", lineIds: [], sourceId: SOURCE, hasMedia: true, expiresAt: null, sourceKey: `${P}/secret/forged.png` };
  return { events, copy, remove, sign, rpc, userRpc, run: () => callCreate({ data, context }) };
}
it("autorisasjon skjer før kopiering; avvisning kopierer ingenting", async () => {
  const f = fixture(true);
  await expect(f.run()).rejects.toThrow();
  expect(f.events).toEqual(["prepare_showcase_item"]);
  expect(f.copy).not.toHaveBeenCalled();
});
it("kopierer kun RPC-kilden, aldri klientstien, og sluttfører reservasjonen", async () => {
  const f = fixture();
  expect(await f.run()).toEqual({ id: ID, status: "pending" });
  expect(f.events.slice(0, 3)).toEqual(["prepare_showcase_item", "copy", "create_showcase_item"]);
  expect(f.copy).toHaveBeenCalledWith(`${P}/source/registered.png`, target);
  expect(f.userRpc).toHaveBeenCalledWith("prepare_showcase_item", { p_project: P, p_kind: "character", p_title: "Reven", p_text: "", p_source: SOURCE, p_lines: [], p_expires_at: null });
  expect(f.remove).not.toHaveBeenCalled();
});
it("kopieringsfeil rydder målet og frigjør reservasjonen", async () => {
  const f = fixture(false, true);
  await expect(f.run()).rejects.toThrow();
  expect(f.events).toEqual(["prepare_showcase_item", "copy", "remove", "cancel_showcase_item"]);
  expect(f.remove).toHaveBeenCalledWith([target]);
});
it("innsettingsfeil rydder målet og frigjør reservasjonen", async () => {
  const f = fixture(false, false, true);
  await expect(f.run()).rejects.toThrow();
  expect(f.events).toEqual(["prepare_showcase_item", "copy", "create_showcase_item", "showcase_item_outcome", "remove", "cancel_showcase_item"]);
  expect(f.rpc).toHaveBeenLastCalledWith("cancel_showcase_item", { p_reservation: ID, p_actor: USER });
});
it("ugyldig mål kan aldri kopieres eller slettes", async () => {
  const f = fixture();
  await expect(completeShowcaseCopy(h.admin as AnyClient, USER, P, { id: ID, sourceKey: `${P}/source/a.png`, storageKey: `${P}/shares/other/keep.png` })).rejects.toThrow();
  expect(f.copy).not.toHaveBeenCalled();
  expect(f.remove).not.toHaveBeenCalled();
});
it("offentlig svar har ingen nøkler/identitet og signerer kun kontrollert item med 600 s", async () => {
  const f = fixture();
  f.rpc.mockImplementation(async (name: string) => ({ data: name === "showcase_feed"
    ? [{ id: ID, kind: "character", title: "Reven", storage_key: `${P}/source/forged.png`, project_id: P, created_by: USER }]
    : { storage_key: target }, error: null }) as never);
  const result = await callFeed({});
  expect(result).toEqual([expect.objectContaining({ id: ID, url: "https://media.test/signed" })]);
  expect(JSON.stringify(result)).not.toContain(P);
  expect(JSON.stringify(result)).not.toContain(USER);
  expect(JSON.stringify(result)).not.toContain("storageKey");
  expect(f.sign).toHaveBeenCalledWith(target, 600);
  expect(f.rpc).toHaveBeenCalledWith("showcase_media", { p_item: ID });
});
it("medieoppslag som ikke godkjenner item signerer ingenting", async () => {
  const f = fixture();
  f.rpc.mockImplementation(async (name: string) => ({ data: name === "showcase_feed" ? [{ id: ID, kind: "scene", title: "Scene" }] : null, error: null }) as never);
  expect(await callFeed({})).toEqual([expect.objectContaining({ url: null })]);
  expect(f.sign).not.toHaveBeenCalled();
});
it("tapt sluttføringssvar sletter aldri allerede publisert media", async () => {
  const f = fixture(false, false, true);
  const original = f.rpc.getMockImplementation();
  f.rpc.mockImplementation(async (name: string) => name === "showcase_item_outcome" ? { data: true, error: null } as never : original ? original(name) : { data: null, error: null });
  expect(await f.run()).toEqual({ id: ID, status: "pending" });
  expect(f.remove).not.toHaveBeenCalled();
  expect(f.rpc).not.toHaveBeenCalledWith("cancel_showcase_item", expect.anything());
});
it("uavklart sluttføring beholder filen for trygg gjenoppretting", async () => {
  const f = fixture(false, false, true);
  const original = f.rpc.getMockImplementation();
  f.rpc.mockImplementation(async (name: string) => name === "showcase_item_outcome" ? { data: null, error: { message: "offline" } } : original ? original(name) : { data: null, error: null });
  await expect(f.run()).rejects.toThrow();
  expect(f.remove).not.toHaveBeenCalled();
});
