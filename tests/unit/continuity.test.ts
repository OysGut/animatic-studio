// @vitest-environment node
/** Kontinuitet for karakterer (M6 del 2, DEC-0055, REQ-0150–0165). */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  appearanceAt,
  blocksOfVariant,
  buildScenePrompt,
  continuitySuggestions,
  continuityTimeline,
  diffStates,
  filmClips,
  keyBetween,
  layerContinuity,
  mainProduction,
  orderedOccurrences,
  planSegments,
  stateFromRows,
  type ContinuityEventFields,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

function setup() {
  let s = fixture.state;
  const main = mainProduction(s)!;
  const occs = orderedOccurrences(s, main.id);
  const kari = tid<"asset">();
  s = mustApply(s, {
    type: "CreateAssets",
    assets: [
      {
        assetId: kari,
        fields: {
          kind: "character",
          name: "Kari",
          names: [],
          description: "Tolv år.",
          category: "",
          tags: [],
        },
      },
    ],
  });
  const variant = (name: string, appearance: string) => {
    const id = tid<"asset_variant">();
    s = mustApply(s, {
      type: "CreateAssetVariant",
      variantId: id,
      assetId: kari,
      fields: { name, style: "animatic", appearance },
    });
    return id;
  };
  const long = variant("Langt hår", "long braided hair");
  const short = variant("Kort hår", "short cropped hair");
  const costume = variant("Nissedrakt", "red gnome costume");
  // Linje i scene på plass 5 der Kari klipper håret (midt i scenen)
  const o5 = occs[5]!;
  const blocks5 = blocksOfVariant(s, o5.variantId);
  const cutBlock = tid<"script_block">();
  s = mustApply(s, {
    type: "InsertBlock",
    productionId: main.id as never,
    variantId: o5.variantId,
    block: {
      blockId: cutBlock,
      kind: "action",
      text: "Kari klipper av seg håret foran speilet.",
      orderKey: keyBetween(blocks5[2]!.orderKey, blocks5[3]!.orderKey),
    },
  });
  return { s, main, occs, kari, long, short, costume, cutBlock };
}

type Ctx = ReturnType<typeof setup>;

function haircut(c: Ctx): ContinuityEventFields {
  return {
    assetId: c.kari,
    kind: "haircut",
    description: "Klipper håret kort",
    fromVariantId: c.long,
    toVariantId: c.short,
    duration: "permanent",
    sceneId: c.occs[5]!.sceneId,
    blockId: c.cutBlock,
    untilSceneId: null,
    status: "approved",
  };
}

function add(s: ProjectState, fields: ContinuityEventFields) {
  const id = tid<"continuity_event">();
  return {
    s: mustApply(s, { type: "AddContinuityEvents", events: [{ eventId: id, fields }] }),
    id,
  };
}

