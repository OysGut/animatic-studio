/**
 * Radfixturen for MTS-nettlesertestene (mts-engine, mts-lower-thirds, mts-nondestructive). Bygger på
 * fixture-state.ts og legger til: en 2D-scene til i en annen scene, en lower third i scene A lagret som mal
 * (versjon 1 og en nyere versjon 2) og brukt én gang i scene A, og et frittstående tekstlag.
 *   bun tests/visual/make-mts-fixture.ts [utfil.json]
 * ID-ene skrives også i filen (`mts`), så testene ikke trenger å gjette.
 */
import { writeFileSync } from "node:fs";
import {
  DEFAULT_COMPOSITION,
  keyBetween,
  diffStates,
  lowerThirdStarter,
  mainProduction,
  orderedOccurrences,
  planApplyTemplate,
  templateFromLayers,
  textLayerFields,
  type TemplateDefinition,
} from "../../src/core";
import { mustApply } from "../helpers/fixtures";
import { fixture } from "./fixture-state";

const { project } = fixture;
const rows: Record<string, unknown[]> = { ...(fixture.rows as Record<string, unknown[]>) };
let s = fixture.state;
const id = (n: number) => `00000000-0000-7000-8000-0000a7${String(n).padStart(6, "0")}`;
const main = mainProduction(s)!;
const compA = Object.values(s.compositions).find((c) => !c.removed)!;
const occs = orderedOccurrences(s, main.id).filter((o) => o.active);
const occA = occs.find((o) => o.variantId === compA.variantId)!;
const occB = occs.find((o) => o.variantId !== compA.variantId && !Object.values(s.compositions).some((c) => c.variantId === o.variantId))!;
const compB = id(1);
s = mustApply(s, {
  type: "CreateComposition",
  compositionId: compB as never,
  variantId: occB.variantId,
  fields: { ...DEFAULT_COMPOSITION, name: "Scene B", durationFrames: 100 },
});

// Frittstående tekst i scene A
const textLayer = id(2);
s = mustApply(s, {
  type: "AddLayers",
  layers: [{ layerId: textLayer as never, compositionId: compA.id, fields: textLayerFields(compA, "Jula på Dovre", "Tittel") }],
});

// Lower third i scene A, lagret som mal (versjon 1)
let n = 100;
const lt = lowerThirdStarter(compA, {
  newLayerId: () => id(n++),
  groupName: "Lower third",
  nameLabel: "Navn",
  roleLabel: "Rolle",
  name: "Anita Killi",
  role: "Regi",
});
s = mustApply(s, { type: "AddLayers", layers: lt });
const def1 = templateFromLayers(s, compA.id, [lt[0]!.layerId], { category: "lower_third" });
// Utgangslagene er bare grunnlaget for malen; forekomsten under er det som vises
s = mustApply(s, { type: "SetLayersRemoved", layerIds: lt.map((l) => l.layerId), removed: true });
const tplAsset = id(10);
const tplVariant = id(11);
const v1 = id(12);
const v2 = id(13);
const media = (v: string) => ({
  path: `${project.id}/${tplAsset}/${v}/mal.png`,
  mimeType: "image/png",
  width: 480,
  height: 270,
  byteSize: 100,
  sha256: "d".repeat(64),
  durationMs: null,
});
s = mustApply(s, {
  type: "CreateAssets",
  assets: [{ assetId: tplAsset as never, fields: { kind: "template", name: "Lower third Trollfilm", names: [], description: "", category: "lower_third", tags: [] } }],
});
s = mustApply(s, { type: "CreateAssetVariant", variantId: tplVariant as never, assetId: tplAsset as never, fields: { name: "Standard", style: "other", appearance: "" } });
s = mustApply(s, { type: "AddAssetVersion", versionId: v1 as never, variantId: tplVariant as never, media: media(v1), note: "", template: def1 });
const inst = id(20);
const plan = planApplyTemplate(s, { instanceId: inst, compositionId: compA.id, versionId: v1, newLayerId: () => id(n++) });
if (!plan.ok) throw new Error(plan.reason);
s = mustApply(s, plan.command);
// Versjon 2: rollen får en annen farge (AI–AJ)
const def2: TemplateDefinition = {
  ...def1,
  elements: def1.elements.map((e) =>
    e.slot === "rolle" && e.fields.text ? { ...e, fields: { ...e.fields, text: { ...e.fields.text, color: "#ff3300" } } } : e,
  ),
};
s = mustApply(s, { type: "AddAssetVersion", versionId: v2 as never, variantId: tplVariant as never, media: media(v2), note: "", template: def2 });

