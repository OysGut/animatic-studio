// @vitest-environment node
/**
 * Import, splitting og sammenslåing (mandat 4.1–4.4, DEC-0015, DEC-0023). Syntetisk manus – ingen tekst fra referansen.
 */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  checkInvariants,
  diffStates,
  orderedOccurrences,
  outdatedTakes,
  parseScreenplayLines,
  planImport,
  scriptView,
  stateFromRows,
  type BlockId,
  type ProductionId,
  type ProjectRows,
  type RawLine,
} from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

const A = 108;
const L = (page: number, row: number, x: number, text: string): RawLine => ({
  page,
  x,
  y: 72 + row * 12,
  text,
});

function sample() {
  return parseScreenplayLines(
    [
      L(1, 0, A, "…fortsetter fra forrige del."),
      L(1, 2, 54, "12 INT. LÅVE - DAG 12"),
      L(1, 4, A, "Støv i lyset."),
      L(1, 6, 252, "OLE"),
      L(1, 7, 180, "Hallo?"),
      L(2, 0, 54, "EXT. TUN - NATT"),
      L(2, 2, A, "Stille."),
      L(2, 4, 54, "14 INT. STUE - KVELD 14"),
      L(2, 6, A, "Peisen knitrer."),
    ],
    { format: "pdf" },
  );
}

describe("ImportScreenplay", () => {
  it("lager permanente scener etter eksisterende scener, med nummer, kildereferanse og usikkerhet", () => {
    const { state, mainId } = seedProject();
    const before = orderedOccurrences(state, mainId);
    const cmd = planImport(state, sample(), { productionId: mainId as ProductionId, newId: tid });
    expect(cmd.scenes).toHaveLength(4);
    const s2 = mustApply(state, cmd);
    expect(checkInvariants(s2)).toEqual([]);
    const after = orderedOccurrences(s2, mainId);
    expect(after.slice(0, before.length).map((o) => o.id)).toEqual(before.map((o) => o.id));
    expect(after.slice(before.length).map((o) => o.productionNumber)).toEqual([
      null,
      "12",
      null,
      "14",
    ]);
    const tun = cmd.scenes[2]!;
    expect(s2.variants[tun.variantId]!.uncertainty).toContain("ikke scenenummer");
    const firstBlock = cmd.scenes[1]!.blocks[0]!;
    expect(s2.blocks[firstBlock.blockId]!.sourceRef).toEqual({ page: 1, y: 72 + 4 * 12 });
  });

  it("kan hoppe over fortsettelsesteksten før første overskrift", () => {
    const { state, mainId } = seedProject();
    const cmd = planImport(state, sample(), {
      productionId: mainId as ProductionId,
      skipContinuation: true,
      newId: tid,
    });
    expect(cmd.scenes.map((s) => s.productionNumber)).toEqual(["12", null, "14"]);
  });

  it("angres samlet og etterlater nøyaktig utgangstilstanden", () => {
    const { state, mainId } = seedProject();
    const cmd = planImport(state, sample(), { productionId: mainId as ProductionId, newId: tid });
    const r = applyCommand(state, envelope(cmd));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const undo = applyCommand(r.state, envelope(r.inverse));
    expect(undo.ok).toBe(true);
    if (!undo.ok) return;
    expect(Object.keys(undo.state.scenes).sort()).toEqual(Object.keys(state.scenes).sort());
    expect(Object.keys(undo.state.blocks).sort()).toEqual(Object.keys(state.blocks).sort());
    expect(undo.state.blockRevisions.length).toBe(state.blockRevisions.length);
  });

  it("radformatet tåler rundtur med kildereferanse og usikkerhet", () => {
    const { state, mainId } = seedProject();
    const s2 = mustApply(
      state,
      planImport(state, sample(), { productionId: mainId as ProductionId, newId: tid }),
    );
    const empty = {
      ...s2,
      productions: {},
      scenes: {},
      variants: {},
      blocks: {},
      occurrences: {},
      segments: {},
      takes: {},
      blockRevisions: [],
    };
    const cs = diffStates(empty, s2);
    const rows = {
      project: {
        id: s2.project.id,
        revision: s2.project.revision,
        name: s2.project.name,
        fps_num: 25,
        fps_den: 1,
      },
      productions: cs.inserts["productions"] ?? [],
      scenes: cs.inserts["scenes"] ?? [],
      scene_variants: cs.inserts["scene_variants"] ?? [],
      script_blocks: cs.inserts["script_blocks"] ?? [],
      script_block_revisions: cs.blockRevisions,
      scene_occurrences: cs.inserts["scene_occurrences"] ?? [],
      production_segments: cs.inserts["production_segments"] ?? [],
      takes: cs.inserts["takes"] ?? [],
    } satisfies ProjectRows;
    const back = stateFromRows(rows);
    expect(back.blocks).toEqual(s2.blocks);
    expect(back.variants).toEqual(s2.variants);
  });
});

