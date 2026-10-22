// @vitest-environment node
/**
 * PTG3 (B-102 §4): gyldne tester for kamerasporet i InterchangeDoc. Kameraet avledes alltid fra
 * scenens rigg (B-087/B-090) – synsfelt sensor/m, zoom z → W0/z, linseformelen d = f(1 + 1/m) i
 * modusen «fysisk kamera», fast høyde i «fast kamera», panorering via pxPerMm, rotasjon som rull.
 */
import { describe, expect, it } from "vitest";
import { mustApply, seedProject, tid } from "../helpers/fixtures";
import { buildInterchange } from "@/core/interchange";
import { orderedOccurrences, type MultiplaneRigSpec, type ProjectState } from "@/core";

const BORD = "00000000-0000-4000-8000-0000000000b0";
const PLATE1 = "00000000-0000-4000-8000-0000000000b1";
const PLATE2 = "00000000-0000-4000-8000-0000000000b2";

function rigSpec(mode: "fixed" | "moving", calibration: MultiplaneRigSpec["calibration"] = null): MultiplaneRigSpec {
  return {
    format: "1",
    camera: { sensorWidthMm: 36, sensorHeightMm: 24, focalLengthMm: 50, cameraHeightMm: 900, mode },
    plates: [
      { id: BORD, name: "Bord", heightMm: 0, glassThicknessMm: null },
      { id: PLATE1, name: "Plate 1", heightMm: 100, glassThicknessMm: 4 },
      { id: PLATE2, name: "Plate 2", heightMm: 200, glassThicknessMm: 4 },
    ],
    calibration,
  };
}

/** Prosjekt 24 bilder/s, én scene med 2D-scene (1000×600) og kamerashot, og en standardrigg. */
function sceneWithRig(mode: "fixed" | "moving", calibration: MultiplaneRigSpec["calibration"] = null) {
  const { state, mainId } = seedProject(1);
  let s: ProjectState = mustApply(state, { type: "SetProjectFormat", width: 1000, height: 600, fps: { num: 24, den: 1 } });
  const o = orderedOccurrences(s, mainId)[0]!;
  const compositionId = tid<"composition">();
  const fields = { name: "Stua", width: 1000, height: 600, durationFrames: 250, background: "#101114" };
  s = mustApply(s, { type: "CreateComposition", compositionId, variantId: o.variantId, fields });
  s = mustApply(s, { type: "UpdateComposition", compositionId, fields, camera: { shots: [{
    id: "shot-1", name: "Inn", startFrame: 0, endFrame: 50,
    from: { x: 500, y: 300, zoom: 1, rotation: 0 }, to: { x: 300, y: 200, zoom: 2, rotation: 15 },
    curve: null, easing: "linear" as const,
  }] } });
  s = mustApply(s, { type: "AddRigSetup", setupId: tid(), sceneId: null, templateId: null, name: "Studiorigg", spec: rigSpec(mode, calibration) });
  return { s, mainId };
}

// Kjente tall: dRef = 900 mm, m = 50/850, synsfelt på bordplaten 612 × 367,2 mm, pxPerMm = 1000/612.
const PX_PER_MM = 1000 / 612;
const SQRT2 = Math.sqrt(2);

