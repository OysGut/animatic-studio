import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import manifest from '@/core/i18n/manifest.json';
import { parseMyFeatures } from '@/core/community';
import { LanguageRoot, LanguageSwitch, availableLanguages } from '@/app/i18n/language';

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

describe('B-107: ordinary languages never depend on login or the test-language feature', () => {
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