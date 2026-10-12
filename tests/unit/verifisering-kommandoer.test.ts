// @vitest-environment node
/**
 * Verifisering av krav (DEC-0073): angre/gjør om, flere brukere, ingen automatisk bytte av aktiv versjon,
 * versjonslåste ressursreferanser og skillet mellom tidslinjeoperasjoner – kontrollert mot domenekjernen.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  applyCommand,
  approveWithImpactCommands,
  assetVersionImpact,
  defaultLayerFields,
  layerVersion,
  emptyStyleGuide,
  keyBetween,
  keysEvenly,
  orderedOccurrences,
  revisionsOf,
  scriptView,
  splitParts,
  filmClips,
  type AssetFields,
  type BlockId,
  type Command,
  type ProductionId,
  type ProjectState,
  type TakeMedia,
} from "@/core";
import {
  ALICE,
  BOB,
  envelope,
  mustApply,
  randomCommand,
  rng,
  seedProject,
  tid,
} from "../helpers/fixtures";

/** Fjerner revisjonstellere (de øker også ved angre). */
function strip(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === "revision" || k === "currentRev") continue;
      out[k] = strip(x);
    }
    return out;
  }
  return v;
}

/** Innholdet i modellen uten revisjonstellere og historikk (historikk kan vokse ved angre). */
function content(s: ProjectState): unknown {
  const { blockRevisions: _history, ...rest } = s;
  return strip(rest);
}

function run(s: ProjectState, c: Command, actor = ALICE) {
  const r = applyCommand(s, envelope(c, actor));
  if (!r.ok) throw new Error(`${c.type} feilet: ${r.error.code} ${r.error.message}`);
  return r;
}

/** Utfør → angre → gjør om (angrens invers), slik angrelisten i appen gjør det. */
function doUndoRedo(before: ProjectState, c: Command) {
  const done = run(before, c);
  const undone = run(done.state, done.inverse);
  const redone = run(undone.state, undone.inverse);
  return { done, undone, redone };
}

function blocksOf(s: ProjectState, variantId: string) {
  return Object.values(s.blocks)
    .filter((b) => b.variantId === variantId && !b.removed)
    .sort((a, b) => (a.orderKey < b.orderKey ? -1 : 1));
}

/** Én kommando for hver strukturoperasjon i manus og film. */
function structuralCommands(s: ProjectState, mainId: string, spinoffId: string) {
  const occ = orderedOccurrences(s, mainId);
  const prod = mainId as ProductionId;
  const o3 = occ[3]!;
  const blocks3 = blocksOf(s, o3.variantId);
  const spinOcc = orderedOccurrences(s, spinoffId)[0]!;
  const forkMap: Record<string, BlockId> = {};
  for (const b of Object.values(s.blocks))
    if (b.variantId === spinOcc.variantId) forkMap[b.id] = tid();
  const splitMap: Record<string, never> = {};
  for (const o of Object.values(s.occurrences))
    if (o.variantId === o3.variantId) splitMap[o.id] = tid() as never;
  const list: [string, Command][] = [
    [
      "MoveOccurrence",
      {
        type: "MoveOccurrence",
        occurrenceId: occ[7]!.id,
        orderKey: keyBetween(null, occ[0]!.orderKey),
      },
    ],
    ["SetOccurrenceActive", { type: "SetOccurrenceActive", occurrenceId: o3.id, active: false }],
    [
      "EditBlockText",
      { type: "EditBlockText", productionId: prod, blockId: blocks3[2]!.id, text: "Ny replikk" },
    ],
    [
      "InsertBlock",
      {
        type: "InsertBlock",
        productionId: prod,
        variantId: o3.variantId,
        block: {
          blockId: tid(),
          kind: "action",
          text: "Innsatt handling",
          orderKey: keyBetween(blocks3[0]!.orderKey, blocks3[1]!.orderKey),
        },
      },
    ],
    ["RemoveBlock", { type: "RemoveBlock", productionId: prod, blockId: blocks3[0]!.id }],
    [
      "SetBlockKind",
      { type: "SetBlockKind", productionId: prod, blockId: blocks3[0]!.id, kind: "transition" },
    ],
    [
      "EditSceneHeading",
      {
        type: "EditSceneHeading",
        productionId: prod,
        variantId: o3.variantId,
        heading: { intExt: "EXT.", location: "LÅVEN", time: "NATT" },
      },
    ],
    [
      "SplitScene",
      {
        type: "SplitScene",
        productionId: prod,
        occurrenceId: o3.id,
        atBlockId: blocks3[1]!.id,
        newSceneId: tid(),
        newVariantId: tid(),
        newOccurrenceIds: splitMap,
        heading: { intExt: "INT.", location: "DELT", time: "DAG" },
      },
    ],
    [
      "MergeScenes",
      {
        type: "MergeScenes",
        productionId: prod,
        targetOccurrenceId: occ[5]!.id,
        sourceOccurrenceId: occ[6]!.id,
      },
    ],
    [
      "CreateScene",
      {
        type: "CreateScene",
        productionId: prod,
        sceneId: tid(),
        variantId: tid(),
        occurrenceId: tid(),
        orderKey: keyBetween(occ[2]!.orderKey, occ[3]!.orderKey),
        heading: { intExt: "INT.", location: "NY", time: "DAG" },
        blocks: [{ blockId: tid(), kind: "action", text: "Ny", orderKey: "i" }],
      },
    ],
    [
      "AddOccurrence",
      {
        type: "AddOccurrence",
        productionId: spinoffId as ProductionId,
        occurrenceId: tid(),
        sceneId: occ[8]!.sceneId,
        variantId: occ[8]!.variantId,
        orderKey: keyBetween(orderedOccurrences(s, spinoffId).at(-1)!.orderKey, null),
      },
    ],
    [
      "ForkVariant",
      { type: "ForkVariant", occurrenceId: spinOcc.id, newVariantId: tid(), blockIdMap: forkMap },
    ],
    [
      "CreateSegments",
      {
        type: "CreateSegments",
        occurrenceId: o3.id,
        reason: "manual",
        segments: keysEvenly(2).map((k) => ({
          segmentId: tid(),
          orderKey: k,
          startBlockId: null,
          endBlockId: null,
        })),
      },
    ],
  ];
  return list;
}

