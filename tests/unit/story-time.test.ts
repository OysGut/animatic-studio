// @vitest-environment node
/** Ikke-lineær fortelling i manus (mandat 10.7, REQ-0164/0165): tilbakeblikk, drøm, tidshopp. */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  keyBetween,
  mainProduction,
  orderedOccurrences,
  storyPlacementOf,
  storyTimeFor,
  storyTimes,
} from "@/core";
import { envelope, mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const occs = orderedOccurrences(s0, main.id);

describe("fortellingstid", () => {
  it("et tilbakeblikk sist i filmen skjer før ankerscenen i historien, og kan angres", () => {
    const last = occs[occs.length - 1]!;
    const anchor = occs[1]!;
    const r = applyCommand(
      s0,
      envelope({
        type: "SetStoryTime",
        sceneId: last.sceneId,
        storyTime: storyTimeFor("flashback", anchor.sceneId, "before"),
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = storyTimes(r.state);
    expect(t.get(last.sceneId)!).toBeLessThan(t.get(anchor.sceneId)!);
    expect(t.get(last.sceneId)!).toBeGreaterThan(t.get(occs[0]!.sceneId)!);
    expect(r.state.scenes[last.sceneId]!.storyTime.kind).toBe("flashback");
    const back = mustApply(r.state, r.inverse as never);
    expect(back.scenes[last.sceneId]!.storyTime).toEqual(s0.scenes[last.sceneId]!.storyTime);
  });

  it("plassering og lineær uten anker; ukjent type og selvanker avvises", () => {
    expect(storyTimeFor("linear", occs[0]!.sceneId, "after")).toEqual({
      kind: "linear",
      anchorSceneId: null,
      offset: 0,
    });
    expect(storyTimeFor("dream", occs[0]!.sceneId, "same").offset).toBe(0);
    expect(storyTimeFor("jump", null, "after").offset).toBe(0);
    expect(storyPlacementOf(-0.5)).toBe("before");
    expect(storyPlacementOf(0)).toBe("same");
    expect(storyPlacementOf(0.5)).toBe("after");
    const sc = occs[0]!.sceneId;
    for (const storyTime of [
      { kind: "memory", anchorSceneId: null, offset: 0 },
      { kind: "dream", anchorSceneId: sc, offset: 0 },
    ])
      expect(
        applyCommand(s0, envelope({ type: "SetStoryTime", sceneId: sc, storyTime } as never)).ok,
      ).toBe(false);
  });
});

describe("fortellingstid ved oppretting og angring", () => {
  const create = (storyTime: unknown) =>
    applyCommand(
      s0,
      envelope({
        type: "CreateScene",
        productionId: main.id,
        sceneId: tid(),
        variantId: tid(),
        occurrenceId: tid(),
        orderKey: keyBetween(occs[occs.length - 1]!.orderKey, null),
        heading: { intExt: "INT.", location: "NY", time: "DAG" },
        blocks: [],
        productionNumber: null,
        storyTime,
      } as never),
    );

  it("ny scene med ugyldig fortellingstid avvises i kjernen", () => {
    expect(create({ kind: "linear", anchorSceneId: occs[0]!.sceneId, offset: 0 }).ok).toBe(false);
    expect(create({ kind: "dream", anchorSceneId: null, offset: "zzz" }).ok).toBe(false);
    expect(create({ kind: "dream", anchorSceneId: occs[0]!.sceneId, offset: 0 }).ok).toBe(true);
  });

  it("en ny scene som en annen scene er ankret til, kan ikke angres bort", () => {
    const r = create(undefined);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const newScene = Object.keys(r.state.scenes).find((id) => !s0.scenes[id])!;
    const anchored = mustApply(r.state, {
      type: "SetStoryTime",
      sceneId: occs[0]!.sceneId,
      storyTime: storyTimeFor("flashforward", newScene, "after"),
    });
    const undo = applyCommand(anchored, envelope(r.inverse as never));
    expect(undo.ok).toBe(false);
    if (!undo.ok) expect(undo.error.code).toBe("referenced");
  });
});
