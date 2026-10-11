// @vitest-environment node
/** Avledede produksjoner – spinoffer (M7 del 1, DEC-0057, REQ-0353–0366, REQ-0498/0499). */
import { describe, expect, it } from "vitest";
import {
  addScenesCommands,
  applyCommand,
  blocksOfVariant,
  compositionOfVariant,
  deriveProductionCommands,
  discrepancies,
  filmClips,
  forkPlan,
  isSharedIn,
  keyBetween,
  layersOf,
  mainProduction,
  orderedOccurrences,
  ownCopyCommands,
  scriptView,
  type Command,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

function applyAll(s: ProjectState, commands: readonly Command[]) {
  for (const c of commands) s = mustApply(s, c);
  return s;
}

function spinoff() {
  const s0 = fixture.state;
  const main = mainProduction(s0)!;
  const occs = orderedOccurrences(s0, main.id);
  const pid = tid<"production">();
  const picked = [occs[0]!.id, occs[2]!.id, occs[4]!.id];
  const s = applyAll(
    s0,
    deriveProductionCommands(s0, {
      productionId: pid,
      name: "Majas jul",
      kind: "spinoff",
      parentProductionId: main.id,
      occurrenceIds: picked,
    }),
  );
  return { s0, s, main, occs, pid, picked };
}

const text = (s: ProjectState, productionId: string) =>
  JSON.stringify(scriptView(s, productionId as never).map((x) => x.blocks.map((b) => b.text)));

describe("avledet produksjon", () => {
  it("lages fra utvalgte scener i hovedfilmens rekkefølge, som referanser (REQ-0354/0360)", () => {
    const { s, occs, pid, main } = spinoff();
    const own = orderedOccurrences(s, pid);
    expect(own.map((o) => o.sceneId)).toEqual([
      occs[0]!.sceneId,
      occs[2]!.sceneId,
      occs[4]!.sceneId,
    ]);
    expect(own.map((o) => o.variantId)).toEqual([
      occs[0]!.variantId,
      occs[2]!.variantId,
      occs[4]!.variantId,
    ]);
    expect(isSharedIn(s, pid, own[0]!.variantId)).toBe(true);
    // Hovedfilmen er urørt
    expect(orderedOccurrences(s, main.id).length).toBe(occs.length);
    // 2D-scenen gjenbrukes i spinoffens film (samme variant)
    expect(filmClips(s, pid)[0]!.compositionId).toBe(
      compositionOfVariant(s, occs[0]!.variantId)!.id,
    );
  });

  it("flere scener legges til sist; scener som finnes, hoppes over", () => {
    const { s, occs, pid } = spinoff();
    const cmds = addScenesCommands(s, pid, [occs[0]!.id, occs[6]!.id]);
    expect(cmds).toHaveLength(1);
    const s2 = applyAll(s, cmds);
    expect(orderedOccurrences(s2, pid).at(-1)!.sceneId).toBe(occs[6]!.sceneId);
  });

  it("rekkefølge og synlighet i spinoffen endrer ikke hovedfilmen (REQ-0356)", () => {
    const { s, main, pid } = spinoff();
    const own = orderedOccurrences(s, pid);
    let s2 = mustApply(s, { type: "SetOccurrenceActive", occurrenceId: own[1]!.id, active: false });
    s2 = mustApply(s2, {
      type: "MoveOccurrence",
      occurrenceId: own[2]!.id,
      orderKey: keyBetween(null, own[0]!.orderKey),
    });
    expect(orderedOccurrences(s2, main.id)).toEqual(orderedOccurrences(s, main.id));
  });

  it("endring av en delt scene i spinoffen gir egen variant; hovedfilmen endres ikke (REQ-0365)", () => {
    const { s, main, pid } = spinoff();
    const own = orderedOccurrences(s, pid)[0]!;
    const block = blocksOfVariant(s, own.variantId).find((b) => b.kind === "dialogue")!;
    const cmd: Command = {
      type: "EditBlockText",
      productionId: pid as never,
      blockId: block.id,
      text: "Bare i spinoffen.",
    };
    // Kjernen avviser direkte endring (INV-04)
    expect(applyCommand(s, envelope(cmd)).ok).toBe(false);
    const plan = forkPlan(s, cmd)!;
    expect(plan.fork[0]!.type).toBe("ForkVariant");
    const before = text(s, main.id);
    const s2 = applyAll(s, [...plan.fork, plan.command]);
    expect(text(s2, main.id)).toBe(before);
    expect(text(s2, pid)).toContain("Bare i spinoffen.");
    expect(isSharedIn(s2, pid, s2.occurrences[own.id]!.variantId)).toBe(false);
    // I hovedfilmen trengs ingen egen variant
    const mainOcc = orderedOccurrences(s, main.id)[0]!;
    const mainBlock = blocksOfVariant(s, mainOcc.variantId).find((b) => b.kind === "dialogue")!;
    expect(
      forkPlan(s, {
        type: "EditBlockText",
        productionId: main.id as never,
        blockId: mainBlock.id,
        text: "x",
      }),
    ).toBeNull();
  });

  it("nye scener i spinoffen legges ikke i hovedfilmen (REQ-0361–0363, REQ-0499)", () => {
    const { s, main, pid } = spinoff();
    const occ = tid<"scene_occurrence">();
    const s2 = mustApply(s, {
      type: "CreateScene",
      productionId: pid as never,
      sceneId: tid(),
      variantId: tid(),
      occurrenceId: occ,
      orderKey: "z",
      heading: { intExt: "EXT.", location: "FJELLET", time: "NATT" },
      blocks: [{ blockId: tid(), kind: "action", text: "Bare her.", orderKey: "i" }],
      productionNumber: null,
    });
    expect(orderedOccurrences(s2, main.id).some((o) => o.id === occ)).toBe(false);
    expect(s2.variants[s2.occurrences[occ]!.variantId]!.ownerProductionId).toBe(pid);
  });

  it("«Lag egen kopi» kopierer 2D-scenen med lag og grupper; hovedfilmens 2D-scene er urørt", () => {
    const { s, pid, occs } = spinoff();
    const own = orderedOccurrences(s, pid)[0]!;
    const mainComp = compositionOfVariant(s, occs[0]!.variantId)!;
    const cmds = ownCopyCommands(s, own.id)!;
    const s2 = applyAll(s, cmds);
    const v = s2.occurrences[own.id]!.variantId;
    expect(v).not.toBe(occs[0]!.variantId);
    const copy = compositionOfVariant(s2, v)!;
    expect(copy.id).not.toBe(mainComp.id);
    const a = layersOf(s2, mainComp.id);
    const b = layersOf(s2, copy.id);
    expect(b.map((l) => l.name)).toEqual(a.map((l) => l.name));
    expect(copy.camera).toEqual(mainComp.camera);
    // Grupper peker på kopiens lag
    for (const l of b) if (l.groupId) expect(b.some((x) => x.id === l.groupId)).toBe(true);
    expect(ownCopyCommands(s2, own.id)).toBeNull();
  });

  it("gjennomgang: automatisk egen versjon tar med 2D-scenen uten falske avvik, og kan angres", () => {
    const { s, pid, occs } = spinoff();
    const own = orderedOccurrences(s, pid)[0]!;
    const block = blocksOfVariant(s, own.variantId).find((b) => b.kind === "dialogue")!;
    const cmd: Command = {
      type: "EditBlockText",
      productionId: pid as never,
      blockId: block.id,
      text: "Ny replikk i spinoffen.",
    };
    const plan = forkPlan(s, cmd)!;
    expect(plan.fork.map((c) => c.type)).toEqual(
      expect.arrayContaining(["ForkVariant", "CreateComposition", "AddLayers"]),
    );
    // Steg for steg med inverser (som angring i appen)
    const inverses: Command[] = [];
    let st = s;
    for (const c of [...plan.fork, plan.command]) {
      const r = applyCommand(st, envelope(c));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      inverses.unshift(r.inverse);
      st = r.state;
    }
    // Spinoffen har fortsatt 2D-scene, og bare den endrede linjen er et avvik
    const clip = filmClips(st, pid)[0]!;
    expect(clip.compositionId).not.toBeNull();
    expect(clip.compositionId).not.toBe(compositionOfVariant(s, occs[0]!.variantId)!.id);
    const found = discrepancies(st, [clip]).flatMap((d) => d.changes);
    expect(found.map((c) => c.kind)).toEqual(["changed"]);
    // Angre alt (omvendt rekkefølge): tilbake til delt scene
    for (const inv of inverses) {
      const r = applyCommand(st, envelope(inv));
      expect(r.ok, inv.type).toBe(true);
      if (!r.ok) return;
      st = r.state;
    }
    expect(st.occurrences[own.id]!.variantId).toBe(occs[0]!.variantId);
  });

  it("gjennomgang: deling av en delt scene i spinoffen gjør den til egen versjon først", () => {
    const { s, pid } = spinoff();
    const own = orderedOccurrences(s, pid)[0]!;
    const blocks = blocksOfVariant(s, own.variantId);
    const at = blocks[3]!;
    const cmd: Command = {
      type: "SplitScene",
      productionId: pid as never,
      occurrenceId: own.id,
      atBlockId: at.id,
      newSceneId: tid(),
      newVariantId: tid(),
      newOccurrenceIds: Object.fromEntries(
        Object.values(s.occurrences)
          .filter((o) => o.variantId === own.variantId)
          .map((o) => [o.id, tid()]),
      ),
      heading: { intExt: "INT.", location: "GANGEN", time: "DAG" },
    };
    const plan = forkPlan(s, cmd)!;
    expect(plan).not.toBeNull();
    const st = applyAll(s, [...plan.fork, plan.command]);
    expect(orderedOccurrences(st, pid).length).toBe(4);
  });
});
