// @vitest-environment node
/**
 * C-2 Photoshop-plugin uten Photoshop: falsk photoshop/uxp-modul (app, core, action, storage, shell),
 * manifestkontroll og hele SDK-flyten mot den falske /api/v1-serveren (C-0). Ingen nettverk.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyProjectState, FPS_25, type ProjectState } from "@/core";
import { makeToken, sha256Hex, tokenHash } from "@/core/connectors";
import { handleApiV1 } from "@/adapters/connectors/api-v1";
import { PtgConnector } from "../../packages/ptg-connector-sdk/src/index";
import { memoryStore } from "../helpers/c0-memory-store";
import { mustApply, tid } from "../helpers/fixtures";
import { PhotoshopPlugin, REDIRECT_URI, SCOPES, CLIENT_ID } from "../../plugins/photoshop/src/controller";
import { checkUxpManifest } from "../../plugins/photoshop/src/manifest-check";
import { secureTokenStore, TOKEN_KEY } from "../../plugins/photoshop/src/token-store";
import { LANGS, STRINGS, pickLang, tr } from "../../plugins/photoshop/src/strings";
import { linkFileName, linkKey, rememberLink } from "../../plugins/photoshop/src/links";
import type { Host, PsDocument, UxpFile } from "../../plugins/photoshop/src/host";

const ROOT = join(__dirname, "../..");
const PLUGIN = join(ROOT, "plugins/photoshop");
const USER = "00000000-0000-7000-8000-a11ce0000002";
let seed = 7;
const random = (n: number) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24; return b; };
const png = (n: number) => { const b = new Uint8Array(n); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); for (let i = 8; i < n; i++) b[i] = i % 251; return b; };
const BINARY = Symbol("binary"), UTF8 = Symbol("utf8");

/** Falsk Photoshop + UXP. Dokumenter har lag; saveAs.psd skriver en PSD-signatur pluss lagene som bytes. */
function fakeHost(fetchFn: typeof fetch, language = "nb-NO") {
  const folders = { tmp: new Map<string, Uint8Array | string>(), data: new Map<string, Uint8Array | string>() };
  const folder = (m: Map<string, Uint8Array | string>) => ({
    async createFile(name: string) { return file(m, name); },
    async getEntry(name: string) { if (!m.has(name)) throw new Error("missing"); return file(m, name); },
  });
  const file = (m: Map<string, Uint8Array | string>, name: string): UxpFile => ({
    name,
    async read(o) { const v = m.get(name)!; return o.format === BINARY ? (v as Uint8Array).slice().buffer : String(v); },
    async write(d, o) { m.set(name, o.format === BINARY ? new Uint8Array(d as ArrayBuffer) : String(d)); },
  });
  const secure = new Map<string, Uint8Array>();
  const calls = { modal: [] as string[], batchPlay: [] as object[][], open: [] as string[], external: [] as string[], saveOptions: [] as unknown[] };
  const docs: (PsDocument & { layers: string[] })[] = [];
  const app = {
    activeDocument: null as (PsDocument & { layers: string[] }) | null,
    async open(f: UxpFile) {
      calls.open.push(f.name);
      const doc: PsDocument & { layers: string[] } = {
        id: docs.length + 1, name: f.name, width: 1920, height: 1080, resolution: 300, mode: "RGBColorMode", layers: ["Background"],
        saveAs: { async psd(target, options, asCopy) {
          calls.saveOptions.push({ options, asCopy });
          await target.write(Uint8Array.from([...new TextEncoder().encode("8BPS"), 0, 1, ...new TextEncoder().encode(doc.layers.join("|"))]).buffer, { format: BINARY });
        } },
      };
      docs.push(doc); app.activeDocument = doc;
      return doc;
    },
  };
  const host: Host = {
    ps: {
      app,
      core: { async executeAsModal(fn, o) { calls.modal.push(o.commandName); return fn({}); } },
      action: { async batchPlay(desc) { calls.batchPlay.push(desc); return [{ width: { _unit: "pixelsUnit", _value: 1920 }, height: { _unit: "pixelsUnit", _value: 1080 }, resolution: { _unit: "densityUnit", _value: 300 }, profile: "sRGB IEC61966-2.1", mode: { _enum: "colorSpace", _value: "RGBColor" }, numberOfLayers: app.activeDocument?.layers.length ?? 0 }]; } },
    },
    uxp: {
      storage: {
        localFileSystem: { async getTemporaryFolder() { return folder(folders.tmp); }, async getDataFolder() { return folder(folders.data); } },
        formats: { binary: BINARY, utf8: UTF8 },
        secureStorage: { async getItem(k) { return secure.get(k) ?? null; }, async setItem(k, v) { secure.set(k, typeof v === "string" ? new TextEncoder().encode(v) : v); }, async removeItem(k) { secure.delete(k); } },
      },
      shell: { async openExternal(url) { calls.external.push(url); } },
    },
    fetch: fetchFn, random, language,
  };
  return { host, app, folders, secure, calls, docs };
}

