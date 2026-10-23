// @vitest-environment node
/**
 * Øystein 23.10, første prøving i After Effects: «File "….webm" is not a valid file type for import».
 * Pakkene (PTG3 AE, PTG7 Nuke/Fusion) skal bare inneholde formater på hvitelisten, og skriptet skal
 * referere til de konverterte filene. Feilet import gir plassholder og ett samlet varsel.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAeJsx } from "@/core/interchange/ae-jsx";
import { nukeScript, fusionComp } from "@/core/interchange/compositing";
import { AE_SAFE_EXTENSIONS, assertAeSafePaths, isAeSafePath, planPackageMedia } from "@/core/interchange/media-formats";
import type { InterchangeDoc, Shot } from "@/core/interchange/types";
import type { AudioClip } from "@/core/model";
import { exportAePackage } from "@/engine/export/ae-export";
import { exportCompositing } from "@/engine/export/compositing";
import type { MediaConverter } from "@/engine/export/media-convert";
import type { ZipSink } from "@/engine/export/zip";
import { doc as base, shot as baseShot } from "../fixtures/ptg7/model";

const audio = {
  id: "a1", sourceOccurrenceId: "s", absoluteStartFrame: 0, absoluteEndFrame: 4, startFrame: 0, endFrame: 4,
  lengthFrames: 4, crossesCut: false, fileId: "lyd", sourceInMs: 0, speed: 1, gain: 0, fadeInFrames: 0,
  fadeOutFrames: 0, volumeKeys: [], source: { id: "a1", name: "Opptak" } as AudioClip,
};
const shot: Shot = { ...baseShot, audio: [audio] };
/** Fikstur: WebM-take (front), WebP-bilde (back) og WebM/Opus-lyd. */
const doc: InterchangeDoc = {
  ...base, shots: [shot],
  references: [
    { id: "front", path: "media/front.webm", mediaPath: "src/front.webm", mimeType: "video/webm", byteSize: 1 },
    { id: "back", path: "media/back.webp", mediaPath: "src/back.webp", mimeType: "image/webp", byteSize: 1 },
    // Opptak fra nettleseren har ofte «video/webm» selv om det bare er lyd
    { id: "lyd", path: "media/lyd.webm", mediaPath: "src/lyd.webm", mimeType: "video/webm", byteSize: 1 },
  ],
};

const fake: MediaConverter = {
  image: async () => new Uint8Array([1]),
  audio: async () => new Uint8Array([2]),
  async *videoFrames() { yield new Uint8Array([3]); yield new Uint8Array([4]); yield new Uint8Array([5]); },
};

function memorySink(): ZipSink & { bytes(): Uint8Array } {
  const parts: Uint8Array[] = [];
  return {
    write: async (c) => { parts.push(c.slice()); }, close: async () => {}, abort: async () => {},
    bytes: () => { const n = parts.reduce((a, p) => a + p.length, 0); const o = new Uint8Array(n); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; },
  };
}
/** Filnavnene i ZIP-filens sentralkatalog (signatur 0x02014b50). */
function zipNames(b: Uint8Array): string[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength); const out: string[] = [];
  for (let i = 0; i + 46 <= b.length; i++) {
    if (v.getUint32(i, true) !== 0x02014b50) continue;
    const n = v.getUint16(i + 28, true);
    out.push(new TextDecoder().decode(b.subarray(i + 46, i + 46 + n)));
  }
  return out;
}
const urls = { "src/front.webm": "https://x/front", "src/back.webp": "https://x/back", "src/lyd.webm": "https://x/lyd" };

afterEach(() => vi.unstubAllGlobals());

describe("hviteliste for medier i pakkene", () => {
  it("godtar bare formatene After Effects importerer", () => {
    expect([...AE_SAFE_EXTENSIONS].sort()).toEqual(["aif", "aiff", "jpeg", "jpg", "mov", "mp3", "mp4", "png", "psd", "tif", "tiff", "wav"]);
    for (const bad of ["a.webm", "a.opus", "a.ogg", "a.webp", "a.avif", "a.m4a"]) expect(isAeSafePath(bad)).toBe(false);
    expect(() => assertAeSafePaths(["media/a.png", "media/b.webm"])).toThrow(/b\.webm/);
  });

  it("planen konverterer WebM-take til PNG-sekvens, WebP til PNG og WebM-lyd til WAV 48 kHz", () => {
    const plan = planPackageMedia(doc, { audio: true });
    expect(plan.keep).toEqual([]);
    expect(plan.convert.map(c => [c.kind, c.path])).toEqual([
      ["video-png-sequence", "media/front/front_00000.png"],
      ["image-png", "media/back.png"],
      ["audio-wav", "media/lyd.wav"],
    ]);
    expect(plan.convert.find(c => c.kind === "audio-wav")).toMatchObject({ sampleRate: 48000 });
    expect(plan.doc.references.every(r => isAeSafePath(r.path))).toBe(true);
  });

  it("bygg-after-effects.jsx refererer til de konverterte filene og importerer sekvensen som sekvens", () => {
    const jsx = buildAeJsx(planPackageMedia(doc, { audio: true }).doc, { cameraMode: "ae" });
    expect(jsx).not.toMatch(/\.webm|\.webp/);
    expect(jsx).toContain('ptgImport("media/front/front_00000.png", true)');
    expect(jsx).toContain('ptgImport("media/back.png", false)');
    expect(jsx).toContain('ptgImport("media/lyd.wav", false)');
    expect(jsx).toContain("io.sequence = true");
    expect(jsx).toContain("conformFrameRate = 24");
  });
});

