// @vitest-environment node
/**
 * Scenariotester for kommandoene (SKILL_TEST_SCENARIOS S1–S6, S9; scene-sync-invariants TEST_SCENARIOS).
 */
import { describe, expect, it } from "vitest";
import {
  activeStructure,
  applyCommand,
  assemblyView,
  checkInvariants,
  diffStates,
  keyBetween,
  orderedOccurrences,
  outdatedTakes,
  scriptView,
  storyTimes,
  type BlockId,
} from "@/core";
import { BOB, envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

describe("Grunnprosjektet", () => {
  it("bryter ingen invarianter", () => {
    const { state } = seedProject();
    expect(checkInvariants(state)).toEqual([]);
  });
});

describe("S2 – flytte en scene (INV-01, kap. 2)", () => {
  it("én kommando endrer rekkefølgen i både manus og film, uten nye ID-er", () => {
    const { state, mainId } = seedProject();
    const occ = orderedOccurrences(state, mainId);
    const moving = occ[7]!;
    const s2 = mustApply(state, {
      type: "MoveOccurrence",
      occurrenceId: moving.id,
      orderKey: keyBetween(null, occ[0]!.orderKey),
    });
    const script = scriptView(s2, mainId).map((x) => x.occurrenceId);
    const film = assemblyView(s2, mainId).map((x) => x.occurrenceId);
    expect(script[0]).toBe(moving.id);
    expect(film).toEqual(script);
    expect(s2.occurrences[moving.id]!.sceneId).toBe(moving.sceneId);
    expect(s2.occurrences[moving.id]!.productionNumber).toBe(moving.productionNumber);
  });
  it("tidskoder beregnes på nytt, men takes er uendret", () => {
    const { state, mainId } = seedProject();
    const before = assemblyView(state, mainId, 100);
    const first = orderedOccurrences(state, mainId)[0]!;
    const s2 = mustApply(state, {
      type: "MoveOccurrence",
      occurrenceId: first.id,
      orderKey: keyBetween(orderedOccurrences(state, mainId).at(-1)!.orderKey, null),
    });
    const after = assemblyView(s2, mainId, 100);
    expect(after.at(-1)!.occurrenceId).toBe(first.id);
    expect(after.at(-1)!.startFrame).not.toBe(before[0]!.startFrame);
    expect(s2.takes).toBe(state.takes);
  });
});

describe("S3 – deaktivere en scene (INV-14)", () => {
  it("utelates fra manus og film, men ingenting slettes og den kan gjenaktiveres", () => {
    const { state, mainId } = seedProject();
    const target = orderedOccurrences(state, mainId)[2]!;
    const off = mustApply(state, {
      type: "SetOccurrenceActive",
      occurrenceId: target.id,
      active: false,
    });
    expect(scriptView(off, mainId).some((x) => x.occurrenceId === target.id)).toBe(false);
    expect(assemblyView(off, mainId).some((x) => x.occurrenceId === target.id)).toBe(false);
    expect(Object.keys(off.takes)).toEqual(Object.keys(state.takes));
    expect(Object.keys(off.blocks)).toEqual(Object.keys(state.blocks));
    const on = mustApply(off, {
      type: "SetOccurrenceActive",
      occurrenceId: target.id,
      active: true,
    });
    expect(scriptView(on, mainId).map((x) => x.occurrenceId)).toEqual(
      scriptView(state, mainId).map((x) => x.occurrenceId),
    );
  });
});

describe("S4 – spinoff redigerer en delt scene (INV-04, kap. 24.5)", () => {
  it("krever egen variant og lar hovedfilmen være uendret", () => {
    const { state, mainId, spinoffId } = seedProject();
    const spinOcc = orderedOccurrences(state, spinoffId)[0]!;
    const block = Object.values(state.blocks).find((b) => b.variantId === spinOcc.variantId)!;

    const direct = applyCommand(
      state,
      envelope({
        type: "EditBlockText",
        productionId: spinoffId as never,
        blockId: block.id,
        text: "Kortere replikk",
      }),
    );
    expect(direct.ok).toBe(false);
    if (!direct.ok) expect(direct.error.code).toBe("must_fork_variant");

    const map: Record<string, BlockId> = {};
    for (const b of Object.values(state.blocks))
      if (b.variantId === spinOcc.variantId) map[b.id] = tid();
    const newVariantId = tid<"scene_variant">();
    let s = mustApply(state, {
      type: "ForkVariant",
      occurrenceId: spinOcc.id,
      newVariantId,
      blockIdMap: map,
    });
    s = mustApply(s, {
      type: "EditBlockText",
      productionId: spinoffId as never,
      blockId: map[block.id]!,
      text: "Kortere replikk",
    });

    expect(s.blocks[block.id]).toEqual(state.blocks[block.id]); // hovedfilmens blokk uendret
    const mainScene = scriptView(s, mainId).find((x) => x.sceneId === spinOcc.sceneId)!;
    expect(mainScene.blocks.map((b) => b.text)).toEqual(
      scriptView(state, mainId)
        .find((x) => x.sceneId === spinOcc.sceneId)!
        .blocks.map((b) => b.text),
    );
    const spinScene = scriptView(s, spinoffId).find((x) => x.sceneId === spinOcc.sceneId)!;
    expect(spinScene.blocks.some((b) => b.text === "Kortere replikk")).toBe(true);
    expect(s.variants[newVariantId]!.ownerProductionId).toBe(spinoffId);
  });
  it("flytting i spinoffen endrer ikke hovedfilmens rekkefølge", () => {
    const { state, mainId, spinoffId } = seedProject();
    const sp = orderedOccurrences(state, spinoffId);
    const s = mustApply(state, {
      type: "MoveOccurrence",
      occurrenceId: sp[2]!.id,
      orderKey: keyBetween(null, sp[0]!.orderKey),
    });
    expect(orderedOccurrences(s, mainId)).toEqual(orderedOccurrences(state, mainId));
  });
});

describe("S5 – norsk replikk endres i scene med ferdig film (INV-07, INV-08)", () => {
  it("ferdig materiale endres ikke, men blir markert som utdatert for berørte blokker", () => {
    const { state, mainId } = seedProject();
    const occ = orderedOccurrences(state, mainId)[0]!;
    expect(occ.activeTakeId).not.toBeNull();
    expect(outdatedTakes(state)).toEqual([]);
    const dialogue = Object.values(state.blocks).find(
      (b) => b.variantId === occ.variantId && b.kind === "dialogue",
    )!;
    const s = mustApply(state, {
      type: "EditBlockText",
      productionId: mainId as never,
      blockId: dialogue.id,
      text: "Hvor er Ola?",
    });
    expect(s.takes).toEqual(state.takes);
    expect(s.occurrences[occ.id]!.activeTakeId).toBe(occ.activeTakeId);
    const outdated = outdatedTakes(s);
    expect(outdated).toHaveLength(1);
    expect(outdated[0]!.changedBlockIds).toEqual([dialogue.id]);
  });
  it("angre (invers kommando) gjenoppretter teksten og bevarer historikken", () => {
    const { state, mainId } = seedProject();
    const block = Object.values(state.blocks)[0]!;
    const r = applyCommand(
      state,
      envelope({
        type: "EditBlockText",
        productionId: mainId as never,
        blockId: block.id,
        text: "Ny",
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const undone = applyCommand(r.state, envelope(r.inverse));
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.state.blocks[block.id]!.text).toBe(block.text);
    expect(undone.state.blockRevisions.filter((x) => x.blockId === block.id)).toHaveLength(3);
  });
});

describe("S6 – fortellingstid og flashback (INV-09, DEC-0020 pkt. 6)", () => {
  it("flashback ankret til en tidligere scene beholder fortellingstiden når den flyttes", () => {
    const { state, mainId } = seedProject();
    const occ = orderedOccurrences(state, mainId);
    const haircut = occ[3]!; // scenen der håret klippes
    const flashback = occ[8]!; // vises senere, men skjer før hårklippet
    let s = mustApply(state, {
      type: "SetStoryTime",
      sceneId: flashback.sceneId,
      storyTime: { kind: "flashback", anchorSceneId: occ[1]!.sceneId, offset: -0.5 },
    });
    const t1 = storyTimes(s);
    expect(t1.get(flashback.sceneId)!).toBeLessThan(t1.get(haircut.sceneId)!);
    s = mustApply(s, {
      type: "MoveOccurrence",
      occurrenceId: flashback.id,
      orderKey: keyBetween(occ.at(-1)!.orderKey, null),
    });
    expect(storyTimes(s).get(flashback.sceneId)).toBe(t1.get(flashback.sceneId));
  });
  it("segmentering ved utseendeendring midt i scene endrer ikke manus eller nummer (INV-10)", () => {
    const { state, mainId } = seedProject();
    const occ = orderedOccurrences(state, mainId)[3]!;
    const blocks = Object.values(state.blocks).filter((b) => b.variantId === occ.variantId);
    const s = mustApply(state, {
      type: "CreateSegments",
      occurrenceId: occ.id,
      reason: "continuity_change",
      segments: [
        { segmentId: tid(), orderKey: "a", startBlockId: blocks[0]!.id, endBlockId: blocks[1]!.id },
        { segmentId: tid(), orderKey: "m", startBlockId: blocks[2]!.id, endBlockId: blocks[2]!.id },
      ],
    });
    expect(scriptView(s, mainId)).toEqual(scriptView(state, mainId));
    expect(s.scenes).toBe(state.scenes);
    expect(Object.keys(s.segments)).toHaveLength(2);
  });
  it("sirkulære ankre avvises", () => {
    const { state, mainId } = seedProject();
    const [a, b] = orderedOccurrences(state, mainId);
    const s = mustApply(state, {
      type: "SetStoryTime",
      sceneId: a!.sceneId,
      storyTime: { kind: "flashback", anchorSceneId: b!.sceneId, offset: -1 },
    });
    const r = applyCommand(
      s,
      envelope({
        type: "SetStoryTime",
        sceneId: b!.sceneId,
        storyTime: { kind: "dream", anchorSceneId: a!.sceneId, offset: 1 },
      }),
    );
    expect(r.ok).toBe(false);
  });
});

describe("S9 – samtidig redigering (INV-C1)", () => {
  it("en skriving basert på gammel revisjon avvises og endrer ingenting", () => {
    const { state, mainId } = seedProject();
    const block = Object.values(state.blocks)[0]!;
    const base = { [block.id]: block.revision };
    const alice = applyCommand(
      state,
      envelope(
        { type: "EditBlockText", productionId: mainId as never, blockId: block.id, text: "Alice" },
        undefined,
        base,
      ),
    );
    expect(alice.ok).toBe(true);
    if (!alice.ok) return;
    const bob = applyCommand(
      alice.state,
      envelope(
        { type: "EditBlockText", productionId: mainId as never, blockId: block.id, text: "Bob" },
        BOB,
        base,
      ),
    );
    expect(bob.ok).toBe(false);
    if (!bob.ok) {
      expect(bob.error.code).toBe("revision_conflict");
      expect(bob.error.details).toContain(block.id);
    }
  });
  it("to brukere som redigerer hver sin replikk lykkes begge (S10)", () => {
    const { state, mainId } = seedProject();
    const [b1, b2] = Object.values(state.blocks);
    const a = applyCommand(
      state,
      envelope(
        { type: "EditBlockText", productionId: mainId as never, blockId: b1!.id, text: "A" },
        undefined,
        { [b1!.id]: b1!.revision },
      ),
    );
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = applyCommand(
      a.state,
      envelope(
        { type: "EditBlockText", productionId: mainId as never, blockId: b2!.id, text: "B" },
        BOB,
        { [b2!.id]: b2!.revision },
      ),
    );
    expect(b.ok).toBe(true);
  });
});

describe("Gjenbruk av take i spinoff (DEC-0020 pkt. 7, S11)", () => {
  it("spinoffen kan bruke hovedfilmens ferdige take uten kopi", () => {
    const { state, mainId, spinoffId } = seedProject();
    const mainOcc = orderedOccurrences(state, mainId)[0]!;
    const s0 = mustApply(state, {
      type: "AddOccurrence",
      productionId: spinoffId as never,
      occurrenceId: tid(),
      sceneId: mainOcc.sceneId,
      variantId: mainOcc.variantId,
      orderKey: "zz",
    });
    const spin = orderedOccurrences(s0, spinoffId).at(-1)!;
    const s = mustApply(s0, {
      type: "SetActiveTake",
      occurrenceId: spin.id,
      takeId: mainOcc.activeTakeId,
    });
    expect(Object.keys(s.takes)).toEqual(Object.keys(state.takes));
    expect(s.occurrences[mainOcc.id]).toEqual(s0.occurrences[mainOcc.id]);
  });
});

describe("Endringssett til databasen (DEC-0022)", () => {
  it("inneholder bare det som er endret, med forventet revisjon", () => {
    const { state, mainId } = seedProject();
    const occ = activeStructure(state, mainId)[0]!;
    const s = mustApply(state, {
      type: "SetOccurrenceActive",
      occurrenceId: occ.id,
      active: false,
    });
    const cs = diffStates(state, s);
    expect(cs.inserts).toEqual({});
    expect(cs.deletes).toEqual({});
    expect(cs.updates["scene_occurrences"]).toHaveLength(1);
    expect(cs.updates["scene_occurrences"]![0]).toMatchObject({
      id: occ.id,
      active: false,
      revision: occ.revision + 1,
      expected_revision: occ.revision,
    });
  });
});
