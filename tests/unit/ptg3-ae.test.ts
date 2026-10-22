/**
 * PTG3 gyldne AE-tester (B-102 §4, PTG-F1): bygg.jsx må være gyldig ES3 og bygge den forventede
 * prosjektstrukturen når det kjøres mot en mock av After Effects sitt objektmodell.
 */
import { describe, expect, it } from "vitest";
import { buildAeJsx } from "@/core/interchange/ae-jsx";
import type { CameraTrack, InterchangeDoc, Shot } from "@/core/interchange/types";
import type { AudioClip, CompositionLayer } from "@/core/model";

const layer = (over: Partial<CompositionLayer> = {}): CompositionLayer => ({
  id: "l1", kind: "draw", name: "Figur", width: 1000, height: 700, orderKey: 10, opacity: 1,
  parallax: 1, transform: { x: 500, y: 350, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
  keyframes: [
    { id: "k1", frame: 0, property: "x", value: 500, easing: "linear" },
    { id: "k2", frame: 24, property: "x", value: 700, easing: "ease-out" },
    { id: "k3", frame: 0, property: "y", value: 350, easing: "linear" },
    { id: "k4", frame: 24, property: "y", value: 300, easing: "ease-out" },
  ],
  swaps: [], ...over,
} as unknown as CompositionLayer);

const camera: CameraTrack = {
  mode: "moving", rigName: "Rigg A", sensorWidthMm: 36, sensorHeightMm: 24, focalLengthMm: 50,
  cameraHeightMm: 900, referencePlateId: "p0", pxPerMm: 2, calibrated: true,
  plates: [{ id: "p0", name: "Bunn", heightMm: 0, distanceMm: 900, parallax: 1 }],
  frames: [
    { frame: 0, fieldWidthMm: 500, fieldHeightMm: 333, panXMm: 0, panYMm: 0, rollDeg: 0, cameraHeightMm: 900, zoom: 1 },
    { frame: 24, fieldWidthMm: 450, fieldHeightMm: 300, panXMm: 40, panYMm: -20, rollDeg: 2, cameraHeightMm: 810, zoom: 1.1 },
  ],
};

const audio = {
  id: "a1", sourceOccurrenceId: "s1", absoluteStartFrame: 0, absoluteEndFrame: 24, startFrame: 0,
  endFrame: 24, lengthFrames: 24, crossesCut: false, fileId: "f2", sourceInMs: 0, speed: 1,
  gain: -3, fadeInFrames: 0, fadeOutFrames: 0, volumeKeys: [{ frame: 12, db: -6 }],
  source: { id: "a1", name: "Musikk" } as AudioClip,
};

const shot: Shot = {
  id: "s1", sceneId: "sc1", sceneNumber: "1", shotNumber: 1, version: 1, name: "TEST_SC001_SH001_v001",
  startFrame: 0, lengthFrames: 24, timecodeIn: "00:00:00:00", timecodeOut: "00:00:01:00",
  handleIn: 0, handleOut: 0, frameIn: 0, frameOut: 24,
  transition: { type: "cut", lengthFrames: 0, overlap: false }, sourceStartFrame: 0, sourceLengthFrames: 24,
  compositionId: "c1", thumbnail: { path: "thumbnails/s1.png", sourceFrame: 0 }, description: "",
  characters: [], sets: [], props: [], status: "planned",
  layers: [{ id: "l1", source: layer(), fileId: "f1", keyframes: layer().keyframes, swaps: [], activeRange: null, path: null }],
  camera, audio: [audio], dialogue: [], words: [],
};

const doc: InterchangeDoc = {
  project: { id: "p1", code: "TEST", name: "Test" }, production: { id: "prod", name: "Hoved" },
  language: { dialogue: "nb", subtitles: null }, fps: { num: 24, den: 1 }, captureFps: { num: 24, den: 1 },
  frameSize: { width: 1920, height: 1080 }, sourceFps: { num: 24, den: 1 }, exposureStep: 1,
  lengthFrames: 24, shots: [shot],
  references: [
    { id: "f1", mediaPath: "m/f1", path: "media/f1.png", mimeType: "image/png", byteSize: 1 },
    { id: "f2", mediaPath: "m/f2", path: "media/f2.mp3", mimeType: "audio/mpeg", byteSize: 1 },
  ],
  namingVersion: "1",
};

/** Minimal mock av AE sitt ES3-objektmodell; registrerer alt scriptet gjør. */
function runJsx(script: string) {
  const log = { comps: [] as { name: string; w: number; h: number; dur: number; fps: number }[], cameras: 0, nulls: [] as string[], imports: [] as string[], folders: [] as string[], keys: [] as { prop: string; times: number[]; values: unknown[] }[], parents: 0, audio: 0 };
  class Prop {
    constructor(public name: string) {}
    setValue(v: unknown) { log.keys.push({ prop: this.name, times: [], values: [v] }); }
    setValueAtTime(t: number, v: unknown) { log.keys.push({ prop: this.name, times: [t], values: [v] }); }
    setTemporalEaseAtKey() {}
    setInterpolationTypeAtKey() {}
    setSpatialTangentsAtKey() {}
    addProperty(n: string) { return new Prop(this.name + "/" + n); }
  }
  class Layer {
    name = ""; threeDLayer = false; trackMatteType = 0; startTime = 0; inPoint = 0; outPoint = 0;
    props = new Map<string, Prop>();
    constructor(public kind: string) {}
    property(n: string) { if (!this.props.has(n)) this.props.set(n, new Prop(n)); return this.props.get(n)!; }
    moveBefore() {}
    set parent(_v: Layer | null) { log.parents++; }
    get parent() { return null; }
  }
  class Layers {
    constructor(public comp: Comp) {}
    add(item: unknown) { if (item instanceof Comp) log.comps.push({ name: item.name + "@used", w: 0, h: 0, dur: 0, fps: 0 }); return new Layer("av"); }
    addNull() { const l = new Layer("null"); nullNames.push(l); return l; }
    addSolid() { return new Layer("solid"); }
    addShape() { return new Layer("shape"); }
    addCamera() { log.cameras++; return new Layer("camera"); }
  }
  const nullNames: Layer[] = [];
  class Comp {
    layers = new Layers(this); parentFolder: unknown = null;
    constructor(public name: string, public w: number, public h: number, public px: number, public dur: number, public fps: number) {
      log.comps.push({ name, w, h, dur, fps });
    }
  }
  const app = {
    beginUndoGroup() {}, endUndoGroup() {},
    project: { items: {
      addFolder(n: string) { log.folders.push(n); return {}; },
      addComp(n: string, w: number, h: number, px: number, dur: number, fps: number) { return new Comp(n, w, h, px, dur, fps); },
    }, importFile(o: { file: { path: string } }) { log.imports.push(o.file.path); const l = new Layer("media-audio"); return l; } },
  };
  class File { constructor(public path: string) {} }
  class ImportOptions { constructor(public file: File) {} }
  class KeyframeEase { constructor(public speed: number, public influence: number) {} }
  const KeyframeInterpolationType = { LINEAR: 1, HOLD: 2 };
  const TrackMatteType = { ALPHA: 1, ALPHA_INVERTED: 2 };
  const fn = new Function("app", "File", "ImportOptions", "KeyframeEase", "KeyframeInterpolationType", "TrackMatteType", script);
  fn(app, File, ImportOptions, KeyframeEase, KeyframeInterpolationType, TrackMatteType);
  return { log };
}

describe("PTG3 After Effects bygg.jsx", () => {
  const jsxAe = buildAeJsx(doc, { cameraMode: "ae" });
  const jsxPar = buildAeJsx(doc, { cameraMode: "parallax" });

  it("er gyldig ES3: ingen let/const/pilfunksjoner i generert kode", () => {
    for (const s of [jsxAe, jsxPar]) {
      expect(s).not.toMatch(/(^|\s)(let|const)\s/);
      expect(s).not.toContain("=>");
      expect(s).not.toContain("`");
    }
  });

  it("kjører mot AE-mocken: hovedkomp + én komp per skudd med riktig varighet og fps", () => {
    const { log } = runJsx(jsxAe);
    expect(log.folders).toEqual(["TEST"]);
    const main = log.comps.find(c => c.name === "TEST_hoved")!;
    expect([main.w, main.h, main.dur, main.fps]).toEqual([1920, 1080, 1, 24]);
    const sc = log.comps.find(c => c.name === "TEST_SC001_SH001_v001")!;
    expect([sc.w, sc.h, sc.dur, sc.fps]).toEqual([1920, 1080, 1, 24]);
  });

  it("AE-kameramodus: kamera med zoom = bredde × f / filmbredde, plater som 3D-nuller, ingen PAR-nuller", () => {
    const { log } = runJsx(jsxAe);
    expect(log.cameras).toBe(1);
    const zoom = log.keys.find(k => k.prop === "Zoom")!;
    // fysisk kamera: konstant zoom 1920 × 50 / 36
    expect(zoom.values[0]).toBeCloseTo(1920 * 50 / 36, 1);
    expect(jsxAe).not.toContain("PAR_");
  });

  it("fast kamera: høyden står fast og zoomen animeres i stedet", () => {
    const fixed = buildAeJsx({ ...doc, shots: [{ ...shot, camera: { ...camera, mode: "fixed" as const } }] }, { cameraMode: "ae" });
    const { log } = runJsx(fixed);
    const zoomKeys = log.keys.filter(k => k.prop === "Zoom");
    expect(zoomKeys.length).toBeGreaterThan(1); // animert, ikke konstant
  });

  it("2D-parallaksemodus: ingen AE-kamera, PAR-null-lag med foreldring", () => {
    const { log } = runJsx(jsxPar);
    expect(log.cameras).toBe(0);
    expect(jsxPar).toContain("PAR_");
    expect(log.parents).toBeGreaterThan(0);
  });

  it("importerer bare brukte media og legger lyd til med volumnøkler i dB", () => {
    const { log } = runJsx(jsxAe);
    expect(log.imports.sort()).toEqual(["media/f1.png", "media/f2.mp3"]);
    const levels = log.keys.filter(k => k.prop === "Audio Levels");
    expect(levels.length).toBeGreaterThan(0);
    expect(levels[0]!.values[0]).toEqual([-9, -9]); // volumnøkkel −6 dB + klippforsterkning −3 dB
  });

  it("posisjonsnøkler har tider i sekunder og AE-verdier", () => {
    const { log } = runJsx(jsxAe);
    const pos = log.keys.filter(k => k.prop === "Position");
    expect(pos.length).toBeGreaterThan(0);
    expect(pos.some(k => k.times[0] === 1)).toBe(true); // bilde 24 ved 24 fps = 1 s
  });

  it("skudd uten rigg: ingen kamera, forklarende kommentar i scriptet", () => {
    const noRig = buildAeJsx({ ...doc, shots: [{ ...shot, camera: null }] }, { cameraMode: "ae" });
    const { log } = runJsx(noRig);
    expect(log.cameras).toBe(0);
    expect(noRig).toContain("camera omitted");
  });
});
