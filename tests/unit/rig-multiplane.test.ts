// @vitest-environment node
/**
 * Rigg & 2D-utskrift (B-087/DEC-0100, runde 1): størrelsesmatematikk (m = f / (d − f)), kalibrering
 * med gyldighet, parallakse fra platenivå og kommandoer med angre/gjør om.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  DEFAULT_COMPOSITION,
  applyCommand,
  calibrationStatus,
  defaultLayerFields,
  defaultRig,
  defaultRigSpec,
  fieldOfViewMm,
  hasParallaxOverride,
  magnification,
  multiplaneRigSpecError,
  parallaxDeviation,
  physicalLayerSizeMm,
  plateParallax,
  resolveSceneRig,
  withCalibrationChecked,
  type Command,
  type Composition,
  type CompositionLayer,
  type MultiplaneRigSpec,
  type RigCalibration,
} from "@/core";
import { ALICE, envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

const BORD = "00000000-0000-4000-8000-0000000000b0";
const PLATE1 = "00000000-0000-4000-8000-0000000000b1";
const PLATE2 = "00000000-0000-4000-8000-0000000000b2";

/** Kjent oppsett: 36×24 mm-sensor, 50 mm-objektiv, kamera 900 mm over bordet. */
function spec(over: Partial<MultiplaneRigSpec["camera"]> = {}, calibration: RigCalibration | null = null): MultiplaneRigSpec {
  return {
    format: "1",
    camera: { sensorWidthMm: 36, sensorHeightMm: 24, focalLengthMm: 50, cameraHeightMm: 900, mode: "fixed", ...over },
    plates: [
      { id: BORD, name: "Bord", heightMm: 0, glassThicknessMm: null },
      { id: PLATE1, name: "Plate 1", heightMm: 100, glassThicknessMm: 4 },
      { id: PLATE2, name: "Plate 2", heightMm: 200, glassThicknessMm: 4 },
    ],
    calibration,
  };
}

function layer(width: number, height: number, over: Partial<CompositionLayer> = {}): CompositionLayer {
  return {
    id: tid<"composition_layer">(),
    revision: 1,
    compositionId: tid<"composition">(),
    orderKey: "a",
    kind: "fill",
    name: "Figur",
    assetId: null,
    assetVariantId: null,
    versionId: null,
    fill: "#808080",
    width,
    height,
    parallax: 1,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
    keyframes: [],
    visible: true,
    locked: false,
    groupId: null,
    swaps: [],
    path: null,
    anchor: null,
    removed: false,
    rigPlateId: BORD,
    ...over,
  } as unknown as CompositionLayer;
}

function composition(zoom?: number): Composition {
  return {
    width: 1920,
    height: 1080,
    camera: {
      shots: zoom
        ? [
            {
              id: "shot-1",
              startFrame: 0,
              endFrame: 100,
              from: { x: 960, y: 540, zoom, rotation: 0 },
              to: { x: 960, y: 540, zoom, rotation: 0 },
              easing: "linear",
            },
          ]
        : [],
    },
  } as unknown as Composition;
}

function run(s: Parameters<typeof applyCommand>[0], c: Command) {
  const r = applyCommand(s, envelope(c, ALICE));
  if (!r.ok) throw new Error(`${c.type}: ${r.error.message}`);
  return r;
}

