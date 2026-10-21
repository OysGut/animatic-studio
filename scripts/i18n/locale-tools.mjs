import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
export const ROOT = new URL('../../', import.meta.url).pathname;
export const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
export const sourceValue = (message) => message.plural?.forms ?? message.text;
export const sourceHash = (message) => createHash('sha256').update(JSON.stringify({ text: message.text, plural: message.plural ?? null, formats: message.formats ?? null })).digest('hex');
const names = (value) => [...new Set(Object.values(typeof value === 'object' && value ? value : { text: value }).flatMap(t => [...String(t).matchAll(/\{([A-Za-z_]\w*)\}/g)].map(m => m[1])))].sort();
export function validateTranslation(code, source, value) {
  const errors = [];
  const plural = source.plural;
  if (plural) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return ['Expected plural forms'];
    const categories = new Intl.PluralRules(code, { type: plural.type ?? 'cardinal' }).resolvedOptions().pluralCategories;
    for (const category of categories) if (typeof value[category] !== 'string') errors.push(`Missing plural form ${category}`);
    for (const category of Object.keys(value)) if (!categories.includes(category)) errors.push(`Invalid plural form ${category}`);
  } else if (typeof value !== 'string') return ['Expected text'];
  const expected = names(sourceValue(source));
  for (const text of typeof value === 'string' ? [value] : Object.values(value)) {
    if (typeof text !== 'string') { errors.push('Expected text'); continue; }
    if (text === '' && sourceValue(source) !== '') errors.push('Empty translation');
    if (JSON.stringify(names(text)) !== JSON.stringify(expected)) errors.push('Placeholder mismatch');
  }
  return errors;
}
export function importLocale(code, directory, root = ROOT, { write = true } = {}) {
  Intl.getCanonicalLocales(code);
  const en = read(join(root, 'src/core/i18n/locales/en.json'));
  const catalog = {}, seen = new Set(), errors = [], stale = [];
  const pattern = new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_del_(\\d+)_av_(\\d+)\\.json$`);
  const files = readdirSync(directory).filter(f => pattern.test(f)).sort();
  if (!files.length) errors.push({ file: directory, key: '', error: 'No locale parts found' });
  const parts = new Set(); let total;
  for (const file of files) {
    const match = file.match(pattern); const n = Number(match?.[1]), count = Number(match?.[2]);
    if (total !== undefined && count !== total) errors.push({ file, key: '', error: 'Inconsistent part count' });
    total = count; parts.add(n);
    let entries;
    try { entries = read(join(directory, file)); } catch { errors.push({ file, key: '', error: 'Invalid JSON' }); continue; }
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) { errors.push({ file, key: '', error: 'Expected key map' }); continue; }
    for (const [key, entry] of Object.entries(entries)) {
      if (seen.has(key)) errors.push({ file, key, error: 'Duplicate key' });
      seen.add(key);
      const source = en[key];
      if (!source) { errors.push({ file, key, error: 'Unknown key' }); continue; }
      if (!entry || typeof entry !== 'object') { errors.push({ file, key, error: 'Expected translation entry' }); continue; }
      // Old English is not a translation of the current message: omit, never silently reuse it.
      if (JSON.stringify(entry.en) !== JSON.stringify(sourceValue(source))) { stale.push({ file, key, error: 'English source changed' }); continue; }
      for (const error of validateTranslation(code, source, entry.oversatt)) errors.push({ file, key, error });
      catalog[key] = { text: source.plural ? null : entry.oversatt, ...(source.plural ? { plural: { ...source.plural, forms: entry.oversatt } } : {}), ...(source.formats ? { formats: source.formats } : {}), sourceHash: sourceHash(source), review: 'user' };
    }
  }
  for (let n = 1; n <= (total ?? 0); n++) if (!parts.has(n)) errors.push({ file: directory, key: '', error: `Missing part ${n}` });
  const missing = Object.keys(en).filter(key => !seen.has(key));
  const report = { code, files: files.length, imported: Object.keys(catalog).length, errors, stale, missing };
  if (!errors.length && write) writeFileSync(join(root, `src/core/i18n/locales/${code}.json`), JSON.stringify(catalog, null, 2) + '\n');
  return { catalog, report };
}
export function exportNew(code, root = ROOT, machine = false) {
  const en = read(join(root, 'src/core/i18n/locales/en.json')), nb = read(join(root, 'src/core/i18n/locales/nb.json'));
  let locale = {}; try { locale = read(join(root, `src/core/i18n/locales/${code}.json`)); } catch { /* new locale */ }
  return Object.fromEntries(Object.entries(en).filter(([key, message]) => machine ? locale[key]?.review === 'machine' : !locale[key] || locale[key].sourceHash !== sourceHash(message)).map(([key, message]) => [key, { nb: sourceValue(nb[key]), en: sourceValue(message), oversatt: machine && locale[key] ? sourceValue(locale[key]) : message.plural ? Object.fromEntries(new Intl.PluralRules(code).resolvedOptions().pluralCategories.map(c => [c, ''])) : '' }]));
}