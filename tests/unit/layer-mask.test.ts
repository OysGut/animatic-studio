// @vitest-environment node
/** Maskering og blandingsmodus for lag (REQ-0175, mandat 11.2). */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyCommand,
  defaultLayerFields,
  layerFieldsOf,
  maskOutline,
  normalizeMask,
  compositionCopyCommands,
  renderFrame,
  stateFromRows,
  toRow,
  type Command,
  type CompositionFields,
  type LayerFields,
  type LayerMask,
  type ProjectRows,
  type ProjectState,
} from "@/core";
import { drawFrame } from "@/engine/compositor/canvas";
import { needsSchema26 } from "@/adapters/storage/commands.functions";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

const COMP: CompositionFields = {
  name: "Stua",
  width: 1000,
  height: 600,
  durationFrames: 100,
  background: "#101114",
};

function fails(s: ProjectState, c: Command): string {
  const r = applyCommand(s, envelope(c));
  if (r.ok) throw new Error(`${c.type} skulle feilet`);
  return r.error.message;
}

/** 2D-scene med tre fargelag A, B, C (200 × 100 hver). */
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
  const [A, B, C] = [
    tid<"composition_layer">(),
    tid<"composition_layer">(),
    tid<"composition_layer">(),
  ];
  const f: LayerFields = {
    ...defaultLayerFields(s, s.compositions[compId]!, { fill: "#ff0000" }),
    width: 200,
    height: 100,
  };
  s = mustApply(s, {
    type: "AddLayers",
    layers: [A, B, C].map((layerId) => ({ layerId, compositionId: compId, fields: f })),
  });
  return { s, compId, A, B, C, variantId };
}

const rect: LayerMask = {
  kind: "rect",
  x: 20,
  y: 10,
  width: 100,
  height: 50,
  feather: 8,
  invert: false,
};

function update(s: ProjectState, id: string, patch: Partial<LayerFields>): Command {
  return {
    type: "UpdateLayers",
    layers: [{ layerId: id as never, fields: { ...layerFieldsOf(s.layers[id]!), ...patch } }],
  };
}

describe("validering av masker", () => {
  it("godtar rektangel, ellipse og lag; avviser ugyldige typer, NaN og negative størrelser", () => {
    expect(normalizeMask(rect).ok).toBe(true);
    expect(normalizeMask({ ...rect, kind: "ellipse", feather: 0 }).ok).toBe(true);
    expect(normalizeMask({ kind: "layer", layerId: "x", invert: true }).ok).toBe(true);
    expect(normalizeMask(null)).toEqual({ ok: true, value: null });
    const bad: unknown[] = [
      { ...rect, kind: "star" },
      { ...rect, x: Number.NaN },
      { ...rect, width: -5 },
      { ...rect, height: 0 },
      { ...rect, feather: 201 },
      { ...rect, feather: -1 },
      { kind: "layer", layerId: "", invert: false },
      { ...rect, invert: "ja" },
    ];
    for (const m of bad) expect(normalizeMask(m as LayerMask).ok).toBe(false);
  });

  it("avviser ugyldig maske og blandingsmodus i kommandoen", () => {
    const { s, A } = setup();
    expect(fails(s, update(s, A, { mask: { ...rect, width: -1 } }))).toMatch(/bredde og høyde/);
    expect(fails(s, update(s, A, { blend: "dodge" as never }))).toMatch(/blandingsmodus/);
  });

  it("et lag kan ikke maskere seg selv, og masker kan ikke gå i ring", () => {
    const { s, A, B, C } = setup();
    expect(fails(s, update(s, A, { mask: { kind: "layer", layerId: A, invert: false } }))).toMatch(
      /seg selv/,
    );
    const s1 = mustApply(s, update(s, A, { mask: { kind: "layer", layerId: B, invert: false } }));
    expect(
      fails(s1, update(s1, B, { mask: { kind: "layer", layerId: A, invert: false } })),
    ).toMatch(/ring/);
    const s2 = mustApply(s1, update(s1, B, { mask: { kind: "layer", layerId: C, invert: false } }));
    expect(
      fails(s2, update(s2, C, { mask: { kind: "layer", layerId: A, invert: false } })),
    ).toMatch(/ring/);
  });

  it("maskelaget må finnes i samme 2D-scene", () => {
    const { s, A } = setup();
    expect(
      fails(s, update(s, A, { mask: { kind: "layer", layerId: tid(), invert: false } })),
    ).toMatch(/finnes ikke/);
    // Lag i en annen 2D-scene
    const { state } = seedProject(2);
    const variants = Object.keys(state.variants) as never[];
    const [c1, c2] = [tid<"composition">(), tid<"composition">()];
    let t = mustApply(state, {
      type: "CreateComposition",
      compositionId: c1,
      variantId: variants[0]!,
      fields: COMP,
    });
    t = mustApply(t, {
      type: "CreateComposition",
      compositionId: c2,
      variantId: variants[1]!,
      fields: COMP,
    });
    const [X, Y] = [tid<"composition_layer">(), tid<"composition_layer">()];
    const f = defaultLayerFields(t, t.compositions[c1]!, { fill: "#00ff00" });
    t = mustApply(t, {
      type: "AddLayers",
      layers: [
        { layerId: X, compositionId: c1, fields: f },
        { layerId: Y, compositionId: c2, fields: f },
      ],
    });
    expect(fails(t, update(t, X, { mask: { kind: "layer", layerId: Y, invert: false } }))).toMatch(
      /finnes ikke i denne 2D-scenen/,
    );
  });

  it("en gruppe kan ikke ha maske eller blanding", () => {
    const { s, compId } = setup();
    const G = tid<"composition_layer">();
    const g: LayerFields = {
      ...defaultLayerFields(s, s.compositions[compId]!, { fill: "#000000" }),
      kind: "group",
      fill: null,
      anchor: { x: 0, y: 0 },
      blend: "multiply",
    };
    expect(
      fails(s, { type: "AddLayers", layers: [{ layerId: G, compositionId: compId, fields: g }] }),
    ).toMatch(/gruppe/i);
  });
});