function harness(opts: { approvedIsBase?: boolean } = {}) {
  let s: ProjectState = emptyProjectState({ id: tid<"project">(), revision: 1, name: "Papirdrage", fps: FPS_25, frameWidth: 1920, frameHeight: 1080, sourceLanguage: "nb" });
  const assetId = tid<"asset">(), variantId = tid<"asset_variant">(), v1 = tid<"asset_version">(), v2 = tid<"asset_version">();
  s = mustApply(s, { type: "CreateAssets", assets: [{ assetId, fields: { kind: "character", name: "Drage", names: [], description: "", category: "", tags: [] } }] });
  s = mustApply(s, { type: "CreateAssetVariant", variantId, assetId, fields: { name: "Hoved", style: "illustrated", appearance: "" } });
  const bytes1 = png(4000), bytes2 = png(5000);
  const media = (v: string, b: Uint8Array) => ({ path: `${s.project.id}/${assetId}/${v}/drage.png`, mimeType: "image/png", width: 1920, height: 1080, byteSize: b.length, sha256: sha256Hex(b) });
  s = mustApply(s, { type: "AddAssetVersion", versionId: v1, variantId, media: media(v1, bytes1), note: "" });
  s = mustApply(s, { type: "ApproveAssetVersion", variantId, versionId: v1 });
  s = mustApply(s, { type: "AddAssetVersion", versionId: v2, variantId, media: media(v2, bytes2), note: "" });
  let now = Date.parse("2026-10-24T09:00:00Z");
  const mem = memoryStore(s, { now: () => now });
  mem.files.set(media(v1, bytes1).path, bytes1);
  mem.files.set(media(v2, bytes2).path, bytes2);
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => handleApiV1(new Request(String(input), init), { store: mem.store, now: () => now, random, ip: "203.0.113.9" })) as typeof fetch;
  const fake = fakeHost(fetchFn);
  const sdk = new PtgConnector({ baseUrl: "https://ptg.test", clientId: CLIENT_ID, fetch: fetchFn, random, tokens: secureTokenStore(fake.host.uxp.storage.secureStorage), now: () => now, sleep: async ms => { now += ms; } });
  const plugin = new PhotoshopPlugin(fake.host, "https://ptg.test", sdk);
  void opts;
  return { plugin, mem, fake, sdk, assetId, variantId, v1, v2, bytes1, bytes2, projectId: s.project.id as string, tick: (ms: number) => { now += ms; } };
}

