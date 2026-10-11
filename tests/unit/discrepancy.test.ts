// @vitest-environment node
/** Avvik mellom manus og materiale (DEC-0054, REQ-0305/0306/0311/0312). */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  blocksOfVariant,
  diffStates,
  discrepancies,
  filmClips,
  mainProduction,
  materialsOf,
  scriptChanges,
  type ProjectState,
} from "@/core";
import { envelope, mustApply } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

function setup() {
  const s0 = fixture.state;
  const main = mainProduction(s0)!;
  // Scenen med 2D-scene (fixturen har et avvik der; godkjent først, så testene starter rent)
  const clip0 = filmClips(s0, main.id).find((c) => c.compositionId !== null)!;
  const occ = s0.occurrences[clip0.occurrenceId]!;
  const s = mustApply(s0, {
    type: "AcceptScriptChanges",
    occurrenceId: occ.id,
    compositionIds: [Object.values(s0.compositions).find((c) => c.variantId === occ.variantId)!.id],
    takeIds: [],
  });
  const clips = filmClips(s, main.id);
  const clip = clips.find((c) => c.occurrenceId === occ.id)!;
  return { s, main, clips, clip, occ };
}
const comp = (s: ProjectState, variantId: string) =>
  Object.values(s.compositions).find((c) => c.variantId === variantId && !c.removed)!;

