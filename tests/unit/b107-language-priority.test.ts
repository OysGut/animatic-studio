import { describe, expect, it, vi } from 'vitest';
import { installCatalogLoader } from '@/core/i18n/keyed';
import { getUiLanguage } from '@/core/i18n';
import { applyProfileLanguage, chooseLanguage, LANGUAGE_KEY } from '@/app/i18n/language';

describe('B-111 preference priority and asynchronous choices', () => {
  it('profile wins over explicit local choice; clearing profile restores that choice', async () => {
    window.localStorage.setItem(LANGUAGE_KEY, 'nb');
    await applyProfileLanguage('en');
    expect(getUiLanguage()).toBe('en');
    expect(window.localStorage.getItem(LANGUAGE_KEY)).toBe('nb');
    await applyProfileLanguage(null);
    expect(getUiLanguage()).toBe('nb');
    window.localStorage.removeItem(LANGUAGE_KEY);
  });
  it('unknown browser language defaults to English and detection never saves an explicit choice', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['zz-ZZ']);
    window.localStorage.removeItem(LANGUAGE_KEY);
    await applyProfileLanguage(null);
    expect(getUiLanguage()).toBe('en');
    expect(window.localStorage.getItem(LANGUAGE_KEY)).toBeNull();
    vi.restoreAllMocks();
  });
  it('a slow earlier choice cannot overwrite the last explicit choice', async () => {
    let finish: ((value: undefined) => void) | undefined;
    installCatalogLoader(() => new Promise(resolve => { finish = resolve; }));
    const slow = chooseLanguage('fr');
    await chooseLanguage('nb');
    finish?.(undefined);
    await slow;
    expect(getUiLanguage()).toBe('nb');
    expect(window.localStorage.getItem(LANGUAGE_KEY)).toBe('nb');
    window.localStorage.removeItem(LANGUAGE_KEY);
  });
});