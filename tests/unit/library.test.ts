// @vitest-environment node
/** Ressursbiblioteket (M3 del 1; REQ-0121–0136, REQ-0146, REQ-0149, KI-29). */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  assetUsage,
  coverVersion,
  displayName,
  editDistance,
  librarySuggestions,
  matchingOccurrences,
  parseScreenplayLines,
  planImport,
  type AssetFields,
  type Command,
  type ProductionId,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

const L = (row: number, x: number, text: string) => ({ page: 1, x, y: 72 + row * 12, text });

function project() {
  const { state, mainId } = seedProject(0);
  const parsed = parseScreenplayLines(
    [
      L(0, 54, "1 INT. STUA - HJEMME HOS MAJA - DAG 1"),
      L(2, 108, "MAJA ser på vasen. Bestemor Anne sover."),
      L(4, 252, "MAJA"),
      L(5, 180, "Hei, bestemor."),
      L(7, 54, "2 EXT. GÅRDSPLASSEN - DAG 2"),
      L(9, 108, "Hunden løper. Far kommer ut."),
      L(11, 252, "BESTEMOR"),
      L(12, 180, "Kom inn!"),
      L(14, 54, "3 INT. STUA - HJEMME HOS MAJA - KVELD 3"),
      L(16, 108, "Vasene står på bordet."),
      L(18, 252, "MAJJA"),
      L(19, 180, "Natta."),
    ],
    { format: "pdf" },
  );
  const cmd = planImport(state, parsed, { productionId: mainId as ProductionId, newId: tid });
  return { s: mustApply(state, cmd), mainId: mainId as ProductionId, cmd };
}

function fields(over: Partial<AssetFields> = {}): AssetFields {
  return {
    kind: "character",
    name: "Bestemor Anne",
    names: [],
    description: "",
    category: "",
    tags: [],
    ...over,
  };
}

function fails(s: ProjectState, c: Command) {
  const r = applyCommand(s, envelope(c));
  expect(r.ok).toBe(false);
  return r.ok ? null : r.error;
}

describe("Ressurser og navn (REQ-0125, REQ-0126)", () => {
  it("lagrer foretrukket og alternative navn ryddet, og avviser tomt navn", () => {
    const { s } = project();
    const id = tid<"asset">();
    const x = mustApply(s, {
      type: "CreateAssets",
      assets: [
        {
          assetId: id,
          fields: fields({
            name: "  Bestemor Anne ",
            names: [
              { name: "BESTEMOR", kind: "alias", language: null },
              { name: "bestemor", kind: "nickname", language: null }, // duplikat
              { name: "Bestemor Anne", kind: "alias", language: null }, // = foretrukket
              { name: "Grandma", kind: "language", language: "en" },
              { name: " ", kind: "alias", language: null },
            ],
            tags: ["familie", "Familie", ""],
          }),
        },
      ],
    });
    const a = x.assets[id]!;
    expect(a.name).toBe("Bestemor Anne");
    expect(a.names.map((n) => n.name)).toEqual(["BESTEMOR", "Grandma"]);
    expect(a.tags).toEqual(["familie"]);
    expect(
      fails(s, {
        type: "CreateAssets",
        assets: [{ assetId: tid(), fields: fields({ name: " " }) }],
      })?.code,
    ).toBe("invalid");
    expect(
      fails(s, {
        type: "CreateAssets",
        assets: [
          {
            assetId: tid(),
            fields: fields({ names: [{ name: "X", kind: "alias", language: "ikke gyldig" }] }),
          },
        ],
      })?.code,
    ).toBe("invalid");
  });

  it("endring, arkivering og angre gir samme innhold tilbake", () => {
    const { s } = project();
    const id = tid<"asset">();
    const create = applyCommand(
      s,
      envelope({ type: "CreateAssets", assets: [{ assetId: id, fields: fields() }] }),
    );
    if (!create.ok) throw new Error();
    const upd = applyCommand(
      create.state,
      envelope({
        type: "UpdateAsset",
        assetId: id,
        fields: fields({ name: "Anne", category: "Familie" }),
      }),
    );
    if (!upd.ok) throw new Error();
    expect(upd.state.assets[id]!.name).toBe("Anne");
    const back = applyCommand(upd.state, envelope(upd.inverse));
    if (!back.ok) throw new Error();
    expect(back.state.assets[id]!.name).toBe("Bestemor Anne");
    const undoCreate = applyCommand(back.state, envelope(create.inverse));
    if (!undoCreate.ok) throw new Error();
    expect(undoCreate.state.assets[id]).toBeUndefined();
  });
});

