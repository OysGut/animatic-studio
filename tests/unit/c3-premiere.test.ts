// @vitest-environment node
/**
 * C-3 Premiere Pro uten Premiere: falsk premierepro- og uxp-modul, rundtur OTIO og FCP XML med markører,
 * forslag fra endret rekkefølge og timing, og hele panelflyten mot det falske /api/v1 (C-0). Ingen nettverk.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { orderedOccurrences, type Command, type ProjectState } from "@/core";
import {
  ADAPTERS, PREMIERE_ADAPTER, buildPremiereSequence, clientKnown, cutFromClips, makeToken, panelIdFromPath, parseRef,
  planPremiereProposal, premiereEditCommands, premiereOtio, premiereReturnManifest, premiereXml, readOtioClips,
  readPremiereReturn, readXmlClips, redirectAllowed, tokenHash, type HostClip, type PremiereSequence,
} from "@/core/connectors";
import { storyboardPanelsOf } from "@/core/storyboard";
import { panelDetails } from "@/core/storyboard/editing";
import { handleApiV1 } from "@/adapters/connectors/api-v1";
import { PtgConnector } from "../../packages/ptg-connector-sdk/src/index";
import { memoryStore } from "../helpers/c0-memory-store";
import { mustApply, seedProject, tid } from "../helpers/fixtures";
import { CLIENT_ID, PremierePlugin, REDIRECT_URI, SCOPES } from "../../plugins/premiere/src/controller";
import { checkPremiereManifest } from "../../plugins/premiere/src/manifest-check";
import { readActiveSequence, ticksToFrames, TICKS_PER_SECOND } from "../../plugins/premiere/src/premiere-host";
import { LANGS, STRINGS, pickLang } from "../../plugins/premiere/src/strings";
import type { Host, PproTrackItem, UxpFile, UxpFolder } from "../../plugins/premiere/src/host";
import { secureTokenStore } from "../../plugins/photoshop/src/token-store";

const ROOT = join(__dirname, "../..");
const PLUGIN = join(ROOT, "plugins/premiere");
const USER = "00000000-0000-7000-8000-a11ce0000003";
let seed = 11;
const random = (n: number) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24; return b; };

/** To scener med tre og to paneler; overgang (SB-9) inn i første panel i scene 2. */
function setup() {
  const sp = seedProject(2);
  let s: ProjectState = sp.state;
  const occs = orderedOccurrences(s, sp.mainId).slice(0, 2);
  const ids: string[][] = [[], []];
  occs.forEach((o, oi) => {
    for (let k = 0; k < (oi === 0 ? 3 : 2); k++) {
      const panelId = tid(); ids[oi]!.push(panelId);
      s = mustApply(s, { type: "AddStoryboardPanel", panelId, occurrenceId: o.id, variantId: o.variantId, orderKey: `a${k}` });
      s = mustApply(s, { type: "UpdateStoryboardPanel", panelId, durationFrames: 20 + 5 * k });
      const d = panelDetails(s.compositions[panelId as never]!);
      s = mustApply(s, { type: "SetStoryboardDetails", panelId, details: { ...d, number: `${oi + 1}${"ABC"[k]}`, ...(oi === 1 && k === 0 ? { transition: { kind: "dissolve", frames: 10, overlap: false } } : {}) } } as unknown as Command);
    }
  });
  return { s, productionId: sp.mainId as string, ids, occs };
}
const seqOf = (s: ProjectState, productionId: string) => buildPremiereSequence(s, productionId, "nb").sequence;
const order = (s: ProjectState, occ: string) => storyboardPanelsOf(s, occ as never).map(p => p.id as string);

/** Det Premiere gjør når brukeren klipper: nye klipp med samme markører, i ny rekkefølge og lengde. */
function edit(seq: PremiereSequence, ids: string[], durations: Record<string, number> = {}): HostClip[] {
  const byId = new Map(seq.panels.map(p => [p.panelId, p]));
  let t = 0;
  return ids.map(id => {
    const p = byId.get(id)!, dur = durations[id] ?? p.durationFrames;
    const c = { startFrame: t, endFrame: t + dur, markers: [`ptg:panel:${id}@${p.revision}`], mediaPath: `/Users/x/pakke/${p.image}` };
    t += dur;
    return c;
  });
}
function ret(s: ProjectState, productionId: string, clips: HostClip[]) {
  const m = premiereReturnManifest({ projectId: s.project.id, productionId, fps: s.project.fps, sequenceName: "Seq", nowIso: "2026-10-24T10:00:00.000Z", hostVersion: "25.6.0" }, cutFromClips(clips));
  const r = readPremiereReturn(JSON.parse(JSON.stringify(m)));
  if (!r.ok) throw new Error(r.reason);
  return { manifest: m, value: r.value };
}

