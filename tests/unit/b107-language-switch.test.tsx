import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import manifest from '@/core/i18n/manifest.json';
import { parseMyFeatures } from '@/core/community';
import { LanguageRoot, LanguageSwitch, availableLanguages, applyProfileLanguage, chooseLanguage, useLanguage } from '@/app/i18n/language';
import { t } from '@/core/i18n/keyed';

const fixture = vi.hoisted(() => ({ signedIn: false, feature: false, failure: false }));
vi.mock('@/adapters/browser/auth', () => ({
  onSessionChange: (listener: (session: unknown) => void) => {
    listener(fixture.signedIn ? { user: { id: 'language-test-user' } } : null);
    return () => {};
  },
}));
vi.mock('@/adapters/browser/features', () => ({
  fetchMyFeatures: async () => {
    if (fixture.failure) throw new Error('Feature service unavailable');
    return { ...parseMyFeatures(null), 'ui.test_languages': fixture.feature };
  },
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const regular = manifest.languages.filter(l => !('testOnly' in l && l.testOnly)).map(l => l.tag);
const changeKey = 'app-i18n-language.language-switch.change-title';
function TranslatedText() {
  useLanguage();
  return <output data-testid="translated-text">{t(changeKey)}</output>;
}

describe('B-107: ordinary languages never depend on login or the test-language feature', () => {
  for (const signedIn of [false, true]) {
    for (const [language, expected] of [['fr', 'Changer de langue'], ['ja', '言語を変更']] as const) {
      it(`uses actual ${language} catalog after selection and restoring ${signedIn ? 'account' : 'local'} choice`, async () => {
        fixture.signedIn = signedIn;
        fixture.feature = false;
        fixture.failure = true;
        await applyProfileLanguage(signedIn ? 'en' : null);
        const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
        const mount = () => render(<QueryClientProvider client={client}><LanguageSwitch /><TranslatedText /></QueryClientProvider>);
        let view = mount();
        fireEvent.click(view.getByTestId(`language-${language}`));
        await waitFor(() => expect(view.getByTestId('translated-text')).toHaveTextContent(expected));
        expect(view.getByTestId('translated-text').textContent).not.toBe(t(changeKey, {}, 'en'));
        view.unmount();
        await chooseLanguage('en');
        window.localStorage.setItem('animatic:lang', language);
        await applyProfileLanguage(signedIn ? language : null);
        view = mount();
        expect(view.getByTestId('translated-text')).toHaveTextContent(expected);
        view.unmount();
        client.clear();
        await applyProfileLanguage(null);
      });
    }
  }
  it('offers the ten approved languages with test languages disabled or enabled', () => {
    expect(regular).toEqual(['nb', 'en', 'fr', 'es', 'ru', 'ja', 'pt-BR', 'de', 'it', 'ko']);
    expect(availableLanguages(false).map(l => l.tag)).toEqual(regular);
    expect(availableLanguages(true).filter(l => !l.testOnly).map(l => l.tag)).toEqual(regular);
  });

  for (const signedIn of [false, true]) {
    for (const state of ['off', 'on', 'unavailable'] as const) {
      it(`renders every ordinary language ${signedIn ? 'signed in' : 'signed out'}, feature ${state}`, async () => {
        fixture.signedIn = signedIn;
        fixture.feature = state === 'on';
        fixture.failure = state === 'unavailable';
        const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
        const view = render(
          <QueryClientProvider client={client}>
            <LanguageRoot><LanguageSwitch compact /><LanguageSwitch /></LanguageRoot>
          </QueryClientProvider>,
        );
        const assertOptions = () => {
          for (const group of view.getAllByTestId('language-switch')) {
            const offered = [...group.querySelectorAll('[data-testid^="language-"]')]
              .map(button => button.getAttribute('data-testid')?.slice('language-'.length));
            expect(offered.filter(tag => regular.includes(tag ?? ''))).toEqual(regular);
          }
        };
        assertOptions(); // Also covers the initial pending feature read.
        await waitFor(() => expect(client.getQueryState(['my-features'])?.status).toBe(fixture.failure ? 'error' : 'success'));
        assertOptions();
        view.unmount();
        client.clear();
      });
    }
  }
});