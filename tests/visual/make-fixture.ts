/** Lager radfixture for visuell QA (mockede Supabase-svar) fra domenekjernen. */
import { writeFileSync } from "node:fs";
import { diffStates, emptyProjectState } from "../../src/core";
import { seedProject } from "../helpers/fixtures";

const { state } = seedProject();
const empty = { ...emptyProjectState(state.project) };
const cs = diffStates(empty, state);
const rows: Record<string, unknown[]> = {};
for (const [t, list] of Object.entries(cs.inserts)) rows[t] = list as unknown[];
rows["script_block_revisions"] = cs.blockRevisions as unknown[];
const project = {
  id: state.project.id,
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
