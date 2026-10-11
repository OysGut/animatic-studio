/**
 * Skriver radfixturen for visuell QA (se fixture-state.ts).
 *   bun tests/visual/make-fixture.ts [utfil.json]
 */
import { writeFileSync } from "node:fs";
import { fixture } from "./fixture-state";

const { project, rows } = fixture;
writeFileSync(
  process.argv[2] ?? "/tmp/claude-0/visual-fixture.json",
  JSON.stringify({ project, rows }, null, 1),
);
console.log("ok", Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length])));
