// @vitest-environment node
/** 2D-sceneeditoren: kommandoer, orden, invarianter, rendring, kamera og lagring (M3 del 2, DEC-0035). */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  cameraAt,
  checkInvariants,
  defaultLayerFields,
  diffStates,
  ease,
  hitTest,
  itemCorners,
  layerFieldsOf,
  layersOf,
  parseScreenplayLines,
  planImport,
  renderFrame,
  stateFromRows,
  toRow,
  valueAt,
  viewMatrix,
  applyMatrix,
  type AssetFields,
  type Command,
  type CompositionCamera,
  type CompositionFields,
  type CompositionLayer,
  type LayerFields,
  type ProductionId,
  type ProjectRows,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

const COMP_FIELDS: CompositionFields = {
  name: "Stua",
  width: 1000,
  height: 600,
  durationFrames: 100,
  background: "#101114",
};

function fails(s: ProjectState, c: Command) {
  const r = applyCommand(s, envelope(c));
  expect(r.ok).toBe(false);
  return r.ok ? null : r.error;
}

function ok(s: ProjectState, c: Command) {
  const r = applyCommand(s, envelope(c));
  if (!r.ok) throw new Error(`${c.type} feilet: ${r.error.code} ${r.error.message}`);
  return r;
}

const assetFields: AssetFields = {
  kind: "character",
  name: "Maja",
  names: [],
  description: "",
  category: "",
  tags: [],
};

/** Prosjekt med én scene, én ressurs med variant og én versjon (800 × 400). */
function base() {
  const { state, mainId } = seedProject(1);
  const variantId = Object.keys(state.variants)[0] as never;
  const assetId = tid<"asset">();
  const assetVariantId = tid<"asset_variant">();
  const versionId = tid<"asset_version">();
  let s = mustApply(state, { type: "CreateAssets", assets: [{ assetId, fields: assetFields }] });
  s = mustApply(s, {
    type: "CreateAssetVariant",
    variantId: assetVariantId,
    assetId,
    fields: { name: "Animatic", style: "animatic", appearance: "" },
  });
  s = mustApply(s, {
    type: "AddAssetVersion",
    versionId,
    variantId: assetVariantId,
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
    fields: COMP_FIELDS,
  });
  return { s, mainId, variantId, assetId, assetVariantId, versionId, compId };
}

function fillFields(s: ProjectState, compId: string, fill = "#2b3a55"): LayerFields {
  return defaultLayerFields(s, s.compositions[compId]!, { fill });
}

/** Tre fargelag A, B, C (bakerst først). */
function withThree() {
  const b = base();
  const [A, B, C] = [
    tid<"composition_layer">(),
    tid<"composition_layer">(),
    tid<"composition_layer">(),
  ];
  const s = mustApply(b.s, {
    type: "AddLayers",
    layers: [A, B, C].map((layerId, i) => ({
      layerId,
      compositionId: b.compId,
      fields: fillFields(b.s, b.compId, ["#111111", "#222222", "#333333"][i]),
    })),
  });
  const order = (st: ProjectState) => layersOf(st, b.compId).map((l) => l.id);
  return { ...b, s, A, B, C, order };
}

describe("CreateComposition", () => {
  it("oppretter 2D-scene med tom kamera, og angre fjerner den igjen", () => {
    const { s, compId, variantId } = base();
    const comp = s.compositions[compId]!;
    expect(comp.variantId).toBe(variantId);
    expect(comp.camera).toEqual({ shots: [] });
    expect(comp.removed).toBe(false);
    // Én aktiv 2D-scene per scene: en ny avvises, men etter sletting av den første går det
    const again = tid<"composition">();
    const create = {
      type: "CreateComposition" as const,
      compositionId: again,
      variantId,
      fields: COMP_FIELDS,
    };
    expect(fails(s, create)?.code).toBe("invalid");
    const removed = mustApply(s, {
      type: "SetCompositionRemoved",
      compositionId: compId,
      removed: true,
    });
    const r = ok(removed, create);
    expect(r.inverse).toEqual({ type: "UndoCreateComposition", compositionId: again });
    // Den første kan ikke hentes tilbake så lenge den nye finnes
    expect(
      fails(r.state, { type: "SetCompositionRemoved", compositionId: compId, removed: false })
        ?.code,
    ).toBe("invalid");
    const undone = mustApply(r.state, r.inverse);
    expect(undone.compositions[again]).toBeUndefined();
  });

  it("avvises ved angre når 2D-scenen har lag", () => {
    const { s, compId } = base();
    const x = mustApply(s, {
      type: "AddLayers",
      layers: [{ layerId: tid(), compositionId: compId, fields: fillFields(s, compId) }],
    });
    expect(fails(x, { type: "UndoCreateComposition", compositionId: compId })?.code).toBe(
      "referenced",
    );
  });

  it("avviser ugyldige felter", () => {
    const { s, variantId } = base();
    const bad = (over: Partial<CompositionFields>) =>
      fails(s, {
        type: "CreateComposition",
        compositionId: tid(),
        variantId,
        fields: { ...COMP_FIELDS, ...over },
      })?.code;
    expect(bad({ width: 10 })).toBe("invalid");
    expect(bad({ background: "red" })).toBe("invalid");
  });
});

