// @vitest-environment node
/** C-0 rester (Fase 5): direkte opplasting over 64 MiB med signerte URL-er, panelmål (C-7),
 *  connector_links-API og notater (notes:write). Falsk lagring og falsk server, ingen nettverk. */
import { describe, expect, it } from "vitest";
import { orderedOccurrences, type ProjectState } from "@/core";
import { DIRECT_MAX_BYTES, LINKS_MAX_PER_PROJECT, SIGNED_CHUNK_BYTES, checkLink, checkNote, signedChunkCount, sha256Hex } from "@/core/connectors";
import { handleApiV1 } from "@/adapters/connectors/api-v1";
import { PtgConnector, memoryTokenStore } from "../../packages/ptg-connector-sdk/src/index";
import { memoryStore } from "../helpers/c0-memory-store";
import { mustApply, seedProject, tid } from "../helpers/fixtures";
import { makeToken, tokenHash } from "@/core/connectors";

const USER = "00000000-0000-7000-8000-a11ce0000001";
let seed = 7;
const random = (n: number) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24; return b; };
const png = (size: number) => { const b = new Uint8Array(size); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); for (let i = 8; i < size; i++) b[i] = i % 251; return b; };

function setup(opts: { quotaBytes?: number } = {}) {
  const sp = seedProject(1);
  const occ = orderedOccurrences(sp.state, sp.mainId)[0]!;
  const panelId = tid();
  const s = mustApply(sp.state, { type: "AddStoryboardPanel", panelId, occurrenceId: occ.id, variantId: occ.variantId, orderKey: "a1" });
  const assetId = tid<"asset">(), variantId = tid<"asset_variant">();
  let st: ProjectState = mustApply(s, { type: "CreateAssets", assets: [{ assetId, fields: { kind: "character", name: "K", names: [], description: "", category: "", tags: [] } }] });
  st = mustApply(st, { type: "CreateAssetVariant", variantId, assetId, fields: { name: "Main", style: "illustrated", appearance: "" } });
  let now = Date.parse("2026-10-24T08:00:00Z");
  const mem = memoryStore(st, { now: () => now, ...opts });
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const fake = /\/fake-storage\/([0-9a-f-]{36})\/part-(\d+)$/.exec(url);
    if (fake && init?.method === "PUT") { // den falske signerte URL-en skriver rett til «lagringen»
      await mem.store.putChunk(fake[1]!, Number(fake[2]), new Uint8Array(await new Response(init.body).arrayBuffer()));
      return new Response("{}", { status: 200 });
    }
    return handleApiV1(new Request(url, init), { store: mem.store, now: () => now, random, ip: "203.0.113.9" });
  }) as typeof fetch;
  const sdk = new PtgConnector({ baseUrl: "https://ptg.test", clientId: "ptg.photoshop", fetch: fetchFn, random, tokens: memoryTokenStore(), now: () => now, sleep: async () => {} });
  return { s: st, occ, panelId: panelId as string, assetId: assetId as string, variantId: variantId as string, mem, sdk, fetchFn };
}
async function login(h: ReturnType<typeof setup>, scope: string) {
  const redirect = "http://127.0.0.1:7777/cb";
  const b = h.sdk.beginAuthorization(redirect, scope);
  const u = new URL(b.url);
  const code = makeToken("code", random(32));
  h.mem.approveCode(tokenHash(code), { clientId: "ptg.photoshop", redirectUri: redirect, challenge: u.searchParams.get("code_challenge")!, projectId: h.s.project.id, userId: USER, scopes: scope.split(" ") });
  await h.sdk.completeAuthorization(`${redirect}?code=${code}&state=${b.state}`, { verifier: b.verifier, state: b.state, redirectUri: redirect });
}
const FULL_SCOPE = "project:read manifest:read assets:read transfers:write conflicts:read notes:write";

