// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { inflateSync } from "node:zlib";
import { defaultLayerFields, orderedOccurrences, renderFrame } from "@/core";
import { alphaExportError, alphaSceneClip, alphaPixels, alphaRange, alphaFileBase,
  DEFAULT_ALPHA_SETTINGS, isAlphaSettings } from "@/core/layer-alpha";
import { drawFilmFrame } from "@/engine/compositor/film";
import { drawFrame } from "@/engine/compositor/canvas";
import { encodePngStrips } from "@/engine/export/png-writer";
import { supportsVp9Alpha } from "@/engine/export/alpha";
import { writeZip, type ZipSink } from "@/engine/export/zip";
import { unzipSync } from "fflate";
import { mustApply, seedProject, tid } from "../helpers/fixtures";
import { SoftCanvas, softLog, resetSoftLog } from "../helpers/soft-canvas";

function setup() {
  const seed = seedProject(1);
  const mainId = seed.mainId;
  const state = mustApply(seed.state, { type: "SetProjectFormat", width: 16, height: 16, fps: { num: 25, den: 1 } });
  const occ = orderedOccurrences(state, mainId)[0];
  if (!occ) throw new Error("Missing occurrence");
  const id = tid<"composition">(), solid = tid<"composition_layer">(), edge = tid<"composition_layer">();
  let s = mustApply(state, { type: "CreateComposition", compositionId: id, variantId: occ.variantId,
    fields: { name: "Alfa", width: 16, height: 16, durationFrames: 3, background: "#000000" } });
  const c = s.compositions[id]; if (!c) throw new Error("Missing composition");
  const fields = { ...defaultLayerFields(s, c, { fill: "#c86432" }), width: 4, height: 4 };
  s = mustApply(s, { type: "AddLayers", layers: [
    { layerId: solid, compositionId: id, fields },
    { layerId: edge, compositionId: id, fields: { ...fields, transform: { ...fields.transform, x: 3, opacity: 0.5 } } },
  ] });
  return { s, c, solid, edge };
}
function frame() {
  const fixture = setup();
  const canvas = new SoftCanvas(16, 16), clip = alphaSceneClip(fixture.s, fixture.c);
  if (!clip) throw new Error("Missing clip");
  drawFilmFrame(canvas.getContext() as unknown as CanvasRenderingContext2D, fixture.s, [clip], 0, {
    width: 16, height: 16, background: "transparent", images: new Map(),
    layerIds: new Set([fixture.solid, fixture.edge]), placeholders: false,
  });
  return { ...fixture, canvas };
}
/** Decode PNG bytes, including filters. No image encoder/decoder mock. */
function decode(parts: Uint8Array[], width: number, height: number): Uint8Array {
  const idat: Uint8Array[] = [];
  for (const p of parts) {
    if (p.length < 12 || String.fromCharCode(...p.subarray(4, 8)) !== "IDAT") continue;
    idat.push(p.subarray(8, p.length - 4));
  }
  const raw = inflateSync(Buffer.concat(idat)), row = width * 4, out = new Uint8Array(row * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (row + 1)];
    for (let x = 0; x < row; x++) {
      const a = x >= 4 ? out[y * row + x - 4] ?? 0 : 0;
      const b = y > 0 ? out[(y - 1) * row + x] ?? 0 : 0;
      out[y * row + x] = (raw[y * (row + 1) + x + 1] ?? 0) + (filter === 1 ? a : filter === 2 ? b : 0);
    }
  }
  return out;
}
afterEach(() => vi.unstubAllGlobals());
describe("P4 actual compositor pixels", () => {
  it("transparent corners and opaque figure through film.ts", () => {
    resetSoftLog();
    const { canvas } = frame();
    expect(canvas.pixel(0, 0)).toEqual([0, 0, 0, 0]);
    expect(canvas.pixel(15, 15)).toEqual([0, 0, 0, 0]);
    expect(canvas.pixel(8, 8)).toEqual([200, 100, 50, 1]);
    expect(softLog.unsupported).toEqual([]);
  });
  it.each(["straight", "premultiplied"] as const)("partial edge survives PNG encoding (%s)", async mode => {
    const { canvas } = frame();
    const px = new Uint8ClampedArray(canvas.data);
    const converted = alphaPixels(px, mode);
    const decoded = decode(await encodePngStrips({ width: 16, height: 16, stripRows: 2 }, async (y, rows) => converted.slice(y * 64, (y + rows) * 64)), 16, 16);
    const at = (8 * 16 + 3) * 4;
    expect([...decoded.slice(at, at + 4)]).toEqual(mode === "straight" ? [200, 100, 50, 128] : [100, 50, 25, 128]);
    expect(decoded[(8 * 16 + 8) * 4 + 3]).toBe(255);
    expect(decoded[3]).toBe(0);
  });
  it("export frame equals preview frame for the same selected layers", () => {
    const { canvas, s, c, solid, edge } = frame();
    const preview = new SoftCanvas(16, 16);
    drawFrame(preview.getContext() as unknown as CanvasRenderingContext2D, renderFrame(s, c.id, 0, { view: "camera" }), {
      background: "transparent", layerIds: new Set([solid, edge]), images: new Map(), placeholders: false,
    });
    expect([...canvas.data]).toEqual([...preview.data]);
  });
  it("unselected layers do not leak into the image", () => {
    const { s, c, edge } = setup(); const clip = alphaSceneClip(s, c);
    if (!clip) throw new Error("Missing clip");
    const canvas = new SoftCanvas(16, 16);
    drawFilmFrame(canvas.getContext() as unknown as CanvasRenderingContext2D, s, [clip], 0, { width: 16, height: 16,
      images: new Map(), background: "transparent", layerIds: new Set([edge]) });
    expect(canvas.pixel(8, 8)[3]).toBe(0);
    expect(canvas.pixel(3, 8)[3]).toBe(0.5);
  });
});
describe("P4 choices and format gate", () => {
  it("PNG defaults to straight alpha", () => {
    expect(DEFAULT_ALPHA_SETTINGS.alpha).toBe("straight"); expect(DEFAULT_ALPHA_SETTINGS.format).toBe("png-seq");
  });
  it("whole scene and in/out are end-exclusive and validated", () => {
    const { s, c, solid } = setup(); const o = { ...DEFAULT_ALPHA_SETTINGS, layerIds: [solid] };
    expect(alphaRange(c, o)).toEqual({ start: 0, end: 3 });
    expect(alphaExportError(s, c, { ...o, range: "in-out", inFrame: 1, outFrame: 3 })).toBeNull();
    for (const [a,b] of [[-1, 2], [2, 2], [0, 4], [0.5, 2]])
      expect(alphaExportError(s, c, { ...o, range: "in-out", inFrame: a ?? 0, outFrame: b ?? 0 })).not.toBeNull();
    expect(alphaExportError(s, c, { ...o, layerIds: ["other"] })).not.toBeNull();
  });
  it("saved choices validate all fields", () => {
    expect(isAlphaSettings(DEFAULT_ALPHA_SETTINGS)).toBe(true);
    expect(isAlphaSettings({ ...DEFAULT_ALPHA_SETTINGS, alpha: "unknown" })).toBe(false);
    expect(isAlphaSettings({ ...DEFAULT_ALPHA_SETTINGS, layerIds: [5] })).toBe(false);
  });
  it("file names include scene, layers and range without path separators", () => {
    expect(alphaFileBase("Scene 1", ["Maja", "Prop/1"], 12, 24)).toBe("Scene 1 - Maja + Prop-1 - f12-24");
  });
  it("VP9 requires an affirmative alpha-keep capability", async () => {
    const probe = vi.fn().mockResolvedValue({ supported: true, config: { alpha: "keep" } });
    vi.stubGlobal("VideoEncoder", { isConfigSupported: probe });
    expect(await supportsVp9Alpha(16, 16)).toBe(true);
    expect(probe.mock.calls[0]?.[0]).toMatchObject({ alpha: "keep", codec: "vp09.00.10.08" });
    probe.mockResolvedValue({ supported: false, config: { alpha: "keep" } }); expect(await supportsVp9Alpha(16,16)).toBe(false);
    probe.mockResolvedValue({ supported: true, config: {} }); expect(await supportsVp9Alpha(16,16)).toBe(false);
  });
});
describe("P4 streaming ZIP and cancellation", () => {
  it("awaits each sink write before requesting another frame", async () => {
    const chunks: Uint8Array[] = []; let pending = false, produced = 0;
    const sink: ZipSink = { write: async c => { pending = true; await new Promise(r => setTimeout(r, 1)); chunks.push(c); pending = false; }, close: vi.fn(), abort: vi.fn() };
    async function* frames() {
      for (let i = 0; i < 20; i++) { expect(pending).toBe(false); produced++; yield { path: `${i}.png`, data: new Uint8Array([i]) }; }
    }
    await writeZip(sink, [], {}, { extra: frames() });
    expect(produced).toBe(20); expect(Object.keys(unzipSync(Buffer.concat(chunks)))).toHaveLength(20);
    expect(sink.close).toHaveBeenCalledOnce();
  });
  it("cancelled export aborts the sink and never finalizes a half file", async () => {
    const ctrl = new AbortController(); const close = vi.fn(async () => {}), abort = vi.fn(async () => {});
    const sink: ZipSink = { write: async () => {}, close, abort };
    async function* frames() { yield { path: "0.png", data: new Uint8Array([1]) }; ctrl.abort(); yield { path: "1.png", data: new Uint8Array([2]) }; }
    await expect(writeZip(sink, [], {}, { signal: ctrl.signal, extra: frames() })).rejects.toMatchObject({ name: "AbortError" });
    expect(close).not.toHaveBeenCalled(); expect(abort).toHaveBeenCalledOnce();
  });
});