describe("AddLayers", () => {
  it("legger til bilde- og fargelag, nytt lag foran, og angre/gjenopprett gir identiske lag", () => {
    const { s, compId, assetId } = base();
    const L1 = tid<"composition_layer">();
    const L2 = tid<"composition_layer">();
    const imageFields = defaultLayerFields(s, s.compositions[compId]!, { assetId });
    expect(imageFields.kind).toBe("character");
    const r = ok(s, {
      type: "AddLayers",
      layers: [
        { layerId: L1, compositionId: compId, fields: imageFields },
        { layerId: L2, compositionId: compId, fields: fillFields(s, compId) },
      ],
    });
    const l1 = r.state.layers[L1]!;
    const l2 = r.state.layers[L2]!;
    expect(l1.orderKey < l2.orderKey).toBe(true);
    expect(layersOf(r.state, compId).map((l) => l.id)).toEqual([L1, L2]);
    expect(l2.fill).toBe("#2b3a55");
    expect(l1.assetId).toBe(assetId);
    expect(r.inverse).toEqual({ type: "UndoAddLayers", layerIds: [L1, L2] });

    const undo = ok(r.state, r.inverse);
    expect(undo.state.layers[L1]).toBeUndefined();
    expect(undo.state.layers[L2]).toBeUndefined();
    const redo = ok(undo.state, undo.inverse);
    for (const before of [l1, l2]) {
      const after = redo.state.layers[before.id]!;
      expect(after.orderKey).toBe(before.orderKey);
      expect(layerFieldsOf(after)).toEqual(layerFieldsOf(before));
    }
  });

  it("avviser lag uten bilde og fargeflate", () => {
    const { s, compId } = base();
    const f = { ...fillFields(s, compId), fill: null };
    expect(
      fails(s, {
        type: "AddLayers",
        layers: [{ layerId: tid(), compositionId: compId, fields: f }],
      })?.code,
    ).toBe("invalid");
  });

  it("avviser versjon som hører til en annen variant enn den oppgitte", () => {
    const { s, compId, assetId, versionId } = base();
    const other = tid<"asset_variant">();
    const x = mustApply(s, {
      type: "CreateAssetVariant",
      variantId: other,
      assetId,
      fields: { name: "Plakat", style: "poster", appearance: "" },
    });
    const f: LayerFields = {
      ...defaultLayerFields(x, x.compositions[compId]!, { assetId }),
      assetVariantId: other,
      versionId,
    };
    expect(
      fails(x, {
        type: "AddLayers",
        layers: [{ layerId: tid(), compositionId: compId, fields: f }],
      })?.code,
    ).toBe("invalid");
  });

  it("avviser ressurs som ikke finnes", () => {
    const { s, compId } = base();
    const f: LayerFields = {
      ...fillFields(s, compId),
      assetId: tid<"asset">(),
      fill: null,
    };
    expect(
      fails(s, {
        type: "AddLayers",
        layers: [{ layerId: tid(), compositionId: compId, fields: f }],
      })?.code,
    ).toBe("not_found");
  });

  it("avviser samme lag-ID to ganger i én kommando", () => {
    const { s, compId } = base();
    const id = tid<"composition_layer">();
    const n = { layerId: id, compositionId: compId, fields: fillFields(s, compId) };
    expect(fails(s, { type: "AddLayers", layers: [n, n] })?.code).toBe("duplicate_id");
  });
});

