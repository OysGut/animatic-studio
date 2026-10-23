/** Kompakt språkvelger i toppmenyen: åpning, lukking, tastatur og lagring som før. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { parseMyFeatures } from '@/core/community';
import { CompactLanguageSwitch, availableLanguages, chooseLanguage, testLanguagesEnabled } from '@/app/i18n/language';

vi.mock('@/adapters/browser/auth', () => ({
  getSessionUserId: () => null,
  onSessionIdentityChange: () => () => {},
  onSessionChange: (listener: (session: unknown) => void) => { listener(null); return () => {}; },
}));
vi.mock('@/adapters/browser/features', () => ({
  fetchMyFeatures: async () => ({ ...parseMyFeatures(null), 'ui.test_languages': false }),
}));

afterEach(async () => { cleanup(); await chooseLanguage('nb'); window.localStorage.clear(); });
const mount = () => render(<QueryClientProvider client={new QueryClient()}><button data-testid="outside">x</button><CompactLanguageSwitch /></QueryClientProvider>);

describe('kompakt språkvelger', () => {
  it('viser bare gjeldende kode lukket, og alle koder som radiogruppe åpen', async () => {
    await chooseLanguage('nb');
    const v = mount();
    const toggle = v.getByTestId('language-compact-toggle');
    expect(toggle.textContent).toBe('NB');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(v.queryByRole('radiogroup')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const radios = v.getAllByRole('radio');
    // Samme liste som den vanlige velgeren: en-XA bare når testspråk er slått på.
    expect(radios.map(r => r.getAttribute('lang'))).toEqual(availableLanguages(testLanguagesEnabled()).map(o => o.tag));
    expect(v.getByTestId('language-compact-nb').getAttribute('aria-checked')).toBe('true');
    if (!testLanguagesEnabled()) expect(v.queryByTestId('language-compact-en-XA')).toBeNull();
    expect(v.getByTestId('language-compact-en').getAttribute('aria-label')).toBeTruthy();
  });

  it('lukkes ved klikk utenfor og ved Esc, med fokus tilbake', async () => {
    const v = mount();
    const toggle = v.getByTestId('language-compact-toggle');
    fireEvent.click(toggle);
    fireEvent.pointerDown(v.getByTestId('outside'));
    expect(v.queryByRole('radiogroup')).toBeNull();
    fireEvent.click(toggle);
    fireEvent.keyDown(v.getByTestId('language-compact-nb'), { key: 'Escape' });
    expect(v.queryByRole('radiogroup')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(toggle));
  });

  it('piltaster flytter fokus, valg lagres som før og lukker', async () => {
    await chooseLanguage('nb');
    const v = mount();
    fireEvent.click(v.getByTestId('language-compact-toggle'));
    const nb = v.getByTestId('language-compact-nb');
    expect(document.activeElement).toBe(nb);
    const tags = availableLanguages(testLanguagesEnabled()).map(o => o.tag);
    const i = tags.indexOf('nb');
    fireEvent.keyDown(nb, { key: 'ArrowRight' });
    expect(document.activeElement?.getAttribute('lang')).toBe(tags[(i + 1) % tags.length]);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(nb);
    fireEvent.click(v.getByTestId('language-compact-en'));
    await waitFor(() => expect(v.getByTestId('language-compact-toggle').textContent).toBe('EN'));
    expect(window.localStorage.getItem('animatic:lang')).toBe('en');
    expect(v.queryByRole('radiogroup')).toBeNull();
  });
});
