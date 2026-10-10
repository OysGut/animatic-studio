/**
 * Lager radfixture for visuell QA (mockede Supabase-svar) fra domenekjernen.
 * Manusteksten er oppdiktet (DEC-0004: ingen ekte manus i repoet), men har samme form som et importert manus:
 * scenenumre, karakterer med replikk, en lagret manusversjon (scene 7 flyttet etterpå) og et lite ressursbibliotek.
 *   bun tests/visual/make-fixture.ts [utfil.json]
 */
import { writeFileSync } from "node:fs";
import {
  DEFAULT_COMPOSITION,
  IDENTITY_TRANSFORM,
  defaultLayerFields,
  diffStates,
  emptyProjectState,
  keyBetween,
  keysEvenly,
  layerFieldsOf,
  newShot,
  orderedOccurrences,
  toggleCurve,
  withShot,
  snapshotFromState,
  FPS_25,
  type ProjectState,
} from "../../src/core";
import { mustApply, tid } from "../helpers/fixtures";

const PEOPLE = ["MAJA", "BESTEMOR ANNE", "FAR", "BESTEMOR", "NISSEN"];
const PLACES = ["STUA - HJEMME HOS MAJA", "GÅRDSPLASSEN", "FJØSET", "SKOGEN"];

// Handlingslinjer som gir forslag i biblioteket: en navngitt ting uten replikk (Svarten) og et objekt (sekk)
const ACTION: Record<number, string> = {
  1: "Det knirker i gulvet. Maja klapper Svarten bak øret.",
  2: "Faren løfter en sekk opp på kjerra.",
  5: "Det er stille. Maja ser at Svarten legger seg ved ovnen. Sekken står igjen ved døra.",
  8: "Hun drar sekken etter seg over tunet.",
};

