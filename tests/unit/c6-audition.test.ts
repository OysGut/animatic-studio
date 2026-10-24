// @vitest-environment node
/**
 * C-6 Audition uten Audition: falsk CSInterface/window.cep.fs og ExtendScript-modell, BWF/iXML-metadata ut og
 * inn, markører, multitrack-økt, og hele panelflyten mot det falske /api/v1 (C-0). Ingen nettverk.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { orderedOccurrences, type Command, type ProjectState } from "@/core";
import {
  ADAPTERS, AUDITION_CLIENT_ID, AUDITION_MAX_CLIPS, auditionPlan, auditionSesx, auditionWavMeta, clientKnown, makeToken,
  readAuditionReturn, redirectAllowed, sha256Hex, tagAuditionWav, tokenHash,
} from "@/core/connectors";
import { encodeBwf, readBwf, retagWav } from "@/core/handoff/wav";
import { keysEvenly } from "@/core/order-key";
import { panelDetails } from "@/core/storyboard/editing";
import { handleApiV1 } from "@/adapters/connectors/api-v1";
import { PtgConnector } from "../../packages/ptg-connector-sdk/src/index";
import { memoryStore } from "../helpers/c0-memory-store";
import { mustApply, seedProject, tid } from "../helpers/fixtures";
import { AuditionPlugin, CLIENT_ID, REDIRECT_URI, SCOPES } from "../../plugins/audition/src/controller";
import { cepHost, fromBase64, jsxArg, toBase64 } from "../../plugins/audition/src/cep-host";
import { checkAuditionManifest } from "../../plugins/audition/src/manifest-check";
import { fileTokenStore } from "../../plugins/audition/src/token-store";
import { LANGS, STRINGS, pickLang, tr } from "../../plugins/audition/src/strings";
import type { CepFsLike, CSInterfaceLike } from "../../plugins/audition/src/host";

const ROOT = join(__dirname, "../..");
const PLUGIN = join(ROOT, "plugins/audition");
const USER = "00000000-0000-7000-8000-a11ce0000006";
let seed = 23;
const random = (n: number) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24; return b; };
const tone = (n: number) => [Float32Array.from({ length: n }, (_, i) => Math.sin(i / 7) * 0.5), Float32Array.from({ length: n }, (_, i) => Math.cos(i / 9) * 0.25)];
const plainWav = (n = 4800) => encodeBwf(tone(n), 48000, { description: "", originator: "", originatorReference: "", timeReference: 0, scene: "", assetId: "", timecode: "00:00:00:00", frameRate: { num: 25, den: 1 } });
const pcmOf = (b: Uint8Array) => { const i = b.findIndex((_, k) => b[k] === 0x64 && b[k + 1] === 0x61 && b[k + 2] === 0x74 && b[k + 3] === 0x61 && k > 11); return b.subarray(i); };

/** Én scene med tre paneler, dialogklipp (låst versjon v2, ikke godkjent), musikk (godkjent v1) og midlertidig panellyd. */
function setup() {
  const sp = seedProject(1);
  let s: ProjectState = sp.state;
  const occ = orderedOccurrences(s, sp.mainId)[0]!;
  const panels: string[] = [];
  const keys = keysEvenly(3);
  for (let k = 0; k < 3; k++) {
    const panelId = tid(); panels.push(panelId);
    s = mustApply(s, { type: "AddStoryboardPanel", panelId, occurrenceId: occ.id, variantId: occ.variantId, orderKey: keys[k]! });
    s = mustApply(s, { type: "UpdateStoryboardPanel", panelId, durationFrames: 25 });
  }
  const assetId = tid<"asset">(), variantId = tid<"asset_variant">(), v1 = tid<"asset_version">(), v2 = tid<"asset_version">(), mp3 = tid<"asset_version">();
  s = mustApply(s, { type: "CreateAssets", assets: [{ assetId, fields: { kind: "sound", name: "Replikk", names: [], description: "", category: "", tags: [] } }] });
  s = mustApply(s, { type: "CreateAssetVariant", variantId, assetId, fields: { name: "Lyd", style: "other", appearance: "" } });
  const bytes1 = plainWav(), bytes2 = plainWav(9600);
  const media = (v: string, b: Uint8Array, name = "a.wav", mimeType = "audio/wav") => ({ path: `${s.project.id}/${assetId}/${v}/${name}`, mimeType, width: null, height: null, byteSize: b.length, sha256: sha256Hex(b), durationMs: 100 });
  s = mustApply(s, { type: "AddAssetVersion", versionId: v1, variantId, media: media(v1, bytes1), note: "" });
  s = mustApply(s, { type: "ApproveAssetVersion", variantId, versionId: v1 });
  s = mustApply(s, { type: "AddAssetVersion", versionId: v2, variantId, media: media(v2, bytes2), note: "" });
  const mp3Bytes = Uint8Array.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]);
  s = mustApply(s, { type: "AddAssetVersion", versionId: mp3, variantId, media: media(mp3, mp3Bytes, "x.mp3", "audio/mpeg"), note: "" });
  const base = { occurrenceId: occ.id, assetId, assetVariantId: variantId, blockId: null, sourceInMs: 0, gainDb: 0, fadeInMs: 0, fadeOutMs: 0, muted: false, continues: false, volumeKeys: [] };
  const dlg = tid<"audio_clip">(), mus = tid<"audio_clip">(), sfx = tid<"audio_clip">();
  s = mustApply(s, { type: "AddAudioClips", clips: [
    { clipId: dlg, fields: { ...base, kind: "dialogue", name: "Hei", versionId: v2, offsetMs: 1200, lengthMs: 600 } },
    { clipId: mus, fields: { ...base, kind: "music", name: "Tema", versionId: null, offsetMs: 0, lengthMs: 3000 } },
    { clipId: sfx, fields: { ...base, kind: "sfx", name: "Dør", versionId: mp3, offsetMs: 2200, lengthMs: 300 } },
  ] } as unknown as Command);
  const d = panelDetails(s.compositions[panels[2] as never]!);
  s = mustApply(s, { type: "SetStoryboardDetails", panelId: panels[2]!, details: { ...d, tempAudio: { assetId, versionId: v1, name: "Skisse", durationMs: 500 } } } as unknown as Command);
  return { s, occ, panels, assetId, variantId, v1, v2, mp3, bytes1, bytes2, mp3Bytes, dlg, mus, sfx };
}