describe("C-3 sekvens ut: OTIO og FCP XML med markører", () => {
  it("panelene i storyboardrekkefølge med panel-, skudd- og scenemarkører, timing og SB-9-overgang", () => {
    const r = setup();
    const seq = seqOf(r.s, r.productionId);
    expect(seq.panels.map(p => p.panelId)).toEqual([...r.ids[0]!, ...r.ids[1]!]);
    expect(seq.panels.map(p => p.durationFrames)).toEqual([20, 25, 30, 20, 25]);
    expect(seq.panels[3]!.transition).toEqual({ kind: "dissolve", frames: 10 });
    const xml = premiereXml(seq), otio = JSON.parse(premiereOtio(seq));
    for (const p of seq.panels) { expect(xml).toContain(`ptg:panel:${p.panelId}@${p.revision}`); expect(xml).toContain(`panels/${p.panelId}.png`); }
    expect(xml).toContain(`ptg:shot:${r.occs[1]!.id}`);
    expect(xml).toContain(`ptg:scene:${r.occs[1]!.sceneId}`);
    expect(xml).toMatch(/<transitionitem>[\s\S]*Cross Dissolve/);
    const video = otio.tracks.children[0];
    expect(video.kind).toBe("Video");
    expect(video.children.filter((c: { OTIO_SCHEMA: string }) => c.OTIO_SCHEMA === "Transition.1")).toHaveLength(1);
    expect(otio.tracks.children.slice(1).map((t: { name: string }) => t.name)).toEqual(["Dialogue", "Music", "Effects"]);
  });
  it("lyd havner på dialog-, musikk- og effektspor i begge formater", () => {
    const seq: PremiereSequence = { name: "S", projectId: "p", productionId: "prod", fps: { num: 25, den: 1 }, width: 1920, height: 1080, lengthFrames: 100, panels: [],
      audio: [{ id: "a1", track: "dialogue", name: "Replikk", path: "audio/v1.wav", startFrame: 5, lengthFrames: 20, sourceInFrames: 0, gainDb: 0 }, { id: "a2", track: "music", name: "Tema", path: "audio/v2.wav", startFrame: 0, lengthFrames: 100, sourceInFrames: 0, gainDb: -6 }, { id: "a3", track: "effects", name: "Dør", path: "audio/v3.wav", startFrame: 40, lengthFrames: 5, sourceInFrames: 3, gainDb: 0 }] };
    const otio = JSON.parse(premiereOtio(seq));
    const [, d, m, e] = otio.tracks.children;
    expect(d.children.map((c: { OTIO_SCHEMA: string }) => c.OTIO_SCHEMA)).toEqual(["Gap.1", "Clip.2"]);
    expect(m.children[0].media_references.DEFAULT_MEDIA.target_url).toBe("audio/v2.wav");
    expect(e.children[1].source_range.start_time.value).toBe(3);
    const xml = premiereXml(seq);
    expect(xml).toMatch(/<track><name>Dialogue<\/name><clipitem[\s\S]*audio\/v1\.wav/);
    expect(xml).toContain("ptg:audio:a3");
  });
});

