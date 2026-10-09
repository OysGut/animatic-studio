/**
 * Lager radfixture for visuell QA (mockede Supabase-svar) fra domenekjernen.
 * Manusteksten er oppdiktet (DEC-0004: ingen ekte manus i repoet), men har samme form som et importert manus:
 * scenenumre, karakterer med replikk, en lagret manusversjon (scene 7 flyttet etterpå) og et lite ressursbibliotek.
 *   bun tests/visual/make-fixture.ts [utfil.json]
 */
import { writeFileSync } from "node:fs";
import {
  diffStates,
  emptyProjectState,
  keyBetween,
  keysEvenly,
  orderedOccurrences,
  snapshotFromState,
  FPS_25,
  type ProjectState,
} from "../../src/core";
import { mustApply, tid } from "../helpers/fixtures";

const PEOPLE = ["MAJA", "BESTEMOR ANNE", "FAR", "BESTEMOR", "NISSEN"];
const PLACES = ["STUA - HJEMME HOS MAJA", "GÅRDSPLASSEN", "FJØSET", "SKOGEN"];

let s: ProjectState = emptyProjectState({
  id: tid<"project">(),
  revision: 1,
  name: "Jula på Dovre",
  fps: FPS_25,
  primaryLanguage: "nb",
});
const mainId = tid<"production">();
s = mustApply(s, {
  type: "CreateProduction",
  productionId: mainId as never,
  kind: "main",
  name: "Hovedfilm",
  parentProductionId: null,
});
const N = 14;
const keys = keysEvenly(N);
for (let i = 0; i < N; i++) {
  const who = PEOPLE[i % PEOPLE.length]!;
  const other = PEOPLE[(i + 2) % PEOPLE.length]!;
  const bk = keysEvenly(7);
  s = mustApply(s, {
    type: "CreateScene",
    productionId: mainId as never,
    sceneId: tid(),
    variantId: tid(),
    occurrenceId: tid(),
    orderKey: keys[i]!,
    heading: {
      intExt: i % 3 === 1 ? "EXT." : "INT.",
      location: PLACES[i % PLACES.length]!,
      time: i % 2 ? "KVELD" : "DAG",
    },
    blocks: [
      {
        blockId: tid(),
        kind: "action",
        text:
          i % 4 === 0
            ? "Snøen ligger tung over tunet. Maja setter vasen i vinduet og ser etter lys i skogen."
            : "Det knirker i gulvet. En katt stryker forbi døra.",
        orderKey: bk[0]!,
      },
      { blockId: tid(), kind: "character", text: who, orderKey: bk[1]! },
      {
        blockId: tid(),
        kind: "dialogue",
        text: "Hører du det? Det er noen ute i mørket.",
        orderKey: bk[2]!,
      },
      { blockId: tid(), kind: "character", text: other, orderKey: bk[3]! },
      { blockId: tid(), kind: "parenthetical", text: "(hvisker)", orderKey: bk[4]! },
      {
        blockId: tid(),
        kind: "dialogue",
        text: "Bare vinden. Legg deg nå, i morgen er det julaften.",
        orderKey: bk[5]!,
      },
      {
        blockId: tid(),
        kind: "action",
        text: "Hun blåser ut lyset.",
        orderKey: bk[6]!,
      },
    ],
    productionNumber: String(i + 1),
  });
}

// En usikker tolkning (som etter import)
const unsure = Object.values(s.blocks).find((b) => b.text === "Hun blåser ut lyset.")!;
s = mustApply(s, {
  type: "SetUncertainty",
  productionId: mainId as never,
  targetId: unsure.id,
  uncertainty: "Usikker elementtype: handling eller replikk?",
});

// Lagret versjon 1, deretter endringer: scene 7 flyttes til plass 2, en replikk endres, scene 10 deaktiveres
const v1 = snapshotFromState(s, mainId);
const occs = orderedOccurrences(s, mainId);
s = mustApply(s, {
  type: "MoveOccurrence",
  occurrenceId: occs[6]!.id,
  orderKey: keyBetween(occs[0]!.orderKey, occs[1]!.orderKey),
});
const dlg = Object.values(s.blocks).find(
  (b) => b.variantId === occs[2]!.variantId && b.kind === "dialogue",
)!;
s = mustApply(s, {
  type: "EditBlockText",
  productionId: mainId as never,
  blockId: dlg.id,
  text: "Hører du det, bestemor? Det er noen ute i mørket.",
});
s = mustApply(s, { type: "SetOccurrenceActive", occurrenceId: occs[9]!.id, active: false });

