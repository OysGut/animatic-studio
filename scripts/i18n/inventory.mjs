/** ML1: deterministic AST inventory. No evaluation of source expressions, no translation merging. */
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const hash = (value) => createHash('sha256').update(value).digest('hex').slice(0, 12);
const slug = (value) => value.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const unwrap = (node) => {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression;
  return node;
};
function scopeOf(node) {
  for (let p = node.parent; p; p = p.parent) {
    if ((ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p) || ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p)) && p.name) return slug(p.name.getText());
  }
  return 'module';
}
function contextOf(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxAttribute(p)) return p.name.getText();
    if (ts.isCallExpression(p)) {
      const name = p.expression.getText();
      if (!['L', 'localized', 'tm'].includes(name)) return name;
    }
    if (ts.isJsxElement(p)) return p.openingElement.tagName.getText();
    if (ts.isPropertyAssignment(p)) return p.name.getText();
  }
  return 'message';
}
/** Preserve original expressions and full raw text; templates never execute during extraction. */
function textOf(node, sf) {
  node = unwrap(node);
  if (!node) return { kind: 'missing', text: null, raw: '', parameters: [] };
  const raw = node.getText(sf);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return { kind: 'literal', text: node.text, raw, parameters: [] };
  if (ts.isTemplateExpression(node)) {
    const used = new Set();
    const parameters = node.templateSpans.map((span, i) => {
      const expression = span.expression.getText(sf);
      let name = ts.isIdentifier(span.expression) ? span.expression.text : ts.isPropertyAccessExpression(span.expression) ? span.expression.name.text : `value${i + 1}`;
      if (used.has(name)) name = `${name}${i + 1}`;
      used.add(name);
      const expr = unwrap(span.expression);
      return { name, expression, conditional: ts.isConditionalExpression(expr), ...(ts.isConditionalExpression(expr) ? { condition: expr.condition.getText(sf), whenTrue: textOf(expr.whenTrue, sf), whenFalse: textOf(expr.whenFalse, sf) } : {}) };
    });
    return { kind: 'template', text: node.head.text + node.templateSpans.map((span, i) => `{${parameters[i].name}}${span.literal.text}`).join(''), raw, parameters };
  }
  return { kind: 'expression', text: null, raw, parameters: [], ...(ts.isConditionalExpression(node) ? { condition: node.condition.getText(sf), whenTrue: textOf(node.whenTrue, sf), whenFalse: textOf(node.whenFalse, sf) } : {}) };
}
export function inventorySource(source, file = 'src/example.tsx') {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const entries = [], references = [], candidates = [];
  const consumed = new Set();
  const aliases = new Map([['L', 'L'], ['localized', 'localized'], ['tm', 'tm']]);
  const shadows = new Map();
  const enclosingScope = (node) => {
    for (let p = node.parent; p; p = p.parent) if (ts.isSourceFile(p) || ts.isBlock(p) || ts.isFunctionLike(p)) return p;
    return sf;
  };
  const bindings = (node) => {
    if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isParameter(node) || ts.isClassDeclaration(node)) && node.name && ts.isIdentifier(node.name)) {
      const scope = enclosingScope(node);
      const names = shadows.get(scope) ?? new Set();
      names.add(node.name.text); shadows.set(scope, names);
    }
    ts.forEachChild(node, bindings);
  };
  bindings(sf);
  for (const stmt of sf.statements) if (ts.isImportDeclaration(stmt) && stmt.importClause?.namedBindings && ts.isNamedImports(stmt.importClause.namedBindings)) {
    for (const el of stmt.importClause.namedBindings.elements) {
      const imported = el.propertyName?.text ?? el.name.text;
      if (['L', 'localized', 'tm', 't', 'tLocalized'].includes(imported)) aliases.set(el.name.text, imported);
    }
  }
  const location = (n) => {
    const at = sf.getLineAndCharacterOfPosition(n.getStart(sf));
    return { file, line: at.line + 1, column: at.character + 1, start: n.getStart(sf), end: n.end, scope: scopeOf(n), context: contextOf(n) };
  };
  function pair(node, nbNode, enNode, kind, label = '') {
    const nb = textOf(nbNode, sf), en0 = textOf(enNode, sf);
    // Match expressions, not word order. Ambiguous/different expressions remain explicit conflicts.
    const normalize = (value) => value.replace(/\s+/g, '');
    const matched = en0.parameters.map((p) => nb.parameters.filter((q) => normalize(q.expression) === normalize(p.expression)));
    const parameterConflict = en0.parameters.length !== nb.parameters.length || matched.some((matches) => matches.length !== 1);
    const en = { ...en0, parameters: en0.parameters.map((p, i) => ({ ...p, name: matched[i]?.length === 1 ? matched[i][0].name : p.name })) };
    if (en0.text !== null) {
      en.text = en0.text.replace(/\{([a-zA-Z_][\w]*)\}/g, (whole, name) => {
        const i = en0.parameters.findIndex((p) => p.name === name);
        return i < 0 ? whole : `{${en.parameters[i]?.name ?? name}}`;
      });
    }
    const loc = location(node);
    const domain = slug(file.replace(/^src\//, '').replace(/\.tsx?$/, '').replace(/\//g, '.'));
    const semantic = [domain, loc.scope, slug(label || loc.context)].filter(Boolean).join('.');
    entries.push({ ...loc, kind, semantic, nb, en, parameterConflict, signature: hash(JSON.stringify([file, loc.scope, label, nb.raw, en.raw])) });
    for (const child of [nbNode, enNode]) if (child) {
      const mark = (n) => { consumed.add(n); ts.forEachChild(n, mark); }; mark(child);
    }
  }
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      let call = ts.isIdentifier(node.expression) ? aliases.get(node.expression.text) : undefined;
      if (call && ts.isIdentifier(node.expression)) for (let p = node.parent; p; p = p.parent) {
        if (shadows.get(p)?.has(node.expression.text)) { call = undefined; break; }
      }
      if (call === 'L') {
        pair(node, node.arguments[0], node.arguments[1], 'L');
        if (node.arguments.length !== 2) references.push({ ...location(node), kind: 'unsupported-L-arity', raw: node.getText(sf) });
      }
      if (call === 'localized') {
        const object = unwrap(node.arguments[0]);
        if (object && ts.isObjectLiteralExpression(object)) for (const prop of object.properties) {
          if (!ts.isPropertyAssignment(prop)) { references.push({ ...location(prop), kind: 'localized-expression', raw: prop.getText(sf) }); continue; }
          const value = unwrap(prop.initializer);
          if (value && ts.isArrayLiteralExpression(value)) pair(prop, value.elements[0], value.elements[1], 'localized', prop.name.getText(sf));
          else references.push({ ...location(prop), kind: 'localized-expression', raw: prop.getText(sf) });
        } else references.push({ ...location(node), kind: 'localized-expression', raw: node.getText(sf) });
      }
      if (call === 'tLocalized') {
        // ML2: fixed lookups by key; every property value must be a literal key.
        const object = unwrap(node.arguments[0]);
        if (object && ts.isObjectLiteralExpression(object)) for (const prop of object.properties) {
          const value = ts.isPropertyAssignment(prop) ? unwrap(prop.initializer) : undefined;
          references.push({ ...location(prop), kind: 't', raw: prop.getText(sf), key: value && ts.isStringLiteral(value) ? value.text : null, parameterNames: [] });
        } else references.push({ ...location(node), kind: 't', raw: node.getText(sf), key: null, parameterNames: [] });
      }
      if (call === 'tm' || call === 't') {
        const params = unwrap(node.arguments[1]);
        references.push({ ...location(node), kind: call, raw: node.getText(sf), key: node.arguments[0] && ts.isStringLiteral(node.arguments[0]) ? node.arguments[0].text : null,
          ...(call === 't' ? { parameterNames: !params ? [] : ts.isObjectLiteralExpression(params) && params.properties.every((p) => ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) ? params.properties.map((p) => p.name.getText(sf).replace(/^['"]|['"]$/g, '')).sort() : null } : {}) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  const literals = (node) => {
    if (!consumed.has(node) && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node) || ts.isJsxText(node))) {
      const parent = node.parent;
      const excluded = ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isLiteralTypeNode(parent) || ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) && parent.name === node) || ts.isElementAccessExpression(parent);
      if (!excluded) {
        const text = ts.isJsxText(node) ? node.text : textOf(node, sf).text;
        if (text?.trim()) candidates.push({ ...location(node), kind: ts.isJsxText(node) ? 'jsx-text' : 'literal-candidate', text, raw: node.getText(sf), ignored: /i18n-ignore/.test(source.split('\n').slice(Math.max(0, location(node).line - 2), location(node).line).join('\n')) });
      }
    }
    ts.forEachChild(node, literals);
  };
  literals(sf);
  return { entries, references, candidates };
}
export function sourceFiles(root = ROOT) {
  const walk = (dir) => readdirSync(dir).sort().flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return ['integrations', 'locales'].includes(name) ? [] : walk(path);
    return /\.tsx?$/.test(name) && !/\.gen\.|\.d\.ts$/.test(name) ? [path] : [];
  });
  return walk(join(root, 'src'));
}
export function collectInventory(root = ROOT, previous = { entries: [] }) {
  const all = sourceFiles(root).map((path) => inventorySource(readFileSync(path, 'utf8'), relative(root, path)));
  const entries = all.flatMap((x) => x.entries);
  const bySignature = new Map();
  for (const old of previous.entries ?? []) {
    const list = bySignature.get(old.signature) ?? [];
    list.push(old.key); bySignature.set(old.signature, list);
  }
  // Reserve all exact matches before allocating any structural fallback; insertion never steals a live key.
  const reserved = new Set(entries.flatMap((item) => bySignature.get(item.signature) ?? []));
  const incomingCounts = new Map();
  for (const item of entries) if (!bySignature.has(item.signature)) {
    const identity = JSON.stringify([item.file, item.scope, item.kind, item.semantic]);
    incomingCounts.set(identity, (incomingCounts.get(identity) ?? 0) + 1);
  }
  // ML2: entries moved to t()/tLocalized keep their frozen ML1 record (text, signature) while referenced.
  const references = all.flatMap((x) => x.references);
  const referenced = new Set(references.filter((r) => r.kind === 't' && r.key).map((r) => r.key));
  const live = new Set();
  const migrated = (previous.entries ?? []).filter((old) => referenced.has(old.key)).map((old) => ({ ...old, migrated: true }));
  const used = new Set(migrated.map((m) => m.key));
  const keyConflicts = [];
  const structural = new Map();
  for (const old of previous.entries ?? []) {
    const identity = JSON.stringify([old.file, old.scope, old.kind, old.semantic]);
    const list = structural.get(identity) ?? [];
    list.push(old.key); structural.set(identity, list);
  }
  for (const item of entries) {
    const old = bySignature.get(item.signature)?.shift();
    const identity = JSON.stringify([item.file, item.scope, item.kind, item.semantic]);
    const unmatched = structural.get(identity)?.filter((key) => !reserved.has(key) && !used.has(key)) ?? [];
    const existing = unmatched.length === 1 && incomingCounts.get(identity) === 1 ? unmatched : [];
    if (!old && unmatched.length && !existing.length) keyConflicts.push({ kind: 'ambiguous-key-mapping', file: item.file, line: item.line, previousKeys: unmatched });
    let structuralKey;
    while (existing?.length && !structuralKey) {
      const candidate = existing.shift();
      if (candidate && !used.has(candidate)) structuralKey = candidate;
    }
    let key = old && !used.has(old) ? old : structuralKey ?? `${item.semantic}.${item.signature}`;
    let duplicate = 1;
    while (used.has(key)) key = `${item.semantic}.${item.signature}.${++duplicate}`;
    item.key = key; used.add(key); live.add(key);
  }
  entries.push(...migrated.filter((m) => !live.has(m.key)));
  const conflicts = [...keyConflicts];
  const sameNb = new Map();
  for (const item of entries) {
    if (item.nb.text !== null) {
      const peers = sameNb.get(item.nb.text) ?? [];
      peers.push(item); sameNb.set(item.nb.text, peers);
    }
    if (item.nb.kind === 'expression' || item.en.kind === 'expression') conflicts.push({ kind: 'dynamic-expression', key: item.key, file: item.file, line: item.line });
    if (item.parameterConflict) conflicts.push({ kind: 'parameter-contract', key: item.key, file: item.file, line: item.line });
    if (item.nb.kind === 'missing' || item.en.kind === 'missing') conflicts.push({ kind: 'missing-pair', key: item.key, file: item.file, line: item.line });
  }
  for (const [text, peers] of sameNb) if (new Set(peers.map((x) => x.en.raw)).size > 1) conflicts.push({ kind: 'same-source-different-translation', text, keys: peers.map((x) => x.key) });
  return { version: 1, entries, references, candidates: all.flatMap((x) => x.candidates), conflicts };
}
export function pseudoText(text) {
  const map = { a: 'á', e: 'ë', i: 'ï', o: 'ô', u: 'ü', A: 'Á', E: 'Ë', I: 'Ï', O: 'Ô', U: 'Ü' };
  return `[!! ${text.split(/(\{[^{}]+\})/g).map((part) => part.startsWith('{') ? part : part.replace(/[aeiouAEIOU]/g, (c) => map[c]).replace(/([a-záëïôü])/gi, '$1$1')).join('')} !!]`;
}
export function generatedFiles(inventory) {
  const locales = { nb: {}, en: {}, 'en-XA': {} };
  for (const item of inventory.entries) for (const lang of ['nb', 'en']) {
    // Dynamic expressions are not executable catalog messages; retain raw source for manual ML2 conversion.
    const value = item[lang];
    locales[lang][item.key] = { text: value.text, source: value.raw, parameters: value.parameters, executable: value.text !== null && !item.parameterConflict };
  }
  for (const [key, msg] of Object.entries(locales.en)) locales['en-XA'][key] = { ...msg, text: msg.text === null ? null : pseudoText(msg.text) };
  // Runtime ships only keys referenced by t()/tLocalized; the full catalogs stay build-time artifacts.
  const runtimeKeys = [...new Set(inventory.references.filter((r) => r.kind === 't' && r.key).map((r) => r.key))].filter((k) => locales.nb[k]).sort();
  const runtime = { nb: {}, en: {} };
  for (const key of runtimeKeys) for (const lang of ['nb', 'en']) {
    const { text, plural, formats } = locales[lang][key];
    runtime[lang][key] = { text, ...(plural ? { plural } : {}), ...(formats ? { formats } : {}) };
  }
  const summary = { version: 1, entries: inventory.entries.length, migrated: inventory.entries.filter((e) => e.migrated).length, files: new Set(inventory.entries.map((e) => e.file)).size, literalPairs: inventory.entries.filter((e) => e.nb.kind === 'literal' && e.en.kind === 'literal').length, templatePairs: inventory.entries.filter((e) => e.nb.kind === 'template' || e.en.kind === 'template').length, dynamicPairs: inventory.entries.filter((e) => e.nb.kind === 'expression' || e.en.kind === 'expression').length, references: inventory.references.length, candidates: inventory.candidates.length, conflicts: inventory.conflicts.length };
  const result = new Map([['scripts/i18n/mapping.v1.json', { version: inventory.version, entries: inventory.entries, conflicts: inventory.conflicts }], ['scripts/i18n/references.v1.json', inventory.references], ['scripts/i18n/candidates.v1.json', inventory.candidates], ['scripts/i18n/inventory-report.json', { ...summary, conflicts: inventory.conflicts }]]);
  for (const [lang, catalog] of Object.entries(locales)) result.set(`src/core/i18n/locales/${lang}.json`, catalog);
  result.set('src/core/i18n/runtime.gen.json', runtime);
  return new Map([...result].map(([path, obj]) => [path, JSON.stringify(obj, null, 2) + '\n']));
}
export function buildInventory(root = ROOT, verify = false) {
  const path = join(root, 'scripts/i18n/mapping.v1.json');
  const previous = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { entries: [] };
  const inventory = collectInventory(root, previous);
  const outputs = generatedFiles(inventory);
  for (const [rel, content] of outputs) {
    const dest = join(root, rel);
    if (verify) {
      if (!existsSync(dest) || readFileSync(dest, 'utf8') !== content) throw new Error(`Stale ML1 inventory/catalog: ${rel}`);
    } else { mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, content); }
  }
  return inventory;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inventory = buildInventory(ROOT, process.argv.includes('--check'));
  console.log(`${inventory.entries.length} text pairs; ${inventory.conflicts.length} conflicts retained for review; ${inventory.candidates.length} unpaired literal candidates`);
}
