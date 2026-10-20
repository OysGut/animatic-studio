// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import manifestData from '@/core/i18n/manifest.json';
import { canonicalLocale, fallbackChain, validateManifest, catalogErrors, createTranslator, type LanguageManifest, type MessageCatalog } from '@/core/i18n/messages';
import { t } from '@/core/i18n/keyed';
const manifest: LanguageManifest = manifestData;
const nb: MessageCatalog = {
  hello: { text: 'Hei {name}', parameters: [{ name: 'name' }] },
  count: { text: null, plural: { parameter: 'count', forms: { one: '{count} scene', other: '{count} scener' } } },
  number: { text: '{amount}', formats: { amount: { type: 'number', options: { minimumFractionDigits: 2 } } } },
  date: { text: '{date}', formats: { date: { type: 'date', options: { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' } } } },
};
const en: MessageCatalog = { ...nb, hello: { text: 'Hello {name}', parameters: [{ name: 'name' }] }, count: { text: null, plural: { parameter: 'count', forms: { one: '{count} scene', other: '{count} scenes' } } } };
const catalogs = { nb, en, 'en-XA': en };
describe('ML1 language/catalog contract', () => {
  it('BCP-47 includes regional/script tags and en-XA; invalid tags fail', () => {
    expect(canonicalLocale('EN-us')).toBe('en-US');
    expect(canonicalLocale('zh-Hant')).toBe('zh-Hant');
    expect(canonicalLocale('sr-Latn-RS')).toBe('sr-Latn-RS');
    expect(canonicalLocale('en-XA')).toBe('en-XA');
    for (const tag of ['', 'en_US', 'a', 'x'.repeat(101)]) expect(() => canonicalLocale(tag)).toThrow();
  });
  it('explicit reserves end in nb without blind script stripping', () => {
    expect(fallbackChain(manifest, 'en-XA')).toEqual(['en-XA', 'en', 'nb']);
    expect(fallbackChain(manifest, 'fr-CA')).toEqual(['nb']);
    expect(fallbackChain(manifest, 'nb')).toEqual(['nb']);
  });
  it('cycles, unknown reserves, duplicates and depth fail', () => {
    const change = (fallbacks: readonly string[]) => ({ ...manifest, languages: manifest.languages.map((l) => l.tag === 'en' ? { ...l, fallbacks } : l) });
    expect(() => validateManifest(change(['en-XA']))).toThrow(/cycle/);
    expect(() => validateManifest(change(['fr']))).toThrow(/Unknown/);
    expect(() => validateManifest({ ...manifest, maxFallbackDepth: 2 })).toThrow(/depth/);
    const lang = manifest.languages[1];
    if (!lang) throw new Error('fixture language missing');
    expect(() => validateManifest({ ...manifest, languages: [...manifest.languages, lang] })).toThrow(/Duplicate/);
  });
  it('unknown keys and missing/extra parameters do not silently render', () => {
    const translate = createTranslator(manifest, catalogs);
    expect(translate('hello', { name: 'Maja' }, 'en')).toBe('Hello Maja');
    expect(() => translate('unknown')).toThrow(/Unknown translation key/);
    expect(() => translate('hello')).toThrow(/parameters/);
    expect(() => translate('hello', { name: 'Maja', other: 'x' })).toThrow(/parameters/);
  });
  it('missing partial language message uses readable fallback; reports no content', () => {
    const partial = { ...manifest, languages: manifest.languages.map((l) => l.tag === 'en-XA' ? { ...l, complete: false } : l) };
    const events: unknown[] = [];
    const translate = createTranslator(partial, { ...catalogs, 'en-XA': {} }, (event) => events.push(event));
    expect(translate('hello', { name: 'Private content' }, 'en-XA')).toBe('Hello Private content');
    expect(events).toEqual([{ key: 'hello', locale: 'en-XA', fallback: 'en' }]);
  });
  it('Intl plural handles 1, 2 and 0 concretely', () => {
    const translate = createTranslator(manifest, catalogs);
    expect(translate('count', { count: 1 }, 'nb')).toBe('1 scene');
    expect(translate('count', { count: 2 }, 'nb')).toBe('2 scener');
    expect(translate('count', { count: 0 }, 'en')).toBe('0 scenes');
    expect(() => translate('count', { count: 'one' })).toThrow(/plural value/);
  });
  it('numbers/date follow locale and deterministic UTC date', () => {
    const translate = createTranslator(manifest, catalogs);
    expect(translate('number', { amount: 1234.5 }, 'en')).toBe('1,234.50');
    expect(translate('number', { amount: 1234.5 }, 'nb')).toBe('1\u00a0234,50');
    expect(translate('date', { date: new Date('2026-10-20T12:00:00Z') }, 'en')).toBe('20/10/2026');
    expect(translate('date', { date: new Date('2026-10-20T12:00:00Z') }, 'nb')).toBe('20.10.2026');
    expect(() => translate('date', { date: '2026-10-20' }, 'en')).toThrow(/date parameter/);
  });
  it('missing nb/en, incompatible parameters and wrong plurals stop validation', () => {
    expect(catalogErrors(manifest, { ...catalogs, en: {} }).length).toBeGreaterThan(0);
    expect(catalogErrors(manifest, { ...catalogs, en: { ...en, hello: { text: 'Hello {person}' } } })).toContain('Parameter mismatch: en:hello');
    const wrong = { text: null, plural: { parameter: 'count', forms: { other: '{count} scenes', invented: '{count}' } } };
    const errors = catalogErrors(manifest, { ...catalogs, en: { ...en, count: wrong } }).join('\n');
    expect(errors).toMatch(/Missing plural form one/);
    expect(errors).toMatch(/Invalid plural form invented/);
    expect(catalogErrors(manifest, { ...catalogs, en: { ...en, hello: { text: 'Hello {name}', parameters: [{ name: 'name' }, { name: 'name' }] } } })).toContain('Invalid parameter declaration: en:hello');
  });
  it('generated keyed API preserves text and exposes pseudo only on explicit use', () => {
    const mapping = JSON.parse(readFileSync('scripts/i18n/mapping.v1.json', 'utf8'));
    const entry = mapping.entries.find((e: { migrated?: boolean; nb: { kind: string; text: string }; en: { kind: string } }) => e.migrated && e.nb.kind === 'literal' && e.en.kind === 'literal' && e.nb.text === 'Lagre');
    expect(entry).toBeDefined();
    expect(t(entry.key, {}, 'nb')).toBe(entry.nb.text);
    expect(t(entry.key, {}, 'en')).toBe(entry.en.text);
    expect(t(entry.key, {}, 'en-XA')).toMatch(/^\[!! /);
  });
});
describe('ML1 AST/exact preservation', () => {
  it('shadowed APIs and unrelated t functions are not translation calls; reordered parameters match expressions', () => {
    const source = 'import {L as label} from "@/core"; function unrelated(label){return label("a","b")} function real(){return label(`${first} ${second}`,`${second} ${first}`)} function t(x){return x} t("table"); const L=(x,y)=>x; L("not","text");';
    const output = execFileSync('node', ['--input-type=module', '-e', `import {inventorySource} from './scripts/i18n/inventory.mjs'; console.log(JSON.stringify(inventorySource(${JSON.stringify(source)})));`], { encoding: 'utf8' });
    const result = JSON.parse(output);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].en.text).toBe('{second} {first}');
    expect(result.entries[0].parameterConflict).toBe(false);
    expect(result.references.filter((r: { kind: string }) => r.kind === 't')).toHaveLength(0);
  });
  it('stable mapping survives copy changes; conflicts remain separate and source spans move safely', () => {
    const output = execFileSync('node', ['--input-type=module', '-e', `
      import { collectInventory } from './scripts/i18n/inventory.mjs';
      import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from 'node:fs';
      import { tmpdir } from 'node:os';
      import { join } from 'node:path';
      const dir=mkdtempSync(join(tmpdir(),'ml1-key-'));mkdirSync(join(dir,'src'));
      writeFileSync(join(dir,'src/example.ts'),'function open(){return L("Åpen","Open")} function unresolved(){return L("Åpen","Unresolved")}');
      const first=collectInventory(dir);
      writeFileSync(join(dir,'src/example.ts'),'\\nfunction open(){return L("Åpne","Open now")} function unresolved(){return L("Åpen","Unresolved")}');
      const second=collectInventory(dir,first);
      rmSync(dir,{recursive:true});
      console.log(JSON.stringify({first,second}));
    `], { encoding: 'utf8' });
    const { first, second } = JSON.parse(output);
    expect(first.conflicts[0].kind).toBe('same-source-different-translation');
    expect(first.entries[0].key).not.toBe(first.entries[1].key);
    expect(second.entries.map((e: { key: string }) => e.key)).toEqual(first.entries.map((e: { key: string }) => e.key));
    expect(second.entries[0].line).toBe(2);
    expect(second.entries[0].en.text).toBe('Open now');
  });
  it('every raw expression and template segment survives regeneration', () => {
    const baseline = JSON.parse(readFileSync('scripts/i18n/baseline.v1.json', 'utf8'));
    const mapping = JSON.parse(readFileSync('scripts/i18n/mapping.v1.json', 'utf8'));
    const byKey = new Map<string, { nb: { raw: string }; en: { raw: string } }>(mapping.entries.map((e: { key: string; nb: { raw: string }; en: { raw: string } }) => [e.key, e]));
    expect(baseline.entries).toHaveLength(9963);
    for (const entry of baseline.entries) {
      const current = byKey.get(entry.key);
      expect(current).toBeDefined();
      if (!current) throw new Error(`Lost baseline key: ${entry.key}`);
      expect(createHash('sha256').update(current.nb.raw).digest('hex')).toBe(entry.nb);
      expect(createHash('sha256').update(current.en.raw).digest('hex')).toBe(entry.en);
    }
    const output = execFileSync('node', ['--input-type=module', '-e', `
      import { buildInventory } from './scripts/i18n/inventory.mjs';
      import { readFileSync } from 'node:fs';
      const inv=buildInventory(undefined,true);
      const catalogs={nb:JSON.parse(readFileSync('src/core/i18n/locales/nb.json','utf8')),en:JSON.parse(readFileSync('src/core/i18n/locales/en.json','utf8'))};
      for(const entry of inv.entries) for(const lang of ['nb','en']) if(catalogs[lang][entry.key].source!==entry[lang].raw || catalogs[lang][entry.key].text!==entry[lang].text) throw Error('Lost text: '+entry.key);
      console.log(JSON.stringify({count:inv.entries.length,keys:new Set(inv.entries.map(e=>e.key)).size}));
    `], { encoding: 'utf8' });
    const counts = JSON.parse(output);
    expect(counts.count).toBeGreaterThan(9900);
    expect(counts.keys).toBe(counts.count);
  }, 60000);
  it('templates, nested calls, aliases and equal words with different meanings remain distinct', () => {
    const source = 'import { L as label } from "@/core"; function first(){return label(`Hei ${person.name}, ${n===1 ? "scene" : "scener"}`,`Hi ${person.name}, ${n===1 ? "scene" : "scenes"}`);} function second(){return label("Åpen","Open");} function third(){return label("Åpen","Unresolved");} const table=localized({x:["Ja","Yes"]}); const nested=L(L("A","B"),"C");';
    const output = execFileSync('node', ['--input-type=module', '-e', `import {inventorySource,pseudoText} from './scripts/i18n/inventory.mjs'; console.log(JSON.stringify({entries:inventorySource(${JSON.stringify(source)}).entries,pseudo:pseudoText('Hello {name}')}));`], { encoding: 'utf8' });
    const result = JSON.parse(output);
    expect(result.entries).toHaveLength(6);
    expect(result.entries[0].nb.text).toBe('Hei {name}, {value2}');
    expect(result.entries[0].nb.parameters[1].conditional).toBe(true);
    expect(result.entries[1].semantic).not.toBe(result.entries[2].semantic);
    expect(result.entries[1].en.text).toBe('Open');
    expect(result.entries[2].en.text).toBe('Unresolved');
    expect(result.pseudo).toContain('{name}');
    expect(result.pseudo).not.toContain('Hello');
  });
});
describe('ML2b migration tool', () => {
  it('moves L/localized to keys without changing text, keeps distinct keys for same text and leaves conflicts on the bridge', () => {
    const source = 'import { L, localized } from "@/core/i18n";\nconst M = localized({ a: ["Ja", "Yes"] });\nexport const f = (n: number) => [L("Lukk", "Close"), L("Lukk", "Close"), L(`${n} scener`, `${n} scenes`), L(`${n} av ${n}`, `${n}`)];\n';
    const output = execFileSync('node', ['--input-type=module', '-e', `
      import { collectInventory } from './scripts/i18n/inventory.mjs';
      import { migrateSource } from './scripts/i18n/migrate.mjs';
      import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
      const root=mkdtempSync('/tmp/ml2b-'); mkdirSync(root+'/src'); writeFileSync(root+'/src/a.ts', ${JSON.stringify(source)});
      const first=collectInventory(root);
      const out=migrateSource(readFileSync(root+'/src/a.ts','utf8'),'src/a.ts',first);
      writeFileSync(root+'/src/a.ts', out.source);
      const second=collectInventory(root, first);
      rmSync(root,{recursive:true,force:true});
      console.log(JSON.stringify({source:out.source,stats:out.stats,firstKeys:first.entries.map(e=>e.key).sort(),secondKeys:second.entries.map(e=>e.key).sort(),migrated:second.entries.filter(e=>e.migrated).length}));`], { encoding: 'utf8' });
    const r = JSON.parse(output);
    expect(r.stats).toEqual({ moved: 4, bridge: 1, reasons: { 'parameter-contract': 1 } });
    expect(r.source).toContain('tLocalized({ a: "');
    expect(r.source).toContain('{ n: String(n) }');
    expect(r.source).toMatch(/import \{ L \} from "@\/core\/i18n";/);
    expect(r.secondKeys).toEqual(r.firstKeys);
    expect(r.migrated).toBe(4);
    const lukk = [...r.source.matchAll(/t\("([^"]+)"\)/g)].map((m: RegExpMatchArray) => m[1]);
    expect(new Set(lukk).size).toBe(2);
  });
});
