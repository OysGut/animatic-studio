/**
 * SSR-krasj 24.10 (ASSET_MIME_TYPES is not iterable): Modulnivåkode utenfor
 * src/core skal ikke lese verdier importert fra @/core når modulen lastes.
 * I produksjonsbundlen kan sirkulære avhengigheter gjøre at verdien ennå ikke
 * er initialisert. Les dem i funksjoner (lat), ikke i toppnivåuttrykk.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const DIRS = ["src/app", "src/engine", "src/adapters", "src/routes", "src/components", "src/lib", "src/hooks"];

function files(dir: string): string[] {
  const out: string[] = [];
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(e) && !e.endsWith(".d.ts") && !e.endsWith(".gen.ts")) out.push(p);
  }
  return out;
}

/** Finn bruk av core-importerte navn i toppnivåkode som kjøres ved lasting. */
export function eagerCoreReads(source: string, fileName = "x.ts"): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const core = new Set<string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || st.importClause?.isTypeOnly) continue;
    const spec = (st.moduleSpecifier as ts.StringLiteral).text;
    if (!/^@\/core(\/|$)/.test(spec)) continue;
    const c = st.importClause;
    if (!c) continue;
    if (c.name) core.add(c.name.text);
    const nb = c.namedBindings;
    if (nb && ts.isNamespaceImport(nb)) core.add(nb.name.text);
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) if (!el.isTypeOnly) core.add(el.name.text);
  }
  if (!core.size) return [];
  const hits: string[] = [];
  const visit = (n: ts.Node): void => {
    // Lat kode: funksjonskropper, klassemetoder, getters og typer kjøres ikke ved lasting.
    if (ts.isFunctionLike(n) || ts.isTypeNode(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) return;
    if (ts.isIdentifier(n) && core.has(n.text)) {
      const p = n.parent;
      const isPropName = (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n);
      if (!isPropName && !ts.isImportSpecifier(p) && !ts.isExportSpecifier(p)) {
        const { line } = sf.getLineAndCharacterOfPosition(n.getStart());
        hits.push(`${n.text}:${line + 1}`);
      }
    }
    ts.forEachChild(n, visit);
  };
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) continue;
    if (ts.isFunctionDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) continue;
    visit(st);
  }
  return hits;
}

describe("modulnivå leser ikke @/core-verdier (SSR-sirkularitet)", () => {
  it("finner mønsteret som krasjet produksjonsbygget", () => {
    expect(eagerCoreReads(`import { A } from "@/core/x";\nexport const B = [...A].join(",");`)).toEqual(["A:2"]);
    expect(eagerCoreReads(`import { A } from "@/core/x";\nexport const b = () => [...A].join(",");`)).toEqual([]);
    expect(eagerCoreReads(`import type { A } from "@/core/x";\nconst B: A = 1;`)).toEqual([]);
  });

  it("ingen app-, engine- eller adaptermodul leser core-verdier ved lasting", () => {
    const bad: string[] = [];
    for (const d of DIRS) for (const f of files(join(ROOT, d))) {
      const hits = eagerCoreReads(readFileSync(f, "utf8"), f);
      if (hits.length) bad.push(`${relative(ROOT, f)}: ${hits.join(", ")}`);
    }
    expect(bad).toEqual([]);
  });
});
