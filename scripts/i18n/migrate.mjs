#!/usr/bin/env node
/**
 * ML2: flytter tekstpar fra L(...)/localized({...}) til t("nøkkel", {...})/tLocalized({...}) med nøklene
 * fra ML1-inventaret (scripts/i18n/mapping.v1.json). Tekstene endres aldri: nøkkelen peker på den frosne
 * nb/en-teksten. Bare kjørbare par flyttes (ikke dynamiske uttrykk eller ulik plassholderkontrakt);
 * resten blir stående på broen og telles i rapporten.
 *   node scripts/i18n/migrate.mjs src/app/shell src/routes/konto.tsx …   – flytter filene/mappene
 *   node scripts/i18n/migrate.mjs --dry …                                  – bare tall
 * Kjør `node scripts/i18n/inventory.mjs` etterpå.
 */
import ts from 'typescript';
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, inventorySource } from './inventory.mjs';

const expand = (path) => statSync(path).isDirectory()
  ? readdirSync(path).sort().flatMap((n) => expand(join(path, n)))
  : /\.tsx?$/.test(path) && !/\.gen\.|\.d\.ts$/.test(path) ? [path] : [];

/** Velger et navn for t som ikke kolliderer med noe i filen. */
function freeName(sf, wanted) {
  const names = new Set();
  const walk = (n) => { if (ts.isIdentifier(n)) names.add(n.text); ts.forEachChild(n, walk); };
  walk(sf);
  for (const name of wanted) if (!names.has(name)) return name;
  throw new Error(`No free alias in ${sf.fileName}`);
}