/** Det godkjenningssiden gjør: brukeren godkjenner, serveren lager koden, nettleseren går til redirect. */
async function signIn(h: ReturnType<typeof harness>) {
  await h.plugin.beginSignIn();
  const u = new URL(h.fake.calls.external.at(-1)!);
  expect(u.pathname).toBe("/koble");
  expect(u.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
  expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  expect(u.searchParams.get("client_id")).toBe("ptg.photoshop");
  const code = makeToken("code", random(32));
  h.mem.approveCode(tokenHash(code), { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, challenge: u.searchParams.get("code_challenge")!, projectId: h.projectId, userId: USER, scopes: SCOPES.split(" ") });
  await h.plugin.finishSignIn(`${REDIRECT_URI}?code=${code}&state=${u.searchParams.get("state")}`);
}

describe("C-2 manifest og pakking", () => {
  const manifest = JSON.parse(readFileSync(join(PLUGIN, "manifest.json"), "utf8"));
  const opts = { allowedDomains: ["https://pentoglass.com"], panelIds: ["ptgPanel"] };
  it("manifest v5 for Photoshop 27+ med bare appens domene og https i nettleseren", () => {
    expect(checkUxpManifest(manifest, opts)).toEqual([]);
    expect(manifest.host.minVersion).toBe("27.0.0");
  });
  it("kontrollen avviser jokertegn, eldre Photoshop, manglende panel og hemmeligheter", () => {
    const bad = (patch: (m: any) => void) => { const m = structuredClone(manifest); patch(m); return checkUxpManifest(m, opts).length; };
    expect(bad(m => { m.requiredPermissions.network.domains = ["https://*.pentoglass.com"]; })).toBeGreaterThan(0);
    expect(bad(m => { m.requiredPermissions.network.domains.push("https://evil.example"); })).toBeGreaterThan(0);
    expect(bad(m => { m.host.minVersion = "26.5.0"; })).toBeGreaterThan(0);
    expect(bad(m => { m.manifestVersion = 4; })).toBeGreaterThan(0);
    expect(bad(m => { m.entrypoints = []; })).toBeGreaterThan(0);
    expect(bad(m => { m.clientSecret = "x"; })).toBeGreaterThan(0);
    expect(bad(m => { m.requiredPermissions.launchProcess.schemes = ["file"]; })).toBeGreaterThan(0);
  });
  it("pluginkoden bruker bare SDK-et/kjernen, ingen hemmeligheter, localStorage eller innerHTML", () => {
    const dir = join(PLUGIN, "src");
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), "utf8");
      const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map(m => m[1]!);
      for (const i of imports) expect(i.startsWith("./") || i.startsWith("../../../packages/ptg-connector-sdk/"), `${f}: ${i}`).toBe(true);
      expect(src, f).not.toMatch(/localStorage|innerHTML|process\.env|client_secret|sb_secret_|sk_live/);
    }
    expect(readFileSync(join(PLUGIN, "src/main.ts"), "utf8")).toMatch(/require\("photoshop"\)[\s\S]*require\("uxp"\)/);
  });
});