describe("REQ-0042 / REQ-0070 – angre og gjør om for strukturoperasjoner og manusredigering", () => {
  const { state, mainId, spinoffId } = seedProject();
  for (const [name, command] of structuralCommands(state, mainId, spinoffId)) {
    it(`REQ-0042 ${name}: angre gir modellen før, gjør om gir modellen etter`, () => {
      const { done, undone, redone } = doUndoRedo(state, command);
      expect(content(done.state)).not.toEqual(content(state));
      expect(content(undone.state)).toEqual(content(state));
      expect(content(redone.state)).toEqual(content(done.state));
      // Manus og film følger med begge veier
      expect(strip(scriptView(undone.state, mainId))).toEqual(strip(scriptView(state, mainId)));
      expect(strip(scriptView(redone.state, mainId))).toEqual(
        strip(scriptView(done.state, mainId)),
      );
    });
  }

  it("REQ-0070: tilfeldige manus- og sceneoperasjoner kan angres og gjøres om (egenskapsbasert)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), (seed) => {
        const r = rng(seed);
        let s = seedProject().state;
        for (let i = 0; i < 25; i++) {
          const c = randomCommand(s, r);
          if (!c) continue;
          const res = applyCommand(s, envelope(c));
          if (!res.ok) continue;
          // Produsert materiale kastes aldri ved angre (INV-07): AddTake sammenlignes uten versjonene
          if (c.type !== "AddTake") {
            const undo = applyCommand(res.state, envelope(res.inverse));
            expect(undo.ok).toBe(true);
            if (undo.ok) {
              expect(content(undo.state)).toEqual(content(s));
              const redo = applyCommand(undo.state, envelope(undo.inverse));
              expect(redo.ok).toBe(true);
              if (redo.ok) expect(content(redo.state)).toEqual(content(res.state));
            }
          }
          s = res.state;
        }
      }),
      { numRuns: 60 },
    );
  });
});

