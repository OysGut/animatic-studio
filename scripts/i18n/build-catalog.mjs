#!/usr/bin/env node
/**
 * Bygger `src/core/i18n/catalog.gen.ts` (DEC-0081): alle tekstpar L("nb", "en") i kjernen og
 * serverkoden, så meldinger som lages på norsk på serveren kan vises på engelsk i nettleseren (`tm`).
 * Plassholdere i maltekster (${…}) blir {0}, {1} … i samme rekkefølge på begge språk.
 *   node scripts/i18n/build-catalog.mjs
 */
import ts from "typescript";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
const DIRS = ["src/core", "src/adapters"];
const files = (d) =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
const text = (n) => {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isTemplateExpression(n))
    return n.head.text + n.templateSpans.map((s, i) => `{${i}}${s.literal.text}`).join("");
  return null;
};
const out = new Map();
for (const f of DIRS.flatMap((d) => files(join(ROOT, d)))) {
  if (f.includes("catalog.gen")) continue;
  const sf = ts.createSourceFile(f, readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true);
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "L" && n.arguments.length === 2) {
      const nb = text(n.arguments[0]);
      const en = text(n.arguments[1]);
      if (nb && en && nb !== en && nb.replace(/\{\d+\}/g, "").trim().length > 2) out.set(nb, en);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
const body = [...out].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n");
writeFileSync(
  join(ROOT, "src/core/i18n/catalog.gen.ts"),
  `// Generert av scripts/i18n/build-catalog.mjs – ikke rediger for hånd (DEC-0081).\n// Norske meldinger fra kjernen og serveren → engelsk, for visning i nettleseren (tm).\nexport const CATALOG: Record<string, string> = {\n${body}\n};\n`,
);
console.log(`${out.size} tekstpar`);