describe("angre og lagring", () => {
  it("angre gir tilbake forrige maske og blanding; utelatt felt = uendret", () => {
    const { s, A, B } = setup();
    const r1 = applyCommand(s, envelope(update(s, A, { mask: rect, blend: "multiply" })));
    if (!r1.ok) throw new Error(r1.error.message);
    expect(r1.state.layers[A]!.mask).toEqual(rect);
    expect(r1.state.layers[A]!.blend).toBe("multiply");
    // Endring uten maske/blanding i feltene (eldre klient) beholder dem
    const { mask: _m, blend: _b, ...plain } = layerFieldsOf(r1.state.layers[A]!);
    const kept = mustApply(r1.state, {
      type: "UpdateLayers",
      layers: [{ layerId: A as never, fields: { ...plain, name: "Nytt navn" } }],
    });
    expect(kept.layers[A]!.mask).toEqual(rect);
    expect(kept.layers[A]!.blend).toBe("multiply");
    const back = mustApply(r1.state, r1.inverse);
    expect(back.layers[A]!.mask).toBeUndefined();
    expect(back.layers[A]!.blend).toBeUndefined();
    expect(JSON.stringify(layerFieldsOf(back.layers[A]!))).toBe(
      JSON.stringify(layerFieldsOf(s.layers[A]!)),
    );
    // Bytte fra én maske til en annen og angre
    const r2 = applyCommand(
      r1.state,
      envelope(
        update(r1.state, A, { mask: { kind: "layer", layerId: B, invert: true }, blend: "screen" }),
      ),
    );
    if (!r2.ok) throw new Error(r2.error.message);
    const back2 = mustApply(r2.state, r2.inverse);
    expect(back2.layers[A]!.mask).toEqual(rect);
    expect(back2.layers[A]!.blend).toBe("multiply");
  });

  it("radene tar med maske og blanding begge veier", () => {
    const { s, A, B } = setup();
    const t = mustApply(
      mustApply(
        s,
        update(s, A, { mask: { kind: "layer", layerId: B, invert: true }, blend: "soft-light" }),
      ),
      update(s, B, { mask: rect }),
    );
    const projectId = t.project.id;
    const rowA = toRow("layers", t.layers[A]!, projectId);
    expect(rowA["mask"]).toEqual({ kind: "layer", layerId: B, invert: true });
    expect(rowA["blend"]).toBe("soft-light");
    const rows = {
      project: {
        id: projectId,
        revision: t.project.revision,
        name: t.project.name,
        fps_num: t.project.fps.num,
        fps_den: t.project.fps.den,
      },
      productions: [],
      scenes: [],
      scene_variants: [],
      script_blocks: [],
      script_block_revisions: [],
      scene_occurrences: [],
      production_segments: [],
      takes: [],
      compositions: Object.values(t.compositions).map((c) => toRow("compositions", c, projectId)),
      composition_layers: Object.values(t.layers).map((l) => toRow("layers", l, projectId)),
    } as unknown as ProjectRows;
    const back = stateFromRows(rows);
    for (const id of Object.keys(t.layers)) expect(back.layers[id]).toEqual(t.layers[id]);
    // Eldre database uten kolonnene / standardverdier: ingen maske
    const old = stateFromRows({
      ...rows,
      composition_layers: (rows.composition_layers ?? []).map((r) => ({
        ...r,
        mask: undefined,
        blend: "normal",
      })),
    } as ProjectRows);
    expect(old.layers[A]!.mask).toBeUndefined();
    expect(old.layers[A]!.blend).toBeUndefined();
  });

  it("kopi av 2D-scenen peker maskene til lagene i kopien", () => {
    const { state } = seedProject(2);
    const [v1, v2] = Object.keys(state.variants) as never[];
    const compId = tid<"composition">();
    let t = mustApply(state, {
      type: "CreateComposition",
      compositionId: compId,
      variantId: v1!,
      fields: COMP,
    });
    const [A, B] = [tid<"composition_layer">(), tid<"composition_layer">()];
    const f = defaultLayerFields(t, t.compositions[compId]!, { fill: "#00ff00" });
    t = mustApply(t, {
      type: "AddLayers",
      layers: [
        { layerId: A, compositionId: compId, fields: f },
        { layerId: B, compositionId: compId, fields: f },
      ],
    });
    t = mustApply(t, update(t, A, { mask: { kind: "layer", layerId: B, invert: false } }));
    let u = t;
    for (const c of compositionCopyCommands(t, compId, v2!)) u = mustApply(u, c);
    const copy = Object.values(u.layers).find(
      (l) => l.compositionId !== compId && l.mask?.kind === "layer",
    )!;
    expect(copy).toBeDefined();
    if (copy.mask?.kind === "layer") {
      expect(copy.mask.layerId).not.toBe(B);
      expect(u.layers[copy.mask.layerId]!.compositionId).toBe(copy.compositionId);
    }
  });
});