describe("avvik ved manusendring", () => {
  it("fixturen har et avvik i scene 1 (replikken er endret etter 2D-scenen)", () => {
    const s0 = fixture.state;
    const found = discrepancies(s0, filmClips(s0, mainProduction(s0)!.id));
    expect(
      found.some(
        (d) =>
          d.material.kind === "composition" &&
          d.changes[0]?.newText === "Hører du det? Noen banker på døra!",
      ),
    ).toBe(true);
  });

  it("2D-scenen er laget fra manuset slik det var; ingen avvik før manuset endres", () => {
    const { s, clips, occ } = setup();
    expect(comp(s, occ.variantId).producedFrom).toBeDefined();
    expect(discrepancies(s, clips).filter((d) => d.material.kind === "composition")).toEqual([]);
  });

  it("endret, ny og fjernet replikk flagges med gammel og ny tekst og berørt tidsrom", () => {
    const { s, main, clips, occ, clip } = setup();
    const blocks = blocksOfVariant(s, occ.variantId);
    const dlg = blocks.find((b) => b.kind === "dialogue")!;
    const act = blocks.filter((b) => b.kind === "action").pop()!;
    let s1 = mustApply(s, {
      type: "EditBlockText",
      productionId: main.id as never,
      blockId: dlg.id,
      text: "Ny replikk.",
    });
    s1 = mustApply(s1, { type: "RemoveBlock", productionId: main.id as never, blockId: act.id });
    const found = discrepancies(s1, filmClips(s1, main.id)).find(
      (d) => d.occurrenceId === occ.id && d.material.kind === "composition",
    )!;
    expect(found).toBeDefined();
    const byKind = Object.fromEntries(found.changes.map((c) => [c.kind, c]));
    expect(byKind["changed"]).toMatchObject({
      blockId: dlg.id,
      oldText: dlg.text,
      newText: "Ny replikk.",
    });
    expect(byKind["removed"]).toMatchObject({ blockId: act.id, oldText: act.text, newText: null });
    // Bare berørte områder: tidsrommet er innenfor klippet og mindre enn hele klippet
    expect(found.spans.length).toBeGreaterThan(0);
    const total = found.spans.reduce((a, x) => a + x.endFrame - x.startFrame, 0);
    expect(total).toBeLessThan(clip.durationFrames);
    for (const x of found.spans) {
      expect(x.startFrame).toBeGreaterThanOrEqual(clip.startFrame);
      expect(x.endFrame).toBeLessThanOrEqual(clip.startFrame + clip.durationFrames + 1);
    }
    void clips;
  });

  it("en endring som er endret tilbake, er ikke et avvik (sammenlignes på tekst)", () => {
    const { s, main, occ } = setup();
    const dlg = blocksOfVariant(s, occ.variantId).find((b) => b.kind === "dialogue")!;
    let s1 = mustApply(s, {
      type: "EditBlockText",
      productionId: main.id as never,
      blockId: dlg.id,
      text: "Midlertidig.",
    });
    s1 = mustApply(s1, {
      type: "EditBlockText",
      productionId: main.id as never,
      blockId: dlg.id,
      text: dlg.text,
    });
    expect(
      scriptChanges(s1, occ.variantId, comp(s1, occ.variantId).producedFrom!.blockRevisions),
    ).toEqual([]);
  });

  it("godkjenn: grunnlaget blir manuset nå; angre gir avviket tilbake", () => {
    const { s, main, occ } = setup();
    const dlg = blocksOfVariant(s, occ.variantId).find((b) => b.kind === "dialogue")!;
    const s1 = mustApply(s, {
      type: "EditBlockText",
      productionId: main.id as never,
      blockId: dlg.id,
      text: "Ny.",
    });
    const c = comp(s1, occ.variantId);
    const takeIds = materialsOf(s1, occ.id)
      .filter((m) => m.kind === "take")
      .map((m) => m.id);
    const r = applyCommand(
      s1,
      envelope({
        type: "AcceptScriptChanges",
        occurrenceId: occ.id,
        compositionIds: [c.id],
        takeIds: takeIds as never,
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(
      discrepancies(r.state, filmClips(r.state, main.id)).filter((d) => d.occurrenceId === occ.id),
    ).toEqual([]);
    expect(diffStates(s1, r.state).updates["compositions"]?.[0]).toHaveProperty("produced_from");
    const back = mustApply(r.state, r.inverse);
    expect(
      discrepancies(back, filmClips(back, main.id)).some((d) => d.occurrenceId === occ.id),
    ).toBe(true);
  });

  it("ukjent grunnlag (laget før kontrollen) flagges ikke", () => {
    const { s, occ } = setup();
    const c = comp(s, occ.variantId);
    const s1 = mustApply(s, {
      type: "SetProducedFrom",
      compositions: [{ compositionId: c.id, blockRevisions: {} }],
      takes: [],
    });
    expect(comp(s1, occ.variantId).producedFrom).toBeUndefined();
    expect(scriptChanges(s1, occ.variantId, {})).toEqual([]);
  });
});

describe("rettelser etter gjennomgang (DEC-0054)", () => {
  it("godkjenning av en versjon endrer aldri producedFrom (INV-07); grunnlaget lagres ved siden av", async () => {
    const s0 = fixture.state;
    const take = Object.values(s0.takes).find((t) => t.kind === "imported_film")!;
    const s1 = mustApply(s0, {
      type: "AcceptScriptChanges",
      occurrenceId: take.occurrenceId,
      compositionIds: [],
      takeIds: [take.id],
    });
    expect(s1.takes[take.id]!.producedFrom).toEqual(take.producedFrom);
    expect(s1.takes[take.id]!.acceptedFrom).toBeDefined();
    const row = diffStates(s0, s1).updates["takes"]![0]!;
    expect(row["produced_from"]).toEqual(take.producedFrom);
    expect(row).toHaveProperty("accepted_from");
  });

  it("versjoner som ikke er i bruk, flagges ikke", () => {
    const s0 = fixture.state;
    const main = mainProduction(s0)!;
    const take = Object.values(s0.takes).find((t) => t.kind === "imported_film")!;
    const occ = s0.occurrences[take.occurrenceId]!;
    const dlg = blocksOfVariant(s0, occ.variantId).find((b) => b.kind === "dialogue")!;
    let s1 = mustApply(s0, {
      type: "EditBlockText",
      productionId: main.id as never,
      blockId: dlg.id,
      text: "Endret.",
    });
    const flaggedTakes = (st: ProjectState) =>
      discrepancies(st, filmClips(st, main.id)).filter((d) => d.material.id === take.id);
    const inUse = s1.occurrences[occ.id]!.activeTakeId === take.id;
    expect(flaggedTakes(s1).length > 0).toBe(inUse);
    if (inUse) {
      // Bytt til animatic: versjonen er ikke lenger i bruk og flagges ikke
      s1 = mustApply(s1, {
        type: "SetSceneEdit",
        occurrenceId: occ.id,
        activeTakeId: null,
        parts: [],
      });
      expect(flaggedTakes(s1)).toEqual([]);
    }
  });
});