describe("REQ-0522 / REQ-0527 – flere brukere på samme manus", () => {
  function twoBlocks() {
    const { state, mainId } = seedProject(3);
    const occ = orderedOccurrences(state, mainId)[0]!;
    const [b1, , b3] = blocksOf(state, occ.variantId);
    return { state, prod: mainId as ProductionId, b1: b1!, b3: b3! };
  }

  it("REQ-0522: to medlemmer redigerer ulike blokker samtidig – begge endringene bevares", () => {
    const { state, prod, b1, b3 } = twoBlocks();
    // Begge starter fra samme tilstand og sender med revisjonene de så
    const a = applyCommand(
      state,
      envelope(
        { type: "EditBlockText", productionId: prod, blockId: b1.id, text: "Alice sin tekst" },
        ALICE,
        revisionsOf(state, [b1.id]),
      ),
    );
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = applyCommand(
      a.state,
      envelope(
        { type: "EditBlockText", productionId: prod, blockId: b3.id, text: "Bob sin tekst" },
        BOB,
        revisionsOf(state, [b3.id]),
      ),
    );
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.state.blocks[b1.id]!.text).toBe("Alice sin tekst");
    expect(b.state.blocks[b3.id]!.text).toBe("Bob sin tekst");
  });

  it("REQ-0522: samme blokk samtidig – den andre endringen avvises som konflikt, ingenting tapes i stillhet", () => {
    const { state, prod, b1 } = twoBlocks();
    const base = revisionsOf(state, [b1.id]);
    const a = run(state, {
      type: "EditBlockText",
      productionId: prod,
      blockId: b1.id,
      text: "Alice",
    });
    const b = applyCommand(
      a.state,
      envelope(
        { type: "EditBlockText", productionId: prod, blockId: b1.id, text: "Bob" },
        BOB,
        base,
      ),
    );
    expect(b.ok).toBe(false);
    if (b.ok) return;
    expect(b.error.code).toBe("revision_conflict");
    expect(b.error.details).toContain(b1.id);
    // Alice sin endring står, og begge tekstene finnes i historikken etter at Bob prøver på nytt
    expect(a.state.blocks[b1.id]!.text).toBe("Alice");
    const retry = applyCommand(
      a.state,
      envelope(
        { type: "EditBlockText", productionId: prod, blockId: b1.id, text: "Bob" },
        BOB,
        revisionsOf(a.state, [b1.id]),
      ),
    );
    expect(retry.ok).toBe(true);
    if (retry.ok) {
      const texts = retry.state.blockRevisions
        .filter((r) => r.blockId === b1.id)
        .map((r) => r.text);
      expect(texts).toEqual(expect.arrayContaining(["Alice", "Bob"]));
    }
  });

  it("REQ-0527: når A angrer, reverseres bare A sin endring – B sin endring i en annen blokk står", () => {
    const { state, prod, b1, b3 } = twoBlocks();
    const a = run(
      state,
      { type: "EditBlockText", productionId: prod, blockId: b1.id, text: "A" },
      ALICE,
    );
    const b = run(
      a.state,
      { type: "EditBlockText", productionId: prod, blockId: b3.id, text: "B" },
      BOB,
    );
    // A angrer med revisjonskontroll på det A endret (som angrelisten i appen)
    const undo = applyCommand(
      b.state,
      envelope(a.inverse, ALICE, revisionsOf(b.state, a.affected)),
    );
    expect(undo.ok).toBe(true);
    if (!undo.ok) return;
    expect(undo.state.blocks[b1.id]!.text).toBe(state.blocks[b1.id]!.text);
    expect(undo.state.blocks[b3.id]!.text).toBe("B");
  });

  it("REQ-0527: A sin angring etter at B har endret samme blokk avvises med revisjonskontroll", () => {
    const { state, prod, b1 } = twoBlocks();
    const a = run(
      state,
      { type: "EditBlockText", productionId: prod, blockId: b1.id, text: "A" },
      ALICE,
    );
    const b = run(
      a.state,
      { type: "EditBlockText", productionId: prod, blockId: b1.id, text: "B" },
      BOB,
    );
    // A husker revisjonen etter sin egen endring; B har endret blokken siden
    const undo = applyCommand(
      b.state,
      envelope(a.inverse, ALICE, revisionsOf(a.state, a.affected)),
    );
    expect(undo.ok).toBe(false);
    if (!undo.ok) expect(undo.error.code).toBe("revision_conflict");
  });
});

const ASSET: AssetFields = {
  kind: "character",
  name: "Maja",
  names: [],
  description: "",
  category: "",
  tags: [],
};