describe("After Effects-pakken med WebM-take og WebM-lyd", () => {
  it("inneholder PNG-sekvens og WAV, og ingen fil utenfor hvitelisten", async () => {
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array([9])));
    const sink = memorySink();
    const r = await exportAePackage({ doc, cameraMode: "ae", sink, urls, signal: new AbortController().signal, titleCard: null, converter: fake });
    expect(r.missing).toEqual([]);
    const names = zipNames(sink.bytes());
    expect(names).toEqual(expect.arrayContaining(["media/front/front_00000.png", "media/front/front_00001.png", "media/front/front_00002.png", "media/back.png", "media/lyd.wav"]));
    expect(names.filter(n => n.startsWith("media/")).every(isAeSafePath)).toBe(true);
    expect(names.some(n => /\.(webm|webp|opus|ogg)$/.test(n))).toBe(false);
  });

  it("en fil som ikke kan konverteres havner ikke i pakken og meldes som manglende", async () => {
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array([9])));
    const sink = memorySink();
    const r = await exportAePackage({ doc, cameraMode: "ae", sink, urls, signal: new AbortController().signal, titleCard: null,
      converter: { ...fake, audio: async () => { throw new Error("kan ikke dekode"); } } });
    expect(r.missing).toEqual(["media/lyd.wav"]);
    expect(zipNames(sink.bytes())).not.toContain("media/lyd.wav");
  });
});

describe("skriptet bygger videre når en import feiler", () => {
  it("laget får en grå plassholder med navnet, og ett varsel lister filen", () => {
    const jsx = buildAeJsx(planPackageMedia(doc, { audio: true }).doc, { cameraMode: "parallax" });
    const alerts: string[] = []; const solids: string[] = []; const saved: string[] = [];
    const prop = () => ({ setValue() {}, setValueAtTime() {}, setTemporalEaseAtKey() {}, setInterpolationTypeAtKey() {}, setSpatialTangentsAtKey() {}, addProperty: prop, value: {} });
    const layer = (): Record<string, unknown> => ({ property: prop, moveBefore() {}, source: { height: 1 } });
    const comp = () => ({ layers: { add: layer, addNull: layer, addSolid: (_c: unknown, n: string) => { solids.push(n); return layer(); }, addText: layer, addBoxText: layer, addShape: layer, addCamera: layer } });
    class File { constructor(public path: string) {} get exists() { return true; } get parent() { return { fsName: "/pakke" }; } }
    const app = { beginUndoGroup() {}, endUndoGroup() {}, project: {
      items: { addFolder: () => ({}), addComp: comp },
      importFile(o: { file: File }) { if (o.file.path.endsWith("back.png")) throw new Error("not a valid file type"); return { mainSource: {} }; },
      save(f: File) { saved.push(f.path); },
    } };
    const fn = new Function("app", "BridgeTalk", "File", "Folder", "$", "alert", "ImportOptions", "KeyframeEase", "KeyframeInterpolationType", "TrackMatteType", "ParagraphJustification", jsx.replace(/^#target aftereffects\n/, ""));
    fn(app, { appName: "aftereffects" }, File, class {}, { fileName: "/pakke/bygg-after-effects.jsx" }, (s: string) => alerts.push(s),
      class { constructor(public file: File) {} }, class {}, { LINEAR: 1, HOLD: 2 }, { ALPHA: 1, ALPHA_INVERTED: 2 }, { CENTER_JUSTIFY: 1 });
    expect(solids).toContain("TEST_SC001_SH001_v003_back (media/back.png)");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("media/back.png");
    expect(saved).toEqual(["/pakke/TEST.aep"]);
  });
});

describe("Nuke/Fusion-pakken (PTG7) bruker samme hviteliste", () => {
  it("Nuke leser sekvensmønsteret, Fusion første bilde", () => {
    const d = planPackageMedia(doc, { audio: false }).doc;
    expect(nukeScript(d, shot)).toContain('"../media/front/front_%05d.png"');
    expect(fusionComp(d, shot)).toContain('"../media/front/front_00000.png"');
    expect(nukeScript(d, shot)).not.toMatch(/\.webm|\.webp/);
  });

  it("pakken inneholder bare formater på hvitelisten", async () => {
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array([9])));
    const sink = memorySink();
    const r = await exportCompositing({ doc, sink, urls, signal: new AbortController().signal, converter: fake });
    expect(r.missing).toEqual([]);
    const names = zipNames(sink.bytes());
    expect(names).toEqual(expect.arrayContaining(["media/front/front_00000.png", "media/back.png"]));
    expect(names.filter(n => n.startsWith("media/")).every(isAeSafePath)).toBe(true);
    expect(names).not.toContain("media/lyd.wav");
  });
});
