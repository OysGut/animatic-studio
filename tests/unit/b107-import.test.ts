// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
// @ts-ignore executable tool tested as ESM
import { importLocale, exportNew, sourceHash, validateTranslation } from '../../scripts/i18n/locale-tools.mjs';
function fixture(run: (root: string, parts: string) => void) {
  const root = mkdtempSync('/tmp/b107-import-test-');
  const locales = join(root, 'src/core/i18n/locales'), parts = join(root, 'parts');
  mkdirSync(locales, { recursive: true }); mkdirSync(parts);
  writeFileSync(join(locales, 'en.json'), JSON.stringify({ hello: { text: 'Hello {name}' } }));
  writeFileSync(join(locales, 'nb.json'), JSON.stringify({ hello: { text: 'Hei {name}' } }));
  try { run(root, parts); } finally { rmSync(root, { recursive: true, force: true }); }
}
describe('B-107 transactional locale import', () => {
  it('imports current text and stores the English source hash', () => fixture((root, parts) => {
    writeFileSync(join(parts, 'fr_del_01_av_01.json'), JSON.stringify({ hello: { en: 'Hello {name}', oversatt: 'Bonjour {name}' } }));
    const result = importLocale('fr', parts, root);
    expect(result.report.errors).toEqual([]);
    expect(JSON.parse(readFileSync(join(root, 'src/core/i18n/locales/fr.json'), 'utf8')).hello.sourceHash).toBe(sourceHash({ text: 'Hello {name}' }));
  }));
  it('rejects bad placeholders without touching an existing locale', () => fixture((root, parts) => {
    const path = join(root, 'src/core/i18n/locales/fr.json'); writeFileSync(path, 'KEEP');
    writeFileSync(join(parts, 'fr_del_01_av_01.json'), JSON.stringify({ hello: { en: 'Hello {name}', oversatt: 'Bonjour {person}' } }));
    expect(importLocale('fr', parts, root).report.errors[0].error).toBe('Placeholder mismatch');
    expect(readFileSync(path, 'utf8')).toBe('KEEP');
  }));
  it('omits outdated translation and exports it for translation again', () => fixture((root, parts) => {
    writeFileSync(join(parts, 'fr_del_01_av_01.json'), JSON.stringify({ hello: { en: 'Old {name}', oversatt: 'Ancien {name}' } }));
    expect(importLocale('fr', parts, root).report.stale).toHaveLength(1);
    expect(exportNew('fr', root)).toEqual({ hello: { nb: 'Hei {name}', en: 'Hello {name}', sourceHash: sourceHash({ text: 'Hello {name}' }), oversatt: '' } });
    expect(existsSync(join(root, 'src/core/i18n/locales/fr.json'))).toBe(false);
  }));
  it('rejects changed formatting metadata even when English words are unchanged', () => fixture((root, parts) => {
    const original = { text: 'Hello {name}' };
    writeFileSync(join(root, 'src/core/i18n/locales/en.json'), JSON.stringify({ hello: { ...original, formats: { name: 'number' } } }));
    const path = join(root, 'src/core/i18n/locales/fr.json'); writeFileSync(path, 'KEEP');
    writeFileSync(join(parts, 'fr_del_01_av_01.json'), JSON.stringify({ hello: { en: original.text, sourceHash: sourceHash(original), oversatt: 'Bonjour {name}' } }));
    expect(importLocale('fr', parts, root).report.stale).toHaveLength(1);
    expect(readFileSync(path, 'utf8')).toBe('KEEP');
  }));
  it.each(['{invalid', JSON.stringify({ unknown: { en: 'Unknown', oversatt: '?' } })])('rejects invalid JSON or unknown keys', data => fixture((root, parts) => {
    writeFileSync(join(parts, 'fr_del_01_av_01.json'), data);
    expect(importLocale('fr', parts, root).report.errors.length).toBeGreaterThan(0);
    expect(existsSync(join(root, 'src/core/i18n/locales/fr.json'))).toBe(false);
  }));
  it('rejects missing and duplicated file parts', () => fixture((root, parts) => {
    writeFileSync(join(parts, 'fr_del_01_av_02.json'), JSON.stringify({ hello: { en: 'Hello {name}', oversatt: 'Bonjour {name}' } }));
    expect(importLocale('fr', parts, root).report.errors).toContainEqual({ file: parts, key: '', error: 'Missing part 2' });
  }));
  it('validates every CLDR category and placeholders in every plural form', () => {
    const source = { text: null, plural: { parameter: 'count', forms: { one: '{count} file', other: '{count} files' } } };
    expect(validateTranslation('pl', source, { one: '{count} plik', few: '{count} pliki', many: '{count} plików', other: '{count} pliku' })).toEqual([]);
    expect(validateTranslation('pl', source, { one: '{count}', other: '{count}', invented: '{other}' })).toContain('Missing plural form few');
  });
});