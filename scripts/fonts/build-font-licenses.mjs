#!/usr/bin/env node
/**
 * B-098 (N3): lager src/core/typography/google-font-licenses.gen.ts fra METADATA.pb i google/fonts.
 * Lisensen leses fra `license:`-feltet og må stemme med mappen (ofl/apache/ufl); avvik stopper skriptet.
 * Ingen nettverk i appen: tabellen bygges inn. Oppdatering:
 *   git clone --depth 1 --filter=blob:none --sparse https://github.com/google/fonts.git /tmp/gf
 *   (cd /tmp/gf && git sparse-checkout set --no-cone '/ofl/*\/METADATA.pb' '/apache/*\/METADATA.pb' '/ufl/*\/METADATA.pb')
 *   node scripts/fonts/build-font-licenses.mjs /tmp/gf
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
if (!root || !existsSync(join(root, "ofl"))) {
  console.error("Bruk: node scripts/fonts/build-font-licenses.mjs <klon av google/fonts>");
  process.exit(1);
}
const DIRS = { ofl: ["OFL", "O"], apache: ["APACHE2", "A"], ufl: ["UFL", "U"] };
const table = new Map();
const errors = [];
for (const [dir, [field, code]] of Object.entries(DIRS)) {
  for (const name of readdirSync(join(root, dir)).sort()) {
    const file = join(root, dir, name, "METADATA.pb");
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    const family = /^name:\s*"([^"]+)"/m.exec(text)?.[1];
    const license = /^license:\s*"([^"]+)"/m.exec(text)?.[1];
    if (!family || !license) { errors.push(`${dir}/${name}: mangler name/license`); continue; }
    if (license !== field) { errors.push(`${dir}/${name}: license ${license} i mappen ${dir}`); continue; }
    const key = family.toLowerCase();
    const prev = table.get(key);
    if (prev && prev !== code) { errors.push(`${family}: to lisenser (${prev}/${code})`); continue; }
    table.set(key, code);
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
let commit = "ukjent";
try { commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { /* ingen git */ }
const rows = [...table.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
const counts = { O: 0, A: 0, U: 0 };
for (const [, c] of rows) counts[c]++;
const out = `// Generert av scripts/fonts/build-font-licenses.mjs fra google/fonts ${commit}. Ikke rediger for hånd.
// i18n-ignore-file: familienavn og lisenskoder, ikke tekst i grensesnittet
/** Familie (små bokstaver) → lisens fra METADATA.pb: O = OFL, A = APACHE2, U = UFL. */
export const GOOGLE_FONTS_COMMIT = ${JSON.stringify(commit)};
export const GOOGLE_FONT_LICENSE_COUNTS = ${JSON.stringify(counts)} as const;
export const GOOGLE_FONT_LICENSES: Readonly<Record<string, "O" | "A" | "U">> = {
${rows.map(([k, c]) => `  ${JSON.stringify(k)}: "${c}",`).join("\n")}
};
`;
writeFileSync(new URL("../../src/core/typography/google-font-licenses.gen.ts", import.meta.url), out);
console.log(`${rows.length} familier (OFL ${counts.O}, Apache ${counts.A}, UFL ${counts.U}) fra ${commit}`);