describe("størrelsesmatematikk (B-087)", () => {
  it("forstørrelsen er m = f / (d − f), og synsfeltet er sensoren delt på m", () => {
    // 50 mm-objektiv, 900 mm avstand: m = 50/850
    expect(magnification(50, 900)).toBeCloseTo(50 / 850, 10);
    expect(fieldOfViewMm(36, 50 / 850)).toBeCloseTo(612, 6);
  });

  it("fysisk figurstørrelse = andel av komposisjonen × synsfeltet", () => {
    // Hele billedbredden på bordplaten: 612 mm; halv bredde: 306 mm
    expect(physicalLayerSizeMm(spec(), layer(1920, 1080), composition(), 0)!.widthMm).toBeCloseTo(612, 4);
    const half = physicalLayerSizeMm(spec(), layer(960, 540), composition(), 0)!;
    expect(half.widthMm).toBeCloseTo(306, 4);
    expect(half.heightMm).toBeCloseTo((540 / 1080) * (24 / (50 / 850)), 4);
  });

  it("keyframes på valgt frame teller med (hvert frame har sin egen størrelse)", () => {
    const l = layer(960, 540, {
      keyframes: [{ frame: 10, property: "scaleX", value: 2, easing: "linear" }],
    } as unknown as Partial<CompositionLayer>);
    expect(physicalLayerSizeMm(spec(), l, composition(), 10)!.widthMm).toBeCloseTo(612, 4);
  });

  it("«fast kamera»: digital zoom bakes inn; panorering endrer ikke størrelsen", () => {
    const s = spec();
    expect(physicalLayerSizeMm(s, layer(960, 540), composition(2), 5)!.widthMm).toBeCloseTo(612, 4);
    // «kameraet beveger seg fysisk»: scenens hvileposisjon (zoom 1) brukes
    expect(physicalLayerSizeMm(spec({ mode: "moving" }), layer(960, 540), composition(2), 5)!.widthMm).toBeCloseTo(306, 4);
  });

  it("en gyldig kalibrering overstyrer teorien", () => {
    const cal: RigCalibration = {
      cameraHeightMm: 900,
      focalLengthMm: 50,
      sensorWidthMm: 36,
      sensorHeightMm: 24,
      referencePlateId: BORD,
      pxPerMm: 2,
      calibratedAt: "2026-10-21T10:00:00.000Z",
      valid: true,
    };
    // 200 px på bordplaten = 100 mm; på plate 1 (800 mm avstand) = 200 / (2 × 900/800)
    expect(physicalLayerSizeMm(spec({}, cal), layer(200, 200), composition(), 0)!.widthMm).toBeCloseTo(100, 6);
    const s = spec({}, cal);
    const onPlate1 = physicalLayerSizeMm(s, layer(200, 200, { rigPlateId: PLATE1 }), composition(), 0)!;
    expect(onPlate1.widthMm).toBeCloseTo(200 / (2 * (900 / 800)), 6);
  });

  it("ugyldig kalibrering: teorien brukes, og kalibreringen slettes ikke", () => {
    const cal: RigCalibration = {
      cameraHeightMm: 900,
      focalLengthMm: 50,
      sensorWidthMm: 36,
      sensorHeightMm: 24,
      referencePlateId: BORD,
      pxPerMm: 2,
      calibratedAt: "2026-10-21T10:00:00.000Z",
      valid: true,
    };
    const moved = withCalibrationChecked(spec({ cameraHeightMm: 1000 }, cal));
    expect(calibrationStatus(moved)).toBe("invalid");
    expect(moved.calibration).not.toBeNull();
    // Teorien igjen: d = 1000, m = 50/950, felt = 684 mm
    expect(physicalLayerSizeMm(moved, layer(1920, 1080), composition(), 0)!.widthMm).toBeCloseTo(684, 4);
    // Gjenopprettede verdier: kalibreringen gjelder igjen
    const restored = withCalibrationChecked(spec({}, moved.calibration));
    expect(calibrationStatus(restored)).toBe("valid");
  });

  it("validering fanger ugyldige oppsett", () => {
    expect(multiplaneRigSpecError(spec())).toBeNull();
    expect(multiplaneRigSpecError(spec({ focalLengthMm: 0 }))).not.toBeNull();
    expect(multiplaneRigSpecError(spec({ sensorWidthMm: 5000 }))).not.toBeNull();
    // Platen kan ikke ligge nærmere kameraet enn brennvidden
    const base = spec();
    const tooHigh: MultiplaneRigSpec = { ...base, plates: base.plates.map((p, i) => (i === 1 ? { ...p, heightMm: 860 } : p)) };
    expect(multiplaneRigSpecError(tooHigh)).not.toBeNull();
    const dup: MultiplaneRigSpec = { ...base, plates: base.plates.map((p, i) => (i === 1 ? { ...p, id: BORD } : p)) };
    expect(multiplaneRigSpecError(dup)).not.toBeNull();
  });
});