describe("C-2 tekster", () => {
  it("alle tekster finnes på alle språk med samme plassholdere", () => {
    for (const [key, row] of Object.entries(STRINGS)) for (const l of LANGS) {
      const text = (row as Record<string, string>)[l]!;
      expect(text, `${key}/${l}`).toBeTruthy();
      expect([...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(), `${key}/${l}`).toEqual([...row.en.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort());
    }
  });
  it("Photoshops språk velges, med engelsk som reserve", () => {
    expect(pickLang("nb_NO")).toBe("nb"); expect(pickLang("no")).toBe("nb"); expect(pickLang("pt-PT")).toBe("pt-BR");
    expect(pickLang("ja-JP")).toBe("ja"); expect(pickLang("sv-SE")).toBe("en"); expect(pickLang(undefined)).toBe("en");
    expect(tr("en", "progress", { done: 1, total: 3 })).toBe("Sending 1 of 3");
  });
  it("filnavn og koblinger: trygge navn, unike per versjon, begrenset antall", () => {
    expect(linkFileName("Drage/hode:1", 3, "0193a1b2-c3d4-7000-8000-000000000000", "psd")).toBe("Drage_hode_1-v3-0193a1b2.psd");
    expect(linkKey("Drage-v3-0193a1b2.PSD")).toBe("drage-v3-0193a1b2");
    let all = {};
    for (let i = 0; i < 205; i++) all = rememberLink(all, { projectId: "p", assetId: "a", variantId: "v", baseVersionId: String(i), baseNumber: i, assetName: "A", fileName: `a-${i}.psd`, openedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() });
    expect(Object.keys(all)).toHaveLength(200);
    expect(Object.keys(all)).not.toContain("a-0");
  });
});

describe("C-2 flyt mot falsk server og falsk Photoshop", () => {
  it("PKCE via nettleseren: tokens bare i secureStorage, panelet viser prosjekt, ressurser og notater", async () => {
    const h = harness();
    await signIn(h);
    const st = h.plugin.state;
    expect(st.signedIn).toBe(true);
    expect(st.projectName).toBe("Papirdrage");
    expect(st.assets.map(a => a.name)).toEqual(["Drage"]);
    expect([...h.fake.secure.keys()]).toEqual([TOKEN_KEY]);
    expect(h.fake.folders.data.size).toBe(0); // ingen tokens i pluginfiler
    expect(JSON.stringify(st)).not.toMatch(/ptg[ar]_/);
  });
  it("feil state i innlimt adresse avvises (CSRF), og feil skjema avvises", async () => {
    const h = harness();
    await h.plugin.beginSignIn();
    await h.plugin.finishSignIn(`${REDIRECT_URI}?code=x&state=feil`);
    expect(h.plugin.state.signedIn).toBe(false);
    expect(h.plugin.state.message?.kind).toBe("error");
    await h.plugin.finishSignIn("https://evil.example/cb?code=x");
    expect(h.plugin.state.message?.text).toContain("wrong_address");
    expect(h.fake.secure.size).toBe(0);
  });
  it("«Åpne fra Pen to Glass»: henter filen, sjekker SHA-256 og åpner i executeAsModal; koblingen huskes", async () => {
    const h = harness();
    await signIn(h);
    await h.plugin.selectAsset(h.assetId);
    expect(h.plugin.state.versions.map(v => v.number)).toEqual([2, 1]);
    await h.plugin.openVersion(h.v1);
    expect(h.fake.calls.open).toHaveLength(1);
    expect(h.fake.calls.modal).toContain(tr("nb", "open"));
    const opened = h.fake.folders.tmp.get(h.fake.calls.open[0]!) as Uint8Array;
    expect(sha256Hex(opened)).toBe(sha256Hex(h.bytes1));
    expect(h.plugin.state.link).toMatchObject({ baseVersionId: h.v1, baseNumber: 1, variantId: h.variantId });
    expect(h.plugin.state.docInfo).toMatchObject({ resolution: 300, colorProfile: "sRGB IEC61966-2.1", width: 1920 });
    expect(JSON.parse(String(h.fake.folders.data.get("links.json")))).toHaveProperty([linkKey(h.fake.calls.open[0]!)]);
  });
  it("nedlasting med feil sjekksum avvises", async () => {
    const h = harness();
    await signIn(h);
    for (const [k, v] of h.mem.files) if (k.includes(h.v1)) h.mem.files.set(k, Uint8Array.from(v, (b, i) => (i === 50 ? b ^ 1 : b)));
    await expect(h.sdk.download(h.projectId, h.assetId, h.v1)).rejects.toMatchObject({ code: "checksum_mismatch" });
  });
  it("«Send tilbake»: PSD med lag, alfa og fargeprofil som ny kandidat med revisjonsgrunnlag; ingenting tas i bruk", async () => {
    const h = harness();
    await signIn(h);
    await h.plugin.selectAsset(h.assetId);
    await h.plugin.openVersion(h.v1);
    h.fake.app.activeDocument!.layers.push("Linjer", "Farge"); // brukeren endrer lag
    const before = Object.keys(h.mem.state.assetVersions).length;
    await h.plugin.sendBack();
    expect(h.fake.calls.saveOptions.at(-1)).toEqual({ options: { embedColorProfile: true, alphaChannels: true, layers: true, maximizeCompatibility: true }, asCopy: true });
    expect(h.fake.calls.modal).toContain(tr("nb", "sendBack"));
    const t = [...h.mem.transfers.values()].at(-1)!;
    expect(t.baseVersionId).toBe(h.v1);
    expect(t.fileName).toMatch(/\.psd$/);
    const v = h.mem.state.assetVersions[t.candidateVersionId as never]!;
    expect(v.mimeType).toBe("image/vnd.adobe.photoshop");
    expect(new TextDecoder().decode(h.mem.files.get(v.mediaPath)!)).toContain("Background|Linjer|Farge");
    expect(Object.keys(h.mem.state.assetVersions)).toHaveLength(before + 1);
    expect(h.mem.state.assetVariants[h.variantId]!.approvedVersionId).toBe(h.v1);
    expect(h.plugin.state.conflict).toBeNull();
    expect(h.plugin.state.message?.text).toBe(tr("nb", "sent"));
    // Samme fil igjen gjenopptar samme overføring (idempotent), ingen ny versjon.
    await h.plugin.sendBack();
    expect(Object.keys(h.mem.state.assetVersions)).toHaveLength(before + 1);
  });
  it("uten koblet dokument sendes ingenting", async () => {
    const h = harness();
    await signIn(h);
    await h.plugin.sendBack();
    expect(h.mem.transfers.size).toBe(0);
    expect(h.plugin.state.message?.text).toBe(tr("nb", "noDoc"));
  });
  it("konflikt: vises med de tre valgene; «Behold begge» lagres, «Bruk min» åpner appen og godkjenner ikke", async () => {
    const h = harness();
    await signIn(h);
    await h.plugin.selectAsset(h.assetId);
    await h.plugin.openVersion(h.v2); // grunnlaget er ikke den godkjente versjonen
    h.fake.app.activeDocument!.layers.push("Ny");
    await h.plugin.sendBack();
    expect(h.plugin.state.conflict).not.toBeNull();
    expect(h.plugin.state.message?.text).toBe(tr("nb", "conflict"));
    await h.plugin.resolve("choose_incoming");
    expect(h.fake.calls.external.at(-1)).toBe("https://ptg.test/konto#c0-conflicts");
    expect(h.plugin.state.conflict).not.toBeNull();
    expect(h.mem.state.assetVariants[h.variantId]!.approvedVersionId).toBe(h.v1);
    await h.plugin.resolve("keep_both");
    expect(h.plugin.state.conflict).toBeNull();
    expect(h.plugin.state.message?.text).toBe(tr("nb", "resolved"));
    const c = (await h.sdk.conflicts(h.projectId)).conflicts[0]!;
    expect(c).toMatchObject({ status: "resolved", choice: "keep_both", revision: 2 });
    expect(Object.values(h.mem.state.assetVersions).filter(v => !v.removed)).toHaveLength(3); // ingenting slettet
  });
  it("API-et: choose_incoming fra plugin gir approve_in_app, gammel revisjon gir stale", async () => {
    const h = harness();
    await signIn(h);
    await h.sdk.upload(h.projectId, { name: "d.png", bytes: png(600) }, { assetId: h.assetId, variantId: h.variantId, baseVersionId: h.v2 }, "z".repeat(20));
    const c = (await h.sdk.conflicts(h.projectId)).conflicts[0]!;
    await expect(h.sdk.resolveConflict(h.projectId, c.id, "choose_incoming", c.revision)).rejects.toMatchObject({ status: 409, code: "approve_in_app" });
    await h.sdk.resolveConflict(h.projectId, c.id, "choose_current", c.revision);
    await expect(h.sdk.resolveConflict(h.projectId, c.id, "keep_both", c.revision)).rejects.toMatchObject({ status: 409, code: "stale" });
  });
  it("tilbaketrekking av tilgang: neste kall gir 401, pluginen logger ut lokalt og ber om ny innlogging", async () => {
    const h = harness();
    await signIn(h);
    await h.plugin.selectAsset(h.assetId);
    await h.plugin.openVersion(h.v1);
    h.mem.revokeSession(h.mem.sessions[0]!.id);
    await h.plugin.sendBack();
    expect(h.plugin.state.signedIn).toBe(false);
    expect(h.plugin.state.message?.text).toBe(tr("nb", "revoked"));
    expect(h.fake.secure.size).toBe(0);
    expect(h.mem.transfers.size).toBe(0);
  });
  it("enhetsflyt som reserve: koden vises, nettleseren åpnes, og godkjenning logger inn", async () => {
    const h = harness();
    const origLogin = h.sdk.deviceLogin.bind(h.sdk);
    h.sdk.deviceLogin = (scope, show, signal) => origLogin(scope, d => { show(d); h.mem.approveDevice(d.userCode, h.projectId, USER); }, signal);
    await h.plugin.deviceSignIn();
    expect(h.plugin.state.signedIn).toBe(true);
    expect(h.fake.calls.external.at(-1)).toContain("/koble?user_code=");
  });
  it("start() uten lagrede tokens viser innlogging; med tokens lastes prosjektet", async () => {
    const h = harness();
    await h.plugin.start();
    expect(h.plugin.state.signedIn).toBe(false);
    expect(h.plugin.state.message).toBeNull();
    await signIn(h);
    const again = new PhotoshopPlugin(h.fake.host, "https://ptg.test", h.sdk);
    await again.start();
    expect(again.state.signedIn).toBe(true);
  });
  it("utlogging trekker tilbake tokenet på serveren og tømmer secureStorage", async () => {
    const h = harness();
    await signIn(h);
    await h.plugin.signOut();
    expect(h.fake.secure.size).toBe(0);
    expect(h.mem.sessions[0]!.revokedAt).not.toBeNull();
  });
});
