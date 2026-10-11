// @vitest-environment node
/** Kontinuitet i spinoffer og varsler om hull (M7 del 4, DEC-0060, REQ-0166/0167, REQ-0325, REQ-0369). */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  appearanceAt,
  continuityAnalysis,
  continuityEventsOf,
  continuityFor,
  deriveProductionCommands,
  includeSceneCommands,
  diffStates,
  emptyProjectState,
  mainProduction,
  orderedOccurrences,
  ownCopyCommands,
  sceneContinuityVariant,
  stateFromRows,
  type Command,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const order = orderedOccurrences(s0, main.id);
const maja = Object.values(s0.assets).find((a) => a.name === "Maja")!;
const haircut = Object.values(s0.continuityEvents).find((e) => e.kind === "haircut")!;
const short = haircut.toVariantId!;

const applyAll = (s: ProjectState, cs: readonly Command[]) =>
  cs.reduce((acc: ProjectState, c) => mustApply(acc, c), s);

/** En spinoff uten scenen med hårklippet (scene 4), men med scene 9 der Maja er med. */
function withoutHaircut() {
  const pid = tid<"production">();
  const s = applyAll(
    s0,
    deriveProductionCommands(s0, {
      productionId: pid,
      name: "Uten klipp",
      kind: "spinoff",
      parentProductionId: main.id,
      occurrenceIds: [order[0]!.id, order[8]!.id],
    }),
  );
  return { s, pid, later: order[8]! };
}