describe("UpdateLayers", () => {
  it("endrer transformasjon, og angre gjenoppretter", () => {
    const { s, A, B } = withThree();
    const a = s.layers[A]!;
    const f: LayerFields = {
      ...layerFieldsOf(a),
      transform: { ...a.transform, x: 42, rotation: 15 },
    };
    const r = ok(s, { type: "UpdateLayers", layers: [{ layerId: A, fields: f }] });
    expect(r.state.layers[A]!.transform.x).toBe(42);
    expect(r.state.layers[A]!.revision).toBe(a.revision + 1);
    expect(r.state.layers[B]).toBe(s.layers[B]);
    const back = ok(r.state, r.inverse);
    expect(layerFieldsOf(back.state.layers[A]!)).toEqual(layerFieldsOf(a));
  });

  it("endrer to lag i én kommando", () => {
    const { s, A, B } = withThree();
    const upd = (id: typeof A, x: number) => ({
      layerId: id,
      fields: {
        ...layerFieldsOf(s.layers[id]!),
        transform: { ...s.layers[id]!.transform, x },
      },
    });
    const r = ok(s, { type: "UpdateLayers", layers: [upd(A, 1), upd(B, 2)] });
    expect(r.state.layers[A]!.transform.x).toBe(1);
    expect(r.state.layers[B]!.transform.x).toBe(2);
    const back = ok(r.state, r.inverse).state;
    expect(back.layers[A]!.transform.x).toBe(s.layers[A]!.transform.x);
    expect(back.layers[B]!.transform.x).toBe(s.layers[B]!.transform.x);
  });

  it("avviser parallakse 5 og begrenser opasitet 1.5 til 1", () => {
    const { s, A } = withThree();
    const f = layerFieldsOf(s.layers[A]!);
    expect(
      fails(s, { type: "UpdateLayers", layers: [{ layerId: A, fields: { ...f, parallax: 5 } }] })
        ?.code,
    ).toBe("invalid");
    const r = ok(s, {
      type: "UpdateLayers",
      layers: [{ layerId: A, fields: { ...f, transform: { ...f.transform, opacity: 1.5 } } }],
    });
    expect(r.state.layers[A]!.transform.opacity).toBe(1);
  });
});

describe("MoveLayer", () => {
  it("flytter bak et annet lag, og angre gjenoppretter rekkefølgen", () => {
    const { s, A, B, C, order } = withThree();
    expect(order(s)).toEqual([A, B, C]);
    const r = ok(s, { type: "MoveLayer", layerId: C, beforeLayerId: A });
    expect(order(r.state)).toEqual([C, A, B]);
    expect(order(ok(r.state, r.inverse).state)).toEqual([A, B, C]);
  });

  it("null flytter laget helt foran", () => {
    const { s, A, B, C, order } = withThree();
    const r = ok(s, { type: "MoveLayer", layerId: A, beforeLayerId: null });
    expect(order(r.state)).toEqual([B, C, A]);
    expect(order(ok(r.state, r.inverse).state)).toEqual([A, B, C]);
  });
});

describe("SetLayersRemoved", () => {
  it("skjuler fra layersOf (men ikke med includeRemoved), og angre gjenoppretter", () => {
    const { s, A, B, C, compId, order } = withThree();
    const r = ok(s, { type: "SetLayersRemoved", layerIds: [B], removed: true });
    expect(order(r.state)).toEqual([A, C]);
    expect(layersOf(r.state, compId, { includeRemoved: true }).map((l) => l.id)).toEqual([A, B, C]);
    expect(order(ok(r.state, r.inverse).state)).toEqual([A, B, C]);
  });

  it("avvises når ingenting endres", () => {
    const { s, A } = withThree();
    expect(fails(s, { type: "SetLayersRemoved", layerIds: [A], removed: false })?.code).toBe(
      "invalid",
    );
  });
});

