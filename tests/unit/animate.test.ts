// @vitest-environment node
/** Tid i 2D-scenen: nøkkelbilder, varighet og kamerautsnitt (M3 del 2b, DEC-0036). */
import { describe, expect, it } from "vitest";
import {
  FPS_25,
  ANIMATED_PROPERTIES,
  cameraCorners,
  compositionDuration,
  defaultLayerFields,
  fieldsWithTransformAt,
  fullFrameCamera,
  keyAllAt,
  keyframeFrames,
  layerFieldsOf,
  moveKeyframes,
  newShot,
  parseScreenplayLines,
  planImport,
  removeKeyframesAt,
  setKeyframe,
  setKeyframeEasing,
  shotAt,
  shotPath,
  toggleCurve,
  transformAt,
  withShot,
  withoutShot,
  type CompositionLayer,
  type Keyframe,
  type LayerTransform,
  type ProductionId,
} from "@/core";
import { mustApply, seedProject, tid } from "../helpers/fixtures";

const TRANSFORM: LayerTransform = { x: 100, y: 200, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };

function layerWith(keyframes: Keyframe[] = [], transform: LayerTransform = TRANSFORM) {
  const { state } = seedProject(0);
  const f = defaultLayerFields(state, { width: 1000, height: 600 }, { fill: "#222222" });
  return {
    ...f,
    id: tid<"composition_layer">(),
    transform,
    keyframes,
  } as unknown as CompositionLayer;
}

const key = (frame: number, property: Keyframe["property"], value: number, easing = "linear") =>
  ({ frame, property, value, easing }) as Keyframe;

describe("setKeyframe", () => {
  it("erstatter nøkkelbildet på samme bilde og egenskap, og beholder hastighetskurven", () => {
    const list = [key(10, "x", 5, "ease-in")];
    const next = setKeyframe(list, "x", 10, 50);
    expect(next).toEqual([key(10, "x", 50, "ease-in")]);
    expect(list[0]!.value).toBe(5); // ingen mutasjon
  });

  it("bruker standardkurve for nye nøkkelbilder, og sorterer", () => {
    const next = setKeyframe([key(20, "x", 1)], "x", 5, 2);
    expect(next.map((k) => k.frame)).toEqual([5, 20]);
    expect(next[0]!.easing).toBe("ease-in-out");
  });
});

describe("removeKeyframesAt", () => {
  const list = [key(5, "x", 1), key(5, "y", 2), key(9, "x", 3)];
  it("fjerner alle egenskaper på bildet", () => {
    expect(removeKeyframesAt(list, 5)).toEqual([key(9, "x", 3)]);
  });
  it("fjerner bare den oppgitte egenskapen", () => {
    expect(removeKeyframesAt(list, 5, ["y"])).toEqual([key(5, "x", 1), key(9, "x", 3)]);
  });
});

describe("moveKeyframes", () => {
  it("flytter nøkkelbildene og erstatter eksisterende på målbildet for samme egenskap", () => {
    const list = [key(5, "x", 1), key(5, "y", 2), key(8, "x", 99), key(8, "opacity", 0.5)];
    const next = moveKeyframes(list, 5, 8);
    expect(next.filter((k) => k.frame === 8 && k.property === "x")).toEqual([key(8, "x", 1)]);
    expect(next).toContainEqual(key(8, "y", 2));
    expect(next).toContainEqual(key(8, "opacity", 0.5));
    expect(next.some((k) => k.frame === 5)).toBe(false);
    expect(next).toHaveLength(3);
  });
  it("begrenser negative bilder til 0", () => {
    expect(moveKeyframes([key(4, "x", 1)], 4, -7)).toEqual([key(0, "x", 1)]);
  });
  it("er uten virkning når fra og til er like", () => {
    const list = [key(4, "x", 1), key(6, "y", 2)];
    expect(moveKeyframes(list, 4, 4)).toEqual(list);
  });
});

describe("setKeyframeEasing", () => {
  it("endrer bare nøkkelbildene på bildet (og valgte egenskaper)", () => {
    const list = [key(5, "x", 1), key(5, "y", 2), key(9, "x", 3)];
    const all = setKeyframeEasing(list, 5, "hold");
    expect(all.map((k) => k.easing)).toEqual(["hold", "hold", "linear"]);
    const one = setKeyframeEasing(list, 5, "ease-out", ["y"]);
    expect(one.map((k) => k.easing)).toEqual(["linear", "ease-out", "linear"]);
  });
});