describe("PTG3 kameraspore", () => {
  it("«fast kamera»: høyden står fast, zoomen ligger i synsfelt og figurstørrelse", () => {
    const { s, mainId } = sceneWithRig("fixed");
    const doc = buildInterchange(s, { productionId: mainId, language: "nb" });
    const cam = doc.shots[0]!.camera!;
    expect(cam.mode).toBe("fixed"); expect(cam.rigName).toBe("Studiorigg");
    expect(cam.calibrated).toBe(false); expect(cam.referencePlateId).toBe(BORD);
    expect(cam.pxPerMm).toBeCloseTo(PX_PER_MM, 9);
    const f0 = cam.frames[0]!;
    expect(f0.frame).toBe(0);
    expect(f0.fieldWidthMm).toBeCloseTo(612, 6); expect(f0.fieldHeightMm).toBeCloseTo(367.2, 6);
    expect(f0.panXMm).toBeCloseTo(0, 9); expect(f0.panYMm).toBeCloseTo(0, 9);
    expect(f0.rollDeg).toBeCloseTo(0, 9); expect(f0.cameraHeightMm).toBeCloseTo(900, 9); expect(f0.zoom).toBeCloseTo(1, 9);
    const f25 = cam.frames[25]!;
    expect(f25.panXMm).toBeCloseTo(-61.2, 6); expect(f25.panYMm).toBeCloseTo(-30.6, 6);
    expect(f25.rollDeg).toBeCloseTo(7.5, 9); expect(f25.zoom).toBeCloseTo(SQRT2, 9);
    expect(f25.fieldWidthMm).toBeCloseTo(612 / SQRT2, 6);
    expect(f25.cameraHeightMm).toBeCloseTo(900, 9); // fast høyde uansett zoom
    const f50 = cam.frames[50]!;
    expect(f50.panXMm).toBeCloseTo(-122.4, 6); expect(f50.panYMm).toBeCloseTo(-61.2, 6);
    expect(f50.fieldWidthMm).toBeCloseTo(306, 6); expect(f50.fieldHeightMm).toBeCloseTo(183.6, 6);
    expect(f50.rollDeg).toBeCloseTo(15, 9);
    // 3D-tolkning: platenes høyde og avstand; 2D-tolkning: parallakse dRef/d
    expect(cam.plates.map(p => [p.heightMm, p.distanceMm])).toEqual([[0, 900], [100, 800], [200, 700]]);
    expect(cam.plates.map(p => p.parallax)[1]).toBeCloseTo(900 / 800, 9);
    expect(cam.plates.map(p => p.parallax)[2]).toBeCloseTo(900 / 700, 9);
    expect(cam.frames.length).toBe(250);
  });

  it("«fysisk kamera»: zoomen gir ny kamerahøyde etter linseformelen", () => {
    const { s, mainId } = sceneWithRig("moving");
    const cam = buildInterchange(s, { productionId: mainId, language: "nb" }).shots[0]!.camera!;
    expect(cam.mode).toBe("moving");
    expect(cam.frames[0]!.cameraHeightMm).toBeCloseTo(900, 9);
    // zoom √2: m = (50/850)·√2, d = 50·(1 + 1/m) = 50·(1 + 17/√2)
    expect(cam.frames[25]!.cameraHeightMm).toBeCloseTo(50 * (1 + 17 / SQRT2), 6);
    // zoom 2: m = 100/850, d = 50·(1 + 8,5) = 475
    expect(cam.frames[50]!.cameraHeightMm).toBeCloseTo(475, 9);
    // synsfelt og panorering er like i begge moduser
    expect(cam.frames[50]!.fieldWidthMm).toBeCloseTo(306, 6);
    expect(cam.frames[50]!.panXMm).toBeCloseTo(-122.4, 6);
  });

  it("toere: én prøve per eksponering på 24-bilders tidslinjen", () => {
    const { s, mainId } = sceneWithRig("fixed");
    const doc = buildInterchange(s, { productionId: mainId, language: "nb", capture: { mode: "twos", fps: { num: 12, den: 1 } } });
    const cam = doc.shots[0]!.camera!;
    expect(doc.fps).toEqual({ num: 24, den: 1 }); expect(doc.exposureStep).toBe(2);
    expect(cam.frames.length).toBe(125);
    expect(cam.frames.every((f, i) => f.frame === i * 2)).toBe(true);
    expect(cam.frames[1]!.panXMm).toBeCloseTo(((500 + (300 - 500) * (2 / 50)) - 500) * 612 / 1000, 6);
  });

  it("bytte av bildefrekvens (opptak 25): samme geometri, annen prøvetaking", () => {
    const { s, mainId } = sceneWithRig("fixed");
    const doc = buildInterchange(s, { productionId: mainId, language: "nb", captureFps: { num: 25, den: 1 } });
    const cam = doc.shots[0]!.camera!;
    expect(doc.lengthFrames).toBe(260); // 250 kilderbilder à 24/s = 10,4167 s → 260 opptaksbilder à 25/s
    // Komposisjonsbilde 25 (midt i kamerashotet) ligger på opptaksbilde 26 (25·25/24)
    expect(cam.frames[26]!.panXMm).toBeCloseTo(-61.2, 6);
  });

  it("gyldig kalibrering overstyrer pxPerMm (B-090 pkt 5)", () => {
    const { s, mainId } = sceneWithRig("fixed", {
      cameraHeightMm: 900, focalLengthMm: 50, sensorWidthMm: 36, sensorHeightMm: 24,
      referencePlateId: BORD, pxPerMm: 2, calibratedAt: "2026-10-21T10:00:00.000Z", valid: true,
    });
    const cam = buildInterchange(s, { productionId: mainId, language: "nb" }).shots[0]!.camera!;
    expect(cam.calibrated).toBe(true); expect(cam.pxPerMm).toBe(2);
    expect(cam.frames[25]!.panXMm).toBeCloseTo(-50, 9);
    expect(cam.frames[0]!.fieldWidthMm).toBeCloseTo(500, 9);
  });

  it("uten rigg er kameraet null", () => {
    const { state, mainId } = seedProject(1);
    const doc = buildInterchange(state, { productionId: mainId, language: "nb" });
    expect(doc.shots[0]!.camera).toBe(null);
  });
});
