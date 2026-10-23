// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { getUiLanguage, isUiLang, setLanguage } from '@/core/i18n';
import { acceptLanguagePreferences, matchUiLanguage } from '@/core/i18n/languages';
import { createTranslator, type LanguageManifest } from '@/core/i18n/messages';
import { loadUiCatalog, t } from '@/core/i18n/keyed';
import { initializeUiCatalogLoader } from '@/adapters/i18n/catalog-loader';

afterEach(() => setLanguage('nb'));
describe('B-107/B-111 open interface languages', () => {
  it('registers all eight new languages without changing script Lang', () => {
    for (const language of ['fr', 'es', 'ru', 'ja', 'pt-BR', 'de', 'it', 'ko']) expect(isUiLang(language)).toBe(true);
    expect(isUiLang('invented')).toBe(false);
  });
  it('respects browser order, Norwegian aliases and no-match fallback', () => {
    expect(matchUiLanguage(['no-NO', 'en'])).toBe('nb');
    expect(matchUiLanguage(['xx-ZZ', 'en-GB'])).toBe('en');
    expect(matchUiLanguage(['xx-ZZ'])).toBeNull();
    expect(acceptLanguagePreferences('fr;q=0.4,nb;q=0.8,en;q=0,ja')).toEqual(['ja', 'nb', 'fr']);
  });
  it('loads a separate French catalog and renders its own text', async () => {
    initializeUiCatalogLoader();
    await loadUiCatalog('fr');
    expect(t('app-i18n-language.language-switch.aria-label.a2595484506d', {}, 'fr')).not.toBe(t('app-i18n-language.language-switch.aria-label.a2595484506d', {}, 'en'));
  });
  it('falls back to English for a partial synthetic catalog, never Norwegian or a key', () => {
    const manifest: LanguageManifest = { version: 1, defaultLocale: 'en', maxFallbackDepth: 8, languages: [
      { tag: 'en', nativeName: 'English', formatLocale: 'en', direction: 'ltr', fallbacks: [], complete: true },
      { tag: 'nb', nativeName: 'Norsk', formatLocale: 'nb', direction: 'ltr', fallbacks: ['en'], complete: true },
      { tag: 'fr', nativeName: 'Synthetic', formatLocale: 'fr', direction: 'ltr', fallbacks: ['en'], complete: false },
    ] };
    const events: unknown[] = [];
    const translate = createTranslator(manifest, { en: { a: { text: 'English' } }, nb: { a: { text: 'Norsk' } }, fr: {} }, e => events.push(e));
    expect(translate('a', {}, 'fr')).toBe('English');
    expect(events).toEqual([{ key: 'a', locale: 'fr', fallback: 'en' }]);
  });
  it('uses French one for zero/one and Polish few/many with all CLDR categories', () => {
    const languages = ['en', 'nb', 'fr', 'pl'].map(tag => ({ tag, nativeName: tag, formatLocale: tag, direction: 'ltr', fallbacks: tag === 'en' ? [] : ['en'], complete: true }));
    const catalogs = Object.fromEntries(languages.map(l => [l.tag, { count: { text: null, plural: { parameter: 'n', forms: Object.fromEntries(new Intl.PluralRules(l.tag).resolvedOptions().pluralCategories.map(c => [c, `${c} {n}`])) } } }]));
    const translate = createTranslator({ version: 1, defaultLocale: 'en', maxFallbackDepth: 8, languages }, catalogs);
    expect(translate('count', { n: 0 }, 'fr')).toBe('one 0');
    expect(translate('count', { n: 1 }, 'fr')).toBe('one 1');
    expect(translate('count', { n: 2 }, 'pl')).toBe('few 2');
    expect(translate('count', { n: 5 }, 'pl')).toBe('many 5');
  });
});