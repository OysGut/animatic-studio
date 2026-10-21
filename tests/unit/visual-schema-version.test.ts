// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

// AGENTS.md regel 13: alle visuelle suiter deler én skjemaversjon (tests/visual/schema-version.mjs).
// En fast versjon i en mock gir et oppdateringsvarsel i appen som endrer verktøylinjen og får suiten til å feile.
const DIR = path.resolve(__dirname, "../visual");
const FIXED = /schema_version[\s\S]{0,80}?version:\s*\d+/;

it("ingen visuell suite svarer med en fast skjemaversjon", () => {
  const fixed = readdirSync(DIR)
    .filter((f) => f.endsWith(".mjs") && f !== "schema-version.mjs")
    .filter((f) => FIXED.test(readFileSync(path.join(DIR, f), "utf8")));
  expect(fixed).toEqual([]);
});

it("kontrollen kjenner igjen en fast versjon", () => {
  expect(FIXED.test('if (table === "schema_version") return json([{ version: 34 }]);')).toBe(true);
  expect(FIXED.test('if (table === "schema_version") return json([{ version: VISUAL_SCHEMA_VERSION }]);')).toBe(false);
});
