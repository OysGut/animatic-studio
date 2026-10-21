/**
 * Ren logikk for build-catalog.mjs (B-097-retting).
 * Årsak til den tomme filen: etter ML2 er alle L("nb", "en") flyttet til t()-nøkler, så skriptet fant 0 tekstpar
 * og skrev en tom CATALOG over de eksisterende ~1 860 parene (som tm() fortsatt bruker for gamle meldinger).
 * Nå slås funnene sammen med den eksisterende katalogen, og skriptet feiler høyt i stedet for å skrive en
 * tom eller mindre katalog.
 */
import ts from "typescript";

/** Leser parene i en eksisterende catalog.gen.ts. Kaster hvis filen ikke kan tolkes. */
export function parseCatalog(source) {
  const sf = ts.createSourceFile("catalog.gen.ts", source, ts.ScriptTarget.Latest, true);
  const out = new Map();
  let found = false;
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === "CATALOG" && n.initializer && ts.isObjectLiteralExpression(n.initializer)) {
      found = true;
      for (const p of n.initializer.properties) {
        if (!ts.isPropertyAssignment(p)) throw new Error("catalog.gen.ts: uventet oppføring i CATALOG");
        const key = ts.isStringLiteral(p.name) || ts.isIdentifier(p.name) ? p.name.text : null;
        const value = ts.isStringLiteral(p.initializer) || ts.isNoSubstitutionTemplateLiteral(p.initializer) ? p.initializer.text : null;
        if (key === null || value === null) throw new Error("catalog.gen.ts: oppføring som ikke er tekst");
        out.set(key, value);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!found) throw new Error("catalog.gen.ts: fant ikke CATALOG");
  return out;
}

/**
 * Eksisterende par + nye funn (nye vinner ved samme norske tekst). Kaster hvis resultatet er tomt eller
 * mindre enn katalogen som finnes, så en feil i skanningen aldri kan tømme filen.
 */
export function mergeCatalog(existing, found) {
  const merged = new Map(existing);
  for (const [nb, en] of found) merged.set(nb, en);
  if (merged.size === 0) throw new Error("build-catalog: 0 tekstpar – nekter å skrive en tom catalog.gen.ts");
  if (merged.size < existing.size)
    throw new Error(`build-catalog: katalogen ville krympet (${existing.size} → ${merged.size}) – avbryter`);
  return merged;
}
