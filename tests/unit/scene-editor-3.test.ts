// @vitest-environment node
/**
 * Sceneeditor del 3 (DEC-0052): bildeskifte i lag, grupper, bevegelsesbane med tempo og ease med styrke.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPOSITION,
  applyCommand,
  defaultLayerFields,
  easeStrength,
  layerFieldsOf,
  layerVersions,
  pathPointAt,
  pathProgress,
  renderFrame,
  scriptView,
  stateFromRows,
  tempoAt,
  toRow,
  transformAt,
  valueAt,
  type Command,
  type LayerFields,
  type MotionPath,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

function fails(s: ProjectState, c: Command) {
  const r = applyCommand(s, envelope(c));
  expect(r.ok).toBe(false);
  return r.ok ? "" : r.error.message;
}

function base() {
  const seed = seedProject(1);
  const occ = scriptView(seed.state, seed.mainId)[0]!.occurrenceId;
  const compId = tid<"composition">();
  let s = mustApply(seed.state, {
    type: "CreateComposition",
    compositionId: compId,
    variantId: seed.state.occurrences[occ]!.variantId,
    fields: { ...DEFAULT_COMPOSITION, width: 1000, height: 500, durationFrames: 100 },
  });
  // To bilder i biblioteket (versjoner med størrelse)
  const assets = [tid<"asset">(), tid<"asset">()];
  const versions: string[] = [];
  for (const [i, assetId] of assets.entries()) {
    const variantId = tid<"asset_variant">();
    const versionId = tid<"asset_version">();
    versions.push(versionId);
    s = mustApply(s, {
      type: "CreateAssets",
      assets: [
        {
          assetId,
          fields: {
            kind: "object",
            name: i === 0 ? "Kopp" : "Kopp knust",
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
      variantId,
      assetId,
      fields: { name: "Standard", style: "animatic", appearance: "" },
    });
    s = mustApply(s, {
      type: "AddAssetVersion",
      versionId,
      variantId,
      media: {
        path: `${s.project.id}/${assetId}/${versionId}/kopp.png`,
        mimeType: "image/png",
        width: 100 + i * 100,
        height: 100,
        byteSize: 10,
        sha256: "a".repeat(64),
      },
      note: "",
    });
  }
  return { ...seed, s, compId, assets, versions, comp: s.compositions[compId]! };
}

function addLayer(s: ProjectState, compId: string, fields: LayerFields) {
  const layerId = tid<"composition_layer">();
  return {
    s: mustApply(s, {
      type: "AddLayers",
      layers: [{ layerId, compositionId: compId as never, fields }],
    }),
    layerId,
  };
}

describe("bildeskifte i lag (REQ-0579)", () => {
  it("laget bytter bilde på skiftet (hardt kutt), og begge bildene lastes", () => {
    const b = base();
    const { s: s1, layerId } = addLayer(
      b.s,
      b.compId,
      defaultLayerFields(b.s, b.comp, { assetId: b.assets[0]! }),
    );
    const l = s1.layers[layerId]!;
    const s = mustApply(s1, {
      type: "UpdateLayers",
      layers: [
        {
          layerId,
          fields: {
            ...layerFieldsOf(l),
            swaps: [
              { frame: 40, assetId: b.assets[1]! as never, assetVariantId: null, versionId: null },
            ],
          },
        },
      ],
    });
    const at = (f: number) => renderFrame(s, b.compId, f).items.find((i) => i.layerId === layerId)!;
    expect(at(39).width).toBe(100);
    // Det nye bildet får plass i lagets egen ramme (100 × 100) med sitt sideforhold (2:1)
    expect(at(40).version?.width).toBe(200);
    expect([at(40).width, at(40).height]).toEqual([100, 50]);
    expect(layerVersions(s, s.layers[layerId]!).map((v) => v.width)).toEqual([100, 200]);
  });

  it("ugyldige skifter avvises", () => {
    const b = base();
    const { s, layerId } = addLayer(
      b.s,
      b.compId,
      defaultLayerFields(b.s, b.comp, { assetId: b.assets[0]! }),
    );
    const f = layerFieldsOf(s.layers[layerId]!);
    const w = { assetId: b.assets[1]! as never, assetVariantId: null, versionId: null };
    expect(
      fails(s, {
        type: "UpdateLayers",
        layers: [{ layerId, fields: { ...f, swaps: [{ ...w, frame: 0 }] } }],
      }),
    ).toMatch(/Ugyldig bildeskifte/);
    expect(
      fails(s, {
        type: "UpdateLayers",
        layers: [
          {
            layerId,
            fields: {
              ...f,
              swaps: [
                { ...w, frame: 5 },
                { ...w, frame: 5 },
              ],
            },
          },
        ],
      }),
    ).toMatch(/samme bilde/);
  });
});

describe("grupper (REQ-0174)", () => {
  it("lagene i gruppen følger gruppens flytting, skalering og synlighet", () => {
    const b = base();
    const center = { x: 500, y: 250 };
    const g = addLayer(b.s, b.compId, {
      ...defaultLayerFields(b.s, b.comp, { fill: "#000000" }),
      kind: "group",
      name: "Familien",
      fill: null,
      width: 1,
      height: 1,
      transform: { x: center.x, y: center.y, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
      anchor: center,
    });
    const child = defaultLayerFields(g.s, b.comp, { fill: "#ff0000", name: "Maja" });
    const c = addLayer(g.s, b.compId, {
      ...child,
      width: 100,
      height: 100,
      transform: { ...child.transform, x: 600, y: 250 },
      groupId: g.layerId,
    });
    let s = c.s;
    const item = (st: ProjectState) =>
      renderFrame(st, b.compId, 0).items.find((i) => i.layerId === c.layerId)!;
    // I hvile: uendret
    expect(item(s).matrix[4]).toBeCloseTo(600, 6);
    // Gruppen flyttes 100 til høyre og skaleres 2× rundt ankeret
    const gl = s.layers[g.layerId]!;
    s = mustApply(s, {
      type: "UpdateLayers",
      layers: [
        {
          layerId: g.layerId,
          fields: {
            ...layerFieldsOf(gl),
            transform: { ...gl.transform, x: 600, scaleX: 2, scaleY: 2 },
          },
        },
      ],
    });
    // Barnet: 100 fra ankeret → 200 fra gruppens nye sted (600) = 800
    expect(item(s).matrix[4]).toBeCloseTo(800, 6);
    expect(item(s).matrix[0]).toBeCloseTo(2, 6);
    // Gruppen gjemt: barnet gjemt
    s = mustApply(s, {
      type: "UpdateLayers",
      layers: [
        { layerId: g.layerId, fields: { ...layerFieldsOf(s.layers[g.layerId]!), visible: false } },
      ],
    });
    expect(renderFrame(s, b.compId, 0).items.some((i) => i.layerId === c.layerId)).toBe(false);
    // Gruppen tegnes ikke, men har en ramme i editoren
    const items = renderFrame(c.s, b.compId, 0).items;
    expect(items.find((i) => i.layerId === g.layerId)?.kind).toBe("group");
    expect(
      renderFrame(c.s, b.compId, 0, { view: "camera" }).items.some((i) => i.layerId === g.layerId),
    ).toBe(false);
  });

  it("et lag kan bare legges i en gruppe i samme 2D-scene; grupper kan ikke ligge i grupper", () => {
    const b = base();
    const { s, layerId } = addLayer(
      b.s,
      b.compId,
      defaultLayerFields(b.s, b.comp, { fill: "#111111" }),
    );
    const f = layerFieldsOf(s.layers[layerId]!);
    expect(
      fails(s, { type: "UpdateLayers", layers: [{ layerId, fields: { ...f, groupId: layerId } }] }),
    ).toMatch(/Gruppen finnes ikke/);
    expect(
      fails(s, {
        type: "AddLayers",
        layers: [
          {
            layerId: tid(),
            compositionId: b.compId as never,
            fields: { ...f, kind: "group", fill: null, groupId: layerId },
          },
        ],
      }),
    ).toMatch(/gruppe kan ikke ligge i en gruppe/);
  });
});

describe("bevegelsesbane og tempo (REQ-0581/0582)", () => {
  const path: MotionPath = {
    points: [
      { x: 0, y: 0, smooth: false },
      { x: 100, y: 0, smooth: false },
      { x: 100, y: 100, smooth: false },
    ],
    startFrame: 10,
    endFrame: 30,
    easeOut: 0,
    easeIn: 0,
    tempo: [],
  };

  it("jevn fart langs banen; før og etter holdes start og slutt", () => {
    const start = pathPointAt(path, pathProgress(path, 0));
    expect(start.x).toBeCloseTo(0, 6);
    expect(start.y).toBeCloseTo(0, 6);
    const mid = pathPointAt(path, pathProgress(path, 20));
    expect(mid.x).toBeCloseTo(100, 3);
    expect(mid.y).toBeCloseTo(0, 3);
    const end = pathPointAt(path, pathProgress(path, 99));
    expect(end.x).toBeCloseTo(100, 6);
    expect(end.y).toBeCloseTo(100, 6);
  });

  it("tempokurven: et punkt dratt mot starten gir rask start og langsom slutt", () => {
    expect(tempoAt([], 0.3)).toBeCloseTo(0.3, 6);
    const tempo = [{ t: 0.25, p: 0.75 }];
    expect(tempoAt(tempo, 0.25)).toBeCloseTo(0.75, 6);
    // Monoton
    let prev = 0;
    for (let i = 0; i <= 100; i++) {
      const v = tempoAt(tempo, i / 100);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
    const fast = { ...path, tempo };
    expect(pathProgress(fast, 15)).toBeCloseTo(0.75, 3);
  });

  it("ease med styrke: 0/0 er lineær, høyere styrke gir mykere start og slutt", () => {
    expect(easeStrength(0, 0, 0.3)).toBeCloseTo(0.3, 4);
    expect(easeStrength(0.8, 0, 0.2)).toBeLessThan(0.2);
    expect(easeStrength(0, 0.8, 0.8)).toBeGreaterThan(0.8);
  });

  it("banen styrer lagets posisjon og lagres og leses tilbake", () => {
    const b = base();
    const f = defaultLayerFields(b.s, b.comp, { fill: "#222222" });
    const { s, layerId } = addLayer(b.s, b.compId, { ...f, path });
    const l = s.layers[layerId]!;
    expect(transformAt(l, 20).x).toBeCloseTo(100, 3);
    const back = stateFromRows({
      project: { id: s.project.id, name: "x", fps_num: 25, fps_den: 1, revision: 1 },
      productions: [],
      scenes: [],
      scene_variants: [],
      script_blocks: [],
      script_block_revisions: [],
      scene_occurrences: [],
      production_segments: [],
      takes: [],
      composition_layers: [JSON.parse(JSON.stringify(toRow("layers", l, s.project.id)))],
    });
    expect(back.layers[layerId]).toEqual(l);
    expect(
      fails(s, {
        type: "UpdateLayers",
        layers: [{ layerId, fields: { ...layerFieldsOf(l), path: { ...path, endFrame: 5 } } }],
      }),
    ).toMatch(/slutte etter/);
    expect(
      fails(s, {
        type: "UpdateLayers",
        layers: [
          {
            layerId,
            fields: {
              ...layerFieldsOf(l),
              path: {
                ...path,
                tempo: [
                  { t: 0.5, p: 0.6 },
                  { t: 0.4, p: 0.7 },
                ],
              },
            },
          },
        ],
      }),
    ).toMatch(/stige/);
  });

  it("nøkkelbilder med ease-styrke", () => {
    const b = base();
    const f = defaultLayerFields(b.s, b.comp, { fill: "#222222" });
    const { s, layerId } = addLayer(b.s, b.compId, {
      ...f,
      keyframes: [
        { frame: 0, property: "x", value: 0, easing: "linear", easeOut: 0.9 },
        { frame: 10, property: "x", value: 100, easing: "linear" },
      ],
    });
    const l = s.layers[layerId]!;
    expect(l.keyframes[0]!.easeOut).toBe(0.9);
    expect(valueAt(l, "x", 2)).toBeLessThan(20);
  });
});

describe("bevegelsesbane: tegning, glatt ut og formatbytte (DEC-0052)", () => {
  it("frihåndstegning forenkles til få, kurvede punkter", async () => {
    const { pathPointsFromDrawing, smoothPathPoints, straightPathPoints } = await import("@/core");
    const raw = Array.from({ length: 200 }, (_, i) => ({ x: i * 5, y: Math.sin(i / 20) * 100 }));
    const pts = pathPointsFromDrawing(raw)!;
    expect(pts.length).toBeGreaterThan(2);
    expect(pts.length).toBeLessThan(60);
    expect(pts.every((p) => p.smooth)).toBe(true);
    expect(pts[0]).toMatchObject({ x: 0, y: 0 });
    const smooth = smoothPathPoints(pts);
    expect(smooth.length).toBeLessThanOrEqual(pts.length);
    const straight = straightPathPoints(pts);
    expect(straight).toHaveLength(2);
    expect(straight.every((p) => !p.smooth)).toBe(true);
    // For kort tegning blir ingen bane
    expect(
      pathPointsFromDrawing([
        { x: 1, y: 1 },
        { x: 1.2, y: 1 },
      ]),
    ).toBeNull();
  });

  it("ny bane varer to sekunder fra avspillingshodet, men ikke forbi scenen", async () => {
    const { newMotionPath } = await import("@/core");
    const pts = [
      { x: 0, y: 0, smooth: true },
      { x: 10, y: 0, smooth: true },
    ];
    expect(newMotionPath(pts, 10, 250, 25)).toMatchObject({ startFrame: 10, endFrame: 60 });
    const late = newMotionPath(pts, 240, 250, 25);
    expect(late.endFrame).toBe(249);
    expect(late.startFrame).toBeLessThan(late.endFrame);
  });

  it("formatbytte flytter banen, ankerpunktet og bildeskiftene, men skalerer ikke gruppen to ganger", async () => {
    const { formatMapping, rescaleLayer, renderFrame: rf } = await import("@/core");
    const m = formatMapping(
      { width: 1920, height: 1080, fps: { num: 25, den: 1 } },
      { width: 3840, height: 2160, fps: { num: 50, den: 1 } },
    );
    const base = {
      id: tid<"composition_layer">(),
      revision: 1,
      compositionId: tid<"composition">(),
      orderKey: "a0",
      name: "G",
      assetId: null,
      assetVariantId: null,
      versionId: null,
      fill: null,
      width: 1,
      height: 1,
      parallax: 1,
      keyframes: [],
      visible: true,
      locked: false,
      groupId: null,
      removed: false,
    };
    const g = rescaleLayer(
      {
        ...base,
        kind: "group",
        transform: { x: 500, y: 300, scaleX: 2, scaleY: 2, rotation: 0, opacity: 1 },
        swaps: [],
        path: {
          points: [
            { x: 0, y: 0, smooth: true },
            { x: 100, y: 50, smooth: false },
          ],
          startFrame: 10,
          endFrame: 20,
          easeOut: 0.3,
          easeIn: 0,
          tempo: [],
        },
        anchor: { x: 400, y: 200 },
      } as never,
      m,
    );
    expect(g.transform.scaleX).toBe(2);
    expect(g.anchor).toEqual({ x: 800, y: 400 });
    expect(g.path!.points[1]).toMatchObject({ x: 200, y: 100 });
    expect(g.path).toMatchObject({ startFrame: 20, endFrame: 40, easeOut: 0.3 });
    void rf;
  });

  it("ease-styrke på nøkkelbilder kan settes og fjernes", async () => {
    const { setKeyframeEase } = await import("@/core");
    const keys = [
      { property: "x" as const, frame: 0, value: 0, easing: "linear" as const },
      { property: "y" as const, frame: 0, value: 0, easing: "linear" as const },
      { property: "x" as const, frame: 10, value: 100, easing: "linear" as const },
    ];
    const a = setKeyframeEase(keys, 0, { easeOut: 0.8 });
    expect(a[0]!.easeOut).toBe(0.8);
    expect(a[1]!.easeOut).toBe(0.8);
    expect(a[2]!.easeOut).toBeUndefined();
    const b = setKeyframeEase(a, 0, { easeOut: null });
    expect("easeOut" in b[0]!).toBe(false);
    expect(setKeyframeEase(keys, 0, { easeIn: 3 })[0]!.easeIn).toBe(1);
  });
});

describe("rettelser etter gjennomgang (DEC-0052)", () => {
  it("et lag som flyttes inn i og ut av en flyttet gruppe, blir stående der det er", async () => {
    const { regroupFields, IDENTITY_TRANSFORM } = await import("@/core");
    const b = base();
    const { s: s1, layerId } = addLayer(b.s, b.compId, {
      ...defaultLayerFields(b.s, b.comp, { fill: "#112233" }),
      width: 100,
      height: 100,
      transform: { ...IDENTITY_TRANSFORM, x: 400, y: 300 },
    });
    // Gruppe med anker (500, 300), flyttet 100 til høyre, rotert 90° og skalert 2×
    const { s: s2, layerId: g } = addLayer(s1, b.compId, {
      ...defaultLayerFields(s1, b.comp, { fill: "#000000" }),
      kind: "group",
      fill: null,
      width: 1,
      height: 1,
      transform: { ...IDENTITY_TRANSFORM, x: 600, y: 300, rotation: 90, scaleX: 2, scaleY: 2 },
      anchor: { x: 500, y: 300 },
    });
    const where = (s: ProjectState) => {
      const it = renderFrame(s, b.compId, 0).items.find((i) => i.layerId === layerId)!;
      return {
        x: it.matrix[4],
        y: it.matrix[5],
        a: Math.atan2(it.matrix[1], it.matrix[0]),
        k: Math.hypot(it.matrix[0], it.matrix[1]),
      };
    };
    const before = where(s2);
    const s3 = mustApply(s2, {
      type: "UpdateLayers",
      layers: [{ layerId, fields: regroupFields(s2, s2.layers[layerId]!, g, 0) }],
    });
    const inside = where(s3);
    expect(s3.layers[layerId]!.groupId).toBe(g);
    expect(inside.x).toBeCloseTo(before.x, 0);
    expect(inside.y).toBeCloseTo(before.y, 0);
    expect(inside.a).toBeCloseTo(before.a, 3);
    expect(inside.k).toBeCloseTo(before.k, 2);
    const s4 = mustApply(s3, {
      type: "UpdateLayers",
      layers: [{ layerId, fields: regroupFields(s3, s3.layers[layerId]!, null, 0) }],
    });
    const out = where(s4);
    expect(out.x).toBeCloseTo(before.x, 0);
    expect(out.y).toBeCloseTo(before.y, 0);
  });

  it("en eldre klient uten de nye feltene sletter ikke bildeskifte og bane", () => {
    const b = base();
    const { s: s1, layerId } = addLayer(b.s, b.compId, {
      ...defaultLayerFields(b.s, b.comp, { assetId: b.assets[0]! }),
      swaps: [{ frame: 5, assetId: b.assets[1]! as never, assetVariantId: null, versionId: null }],
      path: {
        points: [
          { x: 0, y: 0, smooth: true },
          { x: 10, y: 10, smooth: true },
        ],
        startFrame: 0,
        endFrame: 10,
        easeOut: 0,
        easeIn: 0,
        tempo: [],
      },
    });
    const { swaps: _a, path: _b, anchor: _c, ...old } = layerFieldsOf(s1.layers[layerId]!);
    const s2 = mustApply(s1, {
      type: "UpdateLayers",
      layers: [{ layerId, fields: { ...old, visible: false } as never }],
    });
    expect(s2.layers[layerId]!.visible).toBe(false);
    expect(s2.layers[layerId]!.swaps).toHaveLength(1);
    expect(s2.layers[layerId]!.path).not.toBeNull();
  });
});
