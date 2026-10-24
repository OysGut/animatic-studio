// @vitest-environment node
/**
 * C-5 Toon Boom Storyboard Pro: skriptpakken kjøres i en sandkasse med en falsk modell av Storyboard Pros
 * API (CaptionManager, ExportManager, ImportManager, SoundTrackManager, SelectionManager, StoryboardManager)
 * og et falskt Pen to Glass-API (handleApiV1 + minnelager). Ingen ekte nettverk, ingen Storyboard Pro.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";
import { applyCommand, orderedOccurrences, type Command, type ProjectState } from "@/core";
import {
  ADAPTERS, SBPRO_ADAPTER, SBPRO_LIMITS, buildSbproPackage, clientKnown, conformCommands, planSbproReturn, productionPanels,
  readSbproReturn, sha256Hex, findSecrets, type SbproPackageFile,
} from "@/core/connectors";
import { panelDetails } from "@/core/storyboard/editing";
import { handleApiV1 } from "@/adapters/connectors/api-v1";
import { memoryStore } from "../helpers/c0-memory-store";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

const DIR = "plugins/toonboom-sbpro/scripts";
const LIB = readFileSync(`${DIR}/PtG_lib.js`, "utf8");
type Lib = Record<string, any>;

function loadLib(): Lib {
  const sandbox: Record<string, unknown> = { module: { exports: {} } };
  vm.runInNewContext(LIB, sandbox, { filename: "PtG_lib.js" });
  return (sandbox["module"] as { exports: Lib }).exports;
}

const pngBytes = (seed: number) => { const b = new Uint8Array(64); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); for (let i = 8; i < 64; i++) b[i] = (seed * 31 + i) & 0xff; return b; };

/** Falsk Storyboard Pro: scener, paneler, captions, lyd og eksporterte bilder i minnet. */
function fakeSbpro() {
  const scenes: { id: string; name: string }[] = [];
  const panels: { id: string; sceneId: string; duration: number; captions: Record<string, string>; image: string | null }[] = [];
  const captionNames: string[] = ["Dialogue"];
  const tracks: { id: string; clips: { path: string; start: number }[] }[] = [];
  const files = new Map<string, Uint8Array>();
  let selection: string[] = [], n = 0, exportSeed = 100;
  const g = {
    CaptionManager: {
      getCaptionNames: () => [...captionNames], addCaption: (x: string) => { captionNames.push(x); return true; },
      setPanelCaptionText: (p: string, c: string, t: string) => { if (!captionNames.includes(c)) throw Error("caption " + c); panels.find(x => x.id === p)!.captions[c] = t; },
      getPanelCaptionText: (p: string, c: string) => panels.find(x => x.id === p)!.captions[c] ?? "",
    },
    StoryboardManager: {
      createScene: (name: string) => { const id = `sc${++n}`; scenes.push({ id, name }); return id; },
      appendPanel: (sceneId: string) => { const id = `pn{${++n}}`; panels.push({ id, sceneId, duration: 12, captions: {}, image: null }); return id; },
      numberOfPanelsInProject: () => panels.length, panelInProject: (i: number) => panels[i]!.id,
      sceneIdOfPanel: (p: string) => panels.find(x => x.id === p)!.sceneId,
      setPanelDuration: (p: string, f: number) => { panels.find(x => x.id === p)!.duration = f; }, getPanelDuration: (p: string) => panels.find(x => x.id === p)!.duration,
      frameRate: () => 25,
    },
    ImportManager: { importImageToPanel: (p: string, path: string) => { if (!files.has(path)) throw Error("missing " + path); panels.find(x => x.id === p)!.image = path; } },
    ExportManager: { exportPanelToPNG: (_p: string, path: string) => { files.set(path, pngBytes(exportSeed++)); } },
    SoundTrackManager: { addSoundTrack: () => { const id = `tr${++n}`; tracks.push({ id, clips: [] }); return id; }, importSound: (t: string, path: string, start: number) => { tracks.find(x => x.id === t)!.clips.push({ path, start }); } },
    SelectionManager: { getPanelSelection: () => selection },
  };
  return { g, scenes, panels, captionNames, tracks, files, select: (ids: string[]) => { selection = ids; } };
}