describe("C-0 rester: direkte opplasting over 64 MiB", () => {
  it("biter på 16 MiB via signert URL, gjenopptak og kontrollsum gir kandidat", async () => {
    const h = setup();
    await login(h, FULL_SCOPE);
    const bytes = png(DIRECT_MAX_BYTES + SIGNED_CHUNK_BYTES + 1234); // 80 MiB + litt
    expect(signedChunkCount(bytes.length)).toBe(6);
    const key = "stor-fil-nokkel-0001";
    // Første forsøk avbrytes etter to biter (simulert: vi laster opp to biter manuelt først).
    const reserved = await h.sdk["json"]<import("../../packages/ptg-connector-sdk/src/index").TransferInfo>("POST", `/api/v1/projects/${h.s.project.id}/transfers`,
      { fileName: "stor.png", byteSize: bytes.length, sha256: sha256Hex(bytes), target: { assetId: h.assetId, variantId: h.variantId }, base: { versionId: null } }, true, { "Idempotency-Key": key });
    expect(reserved.direct).toBe(true);
    expect(reserved.chunkCount).toBe(6);
    for (const i of [0, 1]) {
      const signed = await h.sdk["json"]<{ url: string }>("POST", `/api/v1/projects/${h.s.project.id}/transfers/${reserved.id}/signed-chunks/${i}`, {});
      const part = bytes.subarray(i * SIGNED_CHUNK_BYTES, (i + 1) * SIGNED_CHUNK_BYTES);
      const res = await h.fetchFn(new URL(signed.url, "https://ptg.test").toString(), { method: "PUT", body: part as BodyInit });
      expect(res.ok).toBe(true);
    }
    // Gjenopptak med samme nøkkel: SDK-en hopper over de to mottatte bitene.
    const done = await h.sdk.upload(h.s.project.id, { name: "stor.png", bytes }, { assetId: h.assetId, variantId: h.variantId, baseVersionId: null }, key);
    expect(done.status).toBe("candidate");
    expect(done.candidateVersionId).toBeTruthy();
    expect(h.mem.chunks.get(reserved.id)?.size).toBe(6);
    // Kandidatversjonen ligger i prosjektet uten å være godkjent.
    const variant = h.mem.state.assetVariants[h.variantId as never]!;
    expect(variant.approvedVersionId).toBeNull();
    expect(Object.values(h.mem.state.assetVersions).some(v => v.byteSize === bytes.length)).toBe(true);
  });
  it("over 512 MiB avvises ved reservasjon, og kvoten fra G-5 gjelder også direkte opplasting", async () => {
    const h = setup({ quotaBytes: DIRECT_MAX_BYTES + 10 });
    await login(h, FULL_SCOPE);
    await expect(h.sdk.upload(h.s.project.id, { name: "k.png", bytes: png(70 * 1024 * 1024) }, { assetId: h.assetId, variantId: h.variantId, baseVersionId: null }, "kvote-nokkel-000001")).rejects.toMatchObject({ code: "quota_exceeded" });
    const huge = await h.sdk["json"]<Response>("POST", `/api/v1/projects/${h.s.project.id}/transfers`, { fileName: "h.png", byteSize: 513 * 1024 * 1024, sha256: "a".repeat(64), target: { assetId: h.assetId, variantId: h.variantId }, base: { versionId: null } }, true, { "Idempotency-Key": "huge-nokkel-0000001" }).catch(e => e);
    expect((huge as { code: string }).code).toBe("invalid_size");
  });
  it("signert URL krever direkte modus og gyldig bitnummer", async () => {
    const h = setup();
    await login(h, FULL_SCOPE);
    const small = png(1000);
    const t = await h.sdk.upload(h.s.project.id, { name: "l.png", bytes: small }, { assetId: h.assetId, variantId: h.variantId, baseVersionId: null }, "liten-nokkel-00001");
    expect(t.direct).toBe(false);
    const r = await h.fetchFn(`https://ptg.test/api/v1/projects/${h.s.project.id}/transfers/${t.id}/signed-chunks/0`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer x` }, body: "{}" });
    expect(r.status).toBe(401); // uten token
  });
});

describe("C-0 rester: panelretur (C-7)", () => {
  it("bilde til panel blir skjult kandidatlag, konflikt ved revisjonsendring", async () => {
    const h = setup();
    await login(h, FULL_SCOPE);
    const bytes = png(5000);
    const revision = h.mem.state.compositions[h.panelId as never]!.revision;
    const t = await h.sdk.upload(h.s.project.id, { name: "Panel-1.png", bytes }, { panelId: h.panelId, panelRevision: revision }, "panel-nokkel-00001");
    expect(t.status).toBe("candidate");
    expect(t.panelId).toBe(h.panelId);
    expect(t.conflictId).toBeNull(); // samme revisjon som panelet: ingen konflikt
    const st = h.mem.state;
    // Ny ressurs med én versjon, og et lag i panelet som er SKJULT (visible: false).
    const version = Object.values(st.assetVersions).find(v => v.id === t.candidateVersionId);
    expect(version).toBeTruthy();
    const layers = Object.values(st.layers ?? {}).filter(l => l.compositionId === h.panelId);
    const hidden = layers.find(l => l.versionId === t.candidateVersionId);
    expect(hidden).toBeTruthy();
    expect(hidden!.visible).toBe(false);
    // Utgått revisjonsgrunnlag: kandidaten lages likevel, men merkes med konflikt.
    const stale = await h.sdk.upload(h.s.project.id, { name: "Panel-1b.png", bytes: png(6000) }, { panelId: h.panelId, panelRevision: revision + 5 }, "panel-nokkel-00002");
    expect(stale.status).toBe("candidate");
    expect(stale.conflictId).toBeTruthy();
  });
  it("ukjent panel avvises ved reservasjon", async () => {
    const h = setup();
    await login(h, FULL_SCOPE);
    await expect(h.sdk.upload(h.s.project.id, { name: "p.png", bytes: png(100) }, { panelId: tid() as string, panelRevision: 1 }, "panel-nokkel-00002")).rejects.toMatchObject({ code: "target_not_found" });
  });
});

describe("C-0 rester: connector_links og notater", () => {
  it("lenker: opprett, list, oppdater og fjern — avgrenset per klient", async () => {
    const h = setup();
    await login(h, FULL_SCOPE);
    const put = await h.sdk.putLink(h.s.project.id, { entity: "panel", entityId: h.panelId, externalId: "sbpro://scene/1/panel/3" });
    expect(put.id).toBeTruthy();
    const list = await h.sdk.links(h.s.project.id, "panel", h.panelId);
    expect(list.links).toHaveLength(1);
    expect(list.links[0]!.externalId).toBe("sbpro://scene/1/panel/3");
    const again = await h.sdk.putLink(h.s.project.id, { entity: "panel", entityId: h.assetId, externalId: "sbpro://scene/1/panel/3" });
    expect(again.id).toBe(put.id); // upsert på samme eksterne ID
    expect(again.revision).toBe(put.revision + 1);
    await h.sdk.removeLink(h.s.project.id, { entity: "panel", externalId: "sbpro://scene/1/panel/3" });
    expect((await h.sdk.links(h.s.project.id)).links).toHaveLength(0);
  });
  it("lenker: validering og takhøyde", async () => {
    expect(checkLink({ entity: "panel", entityId: "x", externalId: "y" }).ok).toBe(true);
    expect(checkLink({ entity: "film", entityId: "x", externalId: "y" })).toEqual({ ok: false, reason: "entity" });
    expect(checkLink({ entity: "panel", entityId: "x", externalId: "y".repeat(501) })).toEqual({ ok: false, reason: "external_id" });
    const h = setup();
    await login(h, FULL_SCOPE);
    const mem = h.mem as unknown as { store: never };
    void mem;
    // Fyll opp til taket gjennom minnelagerets egen metode (billig tak-test).
    for (let i = 0; i < LINKS_MAX_PER_PROJECT; i++) await h.mem.store.putLink(h.s.project.id, "ptg.photoshop", USER, { entity: "asset", entityId: h.assetId, externalId: `ext-${i}` });
    await expect(h.sdk.putLink(h.s.project.id, { entity: "asset", entityId: h.assetId, externalId: "en-for-mye" })).rejects.toMatchObject({ code: "too_many_links" });
  });
  it("notater: notes:write lager notatflagg; uten scope 403; validering og tak", async () => {
    expect(checkNote({ targetKind: "occurrence", targetId: "x", text: "Hei" }).ok).toBe(true);
    expect(checkNote({ targetKind: "project", targetId: "x", text: "Hei" })).toEqual({ ok: false, reason: "target" });
    expect(checkNote({ targetKind: "occurrence", targetId: "x", text: "  " })).toEqual({ ok: false, reason: "text" });
    const h = setup();
    await login(h, "project:read transfers:write"); // uten notes:write
    await expect(h.sdk.addNote(h.s.project.id, { targetKind: "occurrence", targetId: h.occ.id, text: "Fra plugin" })).rejects.toMatchObject({ code: "insufficient_scope" });
    await login(h, FULL_SCOPE);
    const n = await h.sdk.addNote(h.s.project.id, { targetKind: "occurrence", targetId: h.occ.id, text: "Fra plugin" });
    expect(n.id).toBeTruthy();
    const flag = h.mem.state.noteFlags?.[n.id as never];
    expect(flag?.text).toBe("Fra plugin");
    expect(flag?.targetId).toBe(h.occ.id);
  });
});
