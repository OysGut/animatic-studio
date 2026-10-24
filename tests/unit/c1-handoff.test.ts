/** C-1 universal file path: formats out/in, recognition, token, intake to candidate, conflict and status. */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { emptyProjectState, FPS_25, type ProjectState, type Command } from "@/core";
import { validateManifest } from "@/core/connectors";
import {
  FORMAT_FACTS, RETURN_TOKEN_PREFIX, RETURN_TOKEN_RE, base64UrlToken, findMarker, handoffManifest, otioForHandoff,
  pngForHandoff, psdForHandoff, readBwf, readPngText, readPsd, recognizeReturn, surfaceStatus, wavForHandoff, svgForHandoff, type HandoffRow,
} from "@/core/handoff";
import { beginReturn, finishReturn, handoffOpen, putReturnChunk, applyLocally, type HandoffRecord, type HandoffStore, type ReturnTransfer } from "@/adapters/handoff/intake";
import { mustApply, tid } from "../helpers/fixtures";

const H = "0190a000-0000-7000-8000-00000000c101";
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const rgba = (w: number, h: number, c: [number, number, number, number]) => { const b = new Uint8Array(w * h * 4); for (let i = 0; i < b.length; i += 4) b.set(c, i); return b; };

describe("C-1 formats", () => {
  it("PSD: layers out and in keep name, visibility, opacity, alpha and the marker", () => {
    const layers = [
      { name: "Bakgrunn", visible: true, opacity: 1, left: 0, top: 0, width: 4, height: 3, rgba: rgba(4, 3, [10, 20, 30, 255]) },
      { name: "Figur – ø 漢字", visible: false, opacity: 0.5, left: 1, top: 1, width: 2, height: 2, rgba: rgba(2, 2, [200, 100, 50, 128]) },
    ];
    const bytes = psdForHandoff(4, 3, layers, H);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("8BPS");
    const doc = readPsd(bytes);
    expect(doc.width).toBe(4); expect(doc.height).toBe(3);
    expect(doc.layers.map((l) => l.name)).toEqual(["Bakgrunn", "Figur – ø 漢字"]);
    expect(doc.layers[1]!.visible).toBe(false);
    expect(Math.round(doc.layers[1]!.opacity * 255)).toBe(128);
    expect(Array.from(doc.layers[1]!.rgba.subarray(0, 4))).toEqual([200, 100, 50, 128]);
    expect(doc.layers[1]!.left).toBe(1);
    expect(findMarker(bytes)).toBe(H);
    expect(Array.from(doc.composite!.subarray(0, 4))).toEqual([10, 20, 30, 255]); // hidden layer not flattened
  });

  it("PNG carries the marker as text", () => {
    const b = pngForHandoff(2, 2, rgba(2, 2, [1, 2, 3, 255]), H);
    expect(Object.values(readPngText(b)).some((v) => v.includes(H))).toBe(true);
    expect(findMarker(b)).toBe(H);
  });

  it("WAV/BWF keeps timecode, scene and asset ID", () => {
    const tone = new Float32Array(480).map((_, i) => Math.sin(i / 10));
    const b = wavForHandoff([tone], 48000, { originatorReference: "ref", timeReference: 48000 * 3600, scene: "SC-1", assetId: "asset-1", clipId: "clip-1", timecode: "01:00:00:00", frameRate: { num: 25, den: 1 } }, H);
    const info = readBwf(b);
    expect(info.sampleRate).toBe(48000); expect(info.frames).toBe(480); expect(info.channels).toBe(1);
    expect(info.timeReference).toBe(48000 * 3600);
    expect(JSON.stringify(info.ixml)).toContain("SC-1");
    expect(JSON.stringify(info.ixml)).toContain("asset-1");
    expect(findMarker(b)).toBe(H);
  });

  it("OTIO is JSON with the hand-off in metadata", () => {
    const out = otioForHandoff(JSON.stringify({ OTIO_SCHEMA: "Timeline.1", name: "x", metadata: {} }), H, "scene-1");
    const j = JSON.parse(out);
    expect(j.OTIO_SCHEMA).toBe("Timeline.1");
    expect(JSON.stringify(j.metadata)).toContain(H);
  });

  it("SVG is honest: not returnable, text not promised", () => {
    expect(FORMAT_FACTS.svg.returnable).toBe(false);
    expect(FORMAT_FACTS.psd.returnable).toBe(true);
    expect(FORMAT_FACTS.psd.editableLayers).toBe(true);
    expect(FORMAT_FACTS.png.editableLayers).toBe(false);
    expect(svgForHandoff("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>", H)).toContain(H);
  });
});

