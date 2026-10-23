// @vitest-environment node
/**
 * Plassholder → bilde (feil fra Øystein 23.10): det nye bildet får vanlig innsettingsstørrelse med egne
 * proporsjoner, bare senteret gjenbrukes, og alt kan angres som ett trinn.
 */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  defaultLayerFields,
  LAYER_FIT_SHARE,
  orderedOccurrences,
  type AssetFields,
  type Command,
  type ProjectState,
} from "@/core";
import { REFIT_FIT_SHARE, refitLayerFields } from "@/core/composition/refit";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

const FIG: AssetFields = { kind: "character", name: "Figur", names: [], description: "", category: "", tags: [] };

/** Scene (prosjektformatet 1920 × 1080) med et lag for en figur uten bilde (plassholder), strukket stående og flyttet. */
function setup(opts: { animate?: boolean; sx?: number; sy?: number } = {}) {
  const { state, mainId } = seedProject(2);
  const occ = orderedOccurrences(state, mainId)[0]!;
  const assetId = tid<"asset">();
  const variantId = tid<"asset_variant">();
  let s = mustApply(state, { type: "CreateAssets", assets: [{ assetId, fields: FIG }] });
  s = mustApply(s, { type: "CreateAssetVariant", variantId, assetId, fields: { name: "A", style: "animatic", appearance: "" } });
  const compositionId = tid<"composition">();
  s = mustApply(s, {
    type: "CreateComposition",
    compositionId,
    variantId: s.occurrences[occ.id]!.variantId,
    fields: { name: "Scene", width: 1000, height: 600, durationFrames: 100, background: "#000000" },
  });
  const comp = s.compositions[compositionId]!;
  const layerId = tid<"composition_layer">();
  const base = defaultLayerFields(s, comp, { assetId: assetId as never, assetVariantId: variantId as never });
  expect(base.width).toBe(512); // plassholder
  s = mustApply(s, {
    type: "AddLayers",
    layers: [
      {
        layerId,
        compositionId,
        fields: {
          ...base,
          // brukeren har dratt plassholderen til en stående boks og flyttet den
          transform: { ...base.transform, x: 300, y: 200, scaleX: opts.sx ?? 0.2, scaleY: opts.sy ?? 0.6 },
          keyframes: opts.animate
            ? [
                { frame: 0, property: "x", value: 300, easing: "linear" },
                { frame: 50, property: "x", value: 700, easing: "linear" },
                { frame: 0, property: "scaleY", value: opts.sy ?? 0.6, easing: "linear" },
                { frame: 50, property: "scaleY", value: (opts.sy ?? 0.6) * 2, easing: "linear" },
              ]
            : [],
        },
      },
    ],
  });
  return { s, layerId, variantId, assetId };
}

function upload(s: ProjectState, variantId: string, assetId: string, width: number, height: number) {
  const versionId = tid<"asset_version">();
  const command: Command = {
    type: "AddAssetVersion",
    versionId,
    variantId,
    media: {
      path: `${s.project.id}/${assetId}/${versionId}/b.png`,
      mimeType: "image/png",
      width,
      height,
      byteSize: 1000,
      sha256: "e".repeat(64),
    },
    note: "",
  } as never;
  const r = applyCommand(s, envelope(command));
  if (!r.ok) throw new Error(r.error.message);
  return { ...r, versionId };
}

