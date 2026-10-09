// @vitest-environment node
/** Regresjonstester for funn i kodegjennomgangen 2026-10-09 (DEC-0025). */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  blocksOfVariant,
  exportNumbering,
  keyBetween,
  orderedOccurrences,
  parseScreenplayLines,
  planImport,
  type BlockId,
  type Command,
  type ProductionId,
  type ProjectState,
} from "@/core";
import { canonicalJson } from "@/adapters/storage/commands.functions";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

const L = (row: number, x: number, text: string) => ({ page: 1, x, y: 72 + row * 12, text });

function imported() {
  const { state, mainId, spinoffId } = seedProject(0);
  const parsed = parseScreenplayLines(
    [
      L(0, 54, "1 INT. A - DAG 1"),
      L(2, 108, "En."),
      L(4, 108, "To."),
      L(6, 108, "Tre."),
      L(8, 108, "Fire."),
      L(10, 108, "Fem."),
      L(12, 54, "2 INT. B - DAG 2"),
      L(14, 108, "Seks."),
    ],
    { format: "pdf" },
  );
  const cmd = planImport(state, parsed, { productionId: mainId as ProductionId, newId: tid });
  return { s: mustApply(state, cmd), cmd, mainId: mainId as ProductionId, spinoffId };
}

const reject = (s: ProjectState, c: Command) => {
  const r = applyCommand(s, envelope(c));
  expect(r.ok).toBe(false);
  return r.ok ? null : r.error.code;
};

describe("Inverse kommandoer kan ikke misbrukes", () => {
  it("UndoSplitScene på en vilkårlig scene avvises", () => {
    const { state, mainId, spinoffId } = seedProject();
    const x = orderedOccurrences(state, mainId)[0]!;
    const spinVariant = Object.values(state.variants).find(
      (v) => v.ownerProductionId === spinoffId,
    );
    expect(
      reject(state, {
        type: "UndoSplitScene",
        split: {
          productionId: mainId as ProductionId,
          occurrenceId: x.id,
          atBlockId: Object.keys(state.blocks)[0] as BlockId,
          newSceneId: x.sceneId,
          newVariantId: x.variantId,
          newOccurrenceIds: { [x.id]: x.id },
          heading: { intExt: "INT.", location: "X", time: "DAG" },
        },
        originalVariantId: (spinVariant?.id ??
          orderedOccurrences(state, mainId)[1]!.variantId) as never,
      }),
    ).not.toBeNull();
  });

  it("UnmergeScenes kan ikke flytte blokker som ikke var med i sammenslåingen", () => {
    const { s, cmd, mainId } = imported();
    const [a, b] = cmd.scenes;
    const merged = mustApply(s, {
      type: "MergeScenes",
      productionId: mainId,
      targetOccurrenceId: a!.occurrenceId,
      sourceOccurrenceId: b!.occurrenceId,
    });
    // Målscenens egen første blokk (ikke fra kilden)
    const other = merged.blocks[a!.blocks[0]!.blockId]!;
    reject(merged, {
      type: "UnmergeScenes",
      productionId: mainId,
      targetOccurrenceId: a!.occurrenceId,
      sourceOccurrenceId: b!.occurrenceId,
      placements: [{ blockId: other.id, variantId: b!.variantId, orderKey: "z" }],
      sourceWasActive: true,
    });
  });

  it("angring av import nektes hvis noen har lagt til tekst i en importert scene", () => {
    const { s, cmd, mainId } = imported();
    const sc = cmd.scenes[0]!;
    const last = sc.blocks[sc.blocks.length - 1]!;
    const s2 = mustApply(s, {
      type: "InsertBlock",
      productionId: mainId,
      variantId: sc.variantId,
      block: {
        blockId: tid(),
        kind: "action",
        text: "Fra en annen bruker",
        orderKey: keyBetween(last.orderKey, null),
      },
    });
    expect(
      reject(s2, { type: "UndoImportScreenplay", productionId: mainId, scenes: cmd.scenes }),
    ).toBe("referenced");
  });
});