describe("C-1 recognition and token", () => {
  const bytes = pngForHandoff(1, 1, rgba(1, 1, [0, 0, 0, 255]), H);
  const plain = pngForHandoff(1, 1, rgba(1, 1, [0, 0, 0, 255]), H).map((x) => x); // marker present
  it("recognizes by marker and by link, rejects filename only and mismatch", () => {
    expect(recognizeReturn({ bytes, linkHandoffId: null, knownHandoffIds: [H] })).toMatchObject({ ok: true, via: "marker" });
    expect(recognizeReturn({ bytes, linkHandoffId: H })).toMatchObject({ ok: true, via: "marker+link" });
    const noMarker = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    expect(recognizeReturn({ bytes: noMarker, linkHandoffId: H })).toMatchObject({ ok: true, via: "link" });
    expect(recognizeReturn({ bytes: noMarker, linkHandoffId: null, knownHandoffIds: [H], outgoingNames: ["kite.png"], fileName: "kite.png" })).toEqual({ ok: false, reason: "filename_only" });
    expect(recognizeReturn({ bytes: plain, linkHandoffId: "0190a000-0000-7000-8000-0000000000ff" })).toEqual({ ok: false, reason: "mismatch" });
  });
  it("token format and expiry", () => {
    const tok = RETURN_TOKEN_PREFIX + base64UrlToken(new Uint8Array(32).fill(7));
    expect(RETURN_TOKEN_RE.test(tok)).toBe(true);
    const h = { id: H, expiresAt: new Date(Date.now() + 1000).toISOString(), status: "out" } as HandoffRecord;
    expect(handoffOpen(h, Date.now())).toBe(true);
    expect(handoffOpen({ ...h, expiresAt: new Date(Date.now() - 1).toISOString() }, Date.now())).toBe(false);
    expect(handoffOpen({ ...h, status: "revoked" }, Date.now())).toBe(false);
  });
});

function project() {
  let s: ProjectState = emptyProjectState({ id: tid<"project">(), revision: 1, name: "C1", fps: FPS_25, frameWidth: 1920, frameHeight: 1080, sourceLanguage: "en" });
  const assetId = tid<"asset">(), variantId = tid<"asset_variant">(), v1 = tid<"asset_version">();
  s = mustApply(s, { type: "CreateAssets", assets: [{ assetId, fields: { kind: "character", name: "Kite", names: [], description: "", category: "", tags: [] } }] });
  s = mustApply(s, { type: "CreateAssetVariant", variantId, assetId, fields: { name: "Main", style: "illustrated", appearance: "" } });
  s = mustApply(s, { type: "AddAssetVersion", versionId: v1, variantId, media: { path: "p/a.png", mimeType: "image/png", width: 1, height: 1, byteSize: 1, sha256: "a".repeat(64) }, note: "" });
  s = mustApply(s, { type: "ApproveAssetVersion", variantId, versionId: v1 });
  return { s, assetId, variantId, v1 };
}

function fakeStore(state: ProjectState) {
  let st = state;
  const chunks = new Map<number, Uint8Array>(); const transfers = new Map<string, ReturnTransfer>();
  const conflicts: unknown[] = []; const marks: unknown[] = []; const applied: Command[] = [];
  const store: HandoffStore = {
    rateLimit: async () => true, byToken: async () => null,
    getTransfer: async (id) => transfers.get(id) ?? null,
    insertTransfer: async (t) => { transfers.set(t.id, t); },
    setTransfer: async (id, p) => { Object.assign(transfers.get(id)!, p); },
    checkQuota: async () => true,
    putChunk: async (_t, i, b) => { chunks.set(i, b); },
    chunkIndexes: async () => [...chunks.keys()],
    readChunk: async (_t, i) => chunks.get(i)!,
    removeChunks: async () => { chunks.clear(); },
    loadState: async () => st,
    uploadFile: async () => undefined,
    previewFromPsd: async () => null,
    applyCommands: async (_p, actor, s, cmds) => { let x = s; for (const c of cmds) { x = applyLocally(x, actor, c).state; applied.push(c); } st = x; return x; },
    insertConflict: async (c) => { conflicts.push(c); return "conflict-1"; },
    markHandoff: async (_id, p) => { marks.push(p); },
  };
  return { store, conflicts, marks, applied, get state() { return st; } };
}