describe("keyAllAt", () => {
  it("legger til seks nøkkelbilder med verdiene laget har på bildet", () => {
    const l = layerWith([key(0, "x", 0), key(20, "x", 200)]);
    const keys = keyAllAt(l, 10);
    const at10 = keys.filter((k) => k.frame === 10);
    expect(at10).toHaveLength(6);
    expect(at10.map((k) => k.property).sort()).toEqual([...ANIMATED_PROPERTIES].sort());
    const t = transformAt(l, 10);
    for (const k of at10) expect(k.value).toBe(t[k.property]);
    expect(keyframeFrames({ keyframes: keys })).toEqual([0, 10, 20]);
  });
});

describe("fieldsWithTransformAt", () => {
  it("uten animasjon og uten autoKey endres grunnverdien, uten nøkkelbilder", () => {
    const l = layerWith();
    const out = fieldsWithTransformAt(l, layerFieldsOf(l), 10, { ...TRANSFORM, x: 300 });
    expect(out.transform.x).toBe(300);
    expect(out.keyframes).toEqual([]);
  });

  it("med autoKey får bare den endrede egenskapen nøkkelbilder på 0 (gammel verdi) og bildet (ny verdi)", () => {
    const l = layerWith();
    const out = fieldsWithTransformAt(
      l,
      layerFieldsOf(l),
      10,
      { ...TRANSFORM, x: 300 },
      {
        autoKey: true,
      },
    );
    expect(out.keyframes.map((k) => [k.property, k.frame, k.value])).toEqual([
      ["x", 0, 100],
      ["x", 10, 300],
    ]);
    expect(out.transform).toEqual(TRANSFORM);
  });

  it("autoKey på bilde 0 lager bare ett nøkkelbilde", () => {
    const l = layerWith();
    const out = fieldsWithTransformAt(
      l,
      layerFieldsOf(l),
      0,
      { ...TRANSFORM, y: 50 },
      {
        autoKey: true,
      },
    );
    expect(out.keyframes.map((k) => [k.property, k.frame, k.value])).toEqual([["y", 0, 50]]);
  });

  it("en egenskap som allerede er animert får nøkkelbilde på bildet, og grunnverdien står urørt", () => {
    const l = layerWith([key(0, "x", 100), key(20, "x", 200)]);
    const out = fieldsWithTransformAt(l, layerFieldsOf(l), 10, { ...TRANSFORM, x: 500 });
    expect(out.transform).toEqual(TRANSFORM);
    expect(out.keyframes.filter((k) => k.property === "x").map((k) => [k.frame, k.value])).toEqual([
      [0, 100],
      [10, 500],
      [20, 200],
    ]);
  });

  it("uendret verdi gir ingen endring", () => {
    const l = layerWith();
    const out = fieldsWithTransformAt(l, layerFieldsOf(l), 10, { ...TRANSFORM }, { autoKey: true });
    expect(out.keyframes).toEqual([]);
    expect(out.transform).toEqual(TRANSFORM);
  });
});

describe("compositionDuration", () => {
  function sceneWith(durationFrames: number) {
    const { state, mainId } = seedProject(0);
    const L = (row: number, x: number, text: string) => ({ page: 1, x, y: 72 + row * 12, text });
    const parsed = parseScreenplayLines(
      [L(0, 54, "1 INT. STUA - DAG 1"), L(2, 108, "MAJA ser ut av vinduet.")],
      { format: "pdf" },
    );
    const cmd = planImport(state, parsed, { productionId: mainId as ProductionId, newId: tid });
    let s = mustApply(state, cmd);
    const variantId = Object.keys(s.variants)[0] as never;
    const compositionId = tid<"composition">();
    s = mustApply(s, {
      type: "CreateComposition",
      compositionId,
      variantId,
      fields: { name: "", width: 1000, height: 600, durationFrames, background: "#101114" },
    });
    return { s, comp: s.compositions[compositionId]! };
  }

  it("satt varighet har forrang", () => {
    const { s, comp } = sceneWith(137);
    expect(compositionDuration(s, comp)).toBe(137);
  });

  it("uten satt varighet brukes anslaget fra manuset (minst 5 sekunder)", () => {
    const { s, comp } = sceneWith(0);
    expect(compositionDuration(s, comp)).toBeGreaterThanOrEqual(5 * (FPS_25.num / FPS_25.den));
  });
});

