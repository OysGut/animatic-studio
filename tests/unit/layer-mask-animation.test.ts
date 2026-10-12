// @vitest-environment node
/** Animert maske (DEC-0072, REQ-0175): maskens plassering og størrelse med samme nøkkelbilder som laget. */
import { describe, expect, it } from "vitest";
import {
  KEYFRAME_PROPERTIES,
  MASK_PROPERTIES,
  applyCommand,
  defaultLayerFields,
  dragMaskRect,
  fieldsWithMaskAt,
  keyAllAt,
  layerFieldsOf,
  maskAt,
  moveKeyframes,
  normalizeKeyframes,
  normalizeLayerFields,
  removeKeyframesAt,
  renderFrame,
  stateFromRows,
  toRow,
  type Command,
  type CompositionFields,
  type Keyframe,
  type LayerFields,
  type LayerMask,
  type ProjectRows,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

const COMP: CompositionFields = {
  name: "Stua",
  width: 1000,
  height: 600,
  durationFrames: 100,
  background: "#101114",
};

/** 2D-scene med to fargelag A og B (200 × 100 hver). */
function setup() {
  const { state } = seedProject(1);
  const variantId = Object.keys(state.variants)[0] as never;
  const compId = tid<"composition">();
  let s = mustApply(state, {
    type: "CreateComposition",
    compositionId: compId,
    variantId,
    fields: COMP,
  });
  const [A, B] = [tid<"composition_layer">(), tid<"composition_layer">()];
  const f: LayerFields = {
    ...defaultLayerFields(s, s.compositions[compId]!, { fill: "#ff0000" }),
    width: 200,
    height: 100,
  };
  s = mustApply(s, {
    type: "AddLayers",
    layers: [A, B].map((layerId) => ({ layerId, compositionId: compId, fields: f })),
  });
  return { s, compId, A, B };
}

const rect: LayerMask = {
  kind: "rect",
  x: 20,
  y: 10,
  width: 100,
  height: 50,
  feather: 0,
  invert: false,
};

const key = (frame: number, property: Keyframe["property"], value: number): Keyframe => ({
  frame,
  property,
  value,
  easing: "linear",
});

function update(s: ProjectState, id: string, patch: Partial<LayerFields>): Command {
  return {
    type: "UpdateLayers",
    layers: [{ layerId: id as never, fields: { ...layerFieldsOf(s.layers[id]!), ...patch } }],
  };
}

function fails(s: ProjectState, c: Command): string {
  const r = applyCommand(s, envelope(c));
  if (r.ok) throw new Error(`${c.type} skulle feilet`);
  return r.error.message;
}

/** Lag A med rektangelmaske som flytter seg fra x 20 til x 120 og vokser fra bredde 100 til 200. */
function animated() {
  const { s, compId, A, B } = setup();
  const t = mustApply(
    s,
    update(s, A, {
      mask: rect,
      keyframes: [
        key(0, "maskX", 20),
        key(10, "maskX", 120),
        key(0, "maskWidth", 100),
        key(10, "maskWidth", 200),
      ],
    }),
  );
  return { s: t, compId, A, B };
}

describe("egenskaper og validering", () => {
  it("maskens egenskaper er egne nøkkelbildeegenskaper ved siden av lagets", () => {
    expect(MASK_PROPERTIES).toEqual(["maskX", "maskY", "maskWidth", "maskHeight"]);
    for (const p of MASK_PROPERTIES) expect(KEYFRAME_PROPERTIES).toContain(p);
    expect(normalizeKeyframes([key(0, "maskX", 5)]).ok).toBe(true);
    expect(normalizeKeyframes([{ ...key(0, "x", 5), property: "maskZ" as never }]).ok).toBe(false);
  });

  it("nøkkelbilder for masken krever rektangel- eller ellipsemaske; ellers fjernes de", () => {
    const { s, A, B } = setup();
    const keys = [key(0, "x", 1), key(5, "maskX", 30)];
    const base = layerFieldsOf(s.layers[A]!);
    const none = normalizeLayerFields({ ...base, keyframes: keys, mask: null });
    if (!none.ok) throw new Error(none.error);
    expect(none.value.keyframes.map((k) => k.property)).toEqual(["x"]);
    const byLayer = normalizeLayerFields({
      ...base,
      keyframes: keys,
      mask: { kind: "layer", layerId: B, invert: false },
    });
    if (!byLayer.ok) throw new Error(byLayer.error);
    expect(byLayer.value.keyframes.map((k) => k.property)).toEqual(["x"]);
    const shape = normalizeLayerFields({ ...base, keyframes: keys, mask: rect });
    if (!shape.ok) throw new Error(shape.error);
    expect(shape.value.keyframes).toHaveLength(2);
  });

  it("avviser bredde eller høyde 0 og verdier langt utenfor i nøkkelbildene", () => {
    const { s, A } = setup();
    expect(fails(s, update(s, A, { mask: rect, keyframes: [key(3, "maskWidth", 0)] }))).toMatch(
      /bredde og høyde over 0/,
    );
    expect(fails(s, update(s, A, { mask: rect, keyframes: [key(3, "maskHeight", -4)] }))).toMatch(
      /bredde og høyde over 0/,
    );
    expect(fails(s, update(s, A, { mask: rect, keyframes: [key(3, "maskY", 5e7)] }))).toMatch(
      /Ugyldig plassering/,
    );
  });
});

describe("masken over tid", () => {
  it("følger nøkkelbildene i tegnelisten (samme for avspilling og eksport)", () => {
    const { s, compId, A } = animated();
    const l = s.layers[A]!;
    expect(maskAt(l, 0)).toEqual(rect);
    expect(maskAt(l, 5)).toEqual({ ...rect, x: 70, width: 150 });
    expect(maskAt(l, 50)).toEqual({ ...rect, x: 120, width: 200 });
    // I tegnelisten: x fra midten av laget (200 × 100)
    const item = (f: number) =>
      renderFrame(s, compId, f, { view: "camera" }).items.find((i) => i.layerId === A)!;
    expect(item(5).mask).toMatchObject({ kind: "rect", x: 70 - 100, y: 10 - 50, width: 150 });
    expect(item(10).mask).toMatchObject({ x: 20, width: 200 });
  });

  it("eldre data uten nøkkelbilder for masken: masken er som lagret på alle bilder", () => {
    const { s, compId, A } = setup();
    const t = mustApply(
      s,
      update(s, A, { mask: rect, keyframes: [key(0, "x", 0), key(10, "x", 500)] }),
    );
    const l = t.layers[A]!;
    expect(maskAt(l, 0)).toBe(l.mask);
    expect(maskAt(l, 7)).toBe(l.mask);
    const it7 = renderFrame(t, compId, 7).items.find((i) => i.layerId === A)!;
    expect(it7.mask).toMatchObject({ x: -80, y: -40, width: 100, height: 50 });
  });

  it("maske av et annet lag er alltid lik", () => {
    const { s, A, B } = setup();
    const m: LayerMask = { kind: "layer", layerId: B, invert: false };
    const t = mustApply(s, update(s, A, { mask: m }));
    expect(maskAt(t.layers[A]!, 3)).toEqual(m);
  });
});

describe("endre masken på et bilde (tall og håndtak på lerretet)", () => {
  it("uten animasjon og uten automatiske nøkkelbilder endres selve masken", () => {
    const { s, A } = setup();
    const t = mustApply(s, update(s, A, { mask: rect }));
    const l = t.layers[A]!;
    const f = fieldsWithMaskAt(l, layerFieldsOf(l), 30, { x: 40, y: 10, width: 120, height: 50 });
    expect(f.mask).toEqual({ ...rect, x: 40, width: 120 });
    expect(f.keyframes).toEqual(l.keyframes);
  });

  it("med automatiske nøkkelbilder blir endringen en bevegelse fra bilde 0", () => {
    const { s, A } = setup();
    const t = mustApply(s, update(s, A, { mask: rect }));
    const l = t.layers[A]!;
    const f = fieldsWithMaskAt(
      l,
      layerFieldsOf(l),
      30,
      { x: 40, y: 10, width: 100, height: 50 },
      { autoKey: true },
    );
    expect(f.mask).toEqual(rect); // grunnverdien er uendret
    expect(
      f.keyframes.filter((k) => k.property === "maskX").map((k) => [k.frame, k.value]),
    ).toEqual([
      [0, 20],
      [30, 40],
    ]);
    // Bare endrede egenskaper får nøkkelbilde
    expect(f.keyframes.some((k) => k.property === "maskY")).toBe(false);
    const u = mustApply(t, { type: "UpdateLayers", layers: [{ layerId: A as never, fields: f }] });
    expect(maskAt(u.layers[A]!, 15)).toMatchObject({ x: 30 });
  });

  it("en egenskap som allerede er animert, får nøkkelbilde på bildet", () => {
    const { s, A } = animated();
    const l = s.layers[A]!;
    const now = maskAt(l, 5)!;
    if (now.kind === "layer") throw new Error("forventet form");
    const f = fieldsWithMaskAt(l, layerFieldsOf(l), 5, { ...now, x: 0, height: 80 });
    expect(f.keyframes.find((k) => k.property === "maskX" && k.frame === 5)?.value).toBe(0);
    // Høyden er ikke animert: grunnverdien endres
    expect(f.mask).toEqual({ ...rect, height: 80 });
  });

  it("lag uten form-maske: feltene er uendret", () => {
    const { s, A } = setup();
    const l = s.layers[A]!;
    const base = layerFieldsOf(l);
    expect(fieldsWithMaskAt(l, base, 0, { x: 1, y: 1, width: 1, height: 1 })).toBe(base);
  });
});

describe("tidslinjen", () => {
  it("«Nøkkelbilde» tar med masken når laget har rektangel- eller ellipsemaske", () => {
    const { s, A, B } = animated();
    const keys = keyAllAt(s.layers[A]!, 5).filter((k) => k.frame === 5);
    expect(keys.map((k) => k.property).sort()).toEqual([...KEYFRAME_PROPERTIES].sort());
    expect(keys.find((k) => k.property === "maskX")!.value).toBe(70);
    // Uten maske: bare lagets egne egenskaper
    expect(keyAllAt(s.layers[B]!, 5).filter((k) => k.frame === 5)).toHaveLength(6);
  });

  it("flytting og sletting av nøkkelbilder på et bilde gjelder også masken", () => {
    const list = [key(10, "x", 1), key(10, "maskX", 2), key(20, "maskWidth", 3)];
    expect(removeKeyframesAt(list, 10)).toEqual([key(20, "maskWidth", 3)]);
    expect(moveKeyframes(list, 10, 15).map((k) => [k.property, k.frame])).toEqual([
      ["maskWidth", 20],
      ["maskX", 15],
      ["x", 15],
    ]);
  });
});

describe("angre og lagring", () => {
  it("fjernet maske tar nøkkelbildene med seg, og angre gir begge tilbake", () => {
    const { s, A } = animated();
    const r = applyCommand(s, envelope(update(s, A, { mask: null })));
    if (!r.ok) throw new Error(r.error.message);
    expect(r.state.layers[A]!.keyframes).toEqual([]);
    const back = mustApply(r.state, r.inverse);
    expect(back.layers[A]!.mask).toEqual(rect);
    expect(back.layers[A]!.keyframes).toEqual(s.layers[A]!.keyframes);
  });

  it("nøkkelbildene for masken lagres i lagets nøkkelbilder (ingen ny kolonne) og leses tilbake", () => {
    const { s, A } = animated();
    const projectId = s.project.id;
    const row = toRow("layers", s.layers[A]!, projectId);
    expect(row["mask"]).toEqual(rect);
    expect((row["keyframes"] as Keyframe[]).map((k) => k.property)).toContain("maskX");
    expect(JSON.stringify(row["mask"]).length).toBeLessThan(8192);
    const rows = {
      project: {
        id: projectId,
        revision: s.project.revision,
        name: s.project.name,
        fps_num: s.project.fps.num,
        fps_den: s.project.fps.den,
      },
      productions: [],
      scenes: [],
      scene_variants: [],
      script_blocks: [],
      script_block_revisions: [],
      scene_occurrences: [],
      production_segments: [],
      takes: [],
      compositions: Object.values(s.compositions).map((c) => toRow("compositions", c, projectId)),
      composition_layers: Object.values(s.layers).map((l) => toRow("layers", l, projectId)),
    } as unknown as ProjectRows;
    const back = stateFromRows(rows);
    expect(back.layers[A]).toEqual(s.layers[A]);
    expect(maskAt(back.layers[A]!, 5)).toMatchObject({ x: 70, width: 150 });
  });
});

describe("håndtak på lerretet", () => {
  const start = { x: 20, y: 10, width: 100, height: 50 };
  it("midtpunktet flytter masken; et hjørne endrer størrelsen med hjørnet overfor fast", () => {
    expect(dragMaskRect(start, -1, 5.04, -3)).toEqual({ x: 25, y: 7, width: 100, height: 50 });
    // Nederst høyre: øverst venstre ligger fast
    expect(dragMaskRect(start, 2, 30, 10)).toEqual({ x: 20, y: 10, width: 130, height: 60 });
    // Øverst venstre: nederst høyre (120, 60) ligger fast
    expect(dragMaskRect(start, 0, 10, 5)).toEqual({ x: 30, y: 15, width: 90, height: 45 });
    // Forbi hjørnet overfor: minst 1 px
    expect(dragMaskRect(start, 2, -500, -500)).toEqual({ x: 20, y: 10, width: 1, height: 1 });
  });

  it("Shift beholder forholdet mellom sidene", () => {
    const r = dragMaskRect(start, 1, 100, 0, true);
    expect(r.width / r.height).toBeCloseTo(2);
    expect(r).toEqual({ x: 20, y: -40, width: 200, height: 100 });
  });
});