function setup() {
  const seed = seedProject(2);
  let s: ProjectState = seed.state;
  const occs = orderedOccurrences(s, seed.mainId);
  const ids: string[] = [];
  occs.slice(0, 2).forEach((o, oi) => {
    for (let k = 0; k < 2; k++) {
      const panelId = tid(); ids.push(panelId);
      s = mustApply(s, { type: "AddStoryboardPanel", panelId, occurrenceId: o.id, variantId: o.variantId, orderKey: `a${k}` });
      s = mustApply(s, { type: "UpdateStoryboardPanel", panelId, durationFrames: 24 + k });
      const d = panelDetails(s.compositions[panelId as never]!);
      s = mustApply(s, { type: "SetStoryboardDetails", panelId, details: { ...d, number: String(oi * 2 + k + 1), fields: { dialogue: `Hei ${k}`, action: `Løper ${oi}`, notes: "" }, shot: "WS" } } as unknown as Command);
    }
  });
  return { s, productionId: seed.mainId as string, ids, occs };
}

/** Pakken slik nettleseren lager den: manifest + panels/<id>.png. */
function makePackage(s: ProjectState, productionId: string, fake: ReturnType<typeof fakeSbpro>) {
  const images = new Map<string, SbproPackageFile>();
  for (const { panel } of productionPanels(s, productionId)) {
    const bytes = pngBytes(panel.id.length), path = `panels/${panel.id}.png`;
    fake.files.set(`/pkg/${path}`, bytes);
    images.set(panel.id, { path, sha256: sha256Hex(bytes), byteSize: bytes.length, mimeType: "image/png" });
  }
  const m = buildSbproPackage(s, { productionId, nowIso: "2026-10-24T10:00:00Z", images, sounds: new Map() });
  return m;
}

function hostFor(fake: ReturnType<typeof fakeSbpro>, manifest: unknown, fetchFn?: (method: string, url: string, headers: Record<string, string>, body: string | null, bodyFile?: string) => { status: number; body: string }) {
  let session: unknown = null, now = Date.parse("2026-10-24T10:00:00Z");
  const messages: string[] = [];
  return {
    messages,
    get session() { return session; },
    host: {
      language: () => "nb_NO", now: () => now, sleep: (ms: number) => { now += ms; }, message: (t: string) => { messages.push(t); },
      readText: (p: string) => { if (p === "/pkg/manifest.json") return JSON.stringify(manifest); throw Error(p); },
      readBytes: (p: string) => Array.from(fake.files.get(p) ?? []),
      http: (method: string, url: string, headers: Record<string, string>, body: string | null, bodyFile?: string) => fetchFn!(method, url, headers, body, bodyFile),
      loadSession: () => session, saveSession: (x: unknown) => { session = JSON.parse(JSON.stringify(x)); }, clearSession: () => { session = null; },
    },
  };
}