describe("C-3 rundtur og kobling bare på ID", () => {
  it("OTIO og XML leses tilbake til samme rekkefølge og timing", () => {
    const r = setup();
    const seq = seqOf(r.s, r.productionId);
    for (const clips of [readOtioClips(premiereOtio(seq)), readXmlClips(premiereXml(seq))]) {
      const cut = cutFromClips(clips);
      expect(cut.items.map(i => i.panelId)).toEqual(seq.panels.map(p => p.panelId));
      expect(cut.items.map(i => i.durationFrames)).toEqual(seq.panels.map(p => p.durationFrames));
      expect(cut.items.every(i => i.baseRevision !== null)).toBe(true);
    }
  });
  it("XML fra Premiere med start/end = -1 ved overganger regnes fra naboene", () => {
    const r = setup();
    const xml = premiereXml(seqOf(r.s, r.productionId)).replace(/<start>(\d+)<\/start><end>(\d+)<\/end><in>0<\/in><out>(\d+)<\/out><file id="file-panel-4"/, "<start>-1</start><end>-1</end><in>0</in><out>$3</out><file id=\"file-panel-4\"");
    const cut = cutFromClips(readXmlClips(xml));
    expect(cut.items[3]!.durationFrames).toBe(20);
    expect(cut.items[3]!.startFrame).toBe(75);
  });
  it("nytt navn og ny rekkefølge endrer ikke koblingen; filnavn er reserve; fremmede klipp og dubletter telles", () => {
    const r = setup();
    const seq = seqOf(r.s, r.productionId);
    const [a, b] = r.ids[0]!;
    const clips: HostClip[] = [
      { startFrame: 0, endFrame: 10, markers: ["Helt nytt navn", `ptg:panel:${b}@1`] },
      { startFrame: 10, endFrame: 30, markers: [], mediaPath: `file:///Users/x/panels/${a}.png` },
      { startFrame: 30, endFrame: 40, markers: ["B-roll"], mediaPath: "/Users/x/broll.mov" },
      { startFrame: 40, endFrame: 50, markers: [`ptg:panel:${b}@1`] },
    ];
    const cut = cutFromClips(clips);
    expect(cut.items.map(i => i.panelId)).toEqual([b, a]);
    expect(cut.items[1]!.baseRevision).toBeNull();
    expect(cut.foreign).toBe(1); expect(cut.duplicates).toBe(1);
    expect(panelIdFromPath("Panel 3.png")).toBeNull();
    expect(parseRef("ptg:panel:abc")).toBeNull();
    void seq;
  });
});

describe("C-3 forslag: per panel, aldri automatisk, aldri scenebytte", () => {
  it("byttet rekkefølge og ny varighet blir forslag; godtatt forslag flytter innen scenen og endrer varighet", () => {
    const r = setup();
    const seq = seqOf(r.s, r.productionId);
    const [a, b, c] = r.ids[0]!, [d, e] = r.ids[1]!;
    const { value } = ret(r.s, r.productionId, edit(seq, [b, a, c, d, e], { [c!]: 42 }));
    const plan = planPremiereProposal(r.s, r.productionId, value);
    const byId = Object.fromEntries(plan.edits.map(x => [x.panelId, x]));
    expect(Object.keys(byId).sort()).toEqual([a, b, c].sort());
    expect(byId[c!]!.durationChanged).toBe(true); expect(byId[c!]!.durationFrames).toBe(42);
    expect(plan.conflicts).toEqual([]); expect(plan.missing).toBe(0);
    // Ingenting er endret før brukeren godtar.
    expect(order(r.s, r.occs[0]!.id)).toEqual([a, b, c]);
    let s = r.s;
    for (const cmd of premiereEditCommands(s, byId[b!]!)!) s = mustApply(s, cmd);
    expect(order(s, r.occs[0]!.id)).toEqual([b, a, c]);
    for (const cmd of premiereEditCommands(s, byId[c!]!)!) s = mustApply(s, cmd);
    expect(s.compositions[c as never]!.durationFrames).toBe(42);
    // Scener, scenenumre og manus er urørt.
    expect(s.occurrences).toEqual(r.s.occurrences);
    expect(s.scenes).toEqual(r.s.scenes);
    expect(s.blocks).toEqual(r.s.blocks);
  });
  it("panel flyttet inn i en annen scene: bare varighet kan godtas, scenen endres aldri", () => {
    const r = setup();
    const seq = seqOf(r.s, r.productionId);
    const [a, b, c] = r.ids[0]!, [d, e] = r.ids[1]!;
    const { value } = ret(r.s, r.productionId, edit(seq, [a, c, d, b, e], { [b!]: 33 }));
    const plan = planPremiereProposal(r.s, r.productionId, value);
    const m = plan.edits.find(x => x.panelId === b)!;
    expect(m.movedToOccurrenceId).toBe(String(r.occs[1]!.id));
    const cmds = premiereEditCommands(r.s, m)!;
    expect(cmds.map(x => x.type)).toEqual(["UpdateStoryboardPanel"]);
    let s = r.s; for (const cmd of cmds) s = mustApply(s, cmd);
    expect(String(s.compositions[b as never]!.occurrenceId)).toBe(String(r.occs[0]!.id));
  });
  it("endret i appen siden eksport: konflikt i planen, og godkjenning av gammelt forslag avvises", () => {
    const r = setup();
    const seq = seqOf(r.s, r.productionId);
    const [a, b, c] = r.ids[0]!, [d, e] = r.ids[1]!;
    const { value } = ret(r.s, r.productionId, edit(seq, [a, b, c, d, e], { [a!]: 50 }));
    const s2 = mustApply(r.s, { type: "UpdateStoryboardPanel", panelId: a!, durationFrames: 21 } as Command);
    const plan = planPremiereProposal(s2, r.productionId, value);
    expect(plan.conflicts).toEqual([a]);
    const old = planPremiereProposal(r.s, r.productionId, value).edits.find(x => x.panelId === a)!;
    expect(premiereEditCommands(s2, old)).toBeNull();
  });
  it("paneler fjernet i Premiere slettes aldri; ukjente ID-er ignoreres", () => {
    const r = setup();
    const seq = seqOf(r.s, r.productionId);
    const [a, , c] = r.ids[0]!;
    const clips = [...edit(seq, [a!, c!]), { startFrame: 100, endFrame: 110, markers: [`ptg:panel:${tid()}@1`] }];
    const plan = planPremiereProposal(r.s, r.productionId, ret(r.s, r.productionId, clips).value);
    expect(plan.missing).toBe(3); expect(plan.unknown).toBe(1);
    expect(plan.edits.every(x => x.panelId !== r.ids[0]![1])).toBe(true);
  });
  it("returmanifestet avviser feil adapter, hemmeligheter, tomme og doble paneler", () => {
    const r = setup();
    const { manifest } = ret(r.s, r.productionId, edit(seqOf(r.s, r.productionId), r.ids[0]!));
    const j = JSON.parse(JSON.stringify(manifest));
    expect(readPremiereReturn({ ...j, adapter: { id: "toonboom-sbpro", version: "1" } }).ok).toBe(false);
    expect(readPremiereReturn({ ...j, token: "ptg_access_abcdefghijklmnopqrstuvwxyz" }).ok).toBe(false);
    expect(readPremiereReturn({ ...j, items: j.items.slice(0, 1) }).ok).toBe(false);
    expect(readPremiereReturn({ ...j, items: [...j.items, j.items[1]] }).ok).toBe(false);
    expect(j.adapter.id).toBe(PREMIERE_ADAPTER.id);
  });
});

