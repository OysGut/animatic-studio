// @vitest-environment node
/** Konsekvenser av ressursendring og rådgivende kontinuitetsanalyse (M6 del 3, DEC-0056). */
import { describe, expect, it } from "vitest";
import {
  approveWithImpactCommands,
  assetVersionImpact,
  blocksOfVariant,
  compositionOfVariant,
  continuityAnalysis,
  keyBetween,
  layerFieldsOf,
  layerVersion,
  layersOf,
  mainProduction,
  orderedOccurrences,
  outdatedLayers,
  type ProjectState,
} from "@/core";
import { mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

function base() {
  const s = fixture.state;
  const main = mainProduction(s)!;
  const occs = orderedOccurrences(s, main.id);
  const comp = compositionOfVariant(s, occs[0]!.variantId)!;
  const maja = Object.values(s.assets).find((a) => a.name === "Maja")!;
  const layer = layersOf(s, comp.id).find((l) => l.assetId === maja.id)!;
  const animatic = Object.values(s.assetVariants).find(
    (v) => v.assetId === maja.id && v.name === "Animatic",
  )!;
  return { s, main, occs, comp, maja, layer, animatic };
}

function addVersion(s: ProjectState, variantId: string, assetId: string) {
  const id = tid<"asset_version">();
  return {
    id,
    s: mustApply(s, {
      type: "AddAssetVersion",
      versionId: id,
      variantId: variantId as never,
      media: {
        path: `${s.project.id}/${assetId}/${id}/ny.png`,
        mimeType: "image/png",
        width: 1200,
        height: 1600,
        byteSize: 1000,
        sha256: "a".repeat(64),
      },
      note: "",
    }),
  };
}

const kinds = (s: ProjectState, productionId: string) =>
  continuityAnalysis(s, productionId).map((f) => f.kind);

describe("konsekvenser når en ressurs endres (REQ-0130/0132/0134)", () => {
  it("scenen med laget som følger godkjent versjon, berøres; brukeren kan beholde det gamle bildet", () => {
    const c = base();
    const before = layerVersion(c.s, c.layer)!;
    const { s, id } = addVersion(c.s, c.animatic.id, c.maja.id);
    const impact = assetVersionImpact(s, c.main.id, c.animatic.id, id);
    const row = impact.find((x) => x.occurrenceId === c.occs[0]!.id)!;
    expect(row.layers).toEqual([
      expect.objectContaining({ layerId: c.layer.id, mode: "follows", versionId: before.id }),
    ]);
    // «Behold»: laget låses til bildet det viser, så godkjennes det nye
    let s2 = mustApply(s, {
      type: "UpdateLayers",
      layers: [
        {
          layerId: c.layer.id,
          fields: {
            ...layerFieldsOf(c.layer),
            assetVariantId: before.variantId,
            versionId: before.id,
          },
        },
      ],
    });
    s2 = mustApply(s2, { type: "ApproveAssetVersion", variantId: c.animatic.id, versionId: id });
    expect(layerVersion(s2, s2.layers[c.layer.id]!)!.id).toBe(before.id);
    // Låst til en eldre versjon enn den godkjente: flagges for gjennomgang
    expect(outdatedLayers(s2, c.comp.id)).toEqual([
      expect.objectContaining({ layerId: c.layer.id, versionId: before.id, approvedVersionId: id }),
    ]);
    expect(kinds(s2, c.main.id)).toContain("asset_outdated");
    // Uten «behold» får scenen det nye bildet
    const s3 = mustApply(s, {
      type: "ApproveAssetVersion",
      variantId: c.animatic.id,
      versionId: id,
    });
    expect(layerVersion(s3, s3.layers[c.layer.id]!)!.id).toBe(id);
  });

  it("scener uten noe som endres, tas ikke med", () => {
    const c = base();
    const winter = Object.values(c.s.assetVariants).find((v) => v.name === "Vinterklær")!;
    const { s, id } = addVersion(c.s, winter.id, c.maja.id);
    expect(
      assetVersionImpact(s, c.main.id, winter.id, id).every((x) => x.layers.length === 0),
    ).toBe(true);
  });
});

describe("rådgivende kontinuitetsanalyse (REQ-0319–0324, REQ-0129)", () => {
  it("fixturen: skrivefeil i navn, gjenstand i bestemt form og feil utseende i 2D-scenen", () => {
    const c = base();
    const found = continuityAnalysis(c.s, c.main.id);
    expect(found.find((f) => f.kind === "name_variant")?.message).toContain("MAJJA");
    expect(found.find((f) => f.kind === "before_established")?.message).toContain("vasen");
    expect(found.find((f) => f.kind === "unexplained_change")).toMatchObject({
      certainty: "likely",
      assetId: c.maja.id,
    });
  });

  it("karakter med i handlingen før introduksjonen, og replikk om noe i en deaktivert scene", () => {
    const c = base();
    let s = mustApply(c.s, {
      type: "CreateAssets",
      assets: [
        {
          assetId: tid(),
          fields: {
            kind: "character",
            name: "Ola",
            names: [],
            description: "",
            category: "",
            tags: [],
          },
        },
        {
          assetId: tid(),
          fields: {
            kind: "object",
            name: "lykt",
            names: [{ name: "Lykta", kind: "alias", language: null }],
            description: "",
            category: "",
            tags: [],
          },
        },
      ],
    });
    const insert = (occIndex: number, kind: "action" | "dialogue", text: string) => {
      const o = c.occs[occIndex]!;
      const b = blocksOfVariant(s, o.variantId);
      s = mustApply(s, {
        type: "InsertBlock",
        productionId: c.main.id as never,
        variantId: o.variantId,
        block: {
          blockId: tid(),
          kind,
          text,
          orderKey: keyBetween(b[b.length - 1]!.orderKey, null),
        },
      });
    };
    insert(1, "action", "Ola står i døra.");
    insert(4, "action", "OLA (40) kommer inn med ved.");
    // occs[9] er deaktivert i fixturen
    insert(9, "action", "Hun tenner Lykta i vinduet.");
    insert(11, "dialogue", "Husker du Lykta?");
    const found = continuityAnalysis(s, c.main.id);
    expect(found.find((f) => f.kind === "before_intro")?.message).toMatch(
      /Ola er med i handlingen/,
    );
    expect(found.find((f) => f.kind === "refers_deactivated")).toMatchObject({
      occurrenceId: c.occs[11]!.id,
      certainty: "uncertain",
    });
  });

  it("motsetninger: anker i deaktivert scene og hendelse med feil «før»", () => {
    const c = base();
    let s = mustApply(c.s, {
      type: "SetStoryTime",
      sceneId: c.occs[11]!.sceneId,
      storyTime: { kind: "flashback", anchorSceneId: c.occs[9]!.sceneId, offset: -0.5 },
    });
    const winter = Object.values(s.assetVariants).find((v) => v.name === "Vinterklær")!;
    s = mustApply(s, {
      type: "AddContinuityEvents",
      events: [
        {
          eventId: tid(),
          fields: {
            assetId: c.maja.id,
            kind: "costume",
            description: "",
            // Etter hårklippet har hun kort hår, ikke vinterklær
            fromVariantId: winter.id,
            toVariantId: c.animatic.id,
            duration: "scene",
            sceneId: c.occs[13]!.sceneId,
            blockId: null,
            untilSceneId: null,
            status: "approved",
          },
        },
      ],
    });
    const found = continuityAnalysis(s, c.main.id).filter((f) => f.kind === "timeline_conflict");
    expect(found.map((f) => f.key.split(":")[0]).sort()).toEqual(["anchor", "from"]);
  });
});

describe("gjennomgang DEC-0056", () => {
  it("«behold» via kommandoene låser laget; bildeskifter tas med; låst til nyere endres ikke", () => {
    const c = base();
    const before = layerVersion(c.s, c.layer)!;
    // Anne-laget får et bildeskifte til Maja/Animatic som følger godkjent versjon
    const anne = layersOf(c.s, c.comp.id).find((l) => l.assetId !== c.maja.id && l.assetId)!;
    let s = mustApply(c.s, {
      type: "UpdateLayers",
      layers: [
        {
          layerId: anne.id,
          fields: {
            ...layerFieldsOf(anne),
            swaps: [
              { frame: 40, assetId: c.maja.id, assetVariantId: c.animatic.id, versionId: null },
            ],
          },
        },
      ],
    });
    const v = addVersion(s, c.animatic.id, c.maja.id);
    s = v.s;
    const impact = assetVersionImpact(s, c.main.id, c.animatic.id, v.id);
    const row = impact.find((x) => x.compositionId === c.comp.id)!;
    expect(row.layers.map((l) => [l.layerId, l.source, l.mode])).toEqual(
      expect.arrayContaining([
        [c.layer.id, "own", "follows"],
        [anne.id, 0, "follows"],
      ]),
    );
    let s2 = s;
    for (const cmd of approveWithImpactCommands(s, c.animatic.id, v.id, impact, new Set([row.key])))
      s2 = mustApply(s2, cmd);
    expect(layerVersion(s2, s2.layers[c.layer.id]!)!.id).toBe(before.id);
    expect(layerVersion(s2, s2.layers[anne.id]!, 50)!.id).toBe(before.id);
    // Låst til en nyere versjon enn den som godkjennes: endres ikke
    const older = Object.values(s2.assetVersions).find(
      (x) => x.variantId === c.animatic.id && x.number === 1,
    )!;
    const imp2 = assetVersionImpact(s2, c.main.id, c.animatic.id, older.id);
    // Ingen bilder i 2D-scenen endres (alle er låst til en nyere versjon)
    expect(
      imp2.flatMap((x) => x.layers).filter((l) => l.mode === "follows" || l.mode === "locked"),
    ).toEqual([]);
  });

  it("navn som bare skiller seg i et tall, eller er ulike ord, gir ikke skrivefeil", () => {
    const c = base();
    const o = c.occs[2]!;
    let s = c.s;
    for (const name of ["GUTT 1", "GUTT 2", "BESTEFAR"]) {
      const b = blocksOfVariant(s, o.variantId);
      s = mustApply(s, {
        type: "InsertBlock",
        productionId: c.main.id as never,
        variantId: o.variantId,
        block: {
          blockId: tid(),
          kind: "character",
          text: name,
          orderKey: keyBetween(b[b.length - 1]!.orderKey, null),
        },
      });
    }
    const names = continuityAnalysis(s, c.main.id)
      .filter((f) => f.kind === "name_variant")
      .map((f) => f.message);
    expect(names).toHaveLength(1);
    expect(names[0]).toContain("MAJJA");
  });
});