describe("parallakse fra platenivå", () => {
  it("fysisk avstand relativt til referanseplaten", () => {
    const s = spec();
    expect(plateParallax(s, BORD)).toBeCloseTo(1, 10);
    expect(plateParallax(s, PLATE1)).toBeCloseTo(900 / 800, 10);
    expect(plateParallax(s, PLATE2)).toBeCloseTo(900 / 700, 10);
  });

  it("overstyring merkes som avvik; lag uten kobling har ingen", () => {
    const s = spec();
    const linked = layer(100, 100, { rigPlateId: PLATE1, parallax: 1 });
    expect(parallaxDeviation(s, linked)).toBeCloseTo(1 - 900 / 800, 10);
    expect(hasParallaxOverride(s, linked)).toBe(true);
    const exact = layer(100, 100, { rigPlateId: PLATE1, parallax: 900 / 800 });
    expect(hasParallaxOverride(s, exact)).toBe(false);
    expect(parallaxDeviation(s, layer(100, 100, { rigPlateId: null }))).toBeNull();
  });
});

describe("egenskaper (monotoni)", () => {
  const camera = fc.record({
    f: fc.double({ min: 10, max: 400, noNaN: true }),
    h: fc.double({ min: 500, max: 3000, noNaN: true }),
  });
  it("høyere plate (kortere avstand) gir større forstørrelse", () => {
    fc.assert(
      fc.property(camera, fc.double({ min: 0, max: 0.5, noNaN: true }), ({ f, h }, frac) => {
        const maxPlate = h - f - 1;
        const h1 = frac * maxPlate * 0.5;
        const h2 = h1 + (maxPlate - h1) * 0.5;
        expect(magnification(f, h - h2)).toBeGreaterThan(magnification(f, h - h1));
      }),
    );
  });
  it("parallaksen vokser mot kameraet og er 1 på referanseplaten", () => {
    fc.assert(
      fc.property(camera, fc.double({ min: 0, max: 0.49, noNaN: true }), ({ f, h }, frac) => {
        const maxPlate = h - f - 1;
        const refH = frac * maxPlate;
        const nearH = refH + (maxPlate - refH) * 0.9;
        const s: MultiplaneRigSpec = {
          format: "1",
          camera: { sensorWidthMm: 36, sensorHeightMm: 24, focalLengthMm: f, cameraHeightMm: h, mode: "fixed" },
          plates: [
            { id: BORD, name: "Ref", heightMm: refH, glassThicknessMm: null },
            { id: PLATE1, name: "Nær", heightMm: nearH, glassThicknessMm: null },
          ],
          calibration: null,
        };
        expect(plateParallax(s, BORD)).toBeCloseTo(1, 10);
        expect(plateParallax(s, PLATE1)!).toBeGreaterThan(1);
      }),
    );
  });
  it("fysisk størrelse er proporsjonal med bildestørrelsen", () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 1920, noNaN: true }), (w) => {
        const a = physicalLayerSizeMm(spec(), layer(w, 100), composition(), 0)!.widthMm;
        const b = physicalLayerSizeMm(spec(), layer(2 * w, 100), composition(), 0)!.widthMm;
        expect(b).toBeCloseTo(2 * a, 6);
      }),
    );
  });
});