describe("Visuelle varianter og versjoner (REQ-0135, REQ-0136, REQ-0146)", () => {
  function withVariant() {
    const { s } = project();
    const assetId = tid<"asset">();
    const variantId = tid<"asset_variant">();
    let x = mustApply(s, { type: "CreateAssets", assets: [{ assetId, fields: fields() }] });
    x = mustApply(x, {
      type: "CreateAssetVariant",
      variantId,
      assetId,
      fields: { name: "Animatic", style: "animatic", appearance: "vinterklær" },
    });
    const media = (versionId: string) => ({
      path: `${x.project.id}/${assetId}/${versionId}/anne.png`,
      mimeType: "image/png",
      width: 1000,
      height: 1500,
      byteSize: 2048,
      sha256: "b".repeat(64),
    });
    return { x, assetId, variantId, media };
  }

  it("nummererer versjoner, og ny versjon endrer ikke godkjent versjon", () => {
    const { x: s0, assetId, variantId, media } = withVariant();
    const v1 = tid<"asset_version">();
    const v2 = tid<"asset_version">();
    let x = mustApply(s0, {
      type: "AddAssetVersion",
      versionId: v1,
      variantId,
      media: media(v1),
      note: "Første",
    });
    x = mustApply(x, { type: "ApproveAssetVersion", variantId, versionId: v1 });
    x = mustApply(x, {
      type: "AddAssetVersion",
      versionId: v2,
      variantId,
      media: media(v2),
      note: "",
    });
    expect(x.assetVersions[v1]!.number).toBe(1);
    expect(x.assetVersions[v2]!.number).toBe(2);
    // REQ-0146: ny versjon tas ikke i bruk automatisk
    expect(x.assetVariants[variantId]!.approvedVersionId).toBe(v1);
    expect(coverVersion(x, assetId)!.id).toBe(v1);
    // Godkjent versjon kan ikke angres bort, og varianten med bilder kan ikke fjernes
    expect(fails(x, { type: "UndoAddAssetVersion", versionId: v1 })?.code).toBe("referenced");
    expect(fails(x, { type: "UndoCreateAssetVariant", variantId })?.code).toBe("referenced");
    expect(fails(x, { type: "UndoCreateAssets", assetIds: [assetId] })?.code).toBe("referenced");
  });

  it("avviser bilder utenfor prosjektet, feil filtype og for store filer", () => {
    const { x, variantId, media } = withVariant();
    const id = tid<"asset_version">();
    const bad = (m: Partial<ReturnType<typeof media>>) =>
      fails(x, {
        type: "AddAssetVersion",
        versionId: id,
        variantId,
        media: { ...media(id), ...m },
        note: "",
      })?.code;
    expect(bad({ path: `annet-prosjekt/${id}/a.png` })).toBe("invalid");
    expect(bad({ path: `${x.project.id}/../a.png` })).toBe("invalid");
    expect(bad({ mimeType: "image/svg+xml" })).toBe("invalid");
    expect(bad({ byteSize: 3 * 1024 * 1024 * 1024 })).toBe("invalid");
    expect(bad({ sha256: "x" })).toBe("invalid");
  });

  it("godkjenning av en annen variants versjon avvises", () => {
    const { x: s0, assetId, variantId, media } = withVariant();
    const other = tid<"asset_variant">();
    const v = tid<"asset_version">();
    let x = mustApply(s0, {
      type: "CreateAssetVariant",
      variantId: other,
      assetId,
      fields: { name: "Plakat", style: "poster", appearance: "" },
    });
    x = mustApply(x, {
      type: "AddAssetVersion",
      versionId: v,
      variantId: other,
      media: media(v),
      note: "",
    });
    expect(fails(x, { type: "ApproveAssetVersion", variantId, versionId: v })?.code).toBe(
      "invalid",
    );
  });

  it("ufullstendige data fra klienten gir feilmelding, ikke krasj", () => {
    const { x, variantId } = withVariant();
    expect(
      fails(x, {
        type: "AddAssetVersion",
        versionId: tid(),
        variantId,
        note: "",
      } as unknown as Command)?.code,
    ).toBe("invalid");
    expect(
      fails(x, {
        type: "CreateAssets",
        assets: [{ assetId: tid(), fields: { kind: "character" } }],
      } as unknown as Command)?.code,
    ).toBe("invalid");
  });
});

