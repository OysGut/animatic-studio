// @vitest-environment node
import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, expect, it, vi } from 'vitest';
import { installRequestLanguageReader, getUiLanguage, setLanguage, tm } from '@/core/i18n';
import { loadUiCatalog, t } from '@/core/i18n/keyed';
import { initializeUiCatalogLoader } from '@/adapters/i18n/catalog-loader';
import { installUiLanguageReader } from '@/adapters/auth/ui-language';

const context = vi.hoisted(() => ({ read: (_name: string): string | undefined => undefined }));
vi.mock('@tanstack/react-start', () => ({ createIsomorphicFn: () => ({ server: (fn: () => unknown) => ({ client: () => fn }) }) }));
vi.mock('@tanstack/react-start/server', () => ({ getRequestHeader: (name: string) => context.read(name) }));
afterEach(() => { installRequestLanguageReader(() => undefined); setLanguage('en'); });
it('interleaved requests never borrow another request language, translated text or name parameters', async () => {
  const requests = new AsyncLocalStorage<Record<string, string>>();
  context.read = name => requests.getStore()?.[name];
  installUiLanguageReader(); initializeUiCatalogLoader();
  await Promise.all(['fr', 'ja', 'nb'].map(loadUiCatalog));
  setLanguage('ja'); // A shared browser fallback must not affect any active server request.
  await Promise.all(Array.from({ length: 20 }, (_, index) => {
    const language = index % 2 ? 'ja' : 'fr';
    const name = index % 2 ? 'Bob' : 'Alice';
    return requests.run({ cookie: `ptg-ui-language=${language}`, 'accept-language': 'nb' }, async () => {
      await new Promise(resolve => setTimeout(resolve, index % 3));
      expect(getUiLanguage()).toBe(language);
      expect(t('app-i18n-language.language-switch.change-title')).toBe(language === 'fr' ? 'Changer de langue' : '言語を変更');
      expect(t('b118.tip-by', { label: 'Scene', time: '10:00', name })).toContain(name);
      expect(t('b118.tip-by', { label: 'Scene', time: '10:00', name })).not.toContain(name === 'Alice' ? 'Bob' : 'Alice');
    });
  }));
  await requests.run({ 'accept-language': 'nb' }, async () => {
    expect(getUiLanguage()).toBe('nb');
    expect(tm('Ugyldig notat')).toBe('Ugyldig notat');
  });
  await requests.run({}, async () => { expect(getUiLanguage()).toBe('en'); });
});