describe("databasen", () => {
  it("maske eller annen blanding enn normal krever migrasjon 0026", () => {
    const { s, A } = setup();
    const plain = layerFieldsOf(s.layers[A]!);
    const cmd = (fields: LayerFields) =>
      ({ type: "UpdateLayers", layers: [{ layerId: A, fields }] }) as never;
    expect(needsSchema26(cmd(plain))).toBe(false);
    expect(needsSchema26(cmd({ ...plain, mask: null, blend: "normal" }))).toBe(false);
    expect(needsSchema26(cmd({ ...plain, mask: rect }))).toBe(true);
    expect(needsSchema26(cmd({ ...plain, blend: "screen" }))).toBe(true);
    expect(needsSchema26({ type: "MoveLayer" } as never)).toBe(false);
  });
});

describe("rendring", () => {
  it("tegnelisten har maske i lagets koordinater og blandingsmodus; slettet maskelag gir ingen maske", () => {
    const { s, compId, A, B } = setup();
    let t = mustApply(s, update(s, A, { mask: rect, blend: "overlay" }));
    t = mustApply(t, update(t, B, { mask: { kind: "layer", layerId: A, invert: false } }));
    const frame = renderFrame(t, compId, 0, { view: "camera" });
    const a = frame.items.find((i) => i.layerId === A)!;
    expect(a.blend).toBe("overlay");
    // (20, 10) fra øverste venstre hjørne av et lag på 200 × 100 = (-80, -40) fra midten
    expect(a.mask).toEqual({
      kind: "rect",
      x: -80,
      y: -40,
      width: 100,
      height: 50,
      feather: 8,
      invert: false,
    });
    const outline = maskOutline(a)!;
    const m = a.matrix;
    expect(outline[0]).toEqual({
      x: m[0] * -80 + m[2] * -40 + m[4],
      y: m[1] * -80 + m[3] * -40 + m[5],
    });
    const b = frame.items.find((i) => i.layerId === B)!;
    expect(b.mask?.kind).toBe("layer");
    if (b.mask?.kind === "layer") expect(b.mask.item.layerId).toBe(A);
    // Maskelaget slettes: laget vises uten maske (ingen krasj)
    const gone = mustApply(t, { type: "SetLayersRemoved", layerIds: [A as never], removed: true });
    const f2 = renderFrame(gone, compId, 0, { view: "camera" });
    expect(f2.items.find((i) => i.layerId === B)!.mask).toBeUndefined();
  });

  it("masken følger laget når det flyttes og skaleres", () => {
    const { s, compId, A } = setup();
    const t = mustApply(s, update(s, A, { mask: { ...rect, kind: "ellipse" } }));
    const moved = mustApply(
      t,
      update(t, A, {
        transform: { ...t.layers[A]!.transform, x: 300, y: 200, scaleX: 2, scaleY: 2, rotation: 0 },
      }),
    );
    const it1 = renderFrame(moved, compId, 0).items.find((i) => i.layerId === A)!;
    const o = maskOutline(it1, 4)!;
    // Ellipsens midtpunkt (70, 35) i laget = (-30, -15) fra midten, skalert 2 og flyttet til (300, 200)
    const cx = (o[0]!.x + o[2]!.x) / 2;
    const cy = (o[1]!.y + o[3]!.y) / 2;
    expect(cx).toBeCloseTo(240);
    expect(cy).toBeCloseTo(170);
    expect(o[0]!.x - o[2]!.x).toBeCloseTo(200); // bredde 100 · 2
  });

  describe("på lerretet", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("bruker blandingsmodus og maskerer på et hjelpelerret (destination-in / -out)", () => {
      const log: string[] = [];
      const fakeCtx = (canvas: { width: number; height: number }) => {
        const ctx: Record<string, unknown> = { canvas };
        const props = [
          "globalAlpha",
          "fillStyle",
          "strokeStyle",
          "lineWidth",
          "font",
          "textAlign",
          "textBaseline",
          "shadowColor",
          "shadowBlur",
          "shadowOffsetX",
          "shadowOffsetY",
        ];
        for (const p of props) ctx[p] = 0;
        let op = "source-over";
        Object.defineProperty(ctx, "globalCompositeOperation", {
          get: () => op,
          set: (v: string) => {
            op = v;
            log.push(`op:${v}`);
          },
        });
        for (const fn of [
          "save",
          "restore",
          "setTransform",
          "transform",
          "beginPath",
          "rect",
          "ellipse",
          "fill",
          "clearRect",
          "strokeRect",
          "setLineDash",
          "fillText",
        ])
          ctx[fn] = () => log.push(fn);
        ctx["fillRect"] = () => log.push(`fillRect@${op}`);
        ctx["drawImage"] = () => log.push(`drawImage@${op}`);
        return ctx;
      };
      class FakeOffscreen {
        constructor(
          public width: number,
          public height: number,
        ) {}
        private c: unknown;
        getContext() {
          return (this.c ??= fakeCtx(this));
        }
      }
      vi.stubGlobal("OffscreenCanvas", FakeOffscreen);
      const { s, compId, A, B, C } = setup();
      let t = mustApply(s, update(s, A, { blend: "multiply" }));
      t = mustApply(t, update(t, B, { mask: { ...rect, invert: true } }));
      t = mustApply(t, update(t, C, { mask: { kind: "layer", layerId: A, invert: false } }));
      const main = fakeCtx({ width: 1000, height: 600 });
      drawFrame(
        main as unknown as CanvasRenderingContext2D,
        renderFrame(t, compId, 0, { view: "camera" }),
        {
          images: new Map(),
        },
      );
      const text = log.join(" ");
      expect(text).toContain("op:multiply");
      expect(text).toContain("op:destination-out"); // snudd rektangelmaske
      expect(text).toContain("op:destination-in"); // maskelag
      expect(text).toContain("fillRect@destination-in"); // maskelaget (fargeflate) som maske
      expect(text).toContain("drawImage@destination-out"); // myk kant fra hjelpelerretet
    });
  });
});
