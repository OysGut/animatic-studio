// @vitest-environment node
/** Prosjektets bildeformat og bildefrekvens (DEC-0039): omregning, SetProjectFormat og angre. */
import { describe, expect, it } from "vitest";
import {
  FRAME_RATES,
  applyCommand,
  defaultLayerFields,
  formatMapping,
  rescaleComposition,
  rescaleLayer,
  type CameraShot,
  type Command,
  type Composition,
  type CompositionLayer,
  type Keyframe,
  type LayerFields,
  type ProjectFormat,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

const HD: ProjectFormat = { width: 1920, height: 1080, fps: { num: 25, den: 1 } };
const UHD: ProjectFormat = { width: 3840, height: 2160, fps: { num: 25, den: 1 } };
const SQUARE: ProjectFormat = { width: 1080, height: 1080, fps: { num: 25, den: 1 } };

const kf = (frame: number, property: Keyframe["property"], value: number): Keyframe => ({
  frame,
  property,
  value,
  easing: "linear",
});

function layer(over: Partial<CompositionLayer> = {}): CompositionLayer {
  return {
    id: tid<"composition_layer">(),
    revision: 1,
    compositionId: tid<"composition">(),
    orderKey: "a0",
    kind: "background",
    name: "L",
    assetId: null,
    assetVariantId: null,
    versionId: null,
    fill: "#112233",
    width: 1920,
    height: 1080,
    parallax: 1,
    transform: { x: 960, y: 540, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
    keyframes: [],
    visible: true,
    locked: false,
    groupId: null,
    ...over,
  } as CompositionLayer;
}

describe("formatMapping", () => {
  it("HD → UHD dobler x, y og skala og beholder midten", () => {
    const m = formatMapping(HD, UHD);
    expect(m.k).toBe(2);
    expect(m.x(100)).toBe(200);
    expect(m.y(50)).toBe(100);
    expect(m.scale(1.25)).toBe(2.5);
    expect(m.x(960)).toBe(1920);
    expect(m.y(540)).toBe(1080);
  });

  it("HD → kvadrat beholder høyden og midten (x 960 → 540)", () => {
    const m = formatMapping(HD, SQUARE);
    expect(m.k).toBe(1);
    expect(m.x(960)).toBe(540);
    expect(m.y(300)).toBe(300);
    expect(m.scale(1.5)).toBe(1.5);
    expect(m.x(0)).toBe(-420);
  });

  it("bildefrekvens 25 → 50 dobler bildenummer, og 24000/1001 regnes riktig", () => {
    const m = formatMapping(HD, { ...HD, fps: { num: 50, den: 1 } });
    expect(m.frame(10)).toBe(20);
    expect(m.frame(0)).toBe(0);
    const n = formatMapping(
      { ...HD, fps: { num: 24, den: 1 } },
      { ...HD, fps: { num: 24000, den: 1001 } },
    );
    expect(n.frame(1001)).toBe(1000);
    const back = formatMapping({ ...HD, fps: { num: 24000, den: 1001 } }, HD);
    expect(back.frame(24000)).toBe(Math.round((24000 * 25 * 1001) / (24000 * 1)));
    expect(back.frame(0)).toBe(0);
  });

  it("størrelser begrenses til 1–16384", () => {
    const m = formatMapping(HD, { width: 1920 * 20, height: 1080 * 20, fps: HD.fps });
    expect(m.size(1920)).toBe(16384);
    expect(formatMapping(HD, { width: 16, height: 16, fps: HD.fps }).size(1)).toBe(1);
  });
});

describe("rescaleLayer", () => {
  const m = formatMapping(HD, UHD);

  it("fargeflatens størrelse skaleres, bildelags størrelse beholdes", () => {
    const fill = rescaleLayer(layer(), m);
    expect([fill.width, fill.height]).toEqual([3840, 2160]);
    const img = rescaleLayer(
      layer({ kind: "character", fill: null, assetId: tid(), width: 800, height: 400 }),
      m,
    );
    expect([img.width, img.height]).toEqual([800, 400]);
    expect(img.transform.x).toBe(1920);
    expect(img.transform.scaleX).toBe(2);
  });

  it("nøkkelbilder for x, y og skala følger, andre egenskaper beholdes", () => {
    const l = rescaleLayer(
      layer({
        keyframes: [
          kf(0, "x", 100),
          kf(10, "y", 50),
          kf(5, "scaleX", 1),
          kf(5, "scaleY", 1.5),
          kf(5, "opacity", 0.5),
          kf(5, "rotation", 30),
        ],
      }),
      m,
    );
    const get = (p: string) => l.keyframes.find((k) => k.property === p)!.value;
    expect(get("x")).toBe(200);
    expect(get("y")).toBe(100);
    expect(get("scaleX")).toBe(2);
    expect(get("scaleY")).toBe(3);
    expect(get("opacity")).toBe(0.5);
    expect(get("rotation")).toBe(30);
  });

  it("nøkkelbilder som havner på samme bilde, slås sammen (det siste vinner)", () => {
    const half = formatMapping(HD, { ...HD, fps: { num: 12, den: 1 } });
    // 25 → 12: bilde 4 → 1,92 → 2 og bilde 5 → 2,4 → 2
    const l = rescaleLayer(
      layer({ keyframes: [kf(4, "x", 10), kf(5, "x", 20), kf(30, "x", 5)] }),
      half,
    );
    expect(l.keyframes.filter((k) => k.property === "x")).toHaveLength(2);
    expect(l.keyframes.find((k) => k.frame === 2)!.value).toBe(20);
  });
});

describe("rescaleComposition", () => {
  const shot: CameraShot = {
    id: "s1",
    name: "Panorering",
    startFrame: 10,
    endFrame: 50,
    from: { x: 960, y: 540, zoom: 1, rotation: 0 },
    to: { x: 1200, y: 600, zoom: 2, rotation: 0 },
    curve: { c1x: 1000, c1y: 500, c2x: 1100, c2y: 520 },
    easing: "linear",
  };
  const comp = (over: Partial<Composition> = {}): Composition =>
    ({
      id: tid<"composition">(),
      revision: 1,
      variantId: tid(),
      name: "S",
      width: 1920,
      height: 1080,
      durationFrames: 100,
      background: "#000000",
      camera: { shots: [shot] },
      removed: false,
      ...over,
    }) as Composition;

  it("kamerautsnitt, kurve og tider regnes om", () => {
    const to: ProjectFormat = { width: 3840, height: 2160, fps: { num: 50, den: 1 } };
    const r = rescaleComposition(comp(), formatMapping(HD, to), to);
    expect([r.width, r.height]).toEqual([3840, 2160]);
    expect(r.durationFrames).toBe(200);
    const sh = r.camera.shots[0]!;
    expect([sh.startFrame, sh.endFrame]).toEqual([20, 100]);
    expect(sh.from).toMatchObject({ x: 1920, y: 1080, zoom: 1 });
    expect(sh.to).toMatchObject({ x: 2400, y: 1200, zoom: 2 });
    expect(sh.curve).toEqual({ c1x: 2000, c1y: 1000, c2x: 2200, c2y: 1040 });
  });

  it("varighet 0 (følger innholdet) blir stående på 0", () => {
    const r = rescaleComposition(comp({ durationFrames: 0 }), formatMapping(HD, UHD), UHD);
    expect(r.durationFrames).toBe(0);
  });
});

// ---------- Kommandoer ----------

function fails(s: ProjectState, c: Command) {
  const r = applyCommand(s, envelope(c));
  expect(r.ok).toBe(false);
  return r.ok ? null : r.error;
}

/** Prosjekt 1920 × 1080 / 25 med to produksjoner, én 2D-scene og to lag (fargeflate med nøkkelbilder, bildelag). */
function setup() {
  const { state, mainId, spinoffId } = seedProject(2);
  const variantId = Object.keys(state.variants)[0] as never;
  const assetId = tid<"asset">();
  const avId = tid<"asset_variant">();
  const versionId = tid<"asset_version">();
  let s = mustApply(state, {
    type: "CreateAssets",
    assets: [
      {
        assetId,
        fields: {
          kind: "character",
          name: "Maja",
          names: [],
          description: "",
          category: "",
          tags: [],
        },
      },
    ],
  });
  s = mustApply(s, {
    type: "CreateAssetVariant",
    variantId: avId,
    assetId,
    fields: { name: "Animatic", style: "animatic", appearance: "" },
  });
  s = mustApply(s, {
    type: "AddAssetVersion",
    versionId,
    variantId: avId,
    media: {
      path: `${s.project.id}/${assetId}/${versionId}/maja.png`,
      mimeType: "image/png",
      width: 800,
      height: 400,
      byteSize: 1000,
      sha256: "c".repeat(64),
    },
    note: "",
  });
  const compId = tid<"composition">();
  s = mustApply(s, {
    type: "CreateComposition",
    compositionId: compId,
    variantId,
    fields: { name: "Stua", width: 1, height: 1, durationFrames: 100, background: "#101114" },
  });
  const [bg, img] = [tid<"composition_layer">(), tid<"composition_layer">()];
  const bgFields: LayerFields = {
    ...defaultLayerFields(s, s.compositions[compId]!, { fill: "#2b3a55" }),
    keyframes: [kf(0, "x", 100), kf(25, "x", 400)],
  };
  s = mustApply(s, {
    type: "AddLayers",
    layers: [
      { layerId: bg, compositionId: compId, fields: bgFields },
      {
        layerId: img,
        compositionId: compId,
        fields: defaultLayerFields(s, s.compositions[compId]!, { assetId, assetVariantId: avId }),
      },
    ],
  });
  return { s, mainId, spinoffId, variantId, compId, bg, img };
}

const strip = <T extends { revision: number }>(o: T): Omit<T, "revision"> => {
  const { revision: _r, ...rest } = o;
  return rest;
};
const stripAll = <T extends { revision: number }>(m: Readonly<Record<string, T>>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, strip(v)]));