/** Falsk CEP: CSInterface, window.cep.fs (Base64) og ExtendScript-modell som bare forstår ptgOpenSession. */
function fakeCep() {
  const files = new Map<string, string>(); // sti → Base64 eller tekst
  const calls = { scripts: [] as string[], urls: [] as string[], opened: [] as string[] };
  let pick: string[] = [];
  const csi: CSInterfaceLike = {
    evalScript(script, cb) {
      calls.scripts.push(script);
      const m = /^ptgOpenSession\((".*")\)$/.exec(script);
      if (m) { const path = JSON.parse(m[1]!); if (files.has(path)) { calls.opened.push(path); cb?.("ok"); } else cb?.("err:missing"); return; }
      cb?.("EvalScript error.");
    },
    openURLInDefaultBrowser(url) { calls.urls.push(url); },
    getSystemPath() { return "file:///Users/x/Library/Application%20Support"; },
    getHostEnvironment() { return { appVersion: "25.0.0", appUILocale: "nb_NO" }; },
  };
  const fs: CepFsLike = {
    readFile(path) { return files.has(path) ? { err: 0, data: files.get(path)! } : { err: 3, data: "" }; },
    writeFile(path, data) { files.set(path, data); return { err: 0 }; },
    deleteFile(path) { files.delete(path); return { err: 0 }; },
    makedir() { return { err: 0 }; },
    showOpenDialogEx(multi, dir) { return { err: 0, data: dir ? ["/Users/x/Lyd"] : multi ? pick : pick.slice(0, 1) }; },
  };
  return { csi, fs, files, calls, setPick: (p: string[]) => { pick = p; } };
}

