// @vitest-environment node
/**
 * C-8 Krita og Blender uten Krita og Blender: kjører Python-enhetstestene (falske krita/bpy) og en kontraktstest
 * der den felles Python-klienten og begge tilleggene snakker med den ekte /api/v1-handleren (falsk lagring)
 * gjennom en lokal server på 127.0.0.1. Ingen eksterne kall.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderedOccurrences, type Command, type ProjectState } from "@/core";
import { ADAPTERS, BLENDER_MAX_PANELS, blenderCameraPlan, framesToTimecode, pkceChallenge, sha256Hex } from "@/core/connectors";
import { fieldOfView } from "@/core/storyboard/blocking";
import { panelDetails } from "@/core/storyboard/editing";
import { encodePng } from "@/core/handoff/png";
import { keysEvenly } from "@/core/order-key";
import { handleApiV1 } from "@/adapters/connectors/api-v1";
import { PtgConnector } from "../../packages/ptg-connector-sdk/src/index";
import { memoryStore } from "../helpers/c0-memory-store";
import { mustApply, seedProject, tid } from "../helpers/fixtures";

const ROOT = join(__dirname, "../..");
const TESTS = join(ROOT, "plugins/python-common/tests");
const USER = "00000000-0000-7000-8000-a11ce0000008";
const PY = process.env["PYTHON"] ?? "python3";
let seed = 31;
const random = (n: number) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24; return b; };
const png = encodePng(2, 2, new Uint8Array(16).fill(200), {});

function setup() {
  const sp = seedProject(1);
  let s: ProjectState = sp.state;
  const occ = orderedOccurrences(s, sp.mainId)[0]!;
  const panels: string[] = []; const keys = keysEvenly(2);
  for (let k = 0; k < 2; k++) {
    const panelId = tid(); panels.push(panelId);
    s = mustApply(s, { type: "AddStoryboardPanel", panelId, occurrenceId: occ.id, variantId: occ.variantId, orderKey: keys[k]! });
    s = mustApply(s, { type: "UpdateStoryboardPanel", panelId, durationFrames: 25 });
  }
  const blocking = { width: 10, height: 8, walls: [], objects: [], characters: [], cameras: [{ id: "cam1", x: 2, y: 3, heading: 15, focal: 35, sensor: 24.89 }], cameraId: "cam1", axis: null, approvals: {} };
  const d = panelDetails(s.compositions[panels[0] as never]!);
  s = mustApply(s, { type: "SetStoryboardDetails", panelId: panels[0]!, details: { ...d, blocking } } as unknown as Command);
  const assetId = tid<"asset">(), variantId = tid<"asset_variant">(), v1 = tid<"asset_version">();
  s = mustApply(s, { type: "CreateAssets", assets: [{ assetId, fields: { kind: "character", name: "Kite", names: [], description: "", category: "", tags: [] } }] } as unknown as Command);
  s = mustApply(s, { type: "CreateAssetVariant", variantId, assetId, fields: { name: "Standard", style: "other", appearance: "" } });
  s = mustApply(s, { type: "AddAssetVersion", versionId: v1, variantId, media: { path: `${s.project.id}/${assetId}/${v1}/kite.png`, mimeType: "image/png", width: 2, height: 2, byteSize: png.length, sha256: sha256Hex(png) }, note: "" });
  s = mustApply(s, { type: "ApproveAssetVersion", variantId, versionId: v1 });
  return { s, occ, panels, assetId, variantId, v1 };
}

describe("C-8 Python-enhetstester (falske krita og bpy)", () => {
  it("python3 -m unittest er grønn", () => {
    const r = spawnSync(PY, ["-W", "error::ResourceWarning", "-m", "unittest", "-q", "test_c8_plugins"], { cwd: TESTS, encoding: "utf8" });
    expect(r.error, "python3 mangler").toBeUndefined();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toMatch(/OK/);
  });
});

describe("C-8 kjerne og API", () => {
  it("kameraplanen følger SB-9: brennvidde, sensor og bildeformat; paneler uten kamera gir null", () => {
    const r = setup();
    const plan = blenderCameraPlan(r.s, r.occ.id)!;
    expect(plan.keys.map(k => k.panelId)).toEqual(r.panels);
    const p = r.s.compositions[r.panels[0] as never]!;
    const c = plan.keys[0]!.camera!;
    expect(c.focalMm).toBe(35); expect(c.sensorWidthMm).toBe(24.89);
    expect(c.sensorHeightMm).toBeCloseTo(24.89 / (p.width / p.height), 10);
    expect(c.fovHorizontalDeg).toBeCloseTo(fieldOfView(35, 24.89, p.width / p.height).horizontal, 10);
    expect(plan.keys[1]!.camera).toBeNull();
    expect(plan.keys[1]!.frame).toBe(25);
    expect(blenderCameraPlan(r.s, "missing")).toBeNull();
    expect(BLENDER_MAX_PANELS).toBe(2000);
  });
  it("adaptere og klienter er registrert; OpenAPI beskriver kameraruten", () => {
    expect(ADAPTERS.map(a => a.id)).toEqual(expect.arrayContaining(["krita-python", "blender-python"]));
    const spec = JSON.parse(readFileSync(join(ROOT, "docs/api/openapi-v1.json"), "utf8"));
    expect(spec.paths["/projects/{projectId}/blender/cameras"].get.security[0].bearer).toEqual(["manifest:read"]);
    const sql = readFileSync(join(ROOT, "db/migrations/0111_c0_security_fixes.sql"), "utf8");
    expect(sql).toContain("'ptg.krita'"); expect(sql).toContain("'ptg.blender'");
  });
});

describe("C-8 kontrakt: Python-klient og tillegg mot /api/v1 (lokal falsk server)", () => {
  const r = setup();
  let now = Date.parse("2026-10-24T12:00:00Z");
  const mem = memoryStore(r.s, { now: () => now });
  mem.files.set(r.s.assetVersions[r.v1 as never]!.mediaPath, png);
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
    now += 10_000; // tiden går mellom kall (enhetsflytens intervall)
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`https://ptg.test${req.url}`, { method: req.method ?? "GET", headers: req.headers as Record<string, string>, ...(body && req.method !== "GET" ? { body: new Uint8Array(body) } : {}) });
    const out = await handleApiV1(request, { store: mem.store, now: () => now, random, ip: "127.0.0.1" });
    const bytes = new Uint8Array(await out.arrayBuffer());
    if (req.url === "/api/v1/oauth/device" && out.ok) mem.approveDevice(JSON.parse(new TextDecoder().decode(bytes)).user_code, r.s.project.id, USER);
    res.writeHead(out.status, Object.fromEntries(out.headers)); res.end(Buffer.from(bytes));
  });
  let base = "";
  beforeAll(async () => { await new Promise<void>(ok => server.listen(0, "127.0.0.1", ok)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
  afterAll(() => new Promise<void>(ok => server.close(() => ok())));

  it("innlogging, manifest, Krita-retur, Blender-kamera og rendringer som kandidater, konflikter og utlogging", async () => {
    const cfg = { base, assetId: r.assetId, variantId: r.variantId, v1: r.v1, occurrenceId: r.occ.id, pngHex: Buffer.from(png).toString("hex"),
      timecodes: [[0, { num: 25, den: 1 }], [90061, { num: 25, den: 1 }], [1439, { num: 24000, den: 1001 }]], idem: ["ab".repeat(32), r.variantId, r.v1], verifier: "v".repeat(43) };
    const stdout = await new Promise<string>((ok, fail) => {
      const p = spawn(PY, [join(TESTS, "run_contract.py"), JSON.stringify(cfg)]);
      let o = "", e = ""; p.stdout.on("data", d => (o += d)); p.stderr.on("data", d => (e += d));
      p.on("close", code => (code === 0 ? ok(o) : fail(new Error(e))));
    });
    const out = JSON.parse(stdout);
    // Paritet med TypeScript-SDK-en og kjernen.
    expect(out.parity.timecode).toEqual(cfg.timecodes.map(([f, rt]) => framesToTimecode(f as number, rt as never)));
    expect(out.parity.idempotency).toBe(PtgConnector.idempotencyKey(cfg.idem[0]!, { variantId: cfg.idem[1]!, baseVersionId: cfg.idem[2]! }));
    expect(out.parity.pkce).toBe(pkceChallenge(cfg.verifier));
    expect(out.deviceShown).toEqual(["userCode", "verificationUri", "verificationUriComplete"]);
    expect(out.manifestItems).toBeGreaterThan(0);
    // Krita: kobling på ID, ny kandidat, idempotent, ingen konflikt (grunnlaget er den godkjente).
    expect(out.kritaLink).toMatchObject({ projectId: r.s.project.id, assetId: r.assetId, variantId: r.variantId, baseVersionId: r.v1 });
    expect(out.krita).toMatchObject({ status: "candidate", conflict: null, sameTransfer: true });
    // Blender: kamera stemmer med SB-9.
    const plan = blenderCameraPlan(mem.state, r.occ.id)!;
    expect(out.plan.keys[0].camera).toEqual(JSON.parse(JSON.stringify(plan.keys[0]!.camera)));
    expect(out.blenderCamera.lens).toBe(35);
    expect(out.blenderCamera.sensorWidth).toBe(24.89);
    expect(out.blenderCamera.fov).toBeCloseTo(plan.keys[0]!.camera!.fovHorizontalDeg, 9);
    expect(out.blenderCamera.resolution).toEqual([plan.frameSize.width, plan.frameSize.height]);
    expect(out.renders).toHaveLength(2);
    for (const x of out.renders) { expect(x.status).toBe("candidate"); expect(x.conflict).not.toBeNull(); }
    expect(out.resolveIncoming).toMatchObject({ approveInApp: true });
    expect(out.resolveKeepBoth).toMatchObject({ resolved: true });
    expect(out.badRequest).toBe("invalid_request");
    expect(out.afterLogout).not.toBe("ok");
    // Ingenting tas i bruk automatisk: godkjent versjon er fortsatt v1; kandidatene finnes med tidskode i PNG.
    expect(mem.state.assetVariants[r.variantId as never]!.approvedVersionId).toBe(r.v1);
    const cands = [out.krita.candidate, ...out.renders.map((x: { candidate: string }) => x.candidate)];
    for (const id of cands) expect(mem.state.assetVersions[id as never]).toBeTruthy();
    const render = mem.files.get(mem.state.assetVersions[out.renders[1].candidate as never]!.mediaPath)!;
    expect(new TextDecoder("latin1").decode(render)).toContain("ptg:timecode\u000000:00:01:00");
  }, 60_000);
});