describe("SetProjectFormat", () => {
  it("avviser ukjent bildefrekvens, ugyldig størrelse og ingen endring", () => {
    const { s } = setup();
    const set = (width: number, height: number, fps = { num: 25, den: 1 }): Command => ({
      type: "SetProjectFormat",
      width,
      height,
      fps,
    });
    expect(fails(s, set(1920, 1080, { num: 26, den: 1 }))?.code).toBe("invalid");
    expect(fails(s, set(1920, 1080))?.message).toMatch(/Ingen endring/);
    expect(fails(s, set(8, 1080))?.code).toBe("invalid");
    expect(fails(s, set(1920, 20000))?.code).toBe("invalid");
    expect(fails(s, set(1920.5, 1080))?.code).toBe("invalid");
    expect(FRAME_RATES.length).toBeGreaterThan(0);
  });

  it("endrer prosjekt, alle produksjoners bildefrekvens, 2D-scener og lag", () => {
    const { s, compId, bg, img, mainId, spinoffId } = setup();
    const t = mustApply(s, {
      type: "SetProjectFormat",
      width: 3840,
      height: 2160,
      fps: { num: 50, den: 1 },
    });
    expect([t.project.frameWidth, t.project.frameHeight]).toEqual([3840, 2160]);
    expect(t.project.fps).toEqual({ num: 50, den: 1 });
    expect(t.project.revision).toBe(s.project.revision + 1);
    for (const id of [mainId, spinoffId]) {
      expect(t.productions[id]!.fps).toEqual({ num: 50, den: 1 });
      expect(t.productions[id]!.revision).toBe(s.productions[id]!.revision + 1);
    }
    const c = t.compositions[compId]!;
    expect([c.width, c.height, c.durationFrames]).toEqual([3840, 2160, 200]);
    expect(c.revision).toBe(s.compositions[compId]!.revision + 1);
    const lbg = t.layers[bg]!;
    expect([lbg.width, lbg.height]).toEqual([3840, 2160]);
    expect(lbg.keyframes.map((k) => [k.frame, k.value])).toEqual([
      [0, 200],
      [50, 800],
    ]);
    const limg = t.layers[img]!;
    expect([limg.width, limg.height]).toEqual([s.layers[img]!.width, s.layers[img]!.height]);
    expect(limg.transform.x).toBe(s.layers[img]!.transform.x * 2);
  });

  it("holder midten når sideforholdet endres", () => {
    const { s, bg } = setup();
    const t = mustApply(s, {
      type: "SetProjectFormat",
      width: 1080,
      height: 1080,
      fps: s.project.fps,
    });
    expect(t.layers[bg]!.transform.x).toBe(540);
    expect(t.compositions[Object.keys(t.compositions)[0]!]!.width).toBe(1080);
  });

  it("angre (UndoSetProjectFormat) gjenoppretter eksakt de forrige objektene", () => {
    const { s } = setup();
    const r = applyCommand(
      s,
      envelope({ type: "SetProjectFormat", width: 1080, height: 1080, fps: { num: 60, den: 1 } }),
    );
    if (!r.ok) throw new Error(r.error.message);
    expect(r.inverse.type).toBe("UndoSetProjectFormat");
    const back = mustApply(r.state, r.inverse);
    expect(strip(back.project)).toEqual(strip(s.project));
    expect(stripAll(back.productions)).toEqual(stripAll(s.productions));
    expect(stripAll(back.compositions)).toEqual(stripAll(s.compositions));
    expect(stripAll(back.layers)).toEqual(stripAll(s.layers));
    // Revisjonene går fremover, aldri bakover
    expect(back.project.revision).toBe(s.project.revision + 2);
    // Gjør om (inversen av inversen) gir samme format som første gang
    const r2 = applyCommand(r.state, envelope(r.inverse));
    if (!r2.ok) throw new Error(r2.error.message);
    const again = mustApply(back, r2.inverse);
    expect(stripAll(again.layers)).toEqual(stripAll(r.state.layers));
  });
});

describe("Formatet følger prosjektet", () => {
  it("CreateComposition ignorerer oppgitt størrelse og bruker prosjektets", () => {
    const { s, variantId, compId } = setup();
    const t = mustApply(s, { type: "SetCompositionRemoved", compositionId: compId, removed: true });
    const id = tid<"composition">();
    const u = mustApply(t, {
      type: "CreateComposition",
      compositionId: id,
      variantId,
      fields: { name: "Ny", width: 640, height: 480, durationFrames: 10, background: "#000000" },
    });
    expect([u.compositions[id]!.width, u.compositions[id]!.height]).toEqual([1920, 1080]);
  });

  it("UpdateComposition kan ikke endre bredde og høyde", () => {
    const { s, compId } = setup();
    const c = s.compositions[compId]!;
    const u = mustApply(s, {
      type: "UpdateComposition",
      compositionId: compId,
      fields: {
        name: "Omdøpt",
        width: 640,
        height: 480,
        durationFrames: 50,
        background: "#000000",
      },
    });
    const n = u.compositions[compId]!;
    expect([n.width, n.height]).toEqual([c.width, c.height]);
    expect(n.name).toBe("Omdøpt");
    expect(n.durationFrames).toBe(50);
  });
});