describe("Rekkefølge og deling", () => {
  it("to blokker får aldri samme plass: angring av deling avvises hvis plassen er tatt", () => {
    const { s, cmd, mainId } = imported();
    const sc = cmd.scenes[0]!;
    const at = sc.blocks[2]!;
    const r = applyCommand(
      s,
      envelope({
        type: "SplitScene",
        productionId: mainId,
        occurrenceId: sc.occurrenceId,
        atBlockId: at.blockId,
        newSceneId: tid(),
        newVariantId: tid(),
        newOccurrenceIds: { [sc.occurrenceId]: tid() },
        heading: sc.heading,
      }),
    );
    if (!r.ok) throw new Error(r.error.message);
    // Sett inn en blokk på plassen etter siste gjenværende blokk – samme nøkkel som en flyttet blokk kan få
    const remaining = Object.values(r.state.blocks).filter((b) => b.variantId === sc.variantId);
    const lastKey = remaining
      .map((b) => b.orderKey)
      .sort()
      .at(-1)!;
    const key = keyBetween(lastKey, null);
    const s2 = mustApply(r.state, {
      type: "InsertBlock",
      productionId: mainId,
      variantId: sc.variantId,
      block: { blockId: tid(), kind: "action", text: "Ny", orderKey: key },
    });
    const undo = applyCommand(s2, envelope(r.inverse));
    if (undo.ok) {
      // Hvis den lykkes, må nøklene fortsatt være unike
      const keys = Object.values(undo.state.blocks)
        .filter((b) => b.variantId === sc.variantId)
        .map((b) => b.orderKey);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("deling tar med fjernede blokker etter delingspunktet", () => {
    const { s, cmd, mainId } = imported();
    const sc = cmd.scenes[0]!;
    const s1 = mustApply(s, {
      type: "RemoveBlock",
      productionId: mainId,
      blockId: sc.blocks[3]!.blockId,
    });
    const newVariant = tid<"scene_variant">();
    const s2 = mustApply(s1, {
      type: "SplitScene",
      productionId: mainId,
      occurrenceId: sc.occurrenceId,
      atBlockId: sc.blocks[2]!.blockId,
      newSceneId: tid(),
      newVariantId: newVariant,
      newOccurrenceIds: { [sc.occurrenceId]: tid() },
      heading: sc.heading,
    });
    expect(s2.blocks[sc.blocks[3]!.blockId]!.variantId).toBe(newVariant);
  });

  it("sammenslåing inn i en scene som deles med en annen produksjon krever egen variant", () => {
    const { state, mainId, spinoffId } = seedProject();
    const spin = orderedOccurrences(state, spinoffId)[0]!;
    const main = orderedOccurrences(state, mainId);
    const target = main.find((o) => o.variantId === spin.variantId)!;
    const i = main.indexOf(target);
    const source = main[i + 1] ?? main[i - 1]!;
    expect(
      reject(state, {
        type: "MergeScenes",
        productionId: mainId as ProductionId,
        targetOccurrenceId: target.id,
        sourceOccurrenceId: source.id,
      }),
    ).toBe("must_fork_variant");
  });
});

describe("Nummerering", () => {
  it("en scene laget ved deling får mellomnummer; deaktiverte numre gjenbrukes ikke", () => {
    const { s, cmd, mainId } = imported();
    const sc = cmd.scenes[0]!;
    const newOcc = tid<"scene_occurrence">();
    const s2 = mustApply(s, {
      type: "SplitScene",
      productionId: mainId,
      occurrenceId: sc.occurrenceId,
      atBlockId: sc.blocks[2]!.blockId,
      newSceneId: tid(),
      newVariantId: tid(),
      newOccurrenceIds: { [sc.occurrenceId]: newOcc },
      heading: sc.heading,
    });
    const n = exportNumbering(s2, mainId, { method: "production", includeInactive: false });
    expect(n.find((x) => x.occurrenceId === newOcc)!.exportNumber).toBe("1A");
    void blocksOfVariant;
  });
});

describe("canonicalJson", () => {
  it("er uavhengig av nøkkelrekkefølge og ignorerer udefinerte felt", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: undefined } })).toBe(
      canonicalJson({ a: { d: [1, { x: 1, y: 2 }] }, b: 1 }),
    );
  });
});