describe("skriptene", () => {
  it("er ES5 (ingen let/const/piler/malstrenger) og har ingen hemmeligheter", () => {
    for (const f of readdirSync(DIR)) {
      const text = readFileSync(`${DIR}/${f}`, "utf8");
      expect(text, f).not.toMatch(/\b(let|const)\s|=>|`/);
      expect(text).not.toMatch(/sb_secret_|service_role|ptg_(access|refresh)_[A-Za-z0-9]{10}|apikey/i);
      expect(findSecrets({ text })).toEqual([]);
      expect(() => new vm.Script(text, { filename: f })).not.toThrow();
    }
  });
  it("menyknappene finnes og bruker biblioteket", () => {
    for (const b of ["PtG_Login", "PtG_Import", "PtG_Export", "PtG_Logout"]) {
      const t = readFileSync(`${DIR}/${b}.js`, "utf8");
      expect(t).toMatch(/include\("PtG_lib\.js"\)/); expect(t).toMatch(new RegExp(`function ${b}\\(`));
    }
  });
  it("SHA-256 i ES5 stemmer med kjernen", () => {
    const P = loadLib();
    for (const len of [0, 3, 55, 56, 64, 1000]) { const b = Uint8Array.from({ length: len }, (_, i) => (i * 7) & 0xff); expect(P.sha256(Array.from(b))).toBe(sha256Hex(b)); }
  });
  it("tekster på nb og en med reserve", () => {
    const P = loadLib();
    expect(Object.keys(P.STRINGS.nb).sort()).toEqual(Object.keys(P.STRINGS.en).sort());
    expect(P.t({ language: () => "nb_NO" }, "loginOk")).toBe("Koblet til prosjektet.");
    expect(P.t({ language: () => "ja_JP" }, "loginOk")).toBe("Connected to the project.");
  });
  it("klienten er registrert og kapabilitetene er ærlige", () => {
    expect(clientKnown("ptg.toonboom-sbpro")).toBe(true);
    expect(readFileSync("db/migrations/0113_c5_sbpro.sql", "utf8")).toMatch(/'ptg\.toonboom-sbpro'/);
    expect(ADAPTERS.find(a => a.id === SBPRO_ADAPTER.id)?.capabilities).toEqual(["read", "write", "audio", "timeline", "notes"]);
    expect(SBPRO_LIMITS).toContain("unverified");
  });
  it("panelbilder fra returer vernes i oppryddingen (ORPHAN_REFERENCE_TABLES)", () => {
    expect(readFileSync("src/adapters/storage/orphan-cleanup.server.ts", "utf8")).toMatch(/"connector_panel_candidates"/);
    expect(readFileSync("db/migrations/0113_c5_sbpro.sql", "utf8")).toMatch(/media_path text/);
  });
});

describe("import", () => {
  it("lager scener, paneler, timing, captions, kamera, referanse og bilder", () => {
    const { s, productionId, ids } = setup();
    const fake = fakeSbpro(), P = loadLib();
    const m = makePackage(s, productionId, fake);
    const h = hostFor(fake, m);
    const r = P.runImport(h.host, P.sbpro(fake.g), "/pkg");
    expect(r).toMatchObject({ panels: 4, scenes: 2 });
    expect(fake.panels.map(p => p.duration)).toEqual([24, 25, 24, 25]);
    expect(fake.panels[0]!.captions["Dialogue"]).toBe("Hei 0");
    expect(fake.panels[2]!.captions["Action Notes"]).toBe("Løper 1");
    expect(fake.panels[0]!.captions["Camera"]).toBe("WS");
    expect(P.parseRef(fake.panels[0]!.captions["PtG Ref"]).panelId).toBe(ids[0]);
    expect(fake.panels.every(p => p.image)).toBe(true);
    expect(fake.captionNames).toEqual(expect.arrayContaining(["Dialogue", "Action Notes", "Notes", "Camera", "PtG Ref"]));
  });
  it("lyd legges på ett spor med starttid fra timingen", () => {
    const P = loadLib(), fake = fakeSbpro();
    const m = { manifestVersion: 1, adapter: { id: "toonboom-sbpro" }, projectId: "p", frameRate: { num: 25, den: 1 }, sbpro: { productionId: "x" }, items: [
      { kind: "panel", id: "a", parentId: "o", durationFrames: 10, sbpro: { order: 0, captions: {}, sound: { path: "sound/a.wav" } } },
      { kind: "panel", id: "b", parentId: "o", durationFrames: 5, sbpro: { order: 1, captions: {}, sound: { path: "sound/b.wav" } } }] };
    P.runImport(hostFor(fake, m).host, P.sbpro(fake.g), "/pkg");
    expect(fake.tracks).toHaveLength(1);
    expect(fake.tracks[0]!.clips).toEqual([{ path: "/pkg/sound/a.wav", start: 0 }, { path: "/pkg/sound/b.wav", start: 10 }]);
  });
  it("avviser feil adapter, versjon og ulik bildefrekvens", () => {
    const P = loadLib(), fake = fakeSbpro();
    expect(() => P.importPlan({ manifestVersion: 2 })).toThrow("manifest-version");
    expect(() => P.importPlan({ manifestVersion: 1, adapter: { id: "x" } })).toThrow("adapter");
    const m = { manifestVersion: 1, adapter: { id: "toonboom-sbpro" }, projectId: "p", frameRate: { num: 24, den: 1 }, sbpro: { productionId: "x" }, items: [] };
    expect(() => P.runImport(hostFor(fake, m).host, P.sbpro(fake.g), "/pkg")).toThrow("fps");
  });
});

function roundtrip(edit?: (f: ReturnType<typeof fakeSbpro>) => void) {
  const base = setup();
  const fake = fakeSbpro(), P = loadLib();
  const h = hostFor(fake, makePackage(base.s, base.productionId, fake));
  P.runImport(h.host, P.sbpro(fake.g), "/pkg");
  edit?.(fake);
  const ret = P.collectReturn(h.host, P.sbpro(fake.g), "/out", "2026-10-24T11:00:00Z");
  const read = readSbproReturn(JSON.parse(JSON.stringify(ret)));
  if (!read.ok) throw new Error(read.reason);
  return { ...base, fake, P, ret, read: read.value, h };
}

describe("rundtur via manifest", () => {
  it("uendret rundtur gir bare bildekandidater og ingen sammenstilling", () => {
    const r = roundtrip(), plan = planSbproReturn(r.s, r.productionId, r.read);
    expect(plan.candidates.map(c => c.kind).sort()).toEqual(["image", "image", "image", "image"]);
    expect(plan.conform.lossless).toBe(true);
  });
  it("endret tekst og timing blir kandidater; ingenting endres i prosjektet", () => {
    const r = roundtrip(f => { f.panels[0]!.captions["Dialogue"] = "Ny replikk"; f.panels[1]!.duration = 40; });
    const plan = planSbproReturn(r.s, r.productionId, r.read);
    expect(plan.candidates.find(c => c.kind === "text")?.incoming).toEqual({ dialogue: "Ny replikk" });
    expect(plan.candidates.find(c => c.kind === "timing")?.incoming).toMatchObject({ durationFrames: 40, current: 25 });
    expect(panelDetails(r.s.compositions[r.ids[0] as never]!).fields["dialogue"]).toBe("Hei 0");
  });
  it("ny rekkefølge i samme scene er tapsfri og blir én kommandoliste", () => {
    const r = roundtrip(f => { const [a, b] = [f.panels[0]!, f.panels[1]!]; f.panels[0] = b; f.panels[1] = a; });
    const plan = planSbproReturn(r.s, r.productionId, r.read);
    expect(plan.conform.lossless).toBe(true);
    const cmds = conformCommands(r.s, plan.conform)!;
    let st = r.s;
    for (const c of cmds) { const x = applyCommand(st, envelope(c)); if (!x.ok) throw new Error(x.error.message); st = x.state; }
    expect(productionPanels(st, r.productionId).map(p => p.panel.id)).toEqual([r.ids[1], r.ids[0], r.ids[2], r.ids[3]]);
  });
  it("nytt panel, flytting mellom scener og manglende panel er bare forslag", () => {
    const added = roundtrip(f => { const id = f.g.StoryboardManager.appendPanel(f.panels[0]!.sceneId); f.g.StoryboardManager.setPanelDuration(id, 8); });
    const p1 = planSbproReturn(added.s, added.productionId, added.read);
    expect(p1.conform.lossless).toBe(false); expect(p1.conform.reasons).toContain("new");
    expect(p1.candidates.some(c => c.kind === "new_panel")).toBe(true);
    expect(conformCommands(added.s, p1.conform)).toBeNull();
    const moved = roundtrip(f => { f.panels[1]!.sceneId = f.panels[2]!.sceneId; f.panels[1]!.captions["PtG Ref"] = f.panels[1]!.captions["PtG Ref"]!.replace(/occ:[^|]+/, "occ:" + /occ:([^|]+)/.exec(f.panels[2]!.captions["PtG Ref"]!)![1]); });
    expect(planSbproReturn(moved.s, moved.productionId, moved.read).conform.reasons).toContain("moved-scene");
    const missing = roundtrip(f => { f.panels.pop(); });
    const p3 = planSbproReturn(missing.s, missing.productionId, missing.read);
    expect(p3.conform.reasons).toContain("missing");
    expect(Object.values(missing.s.compositions).filter(c => c.kind === "storyboard" && !c.removed)).toHaveLength(4);
  });
  it("konflikt når panelet er endret i Pen to Glass etter eksporten, og sammenstillingen stopper", () => {
    const r = roundtrip(f => { f.panels[0]!.captions["Notes"] = "SB Pro"; const [a, b] = [f.panels[0]!, f.panels[1]!]; f.panels[0] = b; f.panels[1] = a; });
    const s2 = mustApply(r.s, { type: "UpdateStoryboardPanel", panelId: r.ids[0]!, name: "Endret" });
    const plan = planSbproReturn(s2, r.productionId, r.read);
    expect(plan.candidates.find(c => c.kind === "text")?.conflict).toBe(true);
    expect(plan.conform.reasons).toContain("conflict");
    const clean = planSbproReturn(r.s, r.productionId, r.read);
    expect(conformCommands(s2, clean.conform)).toBeNull(); // revisjonen sjekkes på nytt før bruk
  });
  it("utvalg sender bare bildene for valgte paneler", () => {
    const r = roundtrip(f => f.select([f.panels[1]!.id]));
    expect(r.ret.items.filter((i: { files: unknown[] }) => i.files.length).length).toBe(1);
  });
  it("avviser hemmeligheter, feil adapter og for mange paneler", () => {
    const r = roundtrip();
    expect(readSbproReturn({ ...r.ret, adapter: { id: "x", version: "1" } })).toEqual({ ok: false, reason: "adapter" });
    expect(readSbproReturn({ ...r.ret, token: "ptg_access_abcdefghijklmnopqrstuvwxyz" }).ok).toBe(false);
    expect(readSbproReturn({ ...r.ret, sbpro: {} })).toEqual({ ok: false, reason: "production" });
  });
});

describe("innlogging og opplasting mot falskt API", () => {
  function api(r: ReturnType<typeof roundtrip>) {
    let now = Date.parse("2026-10-24T10:00:00Z");
    const mem = memoryStore(r.s, { now: () => now });
    let seq = 0;
    const random = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 13 + ++seq) & 0xff);
    const calls: string[] = [];
    const http = (method: string, url: string, headers: Record<string, string>, body: string | null, bodyFile?: string) => {
      calls.push(`${method} ${new URL(url).pathname}`);
      const payload = bodyFile ? r.fake.files.get(bodyFile)! : body ?? undefined;
      let out: { status: number; body: string } = { status: 0, body: "" };
      const req = new Request(url, { method, headers, body: payload as BodyInit | undefined });
      // Synkron fasade for skriptet (curl er synkront i Storyboard Pro): kjør handleren og vent i testen.
      pending.push(handleApiV1(req, { store: mem.store, now: () => now, random, ip: "198.51.100.7" }).then(async res => { out = { status: res.status, body: await res.text() }; }));
      return new Proxy({}, { get: (_t, k) => (out as Record<string, unknown>)[k as string] }) as { status: number; body: string };
    };
    const pending: Promise<void>[] = [];
    return { mem, http, calls, pending, advance: (ms: number) => { now += ms; } };
  }

  it("enhetsflyt, opplasting av retur og bilder, idempotens og utlogging", async () => {
    const r = roundtrip(f => { f.panels[0]!.captions["Dialogue"] = "Ny"; });
    const a = api(r);
    // Asynkron handler bak en synkron vert: kjør skriptets steg ett og ett ved å avvente svarene.
    const run = async (method: string, path: string, headers: Record<string, string>, body: string | null, file?: string) => {
      const res = a.http(method, "https://ptg.test" + path, headers, body, file); await Promise.all(a.pending); return { status: res.status, body: res.body };
    };
    const dev = JSON.parse((await run("POST", "/api/v1/oauth/device", { "Content-Type": "application/x-www-form-urlencoded" }, "client_id=ptg.toonboom-sbpro&scope=" + encodeURIComponent(r.P.SCOPES))).body);
    expect(dev.user_code).toBeTruthy();
    const pend = await run("POST", "/api/v1/oauth/token", { "Content-Type": "application/x-www-form-urlencoded" }, `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:device_code")}&device_code=${dev.device_code}&client_id=ptg.toonboom-sbpro`);
    expect(JSON.parse(pend.body).error).toBe("authorization_pending");
    a.mem.approveDevice(dev.user_code, r.s.project.id, "11111111-1111-4111-8111-111111111111");
    const tok = JSON.parse((await run("POST", "/api/v1/oauth/token", { "Content-Type": "application/x-www-form-urlencoded" }, `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:device_code")}&device_code=${dev.device_code}&client_id=ptg.toonboom-sbpro`)).body);
    expect(tok.access_token).toBeTruthy(); expect(tok.project_id).toBe(r.s.project.id);
    const auth = { Authorization: "Bearer " + tok.access_token, "Content-Type": "application/json" };
    const path = `/api/v1/projects/${r.s.project.id}/sbpro/returns`;
    const first = await run("POST", path, auth, JSON.stringify(r.ret));
    expect(first.status).toBe(201);
    const body = JSON.parse(first.body);
    expect(body.candidates).toBeGreaterThan(0);
    expect(body.uploads).toHaveLength(4);
    const again = await run("POST", path, auth, JSON.stringify(r.ret));
    expect(again.status).toBe(200); expect(JSON.parse(again.body).returnId).toBe(body.returnId);
    const u = body.uploads[0];
    const item = r.ret.items.find((i: { id: string }) => i.id === u.key);
    const wrong = await run("PUT", `${path}/${body.returnId}/images/${body.uploads[1].candidateId}`, { Authorization: auth.Authorization }, null, "/out/" + item.files[0].path);
    expect(wrong.status).toBe(422);
    const ok = await run("PUT", `${path}/${body.returnId}/images/${u.candidateId}`, { Authorization: auth.Authorization }, null, "/out/" + item.files[0].path);
    expect(ok.status).toBe(200);
    expect(a.mem.sbproCandidates.find(c => c.id === u.candidateId)?.status).toBe("open");
    const notPng = await run("PUT", `${path}/${body.returnId}/images/${u.candidateId}`, { Authorization: auth.Authorization }, "hello");
    expect(notPng.status).toBe(413);
    // Ingenting er tatt i bruk: prosjektet er uendret.
    expect(a.mem.state).toBe(r.s);
    // Feil prosjekt og manglende scope stoppes.
    expect((await run("POST", `/api/v1/projects/${tid()}/sbpro/returns`, auth, JSON.stringify(r.ret))).status).toBe(403);
    // Tilbaketrekking: etter revoke virker ikke tokenet.
    await run("POST", "/api/v1/oauth/revoke", { "Content-Type": "application/x-www-form-urlencoded" }, `token=${tok.refresh_token}&client_id=ptg.toonboom-sbpro`);
    expect((await run("POST", path, auth, JSON.stringify(r.ret))).status).toBe(401);
  });

  it("skriptets innlogging, fornyelse og opplasting mot en synkron falsk server", () => {
    const r = roundtrip(f => { f.panels[1]!.duration = 30; });
    const P = r.P, host = r.h.host as Record<string, any>;
    let polls = 0, access = "ptg_access_one", puts: string[] = [], posted: any = null, refreshed = 0;
    host.http = (method: string, url: string, headers: Record<string, string>, body: string | null, file?: string) => {
      const u = new URL(url).pathname;
      if (u === "/api/v1/oauth/device") { expect(body).toContain("client_id=ptg.toonboom-sbpro"); return { status: 200, body: JSON.stringify({ device_code: "ptg_device_x", user_code: "ABCD-EFGH", verification_uri: "https://ptg.test/koble", expires_in: 600, interval: 5 }) }; }
      if (u === "/api/v1/oauth/token" && body!.includes("device_code")) return ++polls < 3 ? { status: 400, body: '{"error":"authorization_pending"}' } : { status: 200, body: JSON.stringify({ access_token: access, refresh_token: "ptg_refresh_one", expires_in: 900, project_id: r.s.project.id }) };
      if (u === "/api/v1/oauth/token" && body!.includes("refresh_token")) { refreshed++; access = "ptg_access_two"; return { status: 200, body: JSON.stringify({ access_token: access, refresh_token: "ptg_refresh_two", expires_in: 900 }) }; }
      if (headers["Authorization"] === "Bearer ptg_access_one" && !refreshed) return { status: 401, body: '{"error":"invalid_token"}' };
      if (method === "POST" && u.endsWith("/sbpro/returns")) { posted = JSON.parse(body!); const it = posted.items[1]; return { status: 201, body: JSON.stringify({ returnId: "r1", candidates: 5, conflicts: 0, conform: { lossless: true, reasons: [] }, uploads: [{ candidateId: "c1", key: it.id, sha256: it.files[0].sha256, byteSize: 64 }, { candidateId: "c2", key: it.id, sha256: "0".repeat(64), byteSize: 64 }] }) }; }
      if (method === "PUT") { puts.push(`${u}|${file}`); return { status: 200, body: "{}" }; }
      return { status: 404, body: "{}" };
    };
    const s1 = P.login(host, "https://ptg.test");
    expect(polls).toBe(3); expect(s1.accessToken).toBe("ptg_access_one");
    expect(r.h.messages[0]).toContain("ABCD-EFGH");
    const res = P.upload(host, r.ret, "/out");
    expect(refreshed).toBe(1);
    expect(res.returnId).toBe("r1");
    expect(posted.adapter.id).toBe("toonboom-sbpro");
    expect(puts).toEqual([`/api/v1/projects/${r.s.project.id}/sbpro/returns/r1/images/c1|/out/${r.ret.items[1].files[0].path}`]); // feil sha sendes ikke
    expect(JSON.stringify(r.h.session)).not.toContain("ptg_access_one");
    P.logout(host);
    expect(r.h.session).toBeNull();
  });
  it("avviser opplasting til et annet prosjekt enn innloggingen", () => {
    const r = roundtrip(), host = r.h.host as Record<string, any>;
    host.saveSession({ baseUrl: "https://ptg.test", accessToken: "a", refreshToken: "b", projectId: "annet", expiresAt: Date.now() + 1e9 });
    expect(() => r.P.upload(host, r.ret, "/out")).toThrow("wrong_project");
  });
});
