// @vitest-environment node
/**
 * GP3: videreføring av lag mellom scener (§17–24). Ny forekomst per målscene med samme ressurs og
 * innstillinger, lokal animasjon, duplikatsjekk, én angregruppe og produksjonsrekkefølge.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPOSITION,
  applyCommand,
  carryTargets,
  checkInvariants,
  compositionOfVariant,
  defaultLayerFields,
  layerFieldsOf,
  layersOf,
  planCarryOver,
  scriptView,
  type Command,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

function setup() {
  const seed = seedProject(5);
  const view = scriptView(seed.state, seed.mainId);
  let s = seed.state;
  const assetId = tid<"asset">();
  s = mustApply(s, {
    type: "CreateAssets",
    assets: [{ assetId, fields: { kind: "character", name: "Maja", names: [], description: "", category: "", tags: [] } }],
  });
  const variantId = tid<"asset_variant">();
  s = mustApply(s, { type: "CreateAssetVariant", variantId, assetId, fields: { name: "Forfra", style: "illustrated", appearance: "" } } as Command);
  const src = s.occurrences[view[0]!.occurrenceId]!;
  const compositionId = tid<"composition">();
  s = mustApply(s, { type: "CreateComposition", compositionId, variantId: src.variantId, fields: { ...DEFAULT_COMPOSITION, durationFrames: 100 } });
  const layerId = tid<"composition_layer">();
  const base = defaultLayerFields(s, s.compositions[compositionId]!, { assetId, assetVariantId: variantId });
  s = mustApply(s, {
    type: "AddLayers",
    layers: [{
      layerId,
      compositionId,
      fields: {
        ...base,
        transform: { ...base.transform, x: 300, y: 200, scaleX: 0.5, scaleY: 0.5, rotation: 15 },
        keyframes: [{ frame: 10, property: "x", value: 400, easing: "linear" } as never],
      },
    }],
  });
  return { s, view, assetId, variantId, layerId, src: src.id };
}

function runAll(s: ProjectState, cmds: readonly Command[]) {
  const inverses: Command[] = [];
  for (const c of cmds) {
    const r = applyCommand(s, envelope(c));
    if (!r.ok) throw new Error(r.error.message);
    s = r.state;
    inverses.push(r.inverse);
  }
  return { s, inverses };
}

describe("GP3 videreføring", () => {
  it("S1 neste scene i produksjonsrekkefølge", () => {
    const { s, view, layerId, src } = setup();
    expect(carryTargets(s, layerId, src).next).toBe(view[1]!.occurrenceId);
  });

  it("S2/S8 flere scener; målscener uten 2D-scene får en; ressurs, variant, skala og rotasjon følger med", () => {
    const { s, view, layerId, src, assetId, variantId } = setup();
    const plan = planCarryOver(s, layerId, src, [
      { occurrenceId: view[2]!.occurrenceId, mode: "add" },
      { occurrenceId: view[4]!.occurrenceId, mode: "add" },
    ]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const after = runAll(s, plan.commands).s;
    expect(checkInvariants(after)).toEqual([]);
    for (const t of [view[2]!, view[4]!]) {
      const comp = compositionOfVariant(after, after.occurrences[t.occurrenceId]!.variantId)!;
      const ls = layersOf(after, comp.id);
      expect(ls).toHaveLength(1);
      expect(ls[0]!.assetId).toBe(assetId);
      expect(ls[0]!.assetVariantId).toBe(variantId);
      expect(ls[0]!.transform.scaleX).toBe(0.5);
      expect(ls[0]!.transform.rotation).toBe(15);
    }
  });

  it("S3 animasjonen er lokal: nøkkelbilder følger ikke med, og endring i målscenen endrer ikke kilden", () => {
    const { s, view, layerId, src } = setup();
    const plan = planCarryOver(s, layerId, src, [{ occurrenceId: view[1]!.occurrenceId, mode: "add" }]);
    if (!plan.ok) throw new Error();
    let after = runAll(s, plan.commands).s;
    const copy = after.layers[plan.created[0]!.layerId]!;
    expect(copy.keyframes).toEqual([]);
    const f = layerFieldsOf(copy);
    after = mustApply(after, { type: "UpdateLayers", layers: [{ layerId: copy.id, fields: { ...f, transform: { ...f.transform, x: 5 } } }] });
    expect(after.layers[layerId]!.transform.x).toBe(300);
    expect(after.layers[layerId]!.keyframes).toHaveLength(1);
  });

  it("S4 duplikat oppdages; «bruk den som finnes» gir ingen ny forekomst", () => {
    const { s, view, layerId, src } = setup();
    const first = planCarryOver(s, layerId, src, [{ occurrenceId: view[1]!.occurrenceId, mode: "add" }]);
    if (!first.ok) throw new Error();
    const s2 = runAll(s, first.commands).s;
    const opt = carryTargets(s2, layerId, src).options.find((o) => o.occurrenceId === view[1]!.occurrenceId)!;
    expect(opt.duplicates).toHaveLength(1);
    const again = planCarryOver(s2, layerId, src, [{ occurrenceId: view[1]!.occurrenceId, mode: "existing" }]);
    expect(again.ok && again.commands).toEqual([]);
    expect(again.ok && again.reused).toEqual([view[1]!.occurrenceId]);
  });

  it("S5 «legg til en til» gir en ny forekomst ved siden av den som finnes", () => {
    const { s, view, layerId, src } = setup();
    const first = planCarryOver(s, layerId, src, [{ occurrenceId: view[1]!.occurrenceId, mode: "add" }]);
    if (!first.ok) throw new Error();
    const s2 = runAll(s, first.commands).s;
    const again = planCarryOver(s2, layerId, src, [{ occurrenceId: view[1]!.occurrenceId, mode: "add" }]);
    if (!again.ok) throw new Error();
    const s3 = runAll(s2, again.commands).s;
    const comp = compositionOfVariant(s3, s3.occurrences[view[1]!.occurrenceId]!.variantId)!;
    expect(layersOf(s3, comp.id)).toHaveLength(2);
  });

  it("S6 angre hele videreføringen gir tilstanden før", () => {
    const { s, view, layerId, src } = setup();
    const plan = planCarryOver(s, layerId, src, [
      { occurrenceId: view[1]!.occurrenceId, mode: "add" },
      { occurrenceId: view[3]!.occurrenceId, mode: "add" },
    ]);
    if (!plan.ok) throw new Error();
    const { s: after, inverses } = runAll(s, plan.commands);
    const undone = runAll(after, [...inverses].reverse()).s;
    expect(Object.values(undone.layers).filter((l) => !l.removed)).toHaveLength(1);
    expect(Object.values(undone.compositions).filter((c) => !c.removed)).toHaveLength(1);
  });

  it("S7 fjerne forekomsten i én scene sletter ikke ressursen eller andre forekomster", () => {
    const { s, view, layerId, src, assetId } = setup();
    const plan = planCarryOver(s, layerId, src, [
      { occurrenceId: view[1]!.occurrenceId, mode: "add" },
      { occurrenceId: view[2]!.occurrenceId, mode: "add" },
    ]);
    if (!plan.ok) throw new Error();
    let after = runAll(s, plan.commands).s;
    after = mustApply(after, { type: "SetLayersRemoved", layerIds: [plan.created[0]!.layerId], removed: true });
    expect(after.assets[assetId]!.archived).toBe(false);
    expect(after.layers[layerId]!.removed).toBe(false);
    expect(after.layers[plan.created[1]!.layerId]!.removed).toBe(false);
  });

  it("samme 2D-scene kan ikke velges", () => {
    const { s, layerId, src } = setup();
    expect(planCarryOver(s, layerId, src, [{ occurrenceId: src, mode: "add" }]).ok).toBe(false);
  });
});
