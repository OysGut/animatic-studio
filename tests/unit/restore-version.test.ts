// @vitest-environment node
/** Gjør en tidligere manusversjon gjeldende (REQ-0077, KI-27). */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  blocksOfVariant,
  keyBetween,
  orderedOccurrences,
  snapshotFromState,
  type Command,
  type ProjectState,
  type ScriptSnapshot,
} from "@/core";
import {
  isAscending,
  previewRestore,
  restoreVersionCommands,
  restoreVersionPlan,
} from "@/core/screenplay/restore-version";
import { envelope, mustApply, rng, seedProject, tid } from "../helpers/fixtures";

function applyAll(s: ProjectState, cmds: readonly Command[]) {
  const inverses: Command[] = [];
  for (const c of cmds) {
    const r = applyCommand(s, envelope(c));
    if (!r.ok) throw new Error(`${c.type}: ${r.error.message}`);
    inverses.push(r.inverse);
    s = r.state;
  }
  return { state: s, inverses };
}

/** Versjonens innhold uten revisjonsnumre (gjenoppretting gir nye revisjoner med samme tekst). */
function textOf(snap: ScriptSnapshot, only?: ReadonlySet<string>) {
  return snap.scenes
    .filter((sc) => !only || only.has(sc.occurrenceId))
    .map((sc) => ({
      occurrenceId: sc.occurrenceId,
      active: sc.active,
      heading: sc.heading,
      blocks: sc.blocks.map((b) => [b.id, b.kind, b.text]),
    }));
}

function edited() {
  const { state, mainId } = seedProject();
  const v1 = snapshotFromState(state, mainId);
  const occs = orderedOccurrences(state, mainId);
  const o0 = occs[0]!;
  const o3 = occs[3]!;
  const b0 = blocksOfVariant(state, o0.variantId);
  const b3 = blocksOfVariant(state, o3.variantId);
  const newBlock = tid<"script_block">();
  const newScene = tid<"scene_occurrence">();
  const pid = mainId as never;
  const s = applyAll(state, [
    { type: "EditBlockText", productionId: pid, blockId: b0[0]!.id, text: "Ny handling" },
    { type: "EditBlockText", productionId: pid, blockId: b0[2]!.id, text: "Ny replikk" },
    {
      type: "InsertBlock",
      productionId: pid,
      variantId: o0.variantId,
      block: {
        blockId: newBlock,
        kind: "action",
        text: "Linje som er kommet til",
        orderKey: keyBetween(b0[2]!.orderKey, null),
      },
    },
    { type: "RemoveBlock", productionId: pid, blockId: b3[1]!.id },
    { type: "SetBlockKind", productionId: pid, blockId: b3[0]!.id, kind: "transition" },
    {
      type: "EditSceneHeading",
      productionId: pid,
      variantId: o3.variantId,
      heading: { intExt: "EXT.", location: "ENDRET", time: "NATT" },
    },
    { type: "SetOccurrenceActive", occurrenceId: occs[5]!.id, active: false },
    {
      type: "MoveOccurrence",
      occurrenceId: occs[1]!.id,
      orderKey: keyBetween(occs[7]!.orderKey, occs[8]!.orderKey),
    },
    {
      type: "CreateScene",
      productionId: pid,
      sceneId: tid(),
      variantId: tid(),
      occurrenceId: newScene,
      orderKey: keyBetween(null, occs[0]!.orderKey),
      heading: { intExt: "INT.", location: "NY", time: "DAG" },
      blocks: [{ blockId: tid(), kind: "action", text: "Ny scene", orderKey: "i" }],
    },
  ]).state;
  return { before: state, state: s, mainId, v1, newBlock, newScene };
}