describe("kontinuitetshendelser", () => {
  it("lagres med kommando, kan angres og leses tilbake fra radene", () => {
    const c = setup();
    const { s, id } = add(c.s, haircut(c));
    expect(s.continuityEvents[id]).toMatchObject({ kind: "haircut", status: "approved" });
    const cs = diffStates(c.s, s);
    const row = cs.inserts["continuity_events"]![0]!;
    expect(row).toMatchObject({
      asset_id: c.kari,
      from_variant_id: c.long,
      to_variant_id: c.short,
      duration: "permanent",
      block_id: c.cutBlock,
      until_scene_id: null,
    });
    const back = stateFromRows({
      project: { id: s.project.id, revision: 1, name: "x", fps_num: 25, fps_den: 1 },
      productions: [],
      scenes: [],
      scene_variants: [],
      script_blocks: [],
      script_block_revisions: [],
      scene_occurrences: [],
      production_segments: [],
      takes: [],
      continuity_events: [row],
    });
    expect(back.continuityEvents[id]).toEqual({ ...s.continuityEvents[id], revision: 1 });
    // Angre: merkes fjernet (inverse)
    const r = applyCommand(
      s,
      envelope({ type: "SetContinuityEventsRemoved", eventIds: [id], removed: true }),
    );
    expect(r.ok && r.state.continuityEvents[id]!.removed).toBe(true);
  });

  it("avviser ugyldige hendelser", () => {
    const c = setup();
    const bad = (f: Partial<ContinuityEventFields>) =>
      applyCommand(
        c.s,
        envelope({
          type: "AddContinuityEvents",
          events: [{ eventId: tid(), fields: { ...haircut(c), ...f } }],
        }),
      );
    const otherVariant = Object.values(c.s.assetVariants).find((v) => v.assetId !== c.kari)!;
    expect(bad({ toVariantId: otherVariant.id }).ok).toBe(false);
    expect(bad({ duration: "temporary", untilSceneId: null }).ok).toBe(false);
    // Scenen følger linjen
    const follow = bad({ sceneId: c.occs[2]!.sceneId });
    expect(follow.ok && Object.values(follow.state.continuityEvents).at(-1)!.sceneId).toBe(
      c.occs[5]!.sceneId,
    );
    expect(bad({ kind: "tattoo" as never }).ok).toBe(false);
    expect(bad({ duration: "temporary", untilSceneId: c.occs[8]!.sceneId }).ok).toBe(true);
  });

  it("riktig utseende etter fortellingstiden: langt hår før klippet, kort etter (REQ-0152)", () => {
    const c = setup();
    const { s } = add(c.s, haircut(c));
    const at = (i: number, block: string | null = null) =>
      appearanceAt(s, c.kari, c.occs[i]!.sceneId, block).variantId;
    expect(at(2)).toBe(c.long);
    expect(at(5)).toBe(c.long); // scenens begynnelse, før linjen
    expect(at(5, c.cutBlock)).toBe(c.short);
    expect(at(8)).toBe(c.short);
    expect(at(13)).toBe(c.short);
  });

  it("tilbakeblikk som vises senere, får utseendet fra før hendelsen (REQ-0160/0165)", () => {
    const c = setup();
    let { s } = add(c.s, haircut(c));
    s = mustApply(s, {
      type: "SetStoryTime",
      sceneId: c.occs[11]!.sceneId,
      storyTime: { kind: "flashback", anchorSceneId: c.occs[2]!.sceneId, offset: -0.5 },
    });
    expect(appearanceAt(s, c.kari, c.occs[11]!.sceneId).variantId).toBe(c.long);
    expect(appearanceAt(s, c.kari, c.occs[13]!.sceneId).variantId).toBe(c.short);
  });

  it("midlertidig og bare denne scenen (REQ-0154)", () => {
    const c = setup();
    let { s } = add(c.s, haircut(c));
    ({ s } = add(s, {
      ...haircut(c),
      kind: "costume",
      description: "Nissedrakt på juletrefesten",
      fromVariantId: null,
      toVariantId: c.costume,
      duration: "temporary",
      sceneId: c.occs[7]!.sceneId,
      blockId: null,
      untilSceneId: c.occs[10]!.sceneId,
    }));
    ({ s } = add(s, {
      ...haircut(c),
      kind: "snow_water",
      description: "Snø i håret",
      fromVariantId: null,
      toVariantId: null,
      duration: "scene",
      sceneId: c.occs[3]!.sceneId,
      blockId: null,
    }));
    const at = (i: number) => appearanceAt(s, c.kari, c.occs[i]!.sceneId);
    expect(at(7).variantId).toBe(c.costume);
    expect(at(8).variantId).toBe(c.costume);
    expect(at(10).variantId).toBe(c.short); // over: tilbake til kort hår
    expect(at(3).variantId).toBe(c.long);
    expect(at(3).active.map((e) => e.kind)).toEqual(["snow_water"]);
    expect(at(4).active).toEqual([]);
  });

  it("tidslinjen viser scenene i fortellingsrekkefølge med hendelsene (REQ-0155)", () => {
    const c = setup();
    const { s } = add(c.s, haircut(c));
    const rows = continuityTimeline(s, c.kari);
    const i = rows.findIndex((r) => r.sceneId === c.occs[5]!.sceneId);
    expect(rows[i]!.events.length).toBe(1);
    expect(rows[i]!.present).toBe(true);
    expect(rows[i]!.appearance.variantId).toBe(c.long);
    expect(rows[i + 1]!.appearance.variantId).toBe(c.short);
  });

  it("forslag fra manuset; avviste forslag kommer ikke igjen (REQ-0157/0158)", () => {
    const c = setup();
    const sug = continuitySuggestions(c.s, c.kari);
    expect(sug).toEqual([
      expect.objectContaining({ kind: "haircut", blockId: c.cutBlock, duration: "permanent" }),
    ]);
    const { s } = add(c.s, {
      ...haircut(c),
      fromVariantId: null,
      toVariantId: null,
      status: "dismissed",
    });
    expect(continuitySuggestions(s, c.kari)).toEqual([]);
    // Avviste hendelser påvirker ikke utseendet
    expect(appearanceAt(s, c.kari, c.occs[8]!.sceneId).variantId).toBeNull();
  });

  it("generering: egne segmenter før og etter endringen, med riktig utseende (REQ-0159/0161/0162)", () => {
    const c = setup();
    const { s } = add(c.s, haircut(c));
    const clip = filmClips(s, c.main.id).find((x) => x.occurrenceId === c.occs[5]!.id)!;
    const plan = planSegments(s, clip, 20);
    expect(plan.length).toBeGreaterThanOrEqual(2);
    const k = plan.findIndex((p) => p.blockIds.includes(c.cutBlock));
    expect(plan[k]!.blockIds[0]).toBe(c.cutBlock);
    const prompt = (i: number) =>
      buildScenePrompt(s, {
        clip,
        productionId: c.main.id,
        segment: plan[i]!,
        index: i,
        count: plan.length,
      });
    expect(prompt(k)).toContain("short cropped hair");
    // Uten kontinuitet deles ikke scenen der
    expect(planSegments(s, clip, 20, { continuity: false }).length).toBeLessThanOrEqual(
      plan.length,
    );
  });

  it("sceneeditoren: lag med feil utseende oppdages", () => {
    const c = setup();
    const { s } = add(c.s, haircut(c));
    const layer = { assetId: c.kari, assetVariantId: c.long, versionId: null } as never;
    expect(layerContinuity(s, layer, c.occs[8]!.sceneId)).toMatchObject({ mismatch: true });
    expect(layerContinuity(s, layer, c.occs[2]!.sceneId)).toMatchObject({ mismatch: false });
  });

  it("angring av en variant hendelsen bruker, avvises", () => {
    const c = setup();
    const { s } = add(c.s, haircut(c));
    const r = applyCommand(s, envelope({ type: "UndoCreateAssetVariant", variantId: c.short }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe("referenced");
  });

  it("hendelsen følger linjen når scenen deles, og angring fungerer (gjennomgang)", () => {
    const c = setup();
    const { s, id } = add(c.s, haircut(c));
    const o5 = c.occs[5]!;
    const newScene = tid<"scene">();
    const r = applyCommand(
      s,
      envelope({
        type: "SplitScene",
        productionId: c.main.id as never,
        occurrenceId: o5.id,
        atBlockId: c.cutBlock as never,
        newSceneId: newScene,
        newVariantId: tid(),
        newOccurrenceIds: Object.fromEntries(
          Object.values(s.occurrences)
            .filter((x) => x.variantId === o5.variantId)
            .map((x) => [x.id, tid()]),
        ),
        heading: { intExt: "INT.", location: "BADET", time: "KVELD" },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.continuityEvents[id]!.sceneId).toBe(newScene);
    expect(appearanceAt(r.state, c.kari, o5.sceneId).variantId).toBe(c.long);
    expect(appearanceAt(r.state, c.kari, newScene).variantId).toBe(c.short);
    // Angre delingen: linjen og hendelsen tilbake i den opprinnelige scenen
    const u = applyCommand(r.state, envelope(r.inverse));
    expect(u.ok).toBe(true);
    if (u.ok) expect(u.state.continuityEvents[id]!.sceneId).toBe(o5.sceneId);
  });

  it("utseendet før den første endringen lekker ikke fra senere hendelser (gjennomgang)", () => {
    const c = setup();
    let { s } = add(c.s, { ...haircut(c), fromVariantId: null });
    ({ s } = add(s, {
      ...haircut(c),
      kind: "costume",
      fromVariantId: c.short,
      toVariantId: c.costume,
      duration: "scene",
      sceneId: c.occs[8]!.sceneId,
      blockId: null,
    }));
    expect(appearanceAt(s, c.kari, c.occs[2]!.sceneId).variantId).toBeNull();
  });

  it("hendelser i en deaktivert scene gjelder ikke", () => {
    const c = setup();
    let { s } = add(c.s, haircut(c));
    s = mustApply(s, { type: "SetOccurrenceActive", occurrenceId: c.occs[5]!.id, active: false });
    expect(appearanceAt(s, c.kari, c.occs[8]!.sceneId).variantId).toBeNull();
  });

  it("avviste forslag hindrer ikke angring av linjen; lydressurser har ikke kontinuitet", () => {
    const c = setup();
    const { s, id } = add(c.s, {
      ...haircut(c),
      fromVariantId: null,
      toVariantId: null,
      status: "dismissed",
    });
    const r = applyCommand(s, envelope({ type: "UndoInsertBlock", blockId: c.cutBlock as never }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.continuityEvents[id]).toBeUndefined();
    const sound = Object.values(c.s.assets).find((a) => a.kind === "sound");
    if (sound) {
      const bad = applyCommand(
        c.s,
        envelope({
          type: "AddContinuityEvents",
          events: [
            {
              eventId: tid(),
              fields: { ...haircut(c), assetId: sound.id, fromVariantId: null, toVariantId: null },
            },
          ],
        }),
      );
      expect(bad.ok).toBe(false);
    }
  });
});