function media(s: ProjectState, assetId: string, versionId: string) {
  return {
    path: `${s.project.id}/${assetId}/${versionId}/maja.png`,
    mimeType: "image/png",
    width: 800,
    height: 400,
    byteSize: 1000,
    sha256: "c".repeat(64),
  };
}

/** Hovedfilm + spinoff, én ressurs med godkjent versjon og en 2D-scene med ressursen i hver produksjon. */
function withAssetInTwoProductions() {
  const seed = seedProject();
  const { mainId, spinoffId } = seed;
  let s = mustApply(seed.state, {
    type: "SetProjectFormat",
    width: 1000,
    height: 600,
    fps: { num: 25, den: 1 },
  });
  const assetId = tid<"asset">();
  const assetVariantId = tid<"asset_variant">();
  const v1 = tid<"asset_version">();
  s = mustApply(s, { type: "CreateAssets", assets: [{ assetId, fields: ASSET }] });
  s = mustApply(s, {
    type: "CreateAssetVariant",
    variantId: assetVariantId,
    assetId,
    fields: { name: "Animatic", style: "animatic", appearance: "" },
  });
  s = mustApply(s, {
    type: "AddAssetVersion",
    versionId: v1,
    variantId: assetVariantId,
    media: media(s, assetId, v1),
    note: "",
  });
  s = mustApply(s, { type: "ApproveAssetVersion", variantId: assetVariantId, versionId: v1 });
  // Spinoffen får sin egen variant av en scene den deler med hovedfilmen
  const spinOcc = orderedOccurrences(s, spinoffId)[0]!;
  const forkMap: Record<string, BlockId> = {};
  for (const b of Object.values(s.blocks))
    if (b.variantId === spinOcc.variantId) forkMap[b.id] = tid();
  const spinVariant = tid<"scene_variant">();
  s = mustApply(s, {
    type: "ForkVariant",
    occurrenceId: spinOcc.id,
    newVariantId: spinVariant,
    blockIdMap: forkMap,
  });
  const mainOcc = orderedOccurrences(s, mainId)[0]!;
  const comps: string[] = [];
  const layers: string[] = [];
  for (const variantId of [mainOcc.variantId, spinVariant]) {
    const compositionId = tid<"composition">();
    s = mustApply(s, {
      type: "CreateComposition",
      compositionId,
      variantId: variantId as never,
      fields: {
        name: "Stua",
        width: 1000,
        height: 600,
        durationFrames: 100,
        background: "#101114",
      },
    });
    const layerId = tid<"composition_layer">();
    s = mustApply(s, {
      type: "AddLayers",
      layers: [
        {
          layerId,
          compositionId,
          fields: defaultLayerFields(s, s.compositions[compositionId]!, {
            assetId,
            assetVariantId,
          }),
        },
      ],
    });
    comps.push(compositionId);
    layers.push(layerId);
  }
  return { s, mainId, spinoffId, assetId, assetVariantId, v1, comps, layers, mainOcc, spinOcc };
}

describe("REQ-0122 – ressurser gjenbrukes på tvers av scener og produksjoner", () => {
  it("samme ressurs-ID refereres fra scener i to produksjoner", () => {
    const { s, mainId, spinoffId, assetId, layers } = withAssetInTwoProductions();
    const productionOf = (layerId: string) => {
      const comp = s.compositions[s.layers[layerId]!.compositionId]!;
      const occ = Object.values(s.occurrences).find((o) => o.variantId === comp.variantId)!;
      return occ.productionId;
    };
    expect(layers.map((l) => s.layers[l]!.assetId)).toEqual([assetId, assetId]);
    expect(new Set(layers.map(productionOf))).toEqual(new Set([mainId, spinoffId]));
    // Én ressurs i biblioteket – ingen kopi per produksjon
    expect(Object.values(s.assets).filter((a) => a.name === "Maja")).toHaveLength(1);
  });
});

