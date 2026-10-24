// @vitest-environment node
/**
 * C-7 Illustrator uten Illustrator: falsk CSInterface/window.cep.fs og en ExtendScript-modell som tolker kallene
 * i jsx/host.jsx (dokumenter med lag, XMP og PNG-eksport), rundtur av SVG med lag, grupper og skala, og hele
 * panelflyten mot det falske /api/v1 (C-0). Ingen nettverk.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyProjectState, FPS_25, type ProjectState } from "@/core";
import {
  ADAPTERS, ILLUSTRATOR_CLIENT_ID, ILLUSTRATOR_MAX_LAYERS, buildIllustratorSvg, clientKnown, illustratorUploadTarget, illustratorXmp,
  imagePixelSize, makeToken, parseIllustratorLink, readIllustratorSvg, redirectAllowed, sha256Hex, tokenHash, type IllustratorDoc,
} from "@/core/connectors";
import { encodePng } from "@/core/handoff/png";
import { handleApiV1 } from "@/adapters/connectors/api-v1";
import { PtgConnector, illustrator as sdkIllustrator } from "../../packages/ptg-connector-sdk/src/index";
import { memoryStore } from "../helpers/c0-memory-store";
import { mustApply, tid } from "../helpers/fixtures";
import { IllustratorPlugin, CLIENT_ID, REDIRECT_URI, SCOPES, TOKEN_FILE } from "../../plugins/illustrator/src/controller";
import { cepIllustrator } from "../../plugins/illustrator/src/cep-ai";
import { cepHost, fromBase64, toBase64 } from "../../plugins/audition/src/cep-host";
import { fileTokenStore } from "../../plugins/audition/src/token-store";
import { checkIllustratorManifest } from "../../plugins/illustrator/src/manifest-check";
import { LANGS, STRINGS, tr } from "../../plugins/illustrator/src/strings";
import type { CepFsLike, CSInterfaceLike } from "../../plugins/illustrator/src/host";

const ROOT = join(__dirname, "../..");
const PLUGIN = join(ROOT, "plugins/illustrator");
const USER = "00000000-0000-7000-8000-a11ce0000007";
let seed = 31;
const random = (n: number) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24; return b; };
const png = (w: number, h: number, v = 120) => encodePng(w, h, new Uint8Array(w * h * 4).fill(v));

function harness() {
  let s: ProjectState = emptyProjectState({ id: tid<"project">(), revision: 1, name: "Papirdrage", fps: FPS_25, frameWidth: 1920, frameHeight: 1080, sourceLanguage: "nb" });
  const assetId = tid<"asset">(), variantId = tid<"asset_variant">(), v1 = tid<"asset_version">(), v2 = tid<"asset_version">();
  s = mustApply(s, { type: "CreateAssets", assets: [{ assetId, fields: { kind: "character", name: "Drage", names: [], description: "", category: "", tags: [] } }] });
  s = mustApply(s, { type: "CreateAssetVariant", variantId, assetId, fields: { name: "Hoved", style: "illustrated", appearance: "" } });
  const b1 = png(64, 40), b2 = png(64, 40, 200);
  const media = (v: string, b: Uint8Array) => ({ path: `${s.project.id}/${assetId}/${v}/drage.png`, mimeType: "image/png", width: 64, height: 40, byteSize: b.length, sha256: sha256Hex(b) });
  s = mustApply(s, { type: "AddAssetVersion", versionId: v1, variantId, media: media(v1, b1), note: "" });
  s = mustApply(s, { type: "ApproveAssetVersion", variantId, versionId: v1 });
  s = mustApply(s, { type: "AddAssetVersion", versionId: v2, variantId, media: media(v2, b2), note: "" });
  let now = Date.parse("2026-10-24T12:00:00Z");
  const mem = memoryStore(s, { now: () => now });
  mem.files.set(media(v1, b1).path, b1); mem.files.set(media(v2, b2).path, b2);
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => handleApiV1(new Request(String(input), init), { store: mem.store, now: () => now, random, ip: "203.0.113.17" })) as typeof fetch;

  // Falsk CEP + ExtendScript-modell over host.jsx-funksjonene.
  const files = new Map<string, string>();
  const calls = { urls: [] as string[], scripts: [] as string[] };
  type Doc = { path: string; svg: IllustratorDoc; xmp: string | null; dpi: number; savedAi: string | null; edit: number };
  const app = { docs: [] as Doc[], active: null as Doc | null };
  const arg = (s: string) => JSON.parse(s);
  const csi: CSInterfaceLike = {
    evalScript(script, cb) {
      calls.scripts.push(script);
      const m = /^(\w+)\((.*)\)$/.exec(script)!;
      const args = m[2] ? JSON.parse(`[${m[2]}]`) as unknown[] : [];
      const a = app.active;
      switch (m[1]) {
        case "ptgOpenSvg": { const p = args[0] as string; if (!files.has(p)) return cb?.("err:missing"); const d: Doc = { path: p, svg: readIllustratorSvg(files.get(p)!), xmp: null, dpi: args[1] as number, savedAi: null, edit: 0 }; app.docs.push(d); app.active = d; return cb?.("ok"); }
        case "ptgSaveAi": if (!a) return cb?.("err:nodoc"); a.savedAi = args[0] as string; files.set(a.savedAi, "%PDF-1.6 AI"); return cb?.("ok");
        case "ptgWriteLink": if (!a) return cb?.("err:nodoc"); a.xmp = args[0] as string; return cb?.("ok");
        case "ptgReadLink": return cb?.(a?.xmp ? "link:" + a.xmp : "none");
        case "ptgDocInfo": return cb?.(a ? `doc:${a.path.split("/").pop()}|${a.svg.width}|${a.svg.height}|${a.svg.layers.length}` : "none");
        case "ptgExportPng": { if (!a) return cb?.("err:nodoc"); files.set(args[0] as string, toBase64(png(args[1] as number, args[2] as number, 10 + a.edit))); return cb?.("ok"); }
      }
      cb?.("EvalScript error.");
    },
    openURLInDefaultBrowser(url) { calls.urls.push(url); },
    getSystemPath() { return "/Users/x/Library/Application Support"; },
    getHostEnvironment() { return { appVersion: "29.0.0", appUILocale: "nb_NO" }; },
  };
  const fs: CepFsLike = {
    readFile(path, enc) { if (!files.has(path)) return { err: 3, data: "" }; const v = files.get(path)!; return { err: 0, data: enc === "Base64" && !isB64(v) ? toBase64(new TextEncoder().encode(v)) : v }; },
    writeFile(path, data, enc) { files.set(path, enc === "Base64" ? data : "\u0000T" + data); return { err: 0 }; },
    deleteFile(path) { files.delete(path); return { err: 0 }; },
    makedir() { return { err: 0 }; },
    showOpenDialogEx() { return { err: 0, data: ["/Users/x/Pakke"] }; },
  };
  // Tekst lagres med et prefiks så modellen vet hva som er Base64.
  const isB64 = (v: string) => !v.startsWith("\u0000T");
  const text = (p: string) => files.get(p)!.slice(2);
  const realFs: CepFsLike = { ...fs, readFile(path, enc) { if (!files.has(path)) return { err: 3, data: "" }; const v = files.get(path)!; return { err: 0, data: isB64(v) ? v : enc === "Base64" ? toBase64(new TextEncoder().encode(v.slice(2))) : v.slice(2) }; } };
  const host = cepHost(csi, realFs, { fetch: fetchFn, random });
  // ptgOpenSvg leser SVG-teksten direkte fra filmodellen.
  const origEval = csi.evalScript.bind(csi);
  csi.evalScript = (script, cb) => { const m = /^ptgOpenSvg\((".*?"),/.exec(script); if (m) { const p = JSON.parse(m[1]!); if (files.has(p) && !isB64(files.get(p)!)) { const t = text(p); files.set(p + "#text", t); } } origEval(script.replace(/^ptgOpenSvg\((".*?")/, (_, q) => `ptgOpenSvg(${JSON.stringify(JSON.parse(q) + "#text")}`), cb); };
  const sdk = new PtgConnector({ baseUrl: "https://ptg.test", clientId: CLIENT_ID, fetch: fetchFn, random, tokens: fileTokenStore(host, TOKEN_FILE), now: () => now, sleep: async ms => { now += ms; } });
  const plugin = new IllustratorPlugin(host, cepIllustrator(host.evalScript), "https://ptg.test", sdk);
  return { plugin, mem, files, text, calls, app, sdk, assetId, variantId, v1, v2, b1, projectId: s.project.id as string, state: s, putText: (p: string, t: string) => files.set(p, "\u0000T" + t) };
}
async function signIn(h: ReturnType<typeof harness>) {
  await h.plugin.beginSignIn();
  const u = new URL(h.calls.urls.at(-1)!);
  expect(u.searchParams.get("client_id")).toBe("ptg.illustrator");
  expect(u.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
  expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  const code = makeToken("code", random(32));
  h.mem.approveCode(tokenHash(code), { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, challenge: u.searchParams.get("code_challenge")!, projectId: h.projectId, userId: USER, scopes: SCOPES.split(" ") });
  await h.plugin.finishSignIn(`${REDIRECT_URI}?code=${code}&state=${u.searchParams.get("state")}`);
}

const LINK = { projectId: "p1", manifestId: "m1", assetId: "a1", variantId: "va1", versionId: "v1", panelId: null, revision: 3 };
const DOC: IllustratorDoc = { width: 1920, height: 1080, dpi: 300, link: LINK, layers: [
  { id: "bg", name: "Bakgrunn & himmel", visible: true, opacity: 1, image: { href: "data:image/png;base64,AAAA", x: 0, y: 0, width: 1920, height: 1080 } },
  { id: "char", name: "Karakter", visible: true, opacity: 0.5, children: [
    { id: "arm", name: "Arm <venstre>", visible: false, opacity: 1, children: [{ id: "hand", name: "Hånd", visible: true, opacity: 1 }] },
    { id: "head", name: "Hode", visible: true, opacity: 1 },
  ] },
  { id: "notes", name: "Notater", visible: false, opacity: 1 },
] };

describe("C-7 SVG-modell: lag, grupper og skala", () => {
  it("rundtur bevarer lag, grupper, navn, synlighet, opasitet, bilder, størrelse, dpi og kobling", () => {
    const svg = buildIllustratorSvg(DOC);
    expect(svg).toContain('width="1920px" height="1080px" viewBox="0 0 1920 1080"');
    expect(readIllustratorSvg(svg)).toEqual(DOC);
  });
  it("leser Illustrators egen eksport: data-name, _x5F_-id-er, style-synlighet og ingen ptg-metadata", () => {
    const ai = `<?xml version="1.0"?><!-- Generator: Adobe Illustrator 29 --><svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="64px" height="40px" viewBox="0 0 64 40"><g id="Kilde_x5F_lag" data-name="Kilde lag"><image width="64" height="40" xlink:href="data:image/png;base64,AA"/></g><g id="Tegning" style="display:none;opacity:0.25"><g id="Strek_x5F_1"/></g></svg>`;
    const d = readIllustratorSvg(ai);
    expect([d.width, d.height, d.dpi, d.link]).toEqual([64, 40, 72, null]);
    expect(d.layers.map(l => [l.id, l.name, l.visible, l.opacity])).toEqual([["Kilde_lag", "Kilde lag", true, 1], ["Tegning", "Tegning", false, 0.25]]);
    expect(d.layers[1]!.children![0]!.name).toBe("Strek_1");
  });
  it("avviser DTD/entiteter og for mange lag; takhøyde per fil", () => {
    expect(() => readIllustratorSvg('<!DOCTYPE svg [<!ENTITY x "y">]><svg/>')).toThrow("svg_dtd");
    const many = { ...DOC, layers: Array.from({ length: ILLUSTRATOR_MAX_LAYERS + 1 }, (_, i) => ({ id: `l${i}`, name: `L${i}`, visible: true, opacity: 1 })) };
    expect(() => buildIllustratorSvg(many)).toThrow("svg_layers");
    expect(() => buildIllustratorSvg({ ...DOC, width: 0 })).toThrow("svg_size");
  });
  it("kobling via metadata/XMP: bare gyldige ID-er; panel uten ressurs gir ingen opplastingsmål", () => {
    expect(parseIllustratorLink(illustratorXmp(LINK))).toEqual(LINK);
    expect(parseIllustratorLink('<ptg:link>{"projectId":"p1","manifestId":"m","assetId":"a/../x","variantId":"v"}</ptg:link>')).toBeNull();
    expect(illustratorUploadTarget(LINK)).toEqual({ assetId: "a1", variantId: "va1", baseVersionId: "v1" });
    expect(illustratorUploadTarget({ ...LINK, assetId: null, variantId: null, panelId: "pa" })).toBeNull();
    expect(sdkIllustrator.buildIllustratorSvg).toBe(buildIllustratorSvg);
  });
  it("pikselstørrelse fra PNG og JPEG uten dekoding", () => {
    expect(imagePixelSize(png(7, 5))).toEqual({ width: 7, height: 5, mimeType: "image/png" });
    const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 30, 0, 50, 3, 0, 0, 0, 0]);
    expect(imagePixelSize(jpg)).toEqual({ width: 50, height: 30, mimeType: "image/jpeg" });
    expect(imagePixelSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("C-7 panelet mot falsk CEP/ExtendScript og falskt API", () => {
  it("åpne versjon: SVG i ressursens pikselstørrelse, XMP-kobling, .ai og manifest v1; retur blir kandidat uten godkjenning", async () => {
    const h = harness();
    await signIn(h);
    expect([...h.files.keys()].some(k => k.endsWith(`/PenToGlass/${TOKEN_FILE}`))).toBe(true);
    await h.plugin.selectAsset(h.assetId);
    await h.plugin.openVersion(h.v1);
    const doc = h.app.active!;
    expect([doc.svg.width, doc.svg.height]).toEqual([64, 40]);
    expect(doc.svg.layers.map(l => l.name)).toEqual(["Drage v1", "Pen to Glass"]);
    expect(doc.savedAi).toMatch(/Drage_v1\.ai$/);
    expect(JSON.parse(doc.xmp!)).toMatchObject({ assetId: h.assetId, variantId: h.variantId, versionId: h.v1 });
    const manifestPath = [...h.files.keys()].find(k => k.endsWith("/manifest.json"))!;
    const manifest = JSON.parse(h.text(manifestPath));
    expect(manifest).toMatchObject({ manifestVersion: 1, projectId: h.projectId, adapter: { id: "adobe-illustrator-cep" } });
    expect(JSON.stringify(manifest)).not.toMatch(/ptgc_|ptgr_|accessToken/);
    doc.edit = 7; // brukeren tegner
    const approvedBefore = h.mem.state.assetVariants[h.variantId]!.approvedVersionId;
    await h.plugin.sendBack();
    expect(h.plugin.state.message?.text).toBe(tr("nb", "sentFlat", { width: 64, height: 40 }));
    expect([...h.mem.transfers.values()].map(t => t.status)).toEqual(["candidate"]);
    expect(h.mem.state.assetVariants[h.variantId]!.approvedVersionId).toBe(approvedBefore);
    await h.plugin.sendBack(); // samme innhold: samme overføring
    expect(h.mem.transfers.size).toBe(1);
  });
  it("koblingen går på XMP, ikke filnavn: et omdøpt dokument sendes til riktig ressurs", async () => {
    const h = harness();
    await signIn(h);
    await h.plugin.selectAsset(h.assetId);
    await h.plugin.openVersion(h.v1);
    h.app.active!.path = "/Users/x/helt_annet_navn.ai";
    await h.plugin.sendBack();
    const t = [...h.mem.transfers.values()][0]!;
    expect(t.variantId ?? (t as unknown as { target: { variantId: string } }).target?.variantId).toBe(h.variantId);
  });
  it("konflikt når grunnlaget ikke er gjeldende versjon: tre valg, «Bruk min» åpner appen og godkjenner ikke", async () => {
    const h = harness();
    await signIn(h);
    await h.plugin.selectAsset(h.assetId);
    await h.plugin.openVersion(h.v2);
    await h.plugin.sendBack();
    expect(h.plugin.state.conflict).not.toBeNull();
    expect(h.plugin.state.message?.text).toBe(tr("nb", "conflict"));
    await h.plugin.resolve("choose_incoming");
    expect(h.calls.urls.at(-1)).toBe("https://ptg.test/konto#c0-conflicts");
    expect(h.plugin.state.conflict).not.toBeNull();
    await h.plugin.resolve("keep_both");
    expect(h.plugin.state.conflict).toBeNull();
  });
  it("C-1-pakke for et storyboardpanel åpnes med lag og grupper; retur viser retursiden i stedet for opplasting", async () => {
    const h = harness();
    await signIn(h);
    const panelId = tid();
    const svg = buildIllustratorSvg({ ...DOC, width: 64, height: 40, link: null });
    const bytes = new TextEncoder().encode(svg);
    h.putText("/Users/x/Pakke/panel.svg", svg);
    h.putText("/Users/x/Pakke/manifest.json", JSON.stringify({ manifestVersion: 1, createdAt: "2026-10-24T12:00:00.000Z", projectId: h.projectId, frameRate: { num: 25, den: 1 }, sampleRate: 48000, sourceApp: { name: "From Pen to Glass", version: "1" }, adapter: { id: "adobe-illustrator-cep", version: "1" }, items: [{ kind: "project", id: h.projectId }, { kind: "panel", id: panelId, name: "1A", revision: 2, base: { entity: "panel", id: panelId, revision: 2 }, files: [{ path: "panel.svg", sha256: sha256Hex(bytes), byteSize: bytes.length, mimeType: "image/svg+xml" }] }] }));
    await h.plugin.openPackage();
    const doc = h.app.active!;
    expect(doc.svg.layers.map(l => l.name)).toEqual(["Bakgrunn & himmel", "Karakter", "Notater"]);
    expect(doc.svg.layers[1]!.children!.map(c => c.name)).toEqual(["Arm <venstre>", "Hode"]);
    expect(doc.svg.layers[2]!.visible).toBe(false);
    expect(JSON.parse(doc.xmp!)).toMatchObject({ panelId, assetId: null });
    await h.plugin.sendBack();
    expect(h.plugin.state.message?.text).toBe(tr("nb", "panelOnly"));
    expect(h.mem.transfers.size).toBe(0);
  });
  it("pakke med endret SVG (feil sha) eller fra et annet prosjekt avvises", async () => {
    const h = harness();
    await signIn(h);
    h.putText("/Users/x/Pakke/a.svg", "<svg/>");
    h.putText("/Users/x/Pakke/manifest.json", JSON.stringify({ manifestVersion: 1, createdAt: "2026-10-24T12:00:00.000Z", projectId: h.projectId, frameRate: { num: 25, den: 1 }, sampleRate: 48000, sourceApp: { name: "x", version: "1" }, adapter: { id: "x-y", version: "1" }, items: [{ kind: "asset", id: h.assetId, files: [{ path: "a.svg", sha256: "0".repeat(64), byteSize: 6, mimeType: "image/svg+xml" }] }] }));
    await h.plugin.openPackage();
    expect(h.plugin.state.message?.text).toBe(tr("nb", "badPackage"));
    expect(h.app.docs).toHaveLength(0);
  });
  it("uten dokument fra Pen to Glass sendes ingenting; tilbaketrukket tilgang logger ut", async () => {
    const h = harness();
    await signIn(h);
    await h.plugin.sendBack();
    expect(h.plugin.state.message?.text).toBe(tr("nb", "noDoc"));
    await h.sdk.logout();
    await h.plugin.selectAsset(h.assetId);
    expect(h.plugin.state.signedIn).toBe(false);
  });
});

describe("C-7 manifest, pakking, tekster og klient", () => {
  it("CEP-manifest for Illustrator 27+ og CSXS 11, uten Node", () => {
    const xml = readFileSync(join(PLUGIN, "CSXS/manifest.xml"), "utf8");
    expect(checkIllustratorManifest(xml)).toEqual([]);
    expect(checkIllustratorManifest(xml.replace("</Resources>", "<CEFCommandLine><Parameter>--enable-nodejs</Parameter></CEFCommandLine></Resources>"))).toContain("node");
  });
  it("tynt vertslag: bare main.ts og cep-ai.ts kjenner CEP; ingen hemmeligheter, innerHTML eller prosjektstatus", () => {
    for (const f of readdirSync(join(PLUGIN, "src"))) {
      const src = readFileSync(join(PLUGIN, "src", f), "utf8");
      expect(src, f).not.toMatch(/innerHTML|client_secret|sb_secret_|SERVICE_ROLE|supabase/i);
      expect(src, f).not.toMatch(/from "@\/|core\/model/);
      if (!["main.ts", "cep-ai.ts", "host.ts"].includes(f)) expect(src, f).not.toMatch(/evalScript\(|CSInterface|window\.cep/);
    }
    const jsx = readFileSync(join(PLUGIN, "jsx/host.jsx"), "utf8");
    for (const fn of ["ptgOpenSvg", "ptgSaveAi", "ptgReadLink", "ptgWriteLink", "ptgExportPng", "ptgDocInfo"]) expect(jsx).toContain(`function ${fn}(`);
    expect(jsx).not.toMatch(/eval\(|Socket|HttpConnection/);
  });
  it("alle tekster på alle språk med samme plassholdere", () => {
    for (const [k, row] of Object.entries(STRINGS)) for (const l of LANGS) {
      const r = row as Record<string, string>;
      expect(r[l], `${k}.${l}`).toBeTruthy();
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(ph(r[l]!), `${k}.${l}`).toEqual(ph(r["en"]!));
    }
  });
  it("klienten ptg.illustrator og redirect er registrert; kapabiliteter viser lag", () => {
    expect(clientKnown(ILLUSTRATOR_CLIENT_ID)).toBe(true);
    expect(redirectAllowed(REDIRECT_URI, ILLUSTRATOR_CLIENT_ID)).toBe(true);
    expect(redirectAllowed("https://evil.example/cb", ILLUSTRATOR_CLIENT_ID)).toBe(false);
    expect(ADAPTERS.find(a => a.id === "adobe-illustrator-cep")?.capabilities).toEqual(expect.arrayContaining(["layers", "write"]));
  });
  it("README på nb og en med PlayerDebugMode og «bygget, ikke verifisert»", () => {
    const md = readFileSync(join(PLUGIN, "README.md"), "utf8");
    expect(md).toContain("PlayerDebugMode");
    expect(md).toContain("Bygget, ikke verifisert i Illustrator");
    expect(md).toContain("Built, not verified in Illustrator");
    void fromBase64;
  });
});