export function migrateSource(source, file, mapping) {
  // Same signature twice in a file (e.g. title and aria-label) keeps its distinct ML1 keys in source order.
  const queues = new Map();
  for (const e of mapping.entries) if (e.file === file && !e.migrated) {
    const id = `${e.signature}|${e.semantic}`; const q = queues.get(id) ?? []; q.push(e); queues.set(id, q);
  }
  for (const q of queues.values()) q.sort((a, b) => a.start - b.start);
  const { entries } = inventorySource(source, file);
  const frozenFor = new Map();
  for (const item of [...entries].sort((a, b) => a.start - b.start)) frozenFor.set(item, queues.get(`${item.signature}|${item.semantic}`)?.shift());
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  const stats = { moved: 0, bridge: 0, reasons: {} };
  const keep = (reason) => { stats.bridge++; stats.reasons[reason] = (stats.reasons[reason] ?? 0) + 1; };
  const executable = (item, frozen) => frozen && !frozen.migrated && item.nb.text !== null && item.en.text !== null && !item.parameterConflict
    && frozen.nb.raw === item.nb.raw && frozen.en.raw === item.en.raw;
  const alias = freeName(sf, ['t', 'tk', 'tKey', 'tx', 'i18nT']);
  let usesT = false, usesLocalized = false;
  // L(...)
  for (const item of entries.filter((e) => e.kind === 'L')) {
    const frozen = frozenFor.get(item);
    if (!executable(item, frozen)) { keep(!frozen ? 'not-in-mapping' : item.parameterConflict ? 'parameter-contract' : 'dynamic-expression'); continue; }
    const params = item.nb.parameters.map((p) => `${p.name}: String(${p.expression})`);
    edits.push({ start: item.start, end: item.end, text: `${alias}(${JSON.stringify(frozen.key)}${params.length ? `, { ${params.join(', ')} }` : ''})` });
    stats.moved++; usesT = true;
  }
  // localized({...}): hele kallet flyttes bare når alle verdiene er kjørbare par uten plassholdere.
  const localizedEntries = entries.filter((e) => e.kind === 'localized');
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'localized') {
      const inside = localizedEntries.filter((e) => e.start >= node.getStart(sf) && e.end <= node.end);
      const object = node.arguments[0];
      const ok = object && ts.isObjectLiteralExpression(object) && object.properties.length === inside.length && inside.length > 0
        && inside.every((e) => executable(e, frozenFor.get(e)) && e.nb.parameters.length === 0 && e.en.parameters.length === 0);
      if (!ok) { for (const _ of inside) keep('localized-not-convertible'); return; }
      const props = inside.map((e) => {
        const prop = object.properties.find((p) => p.getStart(sf) === e.start);
        return `${prop.name.getText(sf)}: ${JSON.stringify(frozenFor.get(e).key)}`;
      });
      const typeArgs = node.typeArguments ? `<${node.typeArguments.map((a) => a.getText(sf)).join(', ')}>` : '';
      edits.push({ start: node.getStart(sf), end: node.end, text: `tLocalized${typeArgs}({ ${props.join(', ')} })` });
      stats.moved += inside.length; usesLocalized = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!edits.length) return { source, stats };
  edits.sort((a, b) => b.start - a.start);
  for (let i = 1; i < edits.length; i++) if (edits[i].end > edits[i - 1].start) throw new Error(`Overlapping edits in ${file}`);
  let out = source;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  // Importer: legg til t/tLocalized, fjern L/localized som ikke lenger brukes.
  const names = [...(usesT ? [alias === 't' ? 't' : `t as ${alias}`] : []), ...(usesLocalized ? ['tLocalized'] : [])];
  const outSf = ts.createSourceFile(file, out, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const used = new Set();
  const walk = (n) => { if (ts.isIdentifier(n) && !ts.isImportSpecifier(n.parent)) used.add(n.text); ts.forEachChild(n, walk); };
  walk(outSf);
  const importEdits = [];
  let lastImportEnd = 0;
  for (const stmt of outSf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    lastImportEnd = stmt.end;
    const from = stmt.moduleSpecifier.text;
    const nb = stmt.importClause?.namedBindings;
    if (!/core\/i18n(\/index)?$|app\/i18n\/language$/.test(from) || !nb || !ts.isNamedImports(nb) || stmt.importClause.name) continue;
    const kept = nb.elements.filter((el) => !(['L', 'localized'].includes(el.propertyName?.text ?? el.name.text) && !used.has(el.name.text)));
    if (kept.length === nb.elements.length) continue;
    const text = kept.length ? `import ${stmt.importClause.isTypeOnly ? 'type ' : ''}{ ${kept.map((el) => el.getText(outSf)).join(', ')} } from ${stmt.moduleSpecifier.getText(outSf)};` : '';
    importEdits.push({ start: stmt.getStart(outSf), end: stmt.end, text });
  }
  importEdits.push({ start: lastImportEnd, end: lastImportEnd, text: `${lastImportEnd ? '\n' : ''}import { ${names.join(', ')} } from "@/core/i18n/keyed";${lastImportEnd ? '' : '\n'}` });
  importEdits.sort((a, b) => b.start - a.start);
  for (const e of importEdits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  out = out.replace(/^\n(?=import )/m, '');
  return { source: out, stats };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const dry = process.argv.includes('--dry');
  const mapping = JSON.parse(readFileSync(join(ROOT, 'scripts/i18n/mapping.v1.json'), 'utf8'));
  const files = process.argv.slice(2).filter((a) => !a.startsWith('--')).flatMap((a) => expand(join(ROOT, a)));
  const total = { moved: 0, bridge: 0, reasons: {} };
  for (const path of files) {
    const file = relative(ROOT, path);
    const { source, stats } = migrateSource(readFileSync(path, 'utf8'), file, mapping);
    if (!dry && stats.moved) writeFileSync(path, source);
    total.moved += stats.moved; total.bridge += stats.bridge;
    for (const [k, v] of Object.entries(stats.reasons)) total.reasons[k] = (total.reasons[k] ?? 0) + v;
    if (stats.moved || stats.bridge) console.log(`${stats.moved}\t${stats.bridge}\t${file}`);
  }
  console.log(JSON.stringify(total));
}
