#!/usr/bin/env node
/**
 * Kontroll av språk (DEC-0081, REQ-0630): finner brukervendt norsk tekst som ikke står i t("nøkkel") eller
 * tLocalized({ … }). Etter ML2f er broen tom: nye L(…)/localized(…)-kall stoppes (skriv teksten i
 * katalogen og bruk t()); tm() er bare for gamle, lagrede servermeldinger. Kjøres i testene (tests/unit/i18n.test.ts) og for hånd:
 *   node scripts/i18n/check.mjs            – hele src/
 *   node scripts/i18n/check.mjs fil1 fil2  – bare disse filene
 * Unntak: `// i18n-ignore-file` øverst i en fil (data som ikke vises, f.eks. gjenkjenning av norske ord i
 * manus), `// i18n-ignore` på linjen før eller på samme linje.
 */
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { buildInventory } from "./inventory.mjs";
import { checkKeyedCatalogs } from "./validate.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const SKIP_DIRS = ["src/integrations", "src/routeTree.gen.ts", "src/core/i18n/catalog.gen.ts"];
/** Ord som bare finnes på norsk (ikke engelsk), i tillegg til æ, ø og å. */
const WORDS =
  "og|ikke|eller|med|til|som|av|er|du|kan|skal|ingen|alle|denne|dette|disse|nytt|nye|lagre|slett|velg|hent|legg|bruk|lukk|avbryt|ferdig|prøv|igjen|mangler|finnes|kunne|ble|blir|har|fra|uten|når|hvis|bare|eller|enn|ennå|ikke|noen|annet|andre|hvor|hva|hvem|lag|laget|bildet|bilder|filen|filer|varighet|lyd|lydklipp|manuset|scenen|scener|prosjektet|ressurs|ressursen|ressurser|versjon|versjonen|endre|endret|opprett|legg|vis|skjul|tilbake|neste|forrige|kopier|last|ned|opp|kjør|stopp|spill|eier|redaktør|leser|klikk|dra|slipp|oppdater|godkjenn|godkjent|valgt|velges|lagret|feil|kreditter|sekunder|minutter|timer|dager|uker|siden|tomt|tomme|navn|beskrivelse|tittel|ukjent|aktiv|aktive|venter|kjører|startet|stoppet|mislyktes|klar|sletter|lagrer|henter|laster|sammen|flere|hele|deler|tekst|tekster|bakgrunn|klipp|opptak|utkast|kommentar|kommentarer|notat|notater|eksporter|importer|innstillinger|oppsett|hjelp|lengde|bredde|høyde|ingen|nei|ja|vent|stk|ugyldig|avbrutt|teknisk|kategori|kontinuitet|sammenlign|bytt|lydspor|generer|importert|notat|replikk|naboscener|opptak";
const ALL = process.argv.includes("--all");
const NB = new RegExp(`[æøåÆØÅ]|(^|[^\\p{L}\\p{N}])(${WORDS})(?=$|[^\\p{L}\\p{N}])`, "iu");

function files(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const rel = relative(ROOT, p);
    if (SKIP_DIRS.some((s) => rel.startsWith(s))) continue;
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(n) && !/\.d\.ts$/.test(n)) out.push(p);
  }
  return out;
}

const OK_CALLS = new Set(["tm", "t", "tk", "tKey", "tx", "i18nT", "tLocalized", "pair", "cn", "clsx", "cva", "twMerge"]);
function insideOk(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p)) {
      const c = p.expression;
      const name = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : "";
      if (OK_CALLS.has(name)) return true;
    }
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
  }
  return false;
}

/** ML2f: L()/localized() er ikke lenger en skrivevei. Finner kall via import fra kjernen eller i18n. */
export function bridgeCalls(file) {
  const rel = relative(ROOT, file);
  if (rel.startsWith("src/core/i18n/")) return [];
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const aliases = new Map();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !/(^|\/)(core|i18n)(\/index)?$|core\/i18n/.test(stmt.moduleSpecifier.text)) continue;
    const nb = stmt.importClause?.namedBindings;
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) {
      const imported = el.propertyName?.text ?? el.name.text;
      if (imported === "L" || imported === "localized") aliases.set(el.name.text, imported);
    }
  }
  if (!aliases.size) return [];
  const hits = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && aliases.has(node.expression.text)) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line;
      hits.push({ file: rel, line: line + 1, text: `${aliases.get(node.expression.text)}() er fjernet som skrivevei – legg teksten i katalogen og bruk t()` });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

export function check(file) {
  const src = readFileSync(file, "utf8");
  if (/i18n-ignore-file/.test(src.slice(0, 2000))) return [];
  const lines = src.split("\n");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits = [];
  const ignored = (line) =>
    /i18n-ignore/.test(lines[line] ?? "") || /i18n-ignore/.test(lines[line - 1] ?? "");
  const visit = (node) => {
    let text = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
    else if (ts.isTemplateExpression(node))
      text = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(" ");
    else if (ts.isJsxText(node)) text = node.text;
    if (text !== null && text.trim() && (ALL || NB.test(text)) && !insideOk(node)) {
      // Nøkler i objekter og moduler, regex-kilder og typer er ikke tekst brukeren ser
      const parent = node.parent;
      const isKey = parent && (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) && parent.name === node;
      const isType = parent && ts.isLiteralTypeNode(parent);
      const isRe = parent && ts.isNewExpression(parent) && ts.isIdentifier(parent.expression) && parent.expression.text === "RegExp";
      const isSlot = parent && ts.isElementAccessExpression(parent);
      const attr = ts.isJsxExpression(parent) ? parent.parent : parent;
      const isClass =
        attr && ts.isJsxAttribute(attr) && ["className", "data-testid", "key", "id", "htmlFor", "type", "name"].includes(attr.name.getText());
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line;
      if (!isKey && !isType && !isRe && !isSlot && !isClass && !ignored(line))
        hits.push({ file: relative(ROOT, file), line: line + 1, text: text.trim().slice(0, 90) });
      if (ts.isTemplateExpression(node)) return; // spennene sjekkes ikke hver for seg
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const listForBridge = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const bridge = (listForBridge.length ? listForBridge.map((a) => join(process.cwd(), a)) : files(join(ROOT, "src"))).flatMap(bridgeCalls);
  for (const h of bridge) console.error(`${h.file}:${h.line}: ${h.text}`);
  if (bridge.length) { console.error(`\n${bridge.length} nye L()/localized()-kall`); process.exit(1); }
  buildInventory(ROOT, true);
  const keyedErrors = checkKeyedCatalogs(ROOT);
  for (const error of keyedErrors) console.error(error);
  if (keyedErrors.length) process.exit(1);
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const list = args.length ? args.map((a) => join(process.cwd(), a)) : files(join(ROOT, "src"));
  const all = list.flatMap(check);
  const byFile = new Map();
  for (const h of all) byFile.set(h.file, (byFile.get(h.file) ?? 0) + 1);
  if (process.argv.includes("--summary"))
    for (const [f, n] of [...byFile].sort((a, b) => b[1] - a[1])) console.log(`${n}\t${f}`);
  else for (const h of all) console.log(`${h.file}:${h.line}: ${h.text}`);
  console.log(`\n${all.length} tekster uten engelsk i ${byFile.size} filer`);
  process.exit(all.length ? 1 : 0);
}