let s: ProjectState = emptyProjectState({
  id: tid<"project">(),
  revision: 1,
  name: "Jula på Dovre",
  fps: FPS_25,
  frameWidth: 1920,
  frameHeight: 1080,
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
  const who = i === 6 ? "MAJJA" : PEOPLE[i % PEOPLE.length]!;
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
          ACTION[i] ??
          (i % 4 === 0
            ? "Snøen ligger tung over tunet. Maja setter vasen i vinduet og ser etter lys i skogen."
            : "Det knirker i gulvet. En katt stryker forbi døra."),
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

// 2D-scene for første scene i hovedproduksjonen
const firstOcc = orderedOccurrences(s, mainId)[0]!;
const compId = tid<"composition">();
s = mustApply(s, {
  type: "CreateComposition",
  compositionId: compId,
  variantId: firstOcc.variantId,
  fields: { ...DEFAULT_COMPOSITION, name: "Stua – åpning" },
});
const anneVariant = tid<"asset_variant">();
s = mustApply(s, {
  type: "CreateAssetVariant",
  variantId: anneVariant,
  assetId: anne,
  fields: { name: "Animatic", style: "animatic", appearance: "" },
});
const anneVersion = tid<"asset_version">();
s = mustApply(s, {
  type: "AddAssetVersion",
  versionId: anneVersion,
  variantId: anneVariant,
  media: {
    path: `${s.project.id}/${anne}/${anneVersion}/anne-1.png`,
    mimeType: "image/png",
    width: 1200,
    height: 1600,
    byteSize: 120_000,
    sha256: "e".repeat(64),
  },
  note: "",
});
const comp = s.compositions[compId]!;
const layerOf = (fields: ReturnType<typeof defaultLayerFields>) => ({
  layerId: tid<"composition_layer">(),
  compositionId: compId,
  fields,
});
s = mustApply(s, {
  type: "AddLayers",
  layers: [
    layerOf(defaultLayerFields(s, comp, { fill: "#24324a", name: "Himmel" })),
    layerOf({
      ...defaultLayerFields(s, comp, { assetId: maja }),
      transform: { ...IDENTITY_TRANSFORM, x: 640, y: 560, scaleX: 0.5, scaleY: 0.5 },
    }),
    layerOf({
      ...defaultLayerFields(s, comp, { assetId: anne }),
      transform: { ...IDENTITY_TRANSFORM, x: 1280, y: 540, scaleX: 0.55, scaleY: 0.55 },
    }),
    layerOf({ ...defaultLayerFields(s, comp, { assetId: vase }), visible: false }),
    layerOf({
      ...defaultLayerFields(s, comp, { fill: "#8fa3c4", name: "Snødis" }),
      kind: "effect",
      locked: true,
      height: 300,
      transform: { ...IDENTITY_TRANSFORM, x: 960, y: 930, opacity: 0.35 },
    }),
  ],
});

// Tid og kamera: Maja går mot høyre (nøkkelbilder), og kameraet kjører inn mot henne langs en kurvet bane
const majaLayer = Object.values(s.layers).find(
  (l) => l.assetId === maja && l.compositionId === compId,
)!;
s = mustApply(s, {
  type: "UpdateLayers",
  layers: [
    {
      layerId: majaLayer.id as never,
      fields: {
        ...layerFieldsOf(majaLayer),
        keyframes: [
          { frame: 0, property: "x", value: 640, easing: "ease-in-out" },
          { frame: 50, property: "x", value: 900, easing: "ease-in-out" },
        ],
      },
    },
  ],
});
const shot0 = toggleCurve({
  ...newShot(s.compositions[compId]!, "shot-1", 0, 75, "Inn mot Maja"),
  to: { x: 900, y: 520, zoom: 1.6, rotation: 0 },
});
const shot1 = shot0.curve
  ? { ...shot0, curve: { ...shot0.curve, c1y: shot0.curve.c1y + 260, c2y: shot0.curve.c2y - 120 } }
  : shot0;
const compNow = s.compositions[compId]!;
s = mustApply(s, {
  type: "UpdateComposition",
  compositionId: compId,
  fields: {
    name: compNow.name,
    width: compNow.width,
    height: compNow.height,
    durationFrames: 100,
    background: compNow.background,
  },
  camera: withShot(compNow.camera, shot1),
});

// Lyd (DEC-0044): to lydfiler i biblioteket og lydklipp i tre scener
const wind = tid<"asset">();
const line = tid<"asset">();
s = mustApply(s, {
  type: "CreateAssets",
  assets: [
    {
      assetId: wind,
      fields: {
        kind: "sound",
        name: "Vind i trærne",
        names: [],
        description: "",
        category: "Atmosfære",
        tags: [],
      },
    },
    {
      assetId: line,
      fields: {
        kind: "sound",
        name: "Maja – Hører du det",
        names: [],
        description: "",
        category: "Dialog",
        tags: [],
      },
    },
  ],
});
const soundVersions: Record<string, string> = {};
for (const [a, ms, file] of [
  [wind, 20000, "vind.wav"],
  [line, 3500, "maja.wav"],
] as const) {
  const va = tid<"asset_variant">();
  s = mustApply(s, {
    type: "CreateAssetVariant",
    variantId: va,
    assetId: a,
    fields: { name: "Lyd", style: "other", appearance: "" },
  });
  const ve = tid<"asset_version">();
  soundVersions[a] = ve;
  s = mustApply(s, {
    type: "AddAssetVersion",
    versionId: ve,
    variantId: va,
    media: {
      path: `${s.project.id}/${a}/${ve}/${file}`,
      mimeType: "audio/wav",
      width: null,
      height: null,
      byteSize: 160_000,
      sha256: "d".repeat(64),
      durationMs: ms,
    },
    note: "",
  });
}
{
  const occs = orderedOccurrences(s, mainId).filter((o) => o.active);
  const o1 = occs[0]!;
  const dlg = Object.values(s.blocks).find(
    (b) => b.variantId === o1.variantId && b.kind === "dialogue",
  );
  const base = {
    assetVariantId: null,
    versionId: null,
    sourceInMs: 0,
    gainDb: 0,
    fadeInMs: 0,
    fadeOutMs: 0,
    muted: false,
    continues: false,
    volumeKeys: [] as { t: number; db: number }[],
  };
  s = mustApply(s, {
    type: "AddAudioClips",
    clips: [
      {
        clipId: tid(),
        fields: {
          ...base,
          occurrenceId: o1.id,
          kind: "dialogue",
          name: "Maja: Hører du det?",
          assetId: line,
          blockId: (dlg?.id ?? null) as never,
          offsetMs: 600,
          lengthMs: 3500,
        },
      },
      {
        clipId: tid(),
        fields: {
          ...base,
          occurrenceId: occs[1]!.id,
          kind: "ambience",
          name: "Vind i trærne",
          assetId: wind,
          blockId: null,
          offsetMs: 0,
          lengthMs: 20000,
          fadeInMs: 1500,
          fadeOutMs: 2000,
        },
      },
      {
        clipId: tid(),
        fields: {
          ...base,
          occurrenceId: o1.id,
          kind: "music",
          name: "Tema",
          assetId: wind,
          blockId: null,
          offsetMs: 2000,
          lengthMs: 18000,
          gainDb: -6,
          continues: true,
          volumeKeys: [
            { t: 0, db: -18 },
            { t: 3000, db: 0 },
            { t: 12000, db: 0 },
            { t: 16000, db: -24 },
          ],
        },
      },
    ],
  });
}

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

// Importert ferdig film i scene 2, og overganger (DEC-0047)
{
  const occs = orderedOccurrences(s, mainId).filter((o) => o.active);
  const takeId = tid<"take">();
  s = mustApply(s, {
    type: "AddTake",
    takeId,
    occurrenceId: occs[1]!.id,
    segmentId: null,
    kind: "imported_film",
    status: "approved",
    durationFrames: 300,
    mediaRef: `${s.project.id}/films/${takeId}/fjoset_ferdig.mp4`,
    media: {
      fileName: "fjøset_ferdig.mp4",
      mimeType: "video/mp4",
      byteSize: 48_000_000,
      width: 1920,
      height: 1080,
      fps: 25,
      durationMs: 12000,
      videoCodec: "avc",
      hasAudio: true,
    },
  });
  s = mustApply(s, { type: "SetActiveTake", occurrenceId: occs[1]!.id, takeId });
  s = mustApply(s, {
    type: "SetTransition",
    occurrenceId: occs[1]!.id,
    transition: { kind: "dissolve", frames: 25 },
  });
  s = mustApply(s, {
    type: "SetTransition",
    occurrenceId: occs[2]!.id,
    transition: { kind: "dip", frames: 20 },
  });
}

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
  frame_width: s.project.frameWidth,
  frame_height: s.project.frameHeight,
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