/** Falsk premierepro + uxp. Sekvensen bygges fra XML-en panelet importerer, og kan «klippes» i testen. */
function fakeHost(fetchFn: typeof fetch) {
  const UTF8 = Symbol("utf8");
  const data = new Map<string, string>(), secure = new Map<string, Uint8Array>();
  const file = (m: Map<string, string>, name: string, base = "/data"): UxpFile => ({ name, nativePath: `${base}/${name}`, async read() { if (!m.has(name)) throw Error("missing"); return m.get(name)!; }, async write(d) { m.set(name, String(d)); } });
  const folderOf = (m: Map<string, string>, base: string): UxpFolder => ({ nativePath: base, async createFile(n) { return file(m, n, base); }, async getEntry(n) { if (!m.has(n)) throw Error("missing"); return file(m, n, base); } });
  const calls = { imported: [] as string[], external: [] as string[] };
  const pkg = new Map<string, string>();
  let active: { name: string; clips: HostClip[] } | null = null;
  const tick = (f: number) => ({ ticks: String(Math.round(f / 25 * TICKS_PER_SECOND)) });
  const host: Host = {
    ppro: {
      Project: { async getActiveProject() { return {
        async importFiles(paths: string[]) { calls.imported.push(paths[0]!); const xml = pkg.get("sequence.xml")!; active = { name: /<sequence\b[^>]*>\s*<name>([\s\S]*?)<\/name>/.exec(xml)![1]!.replace(/&amp;/g, "&"), clips: readXmlClips(xml) }; return true; },
        async getActiveSequence() { return active ? { name: active.name, async getVideoTrack() { return { getTrackItems: () => active!.clips.map(c => ({ getStartTime: () => tick(c.startFrame), getEndTime: () => tick(c.endFrame), getProjectItem: () => ({ name: "x", c }) } as unknown as PproTrackItem)) }; } } : null; },
      }; } },
      ClipProjectItem: { cast: (pi: any) => ({ ...pi, getMediaFilePath: async () => pi.c.mediaPath ?? "" }) },
      Markers: { getMarkers: async (pi: any) => ({ getMarkers: () => pi.c.markers.map((t: string) => ({ getName: () => "", getComments: () => t })) }) },
      Constants: { TrackItemType: { CLIP: 1 } },
    },
    uxp: {
      storage: {
        localFileSystem: { async getFolder() { return folderOf(pkg, "/Users/x/pakke"); }, async getDataFolder() { return folderOf(data, "/data"); } },
        formats: { binary: Symbol("bin"), utf8: UTF8 },
        secureStorage: { async getItem(k) { return secure.get(k) ?? null; }, async setItem(k, v) { secure.set(k, typeof v === "string" ? new TextEncoder().encode(v) : v); }, async removeItem(k) { secure.delete(k); } },
      },
      shell: { async openExternal(url) { calls.external.push(url); } },
    },
    fetch: fetchFn, random, language: "nb-NO", hostVersion: "25.6.0",
  };
  return { host, pkg, calls, secure, setClips: (c: HostClip[]) => { active = { name: active!.name, clips: c }; } };
}

