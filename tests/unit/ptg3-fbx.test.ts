/**
 * PTG3 gyldne FBX-tester (B-102 §4): parser den genererte ASCII FBX-en og kontrollerer KTime-tider,
 * FilmWidth i tommer, FocalLength i mm, kameraposisjon og rull per bilde, og null-objektene for platene.
 */
import { describe, expect, it } from "vitest";
import { buildShotFbx, fbxKTime, FBX_KTIME_PER_SECOND } from "@/core/interchange/fbx";
import type { CameraTrack, Shot } from "@/core/interchange/types";
import type { CompositionLayer } from "@/core/model";

const layer = (over: Partial<CompositionLayer> = {}): CompositionLayer => ({
  id: "l1", kind: "draw", name: "Figur", width: 1000, height: 700, orderKey: 10, opacity: 1,
  parallax: 1, transform: { x: 500, y: 350, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
  keyframes: [], ...over,
} as unknown as CompositionLayer);

const track = (over: Partial<CameraTrack> = {}): CameraTrack => ({
  mode: "moving", rigName: "Rigg A", sensorWidthMm: 36, sensorHeightMm: 24, focalLengthMm: 50,
  cameraHeightMm: 900, referencePlateId: "p0", pxPerMm: 2, calibrated: true,
  plates: [
    { id: "p0", name: "Bunn", heightMm: 0, distanceMm: 900, parallax: 1 },
    { id: "p1", name: "Topp", heightMm: 100, distanceMm: 800, parallax: 1.125 },
  ],
  frames: [
    { frame: 0, fieldWidthMm: 500, fieldHeightMm: 333.3, panXMm: 0, panYMm: 0, rollDeg: 0, cameraHeightMm: 900, zoom: 1 },
    { frame: 12, fieldWidthMm: 500, fieldHeightMm: 333.3, panXMm: 40, panYMm: -20, rollDeg: 5, cameraHeightMm: 800, zoom: 1.125 },
    { frame: 24, fieldWidthMm: 500, fieldHeightMm: 333.3, panXMm: 80, panYMm: -40, rollDeg: 10, cameraHeightMm: 700, zoom: 1.25 },
  ],
  ...over,
});

const shot = (over: Partial<Shot> = {}): Shot => ({
  id: "s1", sceneId: "sc1", name: "TEST_SC001_SH001_v001", sceneNumber: "1", title: "Åpning",
  startFrame: 0, lengthFrames: 24, handleIn: 0, handleOut: 0,
  transitionIn: null, transitionOut: null, layers: [layer()], audio: [], dialogue: [],
  camera: track(), ...over,
} as Shot);

/** Minimal parser: henter navngitte P-egenskaper og animasjonskurver ut av ASCII-strukturen. */
function parseFbx(src: string) {
  const prop = (name: string): number | null => {
    const m = new RegExp(`P: "${name}", "[^"]*", "[^"]*", "",([^\\n]+)`).exec(src);
    if (!m) return null;
    const tail = m[1]!.split(",").map(Number).filter(v => !Number.isNaN(v));
    return tail[tail.length - 1] ?? null;
  };
  const curveValues = (id: number): number[] => {
    const block = src.split(`AnimationCurve: ${id},`)[1]!;
    const m = /KeyValueFloat: \*\d+ \{\s*a: ([^}]+)\}/s.exec(block)!;
    return m[1]!.split(",").map(Number);
  };
  const curveTimes = (id: number): number[] => {
    const block = src.split(`AnimationCurve: ${id},`)[1]!;
    const m = /KeyTime: \*\d+ \{\s*a: ([^}]+)\}/s.exec(block)!;
    return m[1]!.split(",").map(Number);
  };
  const nullNames = [...src.matchAll(/Model: \d+, "Model::([^"]+)", "Null"/g)].map(m => m[1]!);
  return { prop, curveValues, curveTimes, nullNames };
}

describe("PTG3 FBX 7.4", () => {
  const fps = { num: 24, den: 1 };

  it("KTime: 46 186 158 000 tiks per sekund, avrundet per bilde", () => {
    expect(FBX_KTIME_PER_SECOND).toBe(46186158000);
    expect(fbxKTime(0, fps)).toBe(0);
    expect(fbxKTime(24, fps)).toBe(FBX_KTIME_PER_SECOND);
    expect(fbxKTime(1, fps)).toBe(Math.round(FBX_KTIME_PER_SECOND / 24));
  });

  it("FilmWidth/FilmHeight i tommer og FocalLength i mm fra riggen", () => {
    const p = parseFbx(buildShotFbx(shot(), fps)!);
    expect(p.prop("FilmWidth")).toBeCloseTo(36 / 25.4, 5);
    expect(p.prop("FilmHeight")).toBeCloseTo(24 / 25.4, 5);
    expect(p.prop("FocalLength")).toBe(50);
    expect(p.prop("UnitScaleFactor")).toBe(1); // verden i cm
  });

  it("kamerakurver gjenskaper pan, høyde og rull per bilde (cm, PreRotation −90)", () => {
    const src = buildShotFbx(shot(), fps)!;
    expect(src).toContain('P: "PreRotation", "Vector3D", "Vector", "",-90,0,0');
    const p = parseFbx(src);
    const times = p.curveTimes(4000000001);
    expect(times).toEqual([0, fbxKTime(12, fps), fbxKTime(24, fps)]);
    expect(p.curveValues(4000000001)).toEqual([0, 4, 8]); // panX mm/10
    expect(p.curveValues(4000000002)).toEqual([90, 80, 70]); // høyde mm/10
    expect(p.curveValues(4000000003)).toEqual([0, 2, 4]); // −panY mm/10
    expect(p.curveValues(4000000006)).toEqual([0, 5, 10]); // rull om Z
  });

  it("platene blir null-objekter på sin høyde", () => {
    const p = parseFbx(buildShotFbx(shot(), fps)!);
    expect(p.nullNames).toContain("TEST_SC001_SH001_v001_Bunn");
    expect(p.nullNames).toContain("TEST_SC001_SH001_v001_Topp");
  });

  it("skudd uten rigg gir ingen FBX", () => {
    expect(buildShotFbx(shot({ camera: null }), fps)).toBeNull();
  });

  it("skuddnavn renskes slik at det aldri bryter ASCII-strukturen", () => {
    const src = buildShotFbx(shot({ name: 'RAR"NAVN {x}' }), fps)!;
    expect(src).toContain("Model::RAR_NAVN__x__CAM");
  });
});