describe("Gjør en manusversjon gjeldende (REQ-0077)", () => {
  it("tur-retur: teksten, typene, overskriftene, synligheten og rekkefølgen blir som i versjonen", () => {
    const { state, mainId, v1, newBlock, newScene } = edited();
    const cmds = restoreVersionCommands(state, mainId, v1);
    expect(cmds.length).toBeGreaterThan(0);
    const after = applyAll(state, cmds).state;
    const v2 = snapshotFromState(after, mainId);
    const old = new Set(v1.scenes.map((sc) => sc.occurrenceId));
    expect(textOf(v2, old)).toEqual(textOf(v1));
    // Linjen som er kommet til, er fjernet med RemoveBlock (teksten og historikken beholdes)
    expect(cmds).toContainEqual({ type: "RemoveBlock", productionId: mainId, blockId: newBlock });
    expect(after.blocks[newBlock]?.removed).toBe(true);
    expect(after.blocks[newBlock]?.text).toBe("Linje som er kommet til");
    // Scenen som er kommet til, er deaktivert – ikke slettet
    expect(after.occurrences[newScene]?.active).toBe(false);
    expect(v2.scenes.map((sc) => sc.occurrenceId).filter((id) => old.has(id))).toEqual(
      v1.scenes.map((sc) => sc.occurrenceId),
    );
    expect(isAscending(orderedOccurrences(after, mainId).map((o) => o.orderKey))).toBe(true);
    // Ingenting å gjøre etterpå
    expect(restoreVersionCommands(after, mainId, v1)).toEqual([]);
  });

  it("sletter aldri historikk: alle tidligere tekstrevisjoner finnes fortsatt", () => {
    const { state, mainId, v1 } = edited();
    const after = applyAll(state, restoreVersionCommands(state, mainId, v1)).state;
    const keep = new Set(after.blockRevisions.map((r) => `${r.blockId}:${r.rev}:${r.text}`));
    for (const r of state.blockRevisions)
      expect(keep.has(`${r.blockId}:${r.rev}:${r.text}`)).toBe(true);
    expect(Object.keys(after.blocks).sort()).toEqual(Object.keys(state.blocks).sort());
    expect(Object.keys(after.occurrences).sort()).toEqual(Object.keys(state.occurrences).sort());
  });

  it("kan angres samlet: inversene i omvendt rekkefølge gir manuset før gjenopprettingen", () => {
    const { state, mainId, v1 } = edited();
    const { state: after, inverses } = applyAll(state, restoreVersionCommands(state, mainId, v1));
    const back = applyAll(after, [...inverses].reverse()).state;
    expect(textOf(snapshotFromState(back, mainId))).toEqual(
      textOf(snapshotFromState(state, mainId)),
    );
  });

  it("forhåndsvisningen viser scenene og linjene som endres, og endrer ikke tilstanden", () => {
    const { state, mainId, v1 } = edited();
    const p = previewRestore(state, mainId, v1);
    expect(p.error).toBeNull();
    const types = new Set(p.changes.map((c) => c.type));
    for (const t of ["action", "dialogue", "heading", "activated", "deactivated", "moved"] as const)
      expect(types.has(t)).toBe(true);
    expect(p.changes.some((c) => (c.lines ?? []).length > 0)).toBe(true);
    expect(snapshotFromState(state, mainId)).not.toEqual(v1);
  });

  it("uendret manus gir ingen kommandoer", () => {
    const { state, mainId } = seedProject();
    const v = snapshotFromState(state, mainId);
    expect(restoreVersionCommands(state, mainId, v)).toEqual([]);
    expect(previewRestore(state, mainId, v).changes).toEqual([]);
  });

  it("deling etter versjonen: linjene i den nye scenen rapporteres, og scenen beholdes aktiv", () => {
    const { state, mainId } = seedProject();
    const v1 = snapshotFromState(state, mainId);
    const o = orderedOccurrences(state, mainId)[2]!;
    const blocks = blocksOfVariant(state, o.variantId);
    const map: Record<string, never> = {};
    for (const x of Object.values(state.occurrences))
      if (x.variantId === o.variantId) map[x.id] = tid() as never;
    const s = mustApply(state, {
      type: "SplitScene",
      productionId: mainId as never,
      occurrenceId: o.id,
      atBlockId: blocks[1]!.id,
      newSceneId: tid(),
      newVariantId: tid(),
      newOccurrenceIds: map,
      heading: { intExt: "INT.", location: "DELT", time: "DAG" },
    });
    const plan = restoreVersionPlan(s, mainId, v1);
    expect(plan.issues.some((i) => i.occurrenceId === o.id && /flyttet/.test(i.reason))).toBe(true);
    const newOcc = map[o.id] as unknown as string;
    expect(plan.issues.some((i) => i.occurrenceId === newOcc)).toBe(true);
    const after = applyAll(s, plan.commands).state;
    expect(after.occurrences[newOcc]?.active).toBe(true);
  });

  it("tilfeldige endringer i hovedfilmen settes alltid tilbake til versjonen", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed);
      const { state, mainId } = seedProject();
      const v1 = snapshotFromState(state, mainId);
      let s = state;
      const pid = mainId as never;
      for (let i = 0; i < 25; i++) {
        const occs = orderedOccurrences(s, mainId);
        const o = occs[Math.floor(r() * occs.length)]!;
        const all = Object.values(s.blocks).filter((b) => b.variantId === o.variantId);
        const b = all[Math.floor(r() * all.length)];
        const k = Math.floor(r() * 7);
        const c: Command | null =
          k === 0 && b
            ? { type: "EditBlockText", productionId: pid, blockId: b.id, text: `T${seed}-${i}` }
            : k === 1 && b
              ? {
                  type: b.removed ? "RestoreBlock" : "RemoveBlock",
                  productionId: pid,
                  blockId: b.id,
                }
              : k === 2
                ? {
                    type: "InsertBlock",
                    productionId: pid,
                    variantId: o.variantId,
                    block: {
                      blockId: tid(),
                      kind: "dialogue",
                      text: `Ny ${i}`,
                      orderKey: keyBetween(
                        all
                          .map((x) => x.orderKey)
                          .sort()
                          .at(-1) ?? null,
                        null,
                      ),
                    },
                  }
                : k === 3
                  ? { type: "SetOccurrenceActive", occurrenceId: o.id, active: r() < 0.5 }
                  : k === 4
                    ? {
                        type: "MoveOccurrence",
                        occurrenceId: o.id,
                        // Først, eller sist hvis scenen allerede står først
                        orderKey:
                          occs[0]!.id === o.id
                            ? keyBetween(occs.at(-1)!.orderKey, null)
                            : keyBetween(null, occs[0]!.orderKey),
                      }
                    : k === 5
                      ? {
                          type: "EditSceneHeading",
                          productionId: pid,
                          variantId: o.variantId,
                          heading: { intExt: "EXT.", location: `S${i}`, time: "KVELD" },
                        }
                      : b && !b.removed
                        ? {
                            type: "SetBlockKind",
                            productionId: pid,
                            blockId: b.id,
                            kind: b.kind === "action" ? "shot" : "action",
                          }
                        : null;
        if (!c) continue;
        const res = applyCommand(s, envelope(c));
        if (res.ok) s = res.state;
      }
      const plan = restoreVersionPlan(s, mainId, v1);
      expect(plan.issues).toEqual([]);
      const after = applyAll(s, plan.commands).state;
      const old = new Set(v1.scenes.map((sc) => sc.occurrenceId));
      expect(textOf(snapshotFromState(after, mainId), old)).toEqual(textOf(v1));
      expect(
        snapshotFromState(after, mainId)
          .scenes.map((sc) => sc.occurrenceId)
          .filter((id) => old.has(id)),
      ).toEqual(v1.scenes.map((sc) => sc.occurrenceId));
    }
  });

  it("en versjon av en annen produksjon gir ingen kommandoer", () => {
    const { state, mainId, spinoffId } = seedProject();
    const v = snapshotFromState(state, mainId);
    expect(restoreVersionCommands(state, spinoffId, v)).toEqual([]);
  });
});