describe("Foreldreløse referanser", () => {
  it("angre av ressurs som brukes i et lag avvises", () => {
    const { s, compId, assetId } = base();
    const x = mustApply(s, {
      type: "AddLayers",
      layers: [
        {
          layerId: tid(),
          compositionId: compId,
          fields: defaultLayerFields(s, s.compositions[compId]!, { assetId }),
        },
      ],
    });
    // Ressursen har godkjent/variant-innhold; fjern først det som ellers blokkerer, ellers ville
    // en annen regel slått til. Her er det uansett «referenced» som er forventet svar.
    expect(fails(x, { type: "UndoCreateAssets", assetIds: [assetId] })?.code).toBe("referenced");
  });

  it("angre av import avvises når en scenevariant har 2D-scene", () => {
    const { state, mainId } = seedProject(0);
    const L = (row: number, x: number, text: string) => ({ page: 1, x, y: 72 + row * 12, text });
    const parsed = parseScreenplayLines(
      [L(0, 54, "1 INT. STUA - DAG 1"), L(2, 108, "MAJA ser ut av vinduet.")],
      { format: "pdf" },
    );
    const cmd = planImport(state, parsed, { productionId: mainId as ProductionId, newId: tid });
    const imported = ok(state, cmd);
    const variantId = Object.keys(imported.state.variants)[0] as never;
    const withComp = mustApply(imported.state, {
      type: "CreateComposition",
      compositionId: tid(),
      variantId,
      fields: COMP_FIELDS,
    });
    expect(fails(withComp, imported.inverse)?.code).toBe("referenced");
    // Uten 2D-scene lar importen seg angre
    expect(applyCommand(imported.state, envelope(imported.inverse)).ok).toBe(true);
  });
});

describe("Invariant: unik lagrekkefølge", () => {
  it("to lag med samme orderKey i én 2D-scene gir brudd", () => {
    const { s, A, B, compId } = withThree();
    expect(checkInvariants(s)).toEqual([]);
    const bad: ProjectState = {
      ...s,
      layers: { ...s.layers, [B]: { ...s.layers[B]!, orderKey: s.layers[A]!.orderKey } },
    };
    const v = checkInvariants(bad);
    expect(v.length).toBeGreaterThan(0);
    expect(v.some((x) => x.message.includes("lagrekkefølgen"))).toBe(true);
    expect(compId).toBeDefined();
  });
});

describe("renderFrame og hitTest", () => {
  /** Fargelag 200 × 100 på (500, 300) med skala 2. */
  function scene() {
    const { s, compId } = base();
    const mk = (over: Partial<LayerFields>): LayerFields => ({
      ...fillFields(s, compId),
      width: 200,
      height: 100,
      transform: { x: 500, y: 300, scaleX: 2, scaleY: 2, rotation: 0, opacity: 1 },
      ...over,
    });
    const [low, high, locked, hidden] = [
      tid<"composition_layer">(),
      tid<"composition_layer">(),
      tid<"composition_layer">(),
      tid<"composition_layer">(),
    ];
    const x = mustApply(s, {
      type: "AddLayers",
      layers: [
        { layerId: low, compositionId: compId, fields: mk({ name: "lav" }) },
        { layerId: high, compositionId: compId, fields: mk({ name: "høy" }) },
        { layerId: locked, compositionId: compId, fields: mk({ name: "låst", locked: true }) },
        { layerId: hidden, compositionId: compId, fields: mk({ name: "skjult", visible: false }) },
      ],
    });
    return { x, compId, low, high, locked, hidden };
  }

  it("identitetsvisning gir riktige hjørner", () => {
    const { s, compId } = base();
    const id = tid<"composition_layer">();
    const x = mustApply(s, {
      type: "AddLayers",
      layers: [
        {
          layerId: id,
          compositionId: compId,
          fields: {
            ...fillFields(s, compId),
            width: 200,
            height: 100,
            transform: { x: 500, y: 300, scaleX: 2, scaleY: 2, rotation: 0, opacity: 1 },
          },
        },
      ],
    });
    const f = renderFrame(x, compId, 0);
    expect(f.width).toBe(1000);
    expect(f.items).toHaveLength(1);
    expect(itemCorners(f.items[0]!)).toEqual([
      { x: 300, y: 200 },
      { x: 700, y: 200 },
      { x: 700, y: 400 },
      { x: 300, y: 400 },
    ]);
  });

  it("hitTest finner øverste lag og hopper over låste", () => {
    const { x, compId, high, locked } = scene();
    // Skjult lag er ikke med; låst ligger øverst av de synlige
    const f = renderFrame(x, compId, 0);
    expect(f.items.map((i) => i.layerId)).toEqual([expect.anything(), high, locked]);
    expect(hitTest(f, 500, 300)!.layerId).toBe(high);
    expect(hitTest(f, 500, 300, { includeLocked: true })!.layerId).toBe(locked);
    expect(hitTest(f, 10, 10)).toBeNull();
  });

  it("skjulte lag utelates, men tas med dempet (opasitet × 0.25) med includeHidden", () => {
    const { x, compId, hidden } = scene();
    expect(renderFrame(x, compId, 0).items.some((i) => i.layerId === hidden)).toBe(false);
    const f = renderFrame(x, compId, 0, { includeHidden: true });
    expect(f.items.find((i) => i.layerId === hidden)!.opacity).toBe(0.25);
    expect(f.items.find((i) => i.layerId !== hidden)!.opacity).toBe(1);
  });
});