// MT6/MT7: en filmtittel, en tekstscene og en rulletekst med sekvens og deltakere
const addKind = (kind: "title" | "text" | "credits", base: number) => {
  s = mustApply(s, {
    type: "CreateScene",
    productionId: main.id,
    sceneId: id(base) as never,
    variantId: id(base + 1) as never,
    occurrenceId: id(base + 2) as never,
    orderKey: keyBetween(orderedOccurrences(s, main.id).at(-1)!.orderKey, null),
    heading: { intExt: "", location: kind === "title" ? "FILMTITTEL" : kind === "text" ? "MELLOMTEKST" : "RULLETEKST", time: "" },
    blocks: [],
    kind,
  });
  s = mustApply(s, {
    type: "CreateComposition",
    compositionId: id(base + 3) as never,
    variantId: id(base + 1) as never,
    fields: { ...DEFAULT_COMPOSITION, name: kind, durationFrames: 144 },
  });
  return { occurrenceId: id(base + 2), compositionId: id(base + 3) };
};
const title = addKind("title", 200);
const text = addKind("text", 210);
const credits = addKind("credits", 220);
// Tittelen har én side (uten tekst – sider er beholdere) og et tekstlag inni med bokstavanimasjon
s = mustApply(s, {
  type: "AddLayers",
  layers: [
    {
      layerId: id(230) as never,
      compositionId: title.compositionId as never,
      fields: {
        ...textLayerFields(s.compositions[title.compositionId]!, "Jula på Dovre", "Tittel", {
          letterAnim: { unit: "letter", effect: "appear", direction: "up", startFrame: 0, delayFrames: 3, durationFrames: 2, order: "start", seed: 1, distance: 0 },
        }),
        kind: "page",
        text: null,
        activeRange: { from: 0, to: 72 },
        pageTransition: null,
      },
    },
    {
      layerId: id(231) as never,
      compositionId: title.compositionId as never,
      fields: {
        ...textLayerFields(s.compositions[title.compositionId]!, "Jula på Dovre", "Tittel", {
          letterAnim: { unit: "letter", effect: "appear", direction: "up", startFrame: 0, delayFrames: 3, durationFrames: 2, order: "start", seed: 1, distance: 0 },
        }),
        groupId: id(230) as never,
      },
    },
  ],
});
s = mustApply(s, {
  type: "SetCreditSequence",
  sequenceId: id(240) as never,
  occurrenceId: credits.occurrenceId as never,
  fields: { presentation: "roll", durationFrames: 48, pauseFrames: 24, speed: 4, direction: "up" },
});
s = mustApply(s, {
  type: "AddCreditParticipant",
  participantId: id(241) as never,
  fields: { orderKey: keyBetween(null, null), groupKey: "", hidden: false, fields: { navn: "Anita Killi", rolle: "Regi" } },
});
s = mustApply(s, {
  type: "AddCreditParticipant",
  participantId: id(242) as never,
  fields: { orderKey: keyBetween(id(241) in s.creditParticipants ? s.creditParticipants[id(241) as never]!.orderKey : null, null), groupKey: "", hidden: false, fields: { navn: "Øystein Gutu", rolle: "Musikk" } },
});

const cs = diffStates(fixture.state, s);
for (const [t, list] of Object.entries(cs.inserts as Record<string, unknown[]>)) rows[t] = [...(rows[t] ?? []), ...list];

// DV7: én replikk med avvik – den aktive lydversjonen ble laget fra revisjon n, manuset står nå på n+1.
type R = Record<string, unknown>;
const driftClip = (rows["audio_clips"] as R[]).find((c) => c["kind"] === "dialogue" && c["block_id"] && !c["removed"] && c["active_version_id"]);
const driftBlock = driftClip && (rows["script_blocks"] as R[]).find((b) => b["id"] === driftClip["block_id"]);
const driftVersion = driftClip && (rows["dialogue_versions"] as R[]).find((v) => v["id"] === driftClip["active_version_id"]);
if (driftClip && driftBlock && driftVersion) {
  const rev = Number(driftBlock["current_rev"]);
  const oldText = String(driftBlock["text"]);
  driftVersion["script_revision"] = rev;
  driftBlock["current_rev"] = rev + 1;
  driftBlock["text"] = `${oldText.split(" ").slice(1).join(" ")} nå med ny slutt`;
  const revisions = (rows["script_block_revisions"] ?? []) as R[];
  if (!revisions.some((r) => r["block_id"] === driftBlock["id"] && Number(r["rev"]) === rev)) revisions.push({ project_id: project.id, block_id: driftBlock["id"], rev, text: oldText, created_at: "2026-10-19T10:00:00Z", created_by: null });
  revisions.push({ project_id: project.id, block_id: driftBlock["id"], rev: rev + 1, text: driftBlock["text"], created_at: "2026-10-20T10:00:00Z", created_by: null });
  rows["script_block_revisions"] = revisions;
}

const instanceLayers = Object.values(s.layers).filter((l) => l.template?.instanceId === inst && !l.removed);
writeFileSync(
  process.argv[2] ?? "/tmp/claude-0/mts-fixture.json",
  JSON.stringify(
    {
      project,
      rows,
      mts: {
        compA: compA.id,
        occA: occA.id,
        sceneA: occA.id,
        compB,
        occB: occB.id,
        sceneB: occB.id,
        textLayer,
        templateAsset: tplAsset,
        v1,
        v2,
        instance: inst,
        instanceGroup: instanceLayers.find((l) => l.kind === "group")!.id,
        instanceName: instanceLayers.find((l) => l.template?.slot === "navn")!.id,
        titleOcc: title.occurrenceId,
        titleComp: title.compositionId,
        titlePage: id(230),
        textOcc: text.occurrenceId,
        textComp: text.compositionId,
        creditsOcc: credits.occurrenceId,
        creditsComp: credits.compositionId,
        creditSeq: id(240),
        creditP1: id(241),
        creditP2: id(242),
        driftOcc: driftClip?.["occurrence_id"] ?? null,
        driftBlock: driftBlock?.["id"] ?? null,
        driftClip: driftClip?.["id"] ?? null,
        instanceRole: instanceLayers.find((l) => l.template?.slot === "rolle")!.id,
      },
    },
    null,
    1,
  ),
);
console.log("ok", Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length])));
