// @vitest-environment node
/** C-0 Creative Connectors: kjerne, API v1 mot falsk lagring, SDK mot falsk server og OpenAPI. Ingen nettverk. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyProjectState, FPS_25, type ProjectState } from "@/core";
import {
  ADAPTERS, CHUNK_BYTES, checkIntake, checkSession, findSecrets, framesToTimecode, makeToken, makeUserCode, needsConflict, offerFor,
  pkceChallenge, pkceMatches, resolveConflict, roundTripManifest, sha256Hex, sniffExtension, tokenHash, tokenKind, validateManifest,
  validDescriptor, buildProjectManifest, planCandidate,
} from "@/core/connectors";
import { handleApiV1 } from "@/adapters/connectors/api-v1";
import { PtgConnector, memoryTokenStore, ConnectorError } from "../../packages/ptg-connector-sdk/src/index";
import { memoryStore } from "../helpers/c0-memory-store";
import { mustApply, tid } from "../helpers/fixtures";

const ROOT = join(__dirname, "../..");
let seed = 1;
const random = (n: number) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24; return b; };
const USER = "00000000-0000-7000-8000-a11ce0000001";

function project() {
  let s: ProjectState = emptyProjectState({ id: tid<"project">(), revision: 1, name: "C0", fps: FPS_25, frameWidth: 1920, frameHeight: 1080, sourceLanguage: "en" });
  const assetId = tid<"asset">(), variantId = tid<"asset_variant">(), v1 = tid<"asset_version">(), v2 = tid<"asset_version">();
  s = mustApply(s, { type: "CreateAssets", assets: [{ assetId, fields: { kind: "character", name: "Kite", names: [], description: "", category: "", tags: [] } }] });
  s = mustApply(s, { type: "CreateAssetVariant", variantId, assetId, fields: { name: "Main", style: "illustrated", appearance: "" } });
  const media = (v: string) => ({ path: `${s.project.id}/${assetId}/${v}/a.png`, mimeType: "image/png", width: 10, height: 10, byteSize: 10, sha256: "a".repeat(64) });
  s = mustApply(s, { type: "AddAssetVersion", versionId: v1, variantId, media: media(v1), note: "" });
  s = mustApply(s, { type: "ApproveAssetVersion", variantId, versionId: v1 });
  s = mustApply(s, { type: "AddAssetVersion", versionId: v2, variantId, media: media(v2), note: "" });
  return { s, assetId, variantId, v1, v2 };
}
const png = (size: number) => { const b = new Uint8Array(size); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); for (let i = 8; i < size; i++) b[i] = i % 251; return b; };
const jpg = (size: number) => { const b = new Uint8Array(size); b.set([0xff, 0xd8, 0xff, 0xe0]); return b; };

function harness(opts: { rateLimit?: number; quotaBytes?: number } = {}) {
  const p = project();
  let now = Date.parse("2026-10-24T08:00:00Z");
  const mem = memoryStore(p.s, { now: () => now, ...opts });
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => handleApiV1(new Request(String(input), init), { store: mem.store, now: () => now, random, ip: "203.0.113.1" })) as typeof fetch;
  const sdk = new PtgConnector({ baseUrl: "https://ptg.test", clientId: "ptg.photoshop", fetch: fetchFn, random, tokens: memoryTokenStore(), now: () => now, sleep: async ms => { now += ms; } });
  return { ...p, mem, sdk, fetchFn, tick: (ms: number) => { now += ms; }, get now() { return now; } };
}
/** Simulerer nettlesersiden: brukeren godkjenner, serveren lager koden, redirect med kode. */
async function pkceLogin(h: ReturnType<typeof harness>, scope = "project:read manifest:read assets:read transfers:write conflicts:read") {
  const redirect = "http://127.0.0.1:7777/cb";
  const b = h.sdk.beginAuthorization(redirect, scope);
  const u = new URL(b.url);
  const code = makeToken("code", random(32));
  h.mem.approveCode(tokenHash(code), { clientId: "ptg.photoshop", redirectUri: redirect, challenge: u.searchParams.get("code_challenge")!, projectId: h.s.project.id, userId: USER, scopes: scope.split(" ") });
  return h.sdk.completeAuthorization(`${redirect}?code=${code}&state=${b.state}`, { verifier: b.verifier, state: b.state, redirectUri: redirect });
}