describe("REQ-0146 – scener bytter ikke automatisk til en ny variant eller versjon", () => {
  it("ny versjon og ny variant publiseres: eksisterende scener viser fortsatt samme bilde og variant", () => {
    const { s, assetId, assetVariantId, v1, layers } = withAssetInTwoProductions();
    const shown = (st: ProjectState) => layers.map((l) => layerVersion(st, st.layers[l]!)?.id);
    expect(shown(s)).toEqual([v1, v1]);
    const v2 = tid<"asset_version">();
    let t = mustApply(s, {
      type: "AddAssetVersion",
      versionId: v2,
      variantId: assetVariantId as never,
      media: media(s, assetId, v2),
      note: "",
    });
    const newVariant = tid<"asset_variant">();
    t = mustApply(t, {
      type: "CreateAssetVariant",
      variantId: newVariant,
      assetId: assetId as never,
      fields: { name: "Vinter", style: "animatic", appearance: "Vinterklær" },
    });
    expect(shown(t)).toEqual([v1, v1]);
    for (const l of layers) expect(t.layers[l]).toEqual(s.layers[l]);
    expect(t.assetVariants[assetVariantId]!.approvedVersionId).toBe(v1);
  });

  it("godkjenning av ny versjon: scenene brukeren ikke velger, låses til versjonen de viste", () => {
    const { s, mainId, assetId, assetVariantId, v1, layers } = withAssetInTwoProductions();
    const v2 = tid<"asset_version">();
    const t = mustApply(s, {
      type: "AddAssetVersion",
      versionId: v2,
      variantId: assetVariantId as never,
      media: media(s, assetId, v2),
      note: "",
    });
    const impact = assetVersionImpact(t, mainId, assetVariantId, v2);
    // Begge produksjonene vises som berørt før noe endres
    expect(impact.flatMap((x) => x.layers.map((l) => l.layerId)).sort()).toEqual(
      [...layers].sort(),
    );
    const keep = new Set(impact.map((x) => x.key));
    let u = t;
    for (const c of approveWithImpactCommands(t, assetVariantId, v2, impact, keep))
      u = mustApply(u, c);
    expect(u.assetVariants[assetVariantId]!.approvedVersionId).toBe(v2);
    for (const l of layers) {
      expect(layerVersion(u, u.layers[l]!)?.id).toBe(v1);
      expect(u.layers[l]!.versionId).toBe(v1);
    }
  });
});

describe("REQ-0030 – ingen automatisk bytte av aktiv sceneversjon", () => {
  it("manusendring, ressursendring, omnummerering og stilendring lar aktiv versjon stå", () => {
    const { s, mainId, assetId, assetVariantId } = withAssetInTwoProductions();
    const prod = mainId as ProductionId;
    const occ = orderedOccurrences(s, mainId);
    // Scene 0 og 2 har aktiv versjon fra fixturen; legg en nyere versjon ved siden av (ikke aktiv)
    const active = occ.filter((o) => o.activeTakeId !== null);
    expect(active.length).toBeGreaterThan(0);
    let t = s;
    for (const o of active)
      t = mustApply(t, {
        type: "AddTake",
        takeId: tid(),
        occurrenceId: o.id,
        segmentId: null,
        kind: "ai_video",
        status: "approved",
        durationFrames: 100,
        mediaRef: null,
      });
    const activeBefore = () => Object.fromEntries(active.map((o) => [o.id, o.activeTakeId]));
    const activeNow = (st: ProjectState) =>
      Object.fromEntries(active.map((o) => [o.id, st.occurrences[o.id]!.activeTakeId]));
    // AddTake gjør ikke den nye versjonen aktiv
    expect(activeNow(t)).toEqual(activeBefore());

    const profileId = tid<"style_profile">();
    const v2 = tid<"asset_version">();
    const steps: [string, Command][] = [
      [
        "manusendring",
        {
          type: "EditBlockText",
          productionId: prod,
          blockId: blocksOf(t, active[0]!.variantId)[2]!.id,
          text: "Endret replikk",
        },
      ],
      [
        "ressursendring",
        { type: "UpdateAsset", assetId: assetId as never, fields: { ...ASSET, description: "Ny" } },
      ],
      [
        "ny ressursversjon",
        {
          type: "AddAssetVersion",
          versionId: v2,
          variantId: assetVariantId as never,
          media: media(t, assetId, v2),
          note: "",
        },
      ],
      [
        "godkjent ressursversjon",
        { type: "ApproveAssetVersion", variantId: assetVariantId as never, versionId: v2 },
      ],
      // Omnummerering: flytte og deaktivere endrer de fortløpende numrene
      [
        "omnummerering (flytting)",
        {
          type: "MoveOccurrence",
          occurrenceId: occ.at(-1)!.id,
          orderKey: keyBetween(null, occ[0]!.orderKey),
        },
      ],
      [
        "omnummerering (deaktivering)",
        { type: "SetOccurrenceActive", occurrenceId: occ[1]!.id, active: false },
      ],
      [
        "ny stil",
        {
          type: "CreateStyleProfile",
          profileId,
          fields: {
            name: "Stil",
            isDefault: true,
            guide: { ...emptyStyleGuide(), visualStyle: "Akvarell" },
          },
        },
      ],
      [
        "stilendring",
        {
          type: "UpdateStyleProfile",
          profileId,
          fields: {
            name: "Stil",
            isDefault: true,
            guide: { ...emptyStyleGuide(), visualStyle: "Blekk" },
          },
        },
      ],
    ];
    for (const [what, c] of steps) {
      t = mustApply(t, c);
      expect(activeNow(t), what).toEqual(activeBefore());
    }
  });
});