describe("plassholder → bilde", () => {
  it("liggende bilde inn i stående plassholder: egne proporsjoner, vanlig størrelse, samme senter", () => {
    const { s, layerId, variantId, assetId } = setup();
    const r = upload(s, variantId, assetId, 1600, 900);
    const l = r.state.layers[layerId]!;
    expect(r.state.compositions[l.compositionId]).toMatchObject({ width: 1920, height: 1080 });
    // vanlig innsetting: innenfor 50 % av 1920 × 1080 → min(540/900, 960/1600) = 0,6
    expect(l.transform.scaleX).toBe(0.6);
    expect(l.transform.scaleY).toBe(0.6);
    expect(l.transform.x).toBe(300);
    expect(l.transform.y).toBe(200);
    expect(l.width).toBe(1600);
    expect(l.height).toBe(900);
  });

  it("stående bilde inn i liggende plassholder blir ikke strukket", () => {
    const { s: wide, layerId, variantId, assetId } = setup({ sx: 0.9, sy: 0.2 });
    const l = upload(wide, variantId, assetId, 600, 1200).state.layers[layerId]!;
    // min(540/1200, 960/600) = 0,45
    expect(l.transform.scaleX).toBe(0.45);
    expect(l.transform.scaleY).toBe(0.45);
    expect([l.transform.x, l.transform.y]).toEqual([300, 200]);
  });

  it("animert posisjon beholdes; skalabevegelsen beholdes relativt", () => {
    const { s, layerId, variantId, assetId } = setup({ animate: true, sy: 0.3 });
    const l = upload(s, variantId, assetId, 1600, 900).state.layers[layerId]!;
    const x = l.keyframes.filter((k) => k.property === "x").map((k) => k.value);
    expect(x).toEqual([300, 700]);
    const sy = l.keyframes.filter((k) => k.property === "scaleY").map((k) => k.value);
    // grunnskalaen 0,3 blir 0,6 (vanlig innsetting); nøkkelbildene 0,3 → 0,6 skaleres med samme faktor (2)
    expect(sy[0]).toBeCloseTo(0.6, 6);
    expect(sy[1]).toBeCloseTo(1.2, 6); // dobbelt så stor, som før
    const sx = l.keyframes.filter((k) => k.property === "scaleX");
    expect(sx).toEqual([]);
    expect(l.transform.scaleX).toBe(l.transform.scaleY);
  });

  it("angring gir plassholderen tilbake med samme felt, og gjør om gir samme resultat (ett trinn)", () => {
    const { s, layerId, variantId, assetId } = setup();
    const r = upload(s, variantId, assetId, 1600, 900);
    expect(r.inverse.type).toBe("WithLayerRefit");
    const undo = applyCommand(r.state, envelope(r.inverse));
    if (!undo.ok) throw new Error(undo.error.message);
    const back = undo.state.layers[layerId]!;
    expect(back.transform).toEqual(s.layers[layerId]!.transform);
    expect(back.width).toBe(512);
    expect(undo.state.assetVersions[r.versionId]).toBeUndefined();
    const redo = applyCommand(undo.state, envelope(undo.inverse));
    if (!redo.ok) throw new Error(redo.error.message);
    expect(redo.state.layers[layerId]!.transform).toEqual(r.state.layers[layerId]!.transform);
  });

  it("revisjonen til laget øker bare én gang per endring", () => {
    const { s, layerId, variantId, assetId } = setup();
    const r = upload(s, variantId, assetId, 1600, 900);
    expect(r.state.layers[layerId]!.revision).toBe(s.layers[layerId]!.revision + 1);
  });
});

describe("bytte mellom to ekte bilder", () => {
  const v = (w: number, h: number) => ({ id: `v${w}x${h}`, width: w, height: h }) as never;
  const layer = { kind: "character", id: "l" } as never;
  const fields = (sx: number, sy: number) =>
    ({ width: 1000, height: 500, transform: { x: 10, y: 20, rotation: 0, scaleX: sx, scaleY: sy, opacity: 1 }, keyframes: [] }) as never;
  const comp = { width: 1000, height: 600 };

  it("samme proporsjoner: uendret (som før)", () => {
    expect(refitLayerFields(layer, fields(0.5, 0.5), comp, v(1000, 500), v(2000, 1000))).toBe(null);
  });

  it("ulike proporsjoner: senteret og den lengste synlige siden beholdes, ingen forvrengning", () => {
    const f = refitLayerFields(layer, fields(-0.5, 0.5), comp, v(1000, 500), v(400, 800))!;
    // lengste synlige side før: 1000 × 0,5 = 500 px → 800 × k = 500 → k = 0,625; speilvendingen beholdes
    expect(f.transform.scaleX).toBe(-0.625);
    expect(f.transform.scaleY).toBe(0.625);
    expect([f.transform.x, f.transform.y]).toEqual([10, 20]);
  });

  it("innsettingsandelen er den samme som ved vanlig innsetting", () => {
    expect(REFIT_FIT_SHARE).toBe(LAYER_FIT_SHARE);
  });
});