describe("Bruk i manuset (REQ-0131) og karakterfilter med alternative navn (KI-29)", () => {
  it("finner scener for karakter under alle navn, lokasjon og objekt", () => {
    const { s, mainId, cmd } = project();
    const anne = tid<"asset">();
    const stua = tid<"asset">();
    const vase = tid<"asset">();
    const x = mustApply(s, {
      type: "CreateAssets",
      assets: [
        {
          assetId: anne,
          fields: fields({ names: [{ name: "BESTEMOR", kind: "alias", language: null }] }),
        },
        { assetId: stua, fields: fields({ kind: "location", name: "Stua" }) },
        { assetId: vase, fields: fields({ kind: "object", name: "vase" }) },
      ],
    });
    const occ = cmd.scenes.map((sc) => sc.occurrenceId as string);
    const use = (id: string) =>
      assetUsage(x, mainId, x.assets[id]!).map((u) => [u.occurrenceId, u.how]);
    expect(use(anne)).toEqual([
      [occ[0], "mentioned"], // «Bestemor Anne sover» (og «bestemor» med liten forbokstav teller ikke)
      [occ[1], "speaks"],
    ]);
    expect(use(stua)).toEqual([
      [occ[0], "location"],
      [occ[2], "location"],
    ]);
    expect(use(vase)).toEqual([
      [occ[0], "text"], // vasen
      [occ[2], "text"], // Vasene
    ]);
    // Karakterfilteret med alle navnene (KI-29)
    const names = ["Bestemor Anne", "BESTEMOR"];
    expect([
      ...matchingOccurrences(x, mainId, { character: "Bestemor Anne", characterNames: names }),
    ]).toEqual([occ[0], occ[1]]);
  });
});

describe("Forslag fra manuset (REQ-0128)", () => {
  it("foreslår karakterer og lokasjoner som mangler, med mulige treff som må bekreftes", () => {
    const { s, mainId } = project();
    const before = librarySuggestions(s, mainId);
    expect(before.filter((x) => x.kind === "character").map((x) => x.name)).toEqual(
      expect.arrayContaining(["MAJA", "BESTEMOR"]),
    );
    // MAJJA (1 scene) staves nesten som MAJA (2 scener): slås sammen som mulig skrivefeil og blir alternativt navn
    expect(before.find((x) => x.name === "MAJA")!.sources).toEqual([
      { name: "MAJJA", scenes: 1, note: "typo" },
    ]);
    expect(before.some((x) => x.name === "MAJJA")).toBe(false);
    expect(before.filter((x) => x.kind === "location").map((x) => [x.name, x.scenes])).toEqual([
      ["STUA - HJEMME HOS MAJA", 2],
      ["GÅRDSPLASSEN", 1],
    ]);
    const maja = tid<"asset">();
    const x = mustApply(s, {
      type: "CreateAssets",
      assets: [{ assetId: maja, fields: fields({ name: displayName("MAJA") }) }],
    });
    const after = librarySuggestions(x, mainId).filter((y) => y.kind === "character");
    expect(after.map((y) => y.name)).not.toContain("MAJA");
    // MAJJA ligner Maja (stavefeil?) – foreslås som mulig samme, ikke koblet automatisk
    expect(after.find((y) => y.name === "MAJJA")!.possibleMatch).toEqual({
      assetId: maja,
      assetName: "Maja",
    });
    expect(after.find((y) => y.name === "BESTEMOR")!.possibleMatch).toBeNull();
  });

  it("hjelpefunksjoner", () => {
    expect(displayName("BESTEMOR ANNE")).toBe("Bestemor Anne");
    expect(displayName("STUA - HJEMME HOS MAJA")).toBe("Stua - Hjemme Hos Maja");
    expect(editDistance("MAJA", "MAJJA")).toBe(1);
    expect(editDistance("kitten", "sitting")).toBe(3);
  });
});