// Ressursbibliotek
const maja = tid<"asset">();
const anne = tid<"asset">();
const stua = tid<"asset">();
const vase = tid<"asset">();
s = mustApply(s, {
  type: "CreateAssets",
  assets: [
    {
      assetId: maja,
      fields: {
        kind: "character",
        name: "Maja",
        names: [{ name: "Maja-jenta", kind: "nickname", language: null }],
        description: "Ti år, nysgjerrig, redd for mørket men går likevel ut.",
        category: "Familie",
        tags: ["hovedrolle"],
      },
    },
    {
      assetId: anne,
      fields: {
        kind: "character",
        name: "Bestemor Anne",
        names: [
          { name: "BESTEMOR", kind: "alias", language: null },
          { name: "Grandma Anne", kind: "language", language: "en" },
        ],
        description: "Majas bestemor. Forteller historier om nissen.",
        category: "Familie",
        tags: [],
      },
    },
    {
      assetId: stua,
      fields: {
        kind: "location",
        name: "Stua",
        names: [],
        description: "",
        category: "Gården",
        tags: [],
      },
    },
    {
      assetId: vase,
      fields: {
        kind: "object",
        name: "vase",
        names: [],
        description: "Blå vase i vinduet.",
        category: "Rekvisitt",
        tags: [],
      },
    },
  ],
});
const variant = tid<"asset_variant">();
s = mustApply(s, {
  type: "CreateAssetVariant",
  variantId: variant,
  assetId: maja,
  fields: { name: "Animatic", style: "animatic", appearance: "" },
});
const winter = tid<"asset_variant">();
s = mustApply(s, {
  type: "CreateAssetVariant",
  variantId: winter,
  assetId: maja,
  fields: { name: "Vinterklær", style: "illustrated", appearance: "lue og votter" },
});
const versionIds: string[] = [];
for (const [vid, n] of [
  [variant, 3],
  [winter, 1],
] as const) {
  for (let k = 0; k < n; k++) {
    const id = tid<"asset_version">();
    versionIds.push(id);
    s = mustApply(s, {
      type: "AddAssetVersion",
      versionId: id,
      variantId: vid,
      media: {
        path: `${s.project.id}/${maja}/${id}/maja-${k + 1}.png`,
        mimeType: "image/png",
        width: 1200,
        height: 1600,
        byteSize: 120_000,
        sha256: "f".repeat(64),
      },
      note: "",
    });
  }
}
s = mustApply(s, {
  type: "ApproveAssetVersion",
  variantId: variant,
  versionId: versionIds[1]! as never,
});

// Notater: på tekst og som nål på scenen
const firstAction = Object.values(s.blocks).find((b) => b.text.startsWith("Snøen ligger"))!;
const q = "setter vasen i vinduet";
const qs = firstAction.text.indexOf(q);
const occ1 = orderedOccurrences(s, mainId)[0]!;
s = mustApply(s, {
  type: "AddAnnotations",
  annotations: [
    {
      annotationId: tid(),
      blockId: firstAction.id,
      variantId: null,
      start: qs,
      end: qs + q.length,
      quote: q,
      text: "Vasen må være den blå fra bestemors stue – sjekk kontinuitet med scene 9.",
      authorName: "Anita",
      stampAt: "2026-10-09T08:12:00.000Z",
    },
    {
      annotationId: tid(),
      blockId: null,
      variantId: occ1.variantId,
      start: 0,
      end: 0,
      quote: "",
      text: "Åpningsscenen: lang kjøring inn gjennom vinduet.",
      authorName: "Mars",
      stampAt: "2026-10-09T09:40:00.000Z",
    },
  ],
});

const cs = diffStates(emptyProjectState(s.project), s);
const rows: Record<string, unknown[]> = {};
for (const [t, list] of Object.entries(cs.inserts))
  rows[t] = (list as Record<string, unknown>[]).map((r) =>
    t === "asset_versions"
      ? {
          ...r,
          created_at: "2026-10-09T09:00:00Z",
          created_by: "00000000-0000-7000-8000-a11ce0000001",
        }
      : r,
  );
rows["script_block_revisions"] = cs.blockRevisions as unknown[];
rows["script_versions"] = [
  {
    id: "00000000-0000-7000-8000-0000000000f1",
    number: 1,
    name: "Draft 9.3",
    note: "Importert",
    parent_version_id: null,
    created_at: "2026-10-09T08:00:00Z",
    created_by: "00000000-0000-7000-8000-a11ce0000001",
    snapshot: v1,
  },
];
const project = {
  id: s.project.id,
  name: "Jula på Dovre",
  fps_num: 25,
  fps_den: 1,
  primary_language: "nb",
  revision: 1,
  created_at: "2026-10-08T10:00:00Z",
};
writeFileSync(
  process.argv[2] ?? "/tmp/claude-0/visual-fixture.json",
  JSON.stringify({ project, rows }, null, 1),
);
console.log("ok", Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length])));