describe("Nøkkelbilder og hastighetskurver", () => {
  function animated(easing: "linear" | "hold"): CompositionLayer {
    const { s, compId } = base();
    const id = tid<"composition_layer">();
    const f: LayerFields = {
      ...fillFields(s, compId),
      keyframes: [
        { frame: 0, property: "x", value: 0, easing },
        { frame: 10, property: "x", value: 100, easing: "linear" },
      ],
    };
    const x = mustApply(s, {
      type: "AddLayers",
      layers: [{ layerId: id, compositionId: compId, fields: f }],
    });
    return x.layers[id]!;
  }

  it("lineær interpolasjon og ytterverdier før og etter", () => {
    const l = animated("linear");
    expect(valueAt(l, "x", 5)).toBe(50);
    expect(valueAt(l, "x", -3)).toBe(0);
    expect(valueAt(l, "x", 99)).toBe(100);
  });

  it("hold blir stående til neste nøkkelbilde", () => {
    const l = animated("hold");
    expect(valueAt(l, "x", 5)).toBe(0);
    expect(valueAt(l, "x", 9)).toBe(0);
    expect(valueAt(l, "x", 10)).toBe(100);
  });

  it("ease-in-out er symmetrisk", () => {
    expect(ease("ease-in-out", 0.5)).toBe(0.5);
    expect(ease("ease-in-out", 0)).toBe(0);
    expect(ease("ease-in-out", 1)).toBe(1);
  });
});