describe("C-1 intake", () => {
  const actor = "00000000-0000-7000-8000-a11ce0000001";
  const rec = (p: ReturnType<typeof project>, baseVersionId: string | null): HandoffRecord => ({ id: H, projectId: p.s.project.id, createdBy: actor, targetKind: "asset", targetId: p.assetId, assetId: p.assetId, variantId: p.variantId, sceneId: null, baseVersionId, baseRevision: 1, format: "png", fileName: "Kite.png", expiresAt: new Date(Date.now() + 3600e3).toISOString(), status: "out" });
  async function send(p: ReturnType<typeof project>, h: HandoffRecord, bytes: Uint8Array, fileName = "Kite-edit.png") {
    const f = fakeStore(p.s);
    const t = await beginReturn(f.store, h, actor, { fileName, byteSize: bytes.length, sha256: sha(bytes), idempotencyKey: "k".repeat(20) });
    await putReturnChunk(f.store, t, 0, bytes);
    return { f, r: await finishReturn(f.store, h, t, actor, { linkHandoffId: H }) };
  }

  it("creates a candidate version and never approves it", async () => {
    const p = project();
    const { f, r } = await send(p, rec(p, p.v1), pngForHandoff(2, 2, rgba(2, 2, [9, 9, 9, 255]), H));
    expect(f.applied.map((c) => c.type)).toEqual(["AddAssetVersion"]);
    expect(f.state.assetVariants[p.variantId]!.approvedVersionId).toBe(p.v1);
    expect(r.conflictId).toBeNull();
    expect(f.marks).toEqual([expect.objectContaining({ status: "returned" })]);
  });

  it("flags a conflict when the base version is outdated", async () => {
    const p = project();
    const { f, r } = await send(p, rec(p, null), pngForHandoff(1, 1, rgba(1, 1, [1, 1, 1, 255]), H));
    expect(r.conflictId).toBe("conflict-1");
    expect(f.state.assetVariants[p.variantId]!.approvedVersionId).toBe(p.v1);
  });

  it("rejects a disallowed file type and a disguised file", async () => {
    const p = project();
    const f = fakeStore(p.s);
    await expect(beginReturn(f.store, rec(p, p.v1), actor, { fileName: "x.exe", byteSize: 10, sha256: "a".repeat(64), idempotencyKey: "k".repeat(20) })).rejects.toThrow("extension");
    const fake = new TextEncoder().encode("<html>" + "x".repeat(30));
    await expect(send(p, rec(p, p.v1), fake)).rejects.toThrow(/content|extension/);
  });

  it("rejects a file with a damaged checksum", async () => {
    const p = project(); const f = fakeStore(p.s); const h = rec(p, p.v1);
    const bytes = pngForHandoff(1, 1, rgba(1, 1, [1, 1, 1, 255]), H);
    const t = await beginReturn(f.store, h, actor, { fileName: "a.png", byteSize: bytes.length, sha256: "b".repeat(64), idempotencyKey: "k".repeat(20) });
    await putReturnChunk(f.store, t, 0, bytes);
    await expect(finishReturn(f.store, h, t, actor, { linkHandoffId: H })).rejects.toThrow("checksum");
  });
});

describe("C-1 manifest and status", () => {
  it("hand-off manifest validates against Manifest v1", () => {
    const p = project();
    const m = handoffManifest(p.s, { kind: "asset", id: p.assetId, name: "Kite", revision: 1, baseVersionId: p.v1, sceneId: null }, "psd", H, new Date().toISOString(), { path: "Kite.psd", sha256: "a".repeat(64), byteSize: 10 });
    expect(validateManifest(JSON.parse(JSON.stringify(m))).ok).toBe(true);
  });
  it("status surface: conflict over returned over out; expired is ignored", () => {
    const now = Date.now();
    const row = (id: string, status: HandoffRow["status"], exp = now + 1e6): HandoffRow => ({ id, targetKind: "asset", targetId: "a", assetId: "a", sceneId: "s", adapter: "photoshop", format: "psd", status, expiresAt: new Date(exp).toISOString(), candidateVersionId: null, createdAt: new Date(now).toISOString() });
    expect(surfaceStatus([row("1", "out")], { kind: "asset", id: "a" }, now)?.kind).toBe("out");
    expect(surfaceStatus([row("1", "out"), row("2", "returned")], { kind: "asset", id: "a" }, now)?.kind).toBe("returned");
    expect(surfaceStatus([row("1", "returned"), row("2", "conflict")], { kind: "asset", id: "a" }, now)?.kind).toBe("conflict");
    expect(surfaceStatus([row("1", "out", now - 1)], { kind: "asset", id: "a" }, now)).toBeNull();
    expect(surfaceStatus([row("1", "out")], { kind: "scene", id: "s" }, now)?.kind).toBe("out");
  });
});