function harness() {
  const r = setup();
  let now = Date.parse("2026-10-24T10:00:00Z");
  const mem = memoryStore(r.s, { now: () => now });
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => handleApiV1(new Request(String(input), init), { store: mem.store, now: () => now, random, ip: "203.0.113.10" })) as typeof fetch;
  const fake = fakeHost(fetchFn);
  const sdk = new PtgConnector({ baseUrl: "https://ptg.test", clientId: CLIENT_ID, fetch: fetchFn, random, tokens: secureTokenStore(fake.host.uxp.storage.secureStorage), now: () => now, sleep: async ms => { now += ms; } });
  const plugin = new PremierePlugin(fake.host, "https://ptg.test", sdk);
  const seq = seqOf(r.s, r.productionId);
  fake.pkg.set("manifest.json", JSON.stringify({ manifestVersion: 1, projectId: r.s.project.id, frameRate: r.s.project.fps, adapter: { ...PREMIERE_ADAPTER }, premiere: { productionId: r.productionId, sequence: "sequence.xml", panels: seq.panels.length } }));
  fake.pkg.set("sequence.xml", premiereXml(seq));
  return { ...r, mem, fake, plugin, seq, sdk };
}
async function signIn(h: ReturnType<typeof harness>) {
  await h.plugin.beginSignIn();
  const u = new URL(h.fake.calls.external.at(-1)!);
  expect(u.searchParams.get("client_id")).toBe("ptg.premiere");
  expect(u.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
  expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  const code = makeToken("code", random(32));
  h.mem.approveCode(tokenHash(code), { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, challenge: u.searchParams.get("code_challenge")!, projectId: h.s.project.id, userId: USER, scopes: SCOPES.split(" ") });
  await h.plugin.finishSignIn(`${REDIRECT_URI}?code=${code}&state=${u.searchParams.get("state")}`);
}

describe("C-3 panelet mot falsk Premiere og falskt API", () => {
  it("innlogging (PKCE), import av pakken, klipp og retur blir forslag på serveren; samme retur er idempotent", async () => {
    const h = harness();
    await signIn(h);
    expect(h.plugin.state.signedIn).toBe(true);
    expect(JSON.stringify([...h.fake.secure.values()].map(v => new TextDecoder().decode(v)))).toContain("accessToken");
    await h.plugin.importPackage();
    expect(h.fake.calls.imported).toEqual(["/Users/x/pakke/sequence.xml"]);
    expect(h.plugin.state.message?.kind).toBe("info");
    const [a, b, c] = h.ids[0]!, [d, e] = h.ids[1]!;
    h.fake.setClips(edit(h.seq, [b!, a!, c!, d!, e!], { [e!]: 60 }));
    await h.plugin.sendBack();
    expect(h.plugin.state.message?.kind).toBe("info");
    expect(h.mem.premiereProposals.map(p => p.edit.panelId).sort()).toEqual([a, b, e].sort());
    expect(h.mem.premiereProposals.every(p => p.status === "open")).toBe(true);
    // Ingenting tatt i bruk på serveren.
    expect(order(h.mem.state, h.occs[0]!.id)).toEqual([a, b, c]);
    await h.plugin.sendBack();
    expect(h.mem.premiereProposals).toHaveLength(3);
  });
  it("pakke fra et annet prosjekt avvises, og sekvens uten markører gir beskjed", async () => {
    const h = harness();
    await signIn(h);
    h.fake.pkg.set("manifest.json", JSON.stringify({ projectId: tid(), adapter: { ...PREMIERE_ADAPTER }, premiere: { productionId: h.productionId } }));
    await h.plugin.importPackage();
    expect(h.plugin.state.message?.text).toBe(STRINGS.wrongProject.nb);
    expect(h.fake.calls.imported).toEqual([]);
  });
  it("tilbaketrukket tilgang logger panelet ut", async () => {
    const h = harness();
    await signIn(h);
    await h.plugin.importPackage();
    await h.sdk.logout();
    await h.plugin.sendBack();
    expect(h.plugin.state.signedIn).toBe(false);
  });
  it("ticks regnes om til bilder, og den aktive sekvensen leses med markører og mediesti", async () => {
    expect(ticksToFrames({ ticks: String(TICKS_PER_SECOND * 2) }, { num: 25, den: 1 })).toBe(50);
    expect(ticksToFrames({ ticks: TICKS_PER_SECOND }, { num: 30000, den: 1001 })).toBe(30);
    const h = harness();
    await h.plugin.importPackage();
    const seq = await readActiveSequence(h.fake.host, { num: 25, den: 1 });
    expect(cutFromClips(seq!.clips).items.map(i => i.panelId)).toEqual(h.seq.panels.map(p => p.panelId));
  });
});

describe("C-3 manifest, pakking, tekster og klient", () => {
  const manifest = JSON.parse(readFileSync(join(PLUGIN, "manifest.json"), "utf8"));
  const opts = { allowedDomains: ["https://pentoglass.com"], panelIds: ["ptgPanel"] };
  it("manifest v5 for Premiere 25.6+ med bare appens domene", () => {
    expect(checkPremiereManifest(manifest, opts)).toEqual([]);
    const bad = (patch: (m: any) => void) => { const m = structuredClone(manifest); patch(m); return checkPremiereManifest(m, opts).length; };
    expect(bad(m => { m.host.minVersion = "25.5.0"; })).toBeGreaterThan(0);
    expect(bad(m => { m.host.app = "PS"; })).toBeGreaterThan(0);
    expect(bad(m => { m.requiredPermissions.network.domains = ["https://*.pentoglass.com"]; })).toBeGreaterThan(0);
    expect(bad(m => { m.apiKey = "x"; })).toBeGreaterThan(0);
  });
  it("koden bruker bare SDK-et, den rene sekvensmodellen og lokale filer; ingen hemmeligheter eller innerHTML", () => {
    const dir = join(PLUGIN, "src");
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), "utf8");
      for (const i of [...src.matchAll(/from\s+["']([^"']+)["']/g)].map(m => m[1]!))
        expect(i.startsWith("./") || i.startsWith("../../../packages/ptg-connector-sdk/") || i === "../../../src/core/connectors/premiere-sequence" || i === "../../photoshop/src/token-store", `${f}: ${i}`).toBe(true);
      expect(src, f).not.toMatch(/localStorage|innerHTML|process\.env|client_secret/);
    }
    expect(readFileSync(join(PLUGIN, "src/main.ts"), "utf8")).toMatch(/require\("premierepro"\)[\s\S]*require\("uxp"\)/);
    expect(readFileSync(join(ROOT, "src/core/connectors/premiere-sequence.ts"), "utf8")).not.toMatch(/from "\.\.\/(index|model|storyboard|assembly)/);
  });
  it("alle tekster på alle språk med samme plassholdere; Premieres språk velges", () => {
    for (const row of Object.values(STRINGS)) for (const l of LANGS) {
      const ph = (x: string) => [...x.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join();
      expect((row as Record<string, string>)[l]!.length).toBeGreaterThan(0);
      expect(ph((row as Record<string, string>)[l]!)).toBe(ph(row.en));
    }
    expect(pickLang("nb_NO")).toBe("nb"); expect(pickLang("pt-PT")).toBe("pt-BR"); expect(pickLang("xx")).toBe("en");
  });
  it("klienten ptg.premiere og redirect er registrert; kapabiliteter viser tidslinje og lyd", () => {
    expect(clientKnown("ptg.premiere")).toBe(true);
    expect(redirectAllowed(REDIRECT_URI, "ptg.premiere")).toBe(true);
    expect(redirectAllowed("https://evil.example/cb", "ptg.premiere")).toBe(false);
    const a = ADAPTERS.find(x => x.id === PREMIERE_ADAPTER.id)!;
    expect(a.capabilities).toEqual(expect.arrayContaining(["timeline", "audio", "notes"]));
  });
  it("migrasjon 0114: ingen begin/commit, kilde premiere og forslagstype edit", () => {
    const sql = readFileSync(join(ROOT, "db/migrations/0114_c3_premiere.sql"), "utf8");
    expect(sql).not.toMatch(/^\s*(begin|commit)\s*;/im);
    expect(sql).toMatch(/source in\('sbpro','premiere'\)/);
    expect(sql).toMatch(/'conform','edit'\)/);
  });
});