describe("kommandoer med angre og gjør om", () => {
  it("maler: legg til, endre, fjern – alt angrbart", () => {
    const { state } = seedProject(1);
    const templateId = tid();
    const added = run(state, { type: "AddRigTemplate", templateId, name: "Studiorigg", spec: defaultRigSpec() });
    expect(added.state.rigTemplates[templateId]!.name).toBe("Studiorigg");
    const renamed = run(added.state, { type: "UpdateRigTemplate", templateId, name: "Bordrigg" });
    expect(renamed.state.rigTemplates[templateId]!.name).toBe("Bordrigg");
    const removedRun = run(renamed.state, { type: "SetRigTemplateRemoved", templateId, removed: true });
    expect(removedRun.state.rigTemplates[templateId]!.removed).toBe(true);
    // Hvert steg angrer og gjør om
    const unremoved = run(removedRun.state, removedRun.inverse);
    expect(unremoved.state.rigTemplates[templateId]!.removed).toBe(false);
    const redone = run(unremoved.state, unremoved.inverse);
    expect(redone.state.rigTemplates[templateId]!.removed).toBe(true);
    const unrenamed = run(renamed.state, renamed.inverse);
    expect(unrenamed.state.rigTemplates[templateId]!.name).toBe("Studiorigg");
    const gone = run(added.state, added.inverse);
    expect(gone.state.rigTemplates[templateId]).toBeUndefined();
  });

  it("standardrigg og rigger per scene: én av hver, med unntak for duplikat", () => {
    const { state } = seedProject(1);
    const sceneId = Object.keys(state.scenes)[0]!;
    const a = run(state, { type: "AddRigSetup", setupId: tid(), sceneId: null, templateId: null, name: "Standard", spec: spec() });
    expect(defaultRig(a.state)!.name).toBe("Standard");
    const dup = applyCommand(a.state, envelope({ type: "AddRigSetup", setupId: tid(), sceneId: null, templateId: null, name: "Ekstra", spec: spec() }, ALICE));
    expect(dup.ok).toBe(false);
    const b = run(a.state, { type: "AddRigSetup", setupId: tid(), sceneId, templateId: null, name: "Scene 1", spec: spec() });
    expect(resolveSceneRig(b.state, sceneId)!.name).toBe("Scene 1");
    // Scener uten egen rigg arver standardriggen
    const other = run(b.state, {
      type: "CreateScene",
      productionId: b.state.project.id === "" ? ("" as never) : (Object.values(b.state.productions).find((p) => p.kind === "main")!.id as never),
      sceneId: tid(),
      variantId: tid(),
      occurrenceId: tid(),
      orderKey: "zz",
      heading: { intExt: "INT.", location: "NY", time: "DAG" },
      blocks: [],
      productionNumber: null,
    });
    const newScene = Object.keys(other.state.scenes).find((id) => id !== sceneId)!;
    expect(resolveSceneRig(other.state, newScene)!.id).toBe(defaultRig(other.state)!.id);
  });

  it("ApplySceneRig: scenens rigg og standardriggen oppdateres samlet, og angres samlet (B-090 pkt 4)", () => {
    const { state } = seedProject(1);
    const sceneId = Object.keys(state.scenes)[0]!;
    const tall = spec({ cameraHeightMm: 1200 });
    const first = run(state, { type: "ApplySceneRig", setupId: tid(), defaultSetupId: tid(), sceneId, name: "Rigg", spec: tall });
    const own = resolveSceneRig(first.state, sceneId)!;
    expect(own.sceneId).toBe(sceneId);
    expect(own.spec.camera.cameraHeightMm).toBe(1200);
    // Standardriggen ble en kopi i samme steg
    expect(defaultRig(first.state)!.spec.camera.cameraHeightMm).toBe(1200);
    expect(defaultRig(first.state)!.id).not.toBe(own.id);
    // Ny endring: begge oppdateres, ingen nye rader
    const before = Object.keys(first.state.rigSetups).length;
    const second = run(first.state, { type: "ApplySceneRig", setupId: tid(), defaultSetupId: tid(), sceneId, name: "Rigg", spec: spec() });
    expect(Object.keys(second.state.rigSetups).length).toBe(before);
    expect(resolveSceneRig(second.state, sceneId)!.spec.camera.cameraHeightMm).toBe(900);
    // Angre: begge går tilbake til 1200
    const undone = run(second.state, second.inverse);
    expect(resolveSceneRig(undone.state, sceneId)!.spec.camera.cameraHeightMm).toBe(1200);
    expect(defaultRig(undone.state)!.spec.camera.cameraHeightMm).toBe(1200);
    // Angre også det første steget: begge riggene forsvinner (de ble laget i det steget)
    const empty = run(undone.state, first.inverse);
    expect(resolveSceneRig(empty.state, sceneId)).toBeNull();
    expect(defaultRig(empty.state)).toBeNull();
  });

  it("lagets platekobling: valideres mot scenens rigg, med dybde, og angrer", () => {
    const { state } = seedProject(1);
    const variantId = Object.values(state.variants)[0]!.id;
    const compositionId = tid<"composition">();
    const layerId = tid<"composition_layer">();
    let s = run(state, {
      type: "CreateComposition",
      compositionId,
      variantId: variantId as never,
      fields: { ...DEFAULT_COMPOSITION, width: 1920, height: 1080, durationFrames: 100 },
    }).state;
    s = run(s, {
      type: "AddLayers",
      layers: [{ layerId, compositionId, fields: defaultLayerFields(s, s.compositions[compositionId]!, { fill: "#808080" }) }],
    }).state;
    // Uten rigg kan ingen plate velges
    const noRig = applyCommand(s, envelope({ type: "SetLayerRigPlate", layerId, plateId: BORD }, ALICE));
    expect(noRig.ok).toBe(false);
    s = run(s, { type: "ApplySceneRig", setupId: tid(), defaultSetupId: tid(), sceneId: Object.values(state.scenes)[0]!.id, name: "Rigg", spec: spec() }).state;
    const linked = run(s, { type: "SetLayerRigPlate", layerId, plateId: PLATE1, depthMm: 3 });
    expect(linked.state.layers[layerId]!.rigPlateId).toBe(PLATE1);
    expect(linked.state.layers[layerId]!.rigPlateDepthMm).toBe(3);
    const bad = applyCommand(linked.state, envelope({ type: "SetLayerRigPlate", layerId, plateId: tid() }, ALICE));
    expect(bad.ok).toBe(false);
    const unlinked = run(linked.state, { type: "SetLayerRigPlate", layerId, plateId: null });
    expect(unlinked.state.layers[layerId]!.rigPlateId).toBeNull();
    expect(unlinked.state.layers[layerId]!.rigPlateDepthMm).toBe(0);
    const undone = run(unlinked.state, unlinked.inverse);
    expect(undone.state.layers[layerId]!.rigPlateId).toBe(PLATE1);
  });

  it("prosjekter uten rigg oppfører seg nøyaktig som før", () => {
    const { state } = seedProject(1);
    const sceneId = Object.keys(state.scenes)[0]!;
    expect(defaultRig(state)).toBeNull();
    expect(resolveSceneRig(state, sceneId)).toBeNull();
    const l = layer(100, 100, { rigPlateId: null, parallax: 0.5 });
    expect(physicalLayerSizeMm(spec(), l, composition(), 0)).toBeNull();
    expect(parallaxDeviation(spec(), l)).toBeNull();
    expect(l.parallax).toBe(0.5);
  });

  it("kamerabytte merker kalibreringen ugyldig gjennom kommandoen (B-090 pkt 5)", () => {
    const { state } = seedProject(1);
    const cal: RigCalibration = {
      cameraHeightMm: 900,
      focalLengthMm: 50,
      sensorWidthMm: 36,
      sensorHeightMm: 24,
      referencePlateId: "00000000-0000-4000-8000-000000000001",
      pxPerMm: 2,
      calibratedAt: "2026-10-21T10:00:00.000Z",
      valid: true,
    };
    const withCal = { ...defaultRigSpec(), calibration: cal };
    const setupId = tid();
    const added = run(state, { type: "AddRigSetup", setupId, sceneId: null, templateId: null, name: "Standard", spec: withCal });
    expect(calibrationStatus(added.state.rigSetups[setupId]!.spec)).toBe("valid");
    const moved = run(added.state, {
      type: "UpdateRigSetup",
      setupId,
      spec: { ...withCal, camera: { ...withCal.camera, cameraHeightMm: 1000 } },
    });
    expect(calibrationStatus(moved.state.rigSetups[setupId]!.spec)).toBe("invalid");
    // Kalibreringen er ikke slettet, og gjenopprettede verdier gjør den gyldig igjen
    expect(moved.state.rigSetups[setupId]!.spec.calibration).not.toBeNull();
    const back = run(moved.state, { type: "UpdateRigSetup", setupId, spec: withCal });
    expect(calibrationStatus(back.state.rigSetups[setupId]!.spec)).toBe("valid");
  });
});