describe("kamerautsnitt", () => {
  const size = { width: 1000, height: 600 };

  it("newShot starter på hele formatet og zoomer inn", () => {
    const sh = newShot(size, "a", 10, 60);
    expect(sh.from).toEqual(fullFrameCamera(size));
    expect(sh.to.zoom).toBeGreaterThan(1);
    expect(sh.curve).toBeNull();
    expect([sh.startFrame, sh.endFrame]).toEqual([10, 60]);
  });

  it("newShot lar ikke slutten komme før starten", () => {
    const sh = newShot(size, "a", 10, 3);
    expect(sh.endFrame).toBe(10);
  });

  it("toggleCurve går fram og tilbake, og kurven starter som rett linje", () => {
    const sh = { ...newShot(size, "a", 0, 10), to: { x: 700, y: 300, zoom: 2, rotation: 0 } };
    const curved = toggleCurve(sh);
    expect(curved.curve).not.toBeNull();
    const straight = shotPath(sh, 4);
    const onCurve = shotPath(curved, 4);
    onCurve.forEach((p, i) => {
      expect(p.x).toBeCloseTo(straight[i]!.x, 6);
      expect(p.y).toBeCloseTo(straight[i]!.y, 6);
    });
    expect(toggleCurve(curved).curve).toBeNull();
  });

  it("withShot erstatter (samme id), sorterer etter start, og withoutShot fjerner", () => {
    let cam = withShot({ shots: [] }, newShot(size, "b", 50, 60));
    cam = withShot(cam, newShot(size, "a", 0, 10));
    expect(cam.shots.map((x) => x.id)).toEqual(["a", "b"]);
    cam = withShot(cam, newShot(size, "b", 70, 90));
    expect(cam.shots.map((x) => [x.id, x.startFrame])).toEqual([
      ["a", 0],
      ["b", 70],
    ]);
    expect(withoutShot(cam, "a").shots.map((x) => x.id)).toEqual(["b"]);
  });

  it("shotAt finner utsnittet som inneholder bildet (grensene inkludert)", () => {
    const cam = withShot(
      withShot({ shots: [] }, newShot(size, "a", 0, 10)),
      newShot(size, "b", 20, 30),
    );
    expect(shotAt(cam, 0)?.id).toBe("a");
    expect(shotAt(cam, 10)?.id).toBe("a");
    expect(shotAt(cam, 15)).toBeNull();
    expect(shotAt(cam, 30)?.id).toBe("b");
    expect(shotAt(cam, 31)).toBeNull();
  });

  it("shotPath: rett bane har midtpunktet i midten, kurven slutter i fra og til", () => {
    const base = newShot(size, "a", 0, 10);
    const sh = { ...base, from: { ...base.from, x: 0, y: 0 }, to: { ...base.to, x: 200, y: 100 } };
    const straight = shotPath(sh, 32);
    expect(straight).toHaveLength(33);
    expect(straight[16]!.x).toBeCloseTo(100, 9);
    expect(straight[16]!.y).toBeCloseTo(50, 9);

    const curved = { ...sh, curve: { c1x: 0, c1y: 400, c2x: 300, c2y: -200 } };
    const path = shotPath(curved, 16);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[16]!.x).toBeCloseTo(200, 9);
    expect(path[16]!.y).toBeCloseTo(100, 9);
  });

  it("cameraCorners ved zoom 2 er et rektangel med halv størrelse rundt kameraet", () => {
    const corners = cameraCorners(size, { x: 500, y: 300, zoom: 2, rotation: 0 });
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    expect(Math.min(...xs)).toBeCloseTo(250, 9);
    expect(Math.max(...xs)).toBeCloseTo(750, 9);
    expect(Math.min(...ys)).toBeCloseTo(150, 9);
    expect(Math.max(...ys)).toBeCloseTo(450, 9);
    expect(corners[0]!.x).toBeCloseTo(250, 9);
    expect(corners[0]!.y).toBeCloseTo(150, 9);
  });
});