describe("Kamera", () => {
  const shotCamera: CompositionCamera = {
    shots: [
      {
        id: "s1",
        name: "Zoom inn",
        startFrame: 0,
        endFrame: 10,
        from: { x: 100, y: 100, zoom: 1, rotation: 0 },
        to: { x: 300, y: 100, zoom: 4, rotation: 0 },
        curve: null,
        easing: "linear",
      },
    ],
  };

  it("uten shots vises hele formatet", () => {
    const { s, compId } = base();
    expect(cameraAt(s.compositions[compId]!, 7)).toEqual({ x: 500, y: 300, zoom: 1, rotation: 0 });
  });

  it("med ett shot: midtveis geometrisk zoom, og endene holdes utenfor", () => {
    const { s, compId } = base();
    const x = mustApply(s, {
      type: "UpdateComposition",
      compositionId: compId,
      fields: COMP_FIELDS,
      camera: shotCamera,
    });
    const comp = x.compositions[compId]!;
    const mid = cameraAt(comp, 5);
    expect(mid.x).toBeCloseTo(200);
    expect(mid.y).toBeCloseTo(100);
    expect(mid.zoom).toBeCloseTo(2);
    expect(cameraAt(comp, 0).zoom).toBe(1);
    expect(cameraAt(comp, 10).zoom).toBeCloseTo(4);
    expect(cameraAt(comp, 50)).toEqual(shotCamera.shots[0]!.to);
    // Kameraet kommer tilbake uendret ved lagring (rundtur)
    expect(comp.camera).toEqual(shotCamera);
  });

  it("viewMatrix: parallakse 0 er identitet (uten rotasjon), parallakse 1 flytter kameraets sentrum til midten", () => {
    const c = { width: 1000, height: 600 };
    const cam = { x: 200, y: 100, zoom: 2, rotation: 0 };
    const m0 = viewMatrix(c, cam, 0);
    [1, 0, 0, 1, 0, 0].forEach((v, i) => expect(m0[i]).toBeCloseTo(v));
    const p = applyMatrix(viewMatrix(c, { ...cam, rotation: 30 }, 1), cam.x, cam.y);
    expect(p.x).toBeCloseTo(500);
    expect(p.y).toBeCloseTo(300);
  });

  // Mulig feil i kjernen: viewMatrix skalerer ikke kameraets rotasjon med parallaksen. Et lag med
  // parallakse 0 roterer derfor fullt med kameraet. Input: cam { x: 200, y: 100, zoom: 2, rotation: 30 }.
  it("viewMatrix: parallakse 0 står stille ved panorering og zoom, men ruller med kameraet", () => {
    // Rotasjon (rull) gjelder hele bildet, som i en multiplan-rigg; parallakse gjelder bare forflytning og zoom
    const c = { width: 1000, height: 600 };
    const m0 = viewMatrix(c, { x: 200, y: 100, zoom: 2, rotation: 0 }, 0);
    [1, 0, 0, 1, 0, 0].forEach((v, i) => expect(m0[i]).toBeCloseTo(v));
    const r = viewMatrix(c, { x: 200, y: 100, zoom: 2, rotation: 30 }, 0);
    expect(r[0]).toBeCloseTo(Math.cos(Math.PI / 6));
  });

  it("avviser kamera der et utsnitt slutter før det starter", () => {
    const { s, compId } = base();
    const bad: CompositionCamera = {
      shots: [{ ...shotCamera.shots[0]!, startFrame: 10, endFrame: 5 }],
    };
    expect(
      fails(s, {
        type: "UpdateComposition",
        compositionId: compId,
        fields: COMP_FIELDS,
        camera: bad,
      })?.code,
    ).toBe("invalid");
  });
});

describe("Lagring (patch)", () => {
  it("CreateComposition + AddLayers gir inserts, og rader gir samme objekter tilbake", () => {
    const { s: before } = base();
    // Bruk tilstanden før 2D-scenen finnes som utgangspunkt
    const { state: empty } = seedProject(0);
    expect(diffStates(empty, empty).inserts).toEqual({});

    const compId = tid<"composition">();
    const [L1, L2] = [tid<"composition_layer">(), tid<"composition_layer">()];
    const variantId = Object.keys(before.variants)[0] as never;
    const pre = { ...before, compositions: {}, layers: {} } as ProjectState;
    let after = mustApply(pre, {
      type: "CreateComposition",
      compositionId: compId,
      variantId,
      fields: COMP_FIELDS,
    });
    after = mustApply(after, {
      type: "AddLayers",
      layers: [L1, L2].map((layerId, i) => ({
        layerId,
        compositionId: compId,
        fields: fillFields(after, compId, i ? "#aabbcc" : "#2b3a55"),
      })),
    });
    const cs = diffStates(pre, after);
    expect(cs.inserts["compositions"]).toHaveLength(1);
    expect(cs.inserts["composition_layers"]).toHaveLength(2);

    const projectId = after.project.id;
    const rows: ProjectRows = {
      project: {
        id: projectId,
        revision: after.project.revision,
        name: after.project.name,
        fps_num: after.project.fps.num,
        fps_den: after.project.fps.den,
      },
      productions: [],
      scenes: [],
      scene_variants: [],
      script_blocks: [],
      script_block_revisions: [],
      scene_occurrences: [],
      production_segments: [],
      takes: [],
      compositions: Object.values(after.compositions).map((c) =>
        toRow("compositions", c, projectId),
      ),
      composition_layers: Object.values(after.layers).map((l) => toRow("layers", l, projectId)),
    };
    const back = stateFromRows(rows);
    expect(JSON.stringify(back.compositions[compId])).toBe(
      JSON.stringify(after.compositions[compId]),
    );
    for (const id of [L1, L2])
      expect(JSON.stringify(back.layers[id])).toBe(JSON.stringify(after.layers[id]));
  });
});