describe("SplitScene", () => {
  function setup() {
    const { state, mainId } = seedProject();
    const cmd = planImport(state, sample(), { productionId: mainId as ProductionId, newId: tid });
    const s = mustApply(state, cmd);
    const scene = cmd.scenes[1]!; // «12 INT. LÅVE» med tre blokker
    return { s, mainId: mainId as ProductionId, scene };
  }

  it("flytter blokkene fra splittpunktet til en ny scene rett etter, med samme blokk-ID-er", () => {
    const { s, mainId, scene } = setup();
    const at = scene.blocks[1]!.blockId;
    const newOcc = tid<"scene_occurrence">();
    const s2 = mustApply(s, {
      type: "SplitScene",
      productionId: mainId,
      occurrenceId: scene.occurrenceId,
      atBlockId: at,
      newSceneId: tid(),
      newVariantId: tid(),
      newOccurrenceIds: { [scene.occurrenceId]: newOcc },
      heading: { intExt: "INT.", location: "LÅVE, LOFTET", time: "DAG" },
    });
    expect(checkInvariants(s2)).toEqual([]);
    const order = orderedOccurrences(s2, mainId).map((o) => o.id);
    expect(order[order.indexOf(scene.occurrenceId) + 1]).toBe(newOcc);
    expect(s2.blocks[at]!.variantId).toBe(s2.occurrences[newOcc]!.variantId);
    expect(s2.blocks[scene.blocks[0]!.blockId]!.variantId).toBe(scene.variantId);
    // Første del beholder ID og nummer; ny del er avledet og unummerert (DEC-0015)
    expect(s2.occurrences[scene.occurrenceId]!.productionNumber).toBe("12");
    expect(s2.occurrences[newOcc]!.productionNumber).toBeNull();
    expect(s2.scenes[s2.occurrences[newOcc]!.sceneId]!.derivedFromSceneId).toBe(scene.sceneId);
    // Manusvisningen inneholder fortsatt de samme blokkene i samme rekkefølge
    const text = (st: typeof s) => scriptView(st, mainId).flatMap((x) => x.blocks.map((b) => b.id));
    expect(text(s2)).toEqual(text(s));
  });

  it("nekter å splitte ved første blokk og i en scene som brukes i en annen produksjon", () => {
    const { state, mainId, spinoffId } = seedProject();
    const shared = orderedOccurrences(state, spinoffId)[0]!;
    const blocks = Object.values(state.blocks)
      .filter((b) => b.variantId === shared.variantId)
      .sort((a, b) => (a.orderKey < b.orderKey ? -1 : 1));
    const mainOcc = Object.values(state.occurrences).find(
      (o) => o.productionId === mainId && o.variantId === shared.variantId,
    )!;
    const base = {
      type: "SplitScene" as const,
      productionId: mainId as ProductionId,
      occurrenceId: mainOcc.id,
      newSceneId: tid<"scene">(),
      newVariantId: tid<"scene_variant">(),
      newOccurrenceIds: {
        [mainOcc.id]: tid<"scene_occurrence">(),
        [shared.id]: tid<"scene_occurrence">(),
      },
      heading: { intExt: "INT.", location: "X", time: "DAG" },
    };
    const shared1 = applyCommand(state, envelope({ ...base, atBlockId: blocks[1]!.id as BlockId }));
    expect(shared1.ok).toBe(false);
    if (!shared1.ok) expect(shared1.error.code).toBe("must_fork_variant");
  });

  it("angres og gir tilbake én scene", () => {
    const { s, mainId, scene } = setup();
    const r = applyCommand(
      s,
      envelope({
        type: "SplitScene",
        productionId: mainId,
        occurrenceId: scene.occurrenceId,
        atBlockId: scene.blocks[2]!.blockId,
        newSceneId: tid(),
        newVariantId: tid(),
        newOccurrenceIds: { [scene.occurrenceId]: tid() },
        heading: { intExt: "INT.", location: "LÅVE", time: "DAG" },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const u = applyCommand(r.state, envelope(r.inverse));
    expect(u.ok).toBe(true);
    if (!u.ok) return;
    expect(Object.keys(u.state.occurrences).sort()).toEqual(Object.keys(s.occurrences).sort());
    for (const b of scene.blocks)
      expect(u.state.blocks[b.blockId]!.variantId).toBe(scene.variantId);
  });
});

describe("MergeScenes", () => {
  it("legger kildescenens blokker sist i målscenen, beholder kildescenen som sammenslått og deaktivert", () => {
    const { state, mainId } = seedProject();
    const cmd = planImport(state, sample(), { productionId: mainId as ProductionId, newId: tid });
    const s = mustApply(state, cmd);
    const target = cmd.scenes[1]!;
    const source = cmd.scenes[2]!;
    const s2 = mustApply(s, {
      type: "MergeScenes",
      productionId: mainId as ProductionId,
      targetOccurrenceId: target.occurrenceId,
      sourceOccurrenceId: source.occurrenceId,
    });
    expect(checkInvariants(s2)).toEqual([]);
    expect(s2.scenes[source.sceneId]!.mergedIntoSceneId).toBe(target.sceneId);
    expect(s2.occurrences[source.occurrenceId]!.active).toBe(false);
    const view = scriptView(s2, mainId as ProductionId).find(
      (x) => x.occurrenceId === target.occurrenceId,
    )!;
    expect(view.blocks.map((b) => b.id)).toEqual(
      [...target.blocks, ...source.blocks].map((b) => b.blockId),
    );
    // Kan ikke aktiveres igjen mens den er sammenslått
    const re = applyCommand(
      s2,
      envelope({ type: "SetOccurrenceActive", occurrenceId: source.occurrenceId, active: true }),
    );
    expect(re.ok).toBe(false);
    // Kan ikke slås sammen to ganger
    const again = applyCommand(
      s2,
      envelope({
        type: "MergeScenes",
        productionId: mainId as ProductionId,
        targetOccurrenceId: cmd.scenes[3]!.occurrenceId,
        sourceOccurrenceId: source.occurrenceId,
      }),
    );
    expect(again.ok).toBe(false);
  });
});

describe("Manuell korrigering (mandat 4.3)", () => {
  it("elementtype, overskrift og usikkerhet kan endres og angres", () => {
    const { state, mainId } = seedProject();
    const cmd = planImport(state, sample(), { productionId: mainId as ProductionId, newId: tid });
    const s = mustApply(state, cmd);
    const b = cmd.scenes[1]!.blocks[0]!;
    const v = cmd.scenes[2]!.variantId;
    const r1 = applyCommand(
      s,
      envelope({
        type: "SetBlockKind",
        productionId: mainId as ProductionId,
        blockId: b.blockId,
        kind: "shot",
      }),
    );
    expect(r1.ok && r1.state.blocks[b.blockId]!.kind).toBe("shot");
    const r2 = applyCommand(
      s,
      envelope({
        type: "SetUncertainty",
        productionId: mainId as ProductionId,
        targetId: v,
        uncertainty: null,
      }),
    );
    expect(r2.ok && r2.state.variants[v]!.uncertainty).toBeNull();
    if (r2.ok) {
      const u = applyCommand(r2.state, envelope(r2.inverse));
      expect(u.ok && u.state.variants[v]!.uncertainty).toContain("ikke scenenummer");
    }
    const r3 = applyCommand(
      s,
      envelope({
        type: "EditSceneHeading",
        productionId: mainId as ProductionId,
        variantId: v,
        heading: { intExt: "EXT.", location: "TUNET", time: "NATT" },
      }),
    );
    expect(r3.ok && r3.state.variants[v]!.heading.location).toBe("TUNET");
  });
});

describe("RemoveBlock / RestoreBlock", () => {
  it("skjuler blokken i manuset, beholder historikken og gjør ferdig film utdatert", () => {
    const { state, mainId } = seedProject();
    const occ = orderedOccurrences(state, mainId)[0]!; // har godkjent take i fixturen
    const blocks = scriptView(state, mainId)[0]!.blocks;
    const b = blocks[1]!;
    const s2 = mustApply(state, {
      type: "RemoveBlock",
      productionId: mainId as ProductionId,
      blockId: b.id,
    });
    expect(scriptView(s2, mainId)[0]!.blocks.map((x) => x.id)).not.toContain(b.id);
    expect(s2.blocks[b.id]!.text).toBe(b.text);
    expect(s2.blockRevisions).toBe(state.blockRevisions);
    const s3 = mustApply(s2, {
      type: "RestoreBlock",
      productionId: mainId as ProductionId,
      blockId: b.id,
    });
    expect(scriptView(s3, mainId)[0]!.blocks.map((x) => x.id)).toEqual(blocks.map((x) => x.id));
    expect(outdatedTakes(state).some((t) => t.occurrenceId === occ.id)).toBe(false);
    expect(outdatedTakes(s2).some((t) => t.occurrenceId === occ.id)).toBe(true);
  });
});