describe("C-0 kjerne", () => {
  it("SHA-256 og PKCE S256 stemmer med referansen (FIPS 180-4, RFC 7636)", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    for (let i = 0; i < 20; i++) {
      const bytes = random(300 + i * 37);
      expect(sha256Hex(bytes)).toBe(createHash("sha256").update(bytes).digest("hex"));
      const verifier = Buffer.from(random(32)).toString("base64url");
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      expect(pkceChallenge(verifier)).toBe(challenge);
      expect(pkceMatches(verifier, challenge)).toBe(true);
      expect(pkceMatches(verifier.slice(0, -1) + (verifier.endsWith("A") ? "B" : "A"), challenge)).toBe(false);
    }
    expect(pkceMatches("short", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(false);
  });
  it("token: bare hash lagres, prefiks bestemmer type, brukerkode uten forvekslbare tegn", () => {
    const tk = makeToken("access", random(32));
    expect(tokenKind(tk)).toBe("access");
    expect(tokenHash(tk)).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash(tk)).not.toContain(tk.slice(5));
    expect(tokenKind("ptgc_short")).toBeNull();
    expect(makeUserCode(random(8))).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  });
  it("sesjon: utløp, tilbaketrekking, prosjekt og scope", () => {
    const row = { id: "s", projectId: "p", userId: "u", scopes: ["assets:read"], expiresAt: "2026-10-24T09:00:00Z", revokedAt: null };
    const now = Date.parse("2026-10-24T08:00:00Z");
    expect(checkSession(row, now, { scope: "assets:read", projectId: "p" })).toEqual({ ok: true });
    expect(checkSession(row, Date.parse("2026-10-24T09:00:00Z"), { scope: "assets:read" })).toEqual({ ok: false, reason: "expired" });
    expect(checkSession({ ...row, revokedAt: "x" }, now, { scope: "assets:read" })).toEqual({ ok: false, reason: "revoked" });
    expect(checkSession(row, now, { scope: "transfers:write" })).toEqual({ ok: false, reason: "scope" });
    expect(checkSession(row, now, { scope: "assets:read", projectId: "q" })).toEqual({ ok: false, reason: "project" });
  });
  it("manifest: gyldig, brøk-bildefrekvens, ukjente felt bevares ved rundtur", () => {
    const { s } = project();
    const m = buildProjectManifest(s, "2026-10-24T08:00:00Z", { id: "test", version: "1" });
    expect(validateManifest(m).ok).toBe(true);
    expect(m.frameRate).toEqual({ num: 25, den: 1 });
    const extended = { ...m, futureField: { nested: [1, { x: "y" }] }, items: m.items.map(i => ({ ...i, vendorExtra: { layerBlend: "multiply" } })) };
    const r = roundTripManifest(JSON.stringify(extended));
    expect(r.ok).toBe(true);
    expect(JSON.parse(r.json!)).toEqual(extended);
    expect(framesToTimecode(25 * 3661 + 7, { num: 25, den: 1 })).toBe("01:01:01:07");
  });
  it("manifest: avviser hemmeligheter, feil versjon, flyttall-fps og ugyldige filer", () => {
    const { s } = project();
    const m = buildProjectManifest(s, "2026-10-24T08:00:00Z", { id: "test", version: "1" });
    const bad = (x: unknown) => { const r = validateManifest(x); return r.ok ? [] : r.issues.map(i => i.code); };
    expect(bad({ ...m, accessToken: "x" })).toContain("secret");
    expect(bad({ ...m, adapter: { ...m.adapter, note: "ptgc_" + "a".repeat(43) } })).toContain("secret");
    expect(bad({ ...m, extra: { refresh_token: "1" } })).toContain("secret");
    expect(findSecrets({ deep: [{ password: "x" }] })).toEqual(["$.deep[0].password"]);
    expect(bad({ ...m, manifestVersion: 2 })).toContain("version");
    expect(bad({ ...m, frameRate: 23.976 })).toContain("type");
    expect(bad({ ...m, items: [{ kind: "version", id: "v", files: [{ path: "../x", sha256: "z", byteSize: -1, mimeType: "" }] }] })).toEqual(expect.arrayContaining(["format", "range", "required"]));
  });
  it("innhold: hvitelisten fra AE-rettingen, innholdssjekk og kontrollsum", () => {
    const head = png(16);
    const ok = { fileName: "a.png", byteSize: 100, head, declaredSha256: "a".repeat(64), actualSha256: "a".repeat(64) };
    expect(checkIntake(ok)).toEqual({ ok: true, mimeType: "image/png", extension: "png" });
    expect(checkIntake({ ...ok, fileName: "a.webp" })).toEqual({ ok: false, reason: "extension" });
    expect(checkIntake({ ...ok, fileName: "a.exe" })).toEqual({ ok: false, reason: "extension" });
    expect(checkIntake({ ...ok, head: jpg(16) })).toEqual({ ok: false, reason: "mismatch" });
    expect(checkIntake({ ...ok, head: new Uint8Array(16) })).toEqual({ ok: false, reason: "content" });
    expect(checkIntake({ ...ok, actualSha256: "b".repeat(64) })).toEqual({ ok: false, reason: "checksum" });
    expect(sniffExtension(Uint8Array.from([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypqt  ")]))).toBe("mov");
  });
  it("kandidat: bare AddAssetVersion, aldri godkjenning; konflikt når grunnlaget er utdatert", () => {
    const plan = planCandidate({ versionId: "v", variantId: "va", approvedVersionId: "v1", baseVersionId: "v0", media: { path: "p", mimeType: "image/png", byteSize: 1, sha256: "a".repeat(64), width: null, height: null }, note: "" });
    expect(plan.commands.map(c => c.type)).toEqual(["AddAssetVersion"]);
    expect(plan.conflict).toBe(true);
    expect(needsConflict("v1", "v1")).toBe(false);
  });
  it("konflikt: alle valg bevarer begge; bare «bruk innkommende» godkjenner", () => {
    const c = { variantId: "va", incomingVersionId: "vi" };
    expect(resolveConflict("keep_both", c)).toEqual({ command: null, status: "resolved", deletes: [] });
    expect(resolveConflict("choose_current", c)).toEqual({ command: null, status: "resolved", deletes: [] });
    expect(resolveConflict("reject", c)).toEqual({ command: null, status: "rejected", deletes: [] });
    expect(resolveConflict("choose_incoming", c).command).toEqual({ type: "ApproveAssetVersion", variantId: "va", versionId: "vi" });
  });
  it("kapabiliteter: viser handling bare når adapteren kan det, ellers «Eksporter for …»", () => {
    for (const a of ADAPTERS) expect(validDescriptor(a)).toBe(true);
    const ae = ADAPTERS.find(a => a.id === "adobe-after-effects-legacy")!;
    expect(offerFor(ae, "layers")).toEqual({ kind: "action", capability: "layers" });
    expect(offerFor(ae, "write")).toEqual({ kind: "export", format: "ae" });
  });
});

describe("C-0 API v1 og SDK mot falsk server", () => {
  it("PKCE-innlogging gir prosjektavgrenset sesjon; koden kan brukes bare én gang", async () => {
    const h = harness();
    const t = await pkceLogin(h);
    expect(t.projectId).toBe(h.s.project.id);
    expect(h.mem.sessions[0]!.accessHash).toBe(tokenHash(t.accessToken));
    expect(JSON.stringify(h.mem.sessions)).not.toContain(t.accessToken);
    expect((await h.sdk.session()).scopes).toContain("transfers:write");
    const res = await h.fetchFn("https://ptg.test/api/v1/oauth/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant_type: "authorization_code", code: "ptga_" + "x".repeat(43), code_verifier: "v".repeat(43), redirect_uri: "http://127.0.0.1:7777/cb", client_id: "ptg.photoshop" }) });
    expect(res.status).toBe(400);
  });
  it("PKCE: feil verifier eller redirect avvises", async () => {
    const h = harness();
    const redirect = "http://127.0.0.1:7777/cb";
    const b = h.sdk.beginAuthorization(redirect, "project:read");
    const code = makeToken("code", random(32));
    h.mem.approveCode(tokenHash(code), { clientId: "ptg.photoshop", redirectUri: redirect, challenge: new URL(b.url).searchParams.get("code_challenge")!, projectId: h.s.project.id, userId: USER, scopes: ["project:read"] });
    await expect(h.sdk.completeAuthorization(`${redirect}?code=${code}&state=${b.state}`, { verifier: "w".repeat(43), state: b.state, redirectUri: redirect })).rejects.toMatchObject({ code: "invalid_grant" });
    await expect(h.sdk.completeAuthorization(`${redirect}?code=${code}&state=feil`, { verifier: b.verifier, state: b.state, redirectUri: redirect })).rejects.toMatchObject({ code: "state_mismatch" });
  });
  it("enhetsflyt: venter til brukeren godkjenner, deretter tokens", async () => {
    const h = harness();
    const start = await h.fetchFn("https://ptg.test/api/v1/oauth/device", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: "ptg.cli", scope: "project:read" }) });
    const d = (await start.json()) as { device_code: string };
    const poll = await h.fetchFn("https://ptg.test/api/v1/oauth/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: d.device_code, client_id: "ptg.cli" }) });
    expect(await poll.json()).toEqual({ error: "authorization_pending" });
    let shown = "";
    const t = await h.sdk.deviceLogin("project:read manifest:read", x => { shown = x.userCode; h.mem.approveDevice(shown, h.s.project.id, USER); });
    expect(shown).toMatch(/^[A-Z]{4}-[A-Z]{4}$/);
    expect(t.scope).toBe("project:read manifest:read");
    expect((await h.sdk.manifest(h.s.project.id)).projectId).toBe(h.s.project.id);
  });
  it("utløp, scope, feil prosjekt og tilbaketrekking stoppes av serveren", async () => {
    const h = harness();
    const t = await pkceLogin(h, "project:read");
    const call = (path: string, token = t.accessToken) => h.fetchFn(`https://ptg.test${path}`, { headers: { Authorization: `Bearer ${token}` } });
    expect((await call(`/api/v1/projects/${h.s.project.id}/manifest`)).status).toBe(403);
    expect((await call(`/api/v1/projects/00000000-0000-4000-8000-ffffffffffff/manifest`)).status).toBe(403);
    expect((await call("/api/v1/session", "ptgc_" + "A".repeat(43))).status).toBe(401);
    h.tick(16 * 60_000);
    expect((await call("/api/v1/session")).status).toBe(401);
    expect((await h.sdk.session()).projectId).toBe(h.s.project.id); // SDK fornyer med refresh-token
    h.mem.revokeSession(h.mem.sessions[0]!.id);
    await expect(h.sdk.session()).rejects.toMatchObject({ status: 401 });
  });
  it("gjenbruk av et brukt refresh-token trekker tilbake hele sesjonen", async () => {
    const h = harness();
    const t = await pkceLogin(h, "project:read");
    const refresh = (rt: string) => h.fetchFn("https://ptg.test/api/v1/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt, client_id: "ptg.photoshop" }).toString() });
    const first = await refresh(t.refreshToken);
    expect(first.status).toBe(200);
    const next = (await first.json()) as { access_token: string };
    expect((await refresh(t.refreshToken)).status).toBe(400);
    expect((await h.fetchFn("https://ptg.test/api/v1/session", { headers: { Authorization: `Bearer ${next.access_token}` } })).status).toBe(401);
  });
  it("opplasting er gjenopptakbar og idempotent, og gir kandidat uten automatisk bruk", async () => {
    const h = harness();
    await pkceLogin(h);
    const bytes = png(CHUNK_BYTES + 1234);
    const key = PtgConnector.idempotencyKey(PtgConnector.checksum(bytes), { variantId: h.variantId, baseVersionId: h.v1 });
    // Første forsøk: reserver og send bare bit 0, så «brytes forbindelsen».
    const tk = (await h.sdk.session()) && (h.mem.sessions[0]!);
    const access = (await (async () => { const st = h.sdk as unknown as { o: { tokens: { load(): Promise<{ accessToken: string }> } } }; return (await st.o.tokens.load()).accessToken; })());
    const reserve = await h.fetchFn(`https://ptg.test/api/v1/projects/${h.s.project.id}/transfers`, { method: "POST", headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ fileName: "kite.png", byteSize: bytes.length, sha256: sha256Hex(bytes), target: { assetId: h.assetId, variantId: h.variantId }, base: { versionId: h.v1 } }) });
    expect(reserve.status).toBe(201);
    const { id } = (await reserve.json()) as { id: string };
    await h.fetchFn(`https://ptg.test/api/v1/projects/${h.s.project.id}/transfers/${id}/chunks/0`, { method: "PUT", headers: { Authorization: `Bearer ${access}` }, body: bytes.subarray(0, CHUNK_BYTES) });
    expect(tk).toBeTruthy();
    let progress: number[] = [];
    const r = await h.sdk.upload(h.s.project.id, { name: "kite.png", bytes }, { assetId: h.assetId, variantId: h.variantId, baseVersionId: h.v1 }, key, d => progress.push(d));
    expect(progress).toEqual([2]); // bare manglende bit sendt
    expect(r.status).toBe("candidate");
    expect(r.conflictId).toBeNull();
    const v = h.mem.state.assetVersions[r.candidateVersionId!]!;
    expect(v.sha256).toBe(sha256Hex(bytes));
    expect(h.mem.state.assetVariants[h.variantId]!.approvedVersionId).toBe(h.v1); // ikke tatt i bruk
    expect(h.mem.transfers.size).toBe(1);
    // Samme nøkkel igjen: samme overføring, ingen ny versjon
    const again = await h.sdk.upload(h.s.project.id, { name: "kite.png", bytes }, { assetId: h.assetId, variantId: h.variantId, baseVersionId: h.v1 }, key);
    expect(again.id).toBe(id);
    expect(Object.keys(h.mem.state.assetVersions)).toHaveLength(3);
    // Samme nøkkel, annen fil → 409
    await expect(h.sdk.upload(h.s.project.id, { name: "other.png", bytes: png(100) }, { assetId: h.assetId, variantId: h.variantId, baseVersionId: h.v1 }, key)).rejects.toMatchObject({ status: 409 });
    progress = [];
  });
  it("avvist filtype: innholdet stemmer ikke med endelsen, og ukjent endelse avvises ved reservasjon", async () => {
    const h = harness();
    await pkceLogin(h);
    await expect(h.sdk.upload(h.s.project.id, { name: "fake.png", bytes: jpg(500) }, { assetId: h.assetId, variantId: h.variantId, baseVersionId: h.v1 }, "k".repeat(20))).rejects.toMatchObject({ status: 415, code: "rejected_mismatch" });
    await expect(h.sdk.upload(h.s.project.id, { name: "x.webp", bytes: png(500) }, { assetId: h.assetId, variantId: h.variantId, baseVersionId: h.v1 }, "w".repeat(20))).rejects.toMatchObject({ status: 415 });
    expect(Object.keys(h.mem.state.assetVersions)).toHaveLength(2);
  });
  it("konflikt når revisjonsgrunnlaget ikke er godkjent versjon; listen kan leses", async () => {
    const h = harness();
    await pkceLogin(h);
    const r = await h.sdk.upload(h.s.project.id, { name: "k.png", bytes: png(300) }, { assetId: h.assetId, variantId: h.variantId, baseVersionId: h.v2 }, "c".repeat(20));
    expect(r.conflictId).not.toBeNull();
    expect(h.mem.state.assetVariants[h.variantId]!.approvedVersionId).toBe(h.v1);
    expect((await h.sdk.conflicts(h.s.project.id)).conflicts).toHaveLength(1);
  });
  it("kvote og fartsgrense", async () => {
    const h = harness({ quotaBytes: 100 });
    await pkceLogin(h);
    await expect(h.sdk.upload(h.s.project.id, { name: "k.png", bytes: png(300) }, { assetId: h.assetId, variantId: h.variantId, baseVersionId: h.v1 }, "q".repeat(20))).rejects.toMatchObject({ status: 413 });
    const r = harness({ rateLimit: 3 });
    await pkceLogin(r); // 1 token-treff
    await r.sdk.session(); await r.sdk.session(); await r.sdk.session();
    await expect(r.sdk.session()).rejects.toMatchObject({ status: 429 });
  });
  it("alle svar har no-store", async () => {
    const h = harness();
    const res = await h.fetchFn("https://ptg.test/api/v1/session", {});
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.status).toBe(401);
  });
  it("SDK-feil er typede", () => { expect(new ConnectorError(401, "x").status).toBe(401); });
});

describe("C-0 OpenAPI og SDK-arkitektur", () => {
  const spec = JSON.parse(readFileSync(join(ROOT, "docs/api/openapi-v1.json"), "utf8"));
  it("er gyldig OpenAPI 3.1 med løste $ref og responser på alle operasjoner", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title && spec.info.version).toBeTruthy();
    const refs: string[] = [];
    const walk = (v: unknown) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) k === "$ref" ? refs.push(String(x)) : walk(x); };
    walk(spec);
    for (const r of refs) {
      expect(r.startsWith("#/")).toBe(true);
      const target = r.slice(2).split("/").reduce<any>((o, k) => o?.[k], spec);
      expect(target, r).toBeTruthy();
    }
    const ids = new Set<string>();
    for (const [path, item] of Object.entries<any>(spec.paths)) {
      const params = [...path.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
      for (const [method, op] of Object.entries<any>(item)) {
        expect(["get", "post", "put", "delete", "patch"]).toContain(method);
        expect(Object.keys(op.responses).length).toBeGreaterThan(0);
        expect(ids.has(op.operationId)).toBe(false); ids.add(op.operationId);
        const declared = (op.parameters ?? []).map((p: { $ref: string }) => p.$ref.split("/").pop());
        for (const p of params) expect(declared, `${method} ${path}`).toContain(p);
        for (const sec of op.security ?? []) for (const s of sec.bearer ?? []) expect(Object.keys(spec.components.securitySchemes.bearer.flows.authorizationCode.scopes)).toContain(s);
      }
    }
  });
  it("alle ruter i handleren er beskrevet, og alle beskrevne svarer ikke 404 fra ruteren", async () => {
    const h = harness();
    for (const [path, item] of Object.entries<any>(spec.paths)) {
      if (path === "/openapi.json") continue;
      for (const method of Object.keys(item)) {
        const url = "https://ptg.test/api/v1" + path.replace("{projectId}", h.s.project.id).replace("{assetId}", h.assetId).replace("{transferId}", "00000000-0000-4000-8000-000000000001").replace("{index}", "0");
        const res = await h.fetchFn(url, { method: method.toUpperCase(), body: method === "get" ? undefined : "{}", headers: { "Content-Type": "application/json" } });
        const body = (await res.json()) as { error?: string };
        expect(body.error === "not_found" && res.status === 404 && !path.includes("{transferId}"), `${method} ${path}`).toBe(false);
      }
    }
  });
  it("SDK-en importerer bare plattformnøytral kjerne og har ingen hemmeligheter eller React", () => {
    const src = readFileSync(join(ROOT, "packages/ptg-connector-sdk/src/index.ts"), "utf8");
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map(m => m[1]!);
    expect(imports.every(i => i.startsWith("../../../src/core/connectors/"))).toBe(true);
    expect(src).not.toMatch(/from\s+["'](react|@supabase)|process\.env|client_secret|sk_live|sb_secret_/);
  });
});