function harness() {
  const r = setup();
  let now = Date.parse("2026-10-24T11:00:00Z");
  const mem = memoryStore(r.s, { now: () => now });
  for (const v of [r.v1, r.v2, r.mp3]) { const ver = r.s.assetVersions[v]!; mem.files.set(ver.mediaPath, v === r.v1 ? r.bytes1 : v === r.v2 ? r.bytes2 : r.mp3Bytes); }
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => handleApiV1(new Request(String(input), init), { store: mem.store, now: () => now, random, ip: "203.0.113.16" })) as typeof fetch;
  const cep = fakeCep();
  const host = cepHost(cep.csi, cep.fs, { fetch: fetchFn, random });
  const sdk = new PtgConnector({ baseUrl: "https://ptg.test", clientId: CLIENT_ID, fetch: fetchFn, random, tokens: fileTokenStore(host), now: () => now, sleep: async ms => { now += ms; } });
  const plugin = new AuditionPlugin(host, "https://ptg.test", sdk);
  return { ...r, mem, cep, host, sdk, plugin, projectId: r.s.project.id as string };
}
async function signIn(h: ReturnType<typeof harness>) {
  await h.plugin.beginSignIn();
  const u = new URL(h.cep.calls.urls.at(-1)!);
  expect(u.searchParams.get("client_id")).toBe("ptg.audition");
  expect(u.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
  expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  const code = makeToken("code", random(32));
  h.mem.approveCode(tokenHash(code), { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, challenge: u.searchParams.get("code_challenge")!, projectId: h.projectId, userId: USER, scopes: SCOPES.split(" ") });
  await h.plugin.finishSignIn(`${REDIRECT_URI}?code=${code}&state=${u.searchParams.get("state")}`);
}

describe("C-6 BWF/iXML-metadata og markører", () => {
  it("retagWav endrer ikke lyden, erstatter gamle ID-er og bevarer markører i rundtur", () => {
    const src = plainWav();
    const meta = { description: "d", originator: "o", originatorReference: "r", timeReference: 48000 * 3600, scene: "1", assetId: "a1", timecode: "01:00:00:00", frameRate: { num: 25, den: 1 }, user: { PTG_VERSION: "v1", PTG_PANEL: "p1" }, markers: [{ sample: 100, label: "ptg:panel:p1 1A" }, { sample: 2400, label: "ptg:line:b1 Hei" }] };
    const tagged = retagWav(src, meta);
    expect(pcmOf(tagged)).toEqual(pcmOf(src));
    const info = readBwf(tagged);
    expect(info.ixml["PTG_VERSION"]).toBe("v1");
    expect(info.ixml["PTG_PANEL"]).toBe("p1");
    expect(info.timeReference).toBe(48000 * 3600);
    expect(info.markers).toEqual(meta.markers);
    const again = readBwf(retagWav(tagged, { ...meta, user: { PTG_VERSION: "v2" }, markers: [] }));
    expect(again.ixml["PTG_VERSION"]).toBe("v2");
    expect(again.ixml["PTG_PANEL"]).toBeUndefined();
    expect(again.markers).toEqual([]);
  });
  it("C-1-filer uten ekstra felt er byte for byte som før (ingen tomme USER-felt eller cue)", () => {
    const b = plainWav(10);
    expect(new TextDecoder("latin1").decode(b)).not.toContain("cue ");
    expect(readBwf(b).markers).toEqual([]);
  });
});

describe("C-6 lydplan fra prosjektet", () => {
  it("roller, låst/godkjent versjon, midlertidig panellyd og panelmarkører; ID-er, ikke navn", () => {
    const r = setup();
    const plan = auditionPlan(r.s, r.occ.id)!;
    const byRole = Object.fromEntries(plan.clips.map(c => [c.role, c]));
    expect(byRole["dialogue"]).toMatchObject({ clipId: r.dlg, versionId: r.v2, variantId: r.variantId, offsetMs: 1200, panelId: r.panels[1] });
    expect(byRole["music"]).toMatchObject({ clipId: r.mus, versionId: r.v1 });
    expect(byRole["effects"]).toMatchObject({ clipId: r.sfx, mimeType: "audio/mpeg" });
    expect(byRole["temp"]).toMatchObject({ clipId: null, panelId: r.panels[2], offsetMs: 2000, versionId: r.v1 });
    expect(plan.markers.filter(m => m.kind === "panel").map(m => [m.id, m.ms])).toEqual([[r.panels[0], 0], [r.panels[1], 1000], [r.panels[2], 2000]]);
    expect(plan.truncated).toBe(false);
    expect(auditionPlan(r.s, r.occ.id)!.manifestId).toBe(plan.manifestId);
  });
  it("ett panel: bare klipp i panelets vindu, tider relative til panelet", () => {
    const r = setup();
    const plan = auditionPlan(r.s, r.occ.id, r.panels[1])!;
    expect(plan.clips.map(c => c.role).sort()).toEqual(["dialogue", "music"]);
    expect(plan.clips.find(c => c.role === "dialogue")!.offsetMs).toBe(200);
    expect(plan.markers.filter(m => m.kind === "panel").map(m => m.id)).toEqual([r.panels[1]]);
    expect(auditionPlan(r.s, r.occ.id, tid())).toBeNull();
  });
  it("takhøyde per plan: flere enn AUDITION_MAX_CLIPS klipp kuttes og flagges", () => {
    const r = setup();
    const many = Array.from({ length: AUDITION_MAX_CLIPS + 5 }, (_, i) => ({ clipId: tid<"audio_clip">(), fields: { occurrenceId: r.occ.id, assetId: r.assetId, assetVariantId: null, versionId: null, blockId: null, kind: "sfx", name: `x${i}`, offsetMs: i, lengthMs: 10, sourceInMs: 0, gainDb: 0, fadeInMs: 0, fadeOutMs: 0, muted: false, continues: false, volumeKeys: [] } }));
    const s = mustApply(r.s, { type: "AddAudioClips", clips: many } as unknown as Command);
    const plan = auditionPlan(s, r.occ.id)!;
    expect(plan.clips).toHaveLength(AUDITION_MAX_CLIPS);
    expect(plan.truncated).toBe(true);
  });
  it("metadata bærer prosjekt-, scene-, panel-, ressurs-, variant-, versjons- og manifest-ID; markører innenfor klippet", () => {
    const r = setup();
    const plan = auditionPlan(r.s, r.occ.id)!;
    const music = plan.clips.find(c => c.role === "music")!;
    const meta = auditionWavMeta(plan, music);
    expect(meta.user).toMatchObject({ PTG_PROJECT: r.s.project.id, PTG_OCCURRENCE: r.occ.id, PTG_VARIANT: r.variantId, PTG_VERSION: r.v1, PTG_MANIFEST: plan.manifestId, PTG_ROLE: "music" });
    expect(meta.markers!.map(m => m.label.split(" ")[0])).toEqual(expect.arrayContaining([`ptg:panel:${r.panels[0]}`, `ptg:panel:${r.panels[1]}`, `ptg:panel:${r.panels[2]}`]));
    const tagged = tagAuditionWav(r.bytes1, plan, music);
    const back = readAuditionReturn(tagged, r.s.project.id);
    expect(back.ok && back.ref).toMatchObject({ assetId: r.assetId, variantId: r.variantId, versionId: r.v1, clipId: r.mus });
    expect(readAuditionReturn(tagged, tid())).toEqual({ ok: false, reason: "wrong_project" });
    expect(readAuditionReturn(r.bytes1, r.s.project.id)).toEqual({ ok: false, reason: "no_ptg_id" });
    expect(readAuditionReturn(r.mp3Bytes, r.s.project.id)).toEqual({ ok: false, reason: "not_wav" });
  });
  it("multitrack-økten har ett spor per rolle, klipp i samples og markører for panel og replikk", () => {
    const r = setup();
    const plan = auditionPlan(r.s, r.occ.id)!;
    const xml = auditionSesx(plan, plan.clips.map((_, i) => `f${i}.wav`));
    expect(xml).toContain('<sesx version="1.9">');
    expect((xml.match(/<audioTrack /g) ?? []).length).toBe(4);
    expect(xml).toContain('startPoint="57600"'); // 1200 ms × 48 kHz
    expect(xml).toContain(`comment="ptg:panel:${r.panels[1]}"`);
    expect(xml).not.toMatch(/ptgc_|ptgr_|accessToken/);
  });
});

describe("C-6 panelet mot falsk CEP/ExtendScript og falskt API", () => {
  it("innlogging, lyd ut med ID-er og økt, retur blir kandidat uten automatisk bruk; ikke-WAV hoppes over", async () => {
    const h = harness();
    await signIn(h);
    expect(h.plugin.state.signedIn).toBe(true);
    expect([...h.cep.files.keys()].some(k => k.endsWith("/PenToGlass/audition-session.json"))).toBe(true);
    await h.plugin.exportAudio();
    const ex = h.plugin.state.lastExport!;
    expect(ex.files).toHaveLength(3);
    expect(ex.skipped).toBe(1);
    expect(h.plugin.state.message?.text).toContain(tr("nb", "skipped", { count: 1 }));
    expect(h.cep.calls.opened).toHaveLength(1);
    expect(h.cep.calls.opened[0]).toMatch(/^\/Users\/x\/Lyd\/ptg_1_[0-9a-f]{8}\.sesx$/);
    // Ingen tokens i noen fil panelet skrev ut.
    for (const [k, v] of h.cep.files) if (!k.includes("PenToGlass")) expect(k.endsWith(".wav") ? new TextDecoder("latin1").decode(fromBase64(v)) : v).not.toMatch(/ptgc_|ptgr_|accessToken/);
    // Brukeren redigerer i Audition og gir filen et nytt navn: koblingen går likevel på ID.
    const musicFile = ex.files.find(f => f.includes("_music_"))!;
    const edited = fromBase64(h.cep.files.get(`/Users/x/Lyd/${musicFile}`)!);
    edited[edited.length - 2] ^= 0x7f;
    h.cep.files.set("/Users/x/Ny/helt_annet_navn.wav", toBase64(edited));
    const approvedBefore = h.mem.state.assetVariants[h.variantId]!.approvedVersionId;
    await h.plugin.sendBack(["/Users/x/Ny/helt_annet_navn.wav"]);
    expect(h.plugin.state.returns).toEqual([{ name: "helt_annet_navn.wav", status: "candidate" }]);
    expect(h.plugin.state.message?.text).toContain(tr("nb", "sent", { count: 1 }));
    expect([...h.mem.transfers.values()].map(t => t.status)).toEqual(["candidate"]);
    expect(h.mem.state.assetVariants[h.variantId]!.approvedVersionId).toBe(approvedBefore);
    // Samme fil igjen: samme overføring (idempotent).
    await h.plugin.sendBack(["/Users/x/Ny/helt_annet_navn.wav"]);
    expect(h.mem.transfers.size).toBe(1);
  });
  it("konflikt når grunnlaget ikke er gjeldende versjon: tre valg, «Bruk min» åpner appen og godkjenner ikke", async () => {
    const h = harness();
    await signIn(h);
    await h.plugin.exportAudio();
    const dlgFile = h.plugin.state.lastExport!.files.find(f => f.includes("_dialogue_"))!;
    await h.plugin.sendBack([`/Users/x/Lyd/${dlgFile}`]);
    expect(h.plugin.state.returns[0]!.status).toBe("conflict");
    expect(h.plugin.state.conflict).not.toBeNull();
    expect(h.plugin.state.message?.text).toContain(tr("nb", "conflict"));
    await h.plugin.resolve("choose_incoming");
    expect(h.cep.calls.urls.at(-1)).toBe("https://ptg.test/konto#c0-conflicts");
    expect(h.plugin.state.conflict).not.toBeNull();
    await h.plugin.resolve("keep_both");
    expect(h.plugin.state.conflict).toBeNull();
    expect(h.plugin.state.message?.text).toBe(tr("nb", "resolved"));
  });
  it("fil uten ID-er, ikke-WAV og fil fra et annet prosjekt sendes ikke", async () => {
    const h = harness();
    await signIn(h);
    h.cep.files.set("/x/ren.wav", toBase64(plainWav()));
    h.cep.files.set("/x/a.mp3", toBase64(h.mp3Bytes));
    await h.plugin.sendBack(["/x/ren.wav", "/x/a.mp3"]);
    expect(h.mem.transfers.size).toBe(0);
    expect(h.plugin.state.returns.map(r => r.reason)).toEqual(["noId", "notWav"]);
    expect(h.plugin.state.message?.kind).toBe("error");
  });
  it("tilbaketrukket tilgang logger panelet ut og sletter innloggingsfilen", async () => {
    const h = harness();
    await signIn(h);
    await h.sdk.logout();
    await h.plugin.exportAudio("/Users/x/Lyd");
    expect(h.plugin.state.signedIn).toBe(false);
    expect([...h.cep.files.keys()].some(k => k.endsWith("audition-session.json"))).toBe(false);
  });
  it("ExtendScript-argumenter er JSON-strenger, så stier ikke kan bryte ut av kallet", () => {
    expect(jsxArg('C:\\a"b\');app.quit();//')).toBe(JSON.stringify('C:\\a"b\');app.quit();//'));
    const jsx = readFileSync(join(PLUGIN, "jsx/host.jsx"), "utf8");
    expect(jsx).toContain("function ptgOpenSession(path)");
    expect(jsx).not.toMatch(/eval\(|Socket|HttpConnection/);
  });
});

describe("C-6 manifest, pakking, tekster og klient", () => {
  it("CEP-manifest for Audition 24+ og CSXS 11, uten Node", () => {
    expect(checkAuditionManifest(readFileSync(join(PLUGIN, "CSXS/manifest.xml"), "utf8"))).toEqual([]);
    expect(checkAuditionManifest(readFileSync(join(PLUGIN, "CSXS/manifest.xml"), "utf8").replace("</Resources>", "<CEFCommandLine><Parameter>--enable-nodejs</Parameter></CEFCommandLine></Resources>"))).toContain("node");
  });
  it("koden bruker bare SDK-et og den rene lydmodellen; ingen hemmeligheter, innerHTML eller prosjektstatus", () => {
    for (const f of readdirSync(join(PLUGIN, "src"))) {
      const src = readFileSync(join(PLUGIN, "src", f), "utf8");
      expect(src, f).not.toMatch(/innerHTML|client_secret|sb_secret_|SERVICE_ROLE|supabase/i);
      expect(src, f).not.toMatch(/from "@\/|core\/model|core\/connectors\/audition"/);
    }
    expect(readFileSync(join(PLUGIN, "index.html"), "utf8")).toContain("connect-src https://pentoglass.com");
  });
  it("alle tekster på alle språk med samme plassholdere; Auditions språk velges", () => {
    for (const [k, row] of Object.entries(STRINGS)) for (const l of LANGS) {
      expect((row as Record<string, string>)[l], `${k}.${l}`).toBeTruthy();
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(ph((row as Record<string, string>)[l]!), `${k}.${l}`).toEqual(ph(row.en));
    }
    expect(pickLang("nb_NO")).toBe("nb");
    expect(pickLang("ja_JP")).toBe("ja");
    expect(pickLang("xx")).toBe("en");
  });
  it("klienten ptg.audition og redirect er registrert; kapabiliteter viser lyd og tidslinje", () => {
    expect(clientKnown(AUDITION_CLIENT_ID)).toBe(true);
    expect(redirectAllowed(REDIRECT_URI, AUDITION_CLIENT_ID)).toBe(true);
    expect(redirectAllowed("https://evil.example/cb", AUDITION_CLIENT_ID)).toBe(false);
    expect(ADAPTERS.find(a => a.id === "adobe-audition-cep")?.capabilities).toEqual(expect.arrayContaining(["audio", "timeline", "write"]));
  });
  it("README på nb og en med PlayerDebugMode og «bygget, ikke verifisert»", () => {
    const md = readFileSync(join(PLUGIN, "README.md"), "utf8");
    expect(md).toContain("PlayerDebugMode");
    expect(md).toContain("Bygget, ikke verifisert i Audition");
    expect(md).toContain("Built, not verified in Audition");
  });
});