const FILM: TakeMedia = {
  fileName: "film.mp4",
  mimeType: "video/mp4",
  byteSize: 1000,
  width: 1920,
  height: 1080,
  fps: 25,
  durationMs: 8000,
  videoCodec: "avc",
  hasAudio: true,
};

describe("REQ-0229 – fire typer tidslinjeoperasjoner", () => {
  function setup() {
    const seed = seedProject(4);
    const occ = orderedOccurrences(seed.state, seed.mainId);
    const takeId = tid<"take">();
    let s = mustApply(seed.state, {
      type: "AddTake",
      takeId,
      occurrenceId: occ[1]!.id,
      segmentId: null,
      kind: "imported_film",
      status: "approved",
      durationFrames: 200,
      mediaRef: `${seed.state.project.id}/films/${takeId}/film.mp4`,
      media: FILM,
    });
    s = mustApply(s, { type: "SetActiveTake", occurrenceId: occ[1]!.id, takeId });
    return { ...seed, s, occ, takeId };
  }
  const structure = (s: ProjectState, mainId: string) => ({
    script: scriptView(s, mainId),
    scenes: s.scenes,
    variants: s.variants,
    blocks: s.blocks,
    order: orderedOccurrences(s, mainId).map((o) => [o.id, o.orderKey, o.active]),
  });

  it("trimming og utsnittsendring (klippdeler) endrer bare medie- og forekomstdata, ikke manus", () => {
    const { s, mainId, occ, takeId } = setup();
    const clip = filmClips(s, mainId).find((c) => c.occurrenceId === occ[1]!.id)!;
    const parts = splitParts(clip, 50, s.project.fps, () => tid())!;
    // Utsnitt: splitt og trim bort starten av den første delen
    const trimmed = [{ ...parts[0]!, inMs: 500 }, parts[1]!];
    const edited = mustApply(s, {
      type: "SetSceneEdit",
      occurrenceId: occ[1]!.id,
      activeTakeId: takeId,
      parts: trimmed,
    });
    expect(Object.keys(edited.clipParts).length).toBeGreaterThan(0);
    expect(structure(edited, mainId)).toEqual(structure(s, mainId));
    expect(edited.takes[takeId]!.mediaRef).toBe(s.takes[takeId]!.mediaRef);
    // Trimming av scenens lengde
    const planned = mustApply(s, {
      type: "SetPlannedDuration",
      occurrenceId: occ[2]!.id,
      plannedMs: 4000,
    });
    expect(structure(planned, mainId)).toEqual(structure(s, mainId));
  });

  it("flytting og deaktivering endrer manusstrukturen (rekkefølge og hva som er med)", () => {
    const { s, mainId, occ } = setup();
    const moved = mustApply(s, {
      type: "MoveOccurrence",
      occurrenceId: occ[3]!.id,
      orderKey: keyBetween(null, occ[0]!.orderKey),
    });
    expect(scriptView(moved, mainId)[0]!.occurrenceId).toBe(occ[3]!.id);
    const off = mustApply(s, {
      type: "SetOccurrenceActive",
      occurrenceId: occ[2]!.id,
      active: false,
    });
    expect(scriptView(off, mainId).map((x) => x.occurrenceId)).not.toContain(occ[2]!.id);
    // Ingen av dem rører klippdeler eller medier
    expect(moved.clipParts).toEqual(s.clipParts);
    expect(off.takes).toEqual(s.takes);
  });
});
