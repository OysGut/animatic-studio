/**
 * Skriver radfixturen for visuell QA (se fixture-state.ts).
 *   bun tests/visual/make-fixture.ts [utfil.json]
 *
 * For utgivelsesflaten (DEC-0061) legges en godkjent relasjon og to plakater til her, ikke i
 * fixture-state.ts, så enhetstestene som bruker tilstanden er uendret.
 */
import { writeFileSync } from "node:fs";
import {
  diffStates,
  layoutPoster,
  mainProduction,
  posterDraft,
  type PosterKind,
} from "../../src/core";
import { mustApply } from "../helpers/fixtures";
import { fixture } from "./fixture-state";

const { project, rows } = fixture;
let s = fixture.state;
const main = mainProduction(s)!;
const byName = (n: string) => Object.values(s.assets).find((a) => a.name === n)!;
s = mustApply(s, {
  type: "AddRelations",
  items: [
    {
      relationId: "00000000-0000-7000-8000-00000000e001" as never,
      fields: {
        fromAssetId: byName("Maja").id,
        toAssetId: byName("Bestemor Anne").id,
        kind: "family",
        label: "Barnebarn og bestemor",
        description: "Bestemor passer på Maja i jula.",
        status: "approved",
      },
    },
  ],
});
const posters: [string, PosterKind, string][] = [
  ["00000000-0000-7000-8000-00000000e101", "character_map", "Karakterkart"],
  ["00000000-0000-7000-8000-00000000e102", "pitch", "Kinopitch"],
];
for (const [id, kind, name] of posters) {
  const draft = posterDraft(s, main.id, kind);
  const doc = layoutPoster(s, {
    kind,
    widthMm: 700,
    heightMm: 1000,
    productionId: main.id,
    document: {
      ...draft,
      logline: {
        nb: "Maja skal feire jul hos bestemor på Dovre – men noe er galt med nissen.",
        en: "",
      },
    },
  });
  s = mustApply(s, {
    type: "CreatePoster",
    posterId: id as never,
    fields: {
      productionId: main.id,
      name,
      kind,
      language: "nb",
      widthMm: 700,
      heightMm: 1000,
      document: doc,
    },
  });
}
const cs = diffStates(fixture.state, s);
for (const t of ["asset_relations", "posters"])
  rows[t] = (cs.inserts as Record<string, unknown[]>)[t] ?? [];

// DV3/DV4: a second preserved alternative and an account voice default, without auto-linking legacy lines.
const dialogueRows = (rows["dialogue_versions"] ?? []) as Record<string, unknown>[];
const firstDialogue = dialogueRows[0];
if (firstDialogue) dialogueRows.push({ ...firstDialogue, id: "00000000-0000-7000-8000-00000000d300", source: "record", parent_version_id: firstDialogue["id"], created_at: "2026-10-19T20:00:00Z" });
for (const a of (rows["assets"] ?? []) as Record<string, unknown>[]) if (a["kind"] === "character") a["voice"] = { provider: "elevenlabs", voiceId: "mock_voice", label: "Test voice", modelId: "eleven_v3", language: "no", settings: { stability: 0.5 } };

writeFileSync(
  process.argv[2] ?? "/tmp/claude-0/visual-fixture.json",
  JSON.stringify({ project, rows }, null, 1),
);
console.log("ok", Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length])));