describe("kontinuitet per produksjon", () => {
  it("spinoffen arver hovedfilmens hendelser (REQ-0166)", () => {
    const { s, pid, later } = withoutHaircut();
    const cs = continuityFor(s, pid);
    expect(continuityEventsOf(cs, maja.id).map((e) => e.id)).toContain(haircut.id);
    expect(appearanceAt(cs, maja.id, later.sceneId).variantId).toBe(short);
    expect(continuityFor(s, main.id)).toBe(s);
  });

  it("en arvet hendelse kan slås av i spinoffen uten at hovedfilmen endres (REQ-0167)", () => {
    const { s, pid, later } = withoutHaircut();
    const r = applyCommand(
      s,
      envelope({
        type: "SetContinuityEventDisabled",
        eventId: haircut.id,
        productionId: pid as never,
        disabled: true,
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cs = continuityFor(r.state, pid);
    expect(continuityEventsOf(cs, maja.id).map((e) => e.id)).not.toContain(haircut.id);
    expect(appearanceAt(cs, maja.id, later.sceneId).variantId).not.toBe(short);
    // Hovedfilmen: uendret
    expect(appearanceAt(r.state, maja.id, later.sceneId).variantId).toBe(short);
    expect(continuityEventsOf(r.state, maja.id).map((e) => e.id)).toEqual(
      continuityEventsOf(s, maja.id).map((e) => e.id),
    );
    // Angre
    const back = applyCommand(r.state, envelope(r.inverse));
    expect(back.ok && back.state.continuityEvents[haircut.id]!.disabledIn).toBe(undefined);
    // Hovedfilmen kan ikke «slå av» (den fjerner i stedet)
    expect(
      applyCommand(
        s,
        envelope({
          type: "SetContinuityEventDisabled",
          eventId: haircut.id,
          productionId: main.id as never,
          disabled: true,
        }),
      ).ok,
    ).toBe(false);
  });

  it("en lokal hendelse gjelder bare i spinoffen og forblir lokal ved endring", () => {
    const { s, pid, later } = withoutHaircut();
    const id = tid<"continuity_event">();
    const s2 = mustApply(s, {
      type: "AddContinuityEvents",
      events: [
        {
          eventId: id,
          fields: {
            assetId: maja.id,
            kind: "haircut",
            description: "Klipper håret i spinoffen",
            fromVariantId: haircut.fromVariantId,
            toVariantId: short,
            duration: "permanent",
            sceneId: order[0]!.sceneId,
            blockId: null,
            untilSceneId: null,
            status: "approved",
            productionId: pid as never,
          },
        },
      ],
    });
    const cs = continuityFor(s2, pid);
    expect(continuityEventsOf(cs, maja.id).map((e) => e.id)).toContain(id);
    expect(continuityEventsOf(s2, maja.id).map((e) => e.id)).not.toContain(id);
    // I hovedfilmen er Maja langhåret i scene 1 (før klippet), i spinoffen kortklipt
    expect(appearanceAt(cs, maja.id, order[0]!.sceneId).baseVariantId).toBe(short);
    expect(appearanceAt(s2, maja.id, order[0]!.sceneId).baseVariantId).not.toBe(short);
    expect(appearanceAt(cs, maja.id, later.sceneId).variantId).toBe(short);
    // Endring av hendelsen beholder at den er lokal
    const e = s2.continuityEvents[id]!;
    const s3 = mustApply(s2, {
      type: "UpdateContinuityEvents",
      events: [
        {
          eventId: id,
          fields: {
            assetId: e.assetId,
            kind: e.kind,
            description: "Ny beskrivelse",
            fromVariantId: e.fromVariantId,
            toVariantId: e.toVariantId,
            duration: e.duration,
            sceneId: e.sceneId,
            blockId: e.blockId,
            untilSceneId: e.untilSceneId,
            status: e.status,
          },
        },
      ],
    });
    expect(s3.continuityEvents[id]!.productionId).toBe(pid);
    // Rundtur gjennom databaseradene
    const cs2 = diffStates(emptyProjectState(s3.project), s3);
    const rows = Object.fromEntries(
      Object.entries(cs2.inserts).map(([k, v]) => [k, v as unknown[]]),
    ) as Record<string, unknown[]>;
    const back = stateFromRows({
      project: fixture.project,
      ...rows,
      script_block_revisions: cs2.blockRevisions,
    } as never);
    expect(back.continuityEvents[id]!.productionId).toBe(pid);
  });

  it("2D-scenen i spinoffens egen versjon følger spinoffens kontinuitet", () => {
    const { s, pid } = withoutHaircut();
    const s1 = mustApply(s, {
      type: "SetContinuityEventDisabled",
      eventId: haircut.id,
      productionId: pid as never,
      disabled: true,
    });
    const spinOcc = orderedOccurrences(s1, pid)[1]!;
    const s2 = applyAll(s1, ownCopyCommands(s1, spinOcc.id)!);
    const own = s2.occurrences[spinOcc.id]!.variantId;
    expect(sceneContinuityVariant(s2, maja.id, own)).not.toBe(short);
    expect(sceneContinuityVariant(s2, maja.id, order[8]!.variantId)).toBe(short);
  });
});

describe("varsler om hull i spinoffen (REQ-0325/0369)", () => {
  it("utseende fra en hendelse i en scene som ikke er med, flagges og peker på scenen", () => {
    const { s, pid, later } = withoutHaircut();
    const f = continuityAnalysis(s, pid).find((x) => x.key === `gap-event:${haircut.id}`);
    expect(f).toBeTruthy();
    expect(f!.kind).toBe("spinoff_gap");
    expect(f!.occurrenceId).toBe(
      orderedOccurrences(s, pid).find((o) => o.sceneId === later.sceneId)!.id,
    );
    const cutScene = s.variants[s.blocks[haircut.blockId!]!.variantId]!.sceneId;
    expect(f!.includeOccurrenceId).toBe(order.find((o) => o.sceneId === cutScene)!.id);
    expect(f!.eventId).toBe(haircut.id);
    // Hovedfilmen har ikke funnet
    expect(continuityAnalysis(s, main.id).some((x) => x.kind === "spinoff_gap")).toBe(false);
    // Slått av i spinoffen: ingen varsel
    const off = mustApply(s, {
      type: "SetContinuityEventDisabled",
      eventId: haircut.id,
      productionId: pid as never,
      disabled: true,
    });
    expect(continuityAnalysis(off, pid).some((x) => x.key === `gap-event:${haircut.id}`)).toBe(
      false,
    );
  });

  it("tilbakeblikk til en scene som ikke er med, flagges", () => {
    // Scene 13 er et tilbakeblikk til scene 2
    const pid = tid<"production">();
    const s = applyAll(
      s0,
      deriveProductionCommands(s0, {
        productionId: pid,
        name: "Bare tilbakeblikket",
        kind: "spinoff",
        parentProductionId: main.id,
        occurrenceIds: [order[12]!.id],
      }),
    );
    const f = continuityAnalysis(s, pid).find(
      (x) => x.kind === "spinoff_gap" && x.key.startsWith("anchor:"),
    );
    expect(f).toBeTruthy();
    expect(f!.includeOccurrenceId).toBe(order[1]!.id);
  });

  it("«Ta med scenen» legger hovedfilmens scene inn på riktig plass, og varselet forsvinner", () => {
    const { s, pid } = withoutHaircut();
    const f = continuityAnalysis(s, pid).find((x) => x.key === `gap-event:${haircut.id}`)!;
    const s2 = applyAll(s, includeSceneCommands(s, pid, f.includeOccurrenceId!));
    const scenes = orderedOccurrences(s2, pid).map((o) => o.sceneId);
    const mainScenes = order.map((o) => o.sceneId);
    // Rekkefølgen følger hovedfilmen
    expect([...scenes].sort((a, b) => mainScenes.indexOf(a) - mainScenes.indexOf(b))).toEqual(
      scenes,
    );
    expect(scenes).toContain(s.occurrences[f.includeOccurrenceId!]!.sceneId);
    expect(continuityAnalysis(s2, pid).some((x) => x.key === `gap-event:${haircut.id}`)).toBe(
      false,
    );
    // To ganger gir ingenting
    expect(includeSceneCommands(s2, pid, f.includeOccurrenceId!)).toEqual([]);
  });
});
