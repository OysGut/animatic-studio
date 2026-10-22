import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMyAccount, myAccountKey } from '@/app/account/use-account';
import { useUiPref } from '@/app/account/ui-prefs';
import { LanguageRoot, LanguageSwitch, applyProfileLanguage, chooseLanguage, useLanguage } from '@/app/i18n/language';
import { getUiLanguage } from '@/core/i18n';
import { t } from '@/core/i18n/keyed';

const state = vi.hoisted(() => ({
  id: 'user-a' as string | null,
  identities: new Set<() => void>(),
  sessions: new Set<(s: unknown) => void>(),
  delayed: undefined as (() => void) | undefined,
  delayA: false,
  saves: [] as { id: string | null; prefs: Record<string, unknown> }[],
}));
vi.mock('@/adapters/browser/auth', () => ({
  getSessionUserId: () => state.id,
  onSessionIdentityChange: (f: () => void) => { state.identities.add(f); return () => state.identities.delete(f); },
  onSessionChange: (f: (s: unknown) => void) => { state.sessions.add(f); f(state.id ? { user: { id: state.id } } : null); return () => state.sessions.delete(f); },
  signOut: vi.fn(), signupCountry: vi.fn(),
}));
vi.mock('@/adapters/browser/account', () => ({
  fetchMyAccount: async () => {
    const id = state.id;
    if (id === 'user-a' && state.delayA) await new Promise<void>(resolve => { state.delayed = resolve; });
    return id ? { displayName: id === 'user-a' ? 'Alice' : 'Bob', locale: id === 'user-a' ? 'fr' : 'ja', uiPrefs: {} } : null;
  },
  saveUiPrefs: async (prefs: Record<string, unknown>) => { state.saves.push({ id: state.id, prefs }); },
}));
vi.mock('@/adapters/browser/features', () => ({ fetchMyFeatures: async () => ({ 'ui.test_languages': false }) }));
const valid = (v: unknown): v is number => typeof v === 'number';
function Probe() {
  const account = useMyAccount();
  useLanguage();
  const [pref, setPref] = useUiPref('isolation-size', 10, valid);
  return <><output data-testid="name">{account.data?.displayName ?? 'pending'}</output>
    <output data-testid="pref">{pref}</output><button onClick={() => setPref(99)}>Change</button>
    <output data-testid="text">{t('app-i18n-language.language-switch.change-title')}</output><LanguageSwitch /></>;
}
function switchUser(id: string | null) {
  act(() => {
    state.id = id;
    for (const f of state.identities) f();
    for (const f of state.sessions) f(id ? { user: { id } } : null);
  });
}
afterEach(() => { cleanup(); window.localStorage.clear(); state.delayA = false; state.delayed = undefined; state.saves = []; state.id = 'user-a'; });
describe('Account identity isolation', () => {
  it('never displays A name to B, even when A account response finishes late', async () => {
    state.delayA = true;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><LanguageRoot><Probe /></LanguageRoot></QueryClientProvider>);
    await waitFor(() => expect(state.delayed).toBeTypeOf('function'));
    switchUser('user-b');
    expect(view.getByTestId('name')).not.toHaveTextContent('Alice');
    await waitFor(() => expect(view.getByTestId('name')).toHaveTextContent('Bob'));
    await act(async () => { state.delayed?.(); });
    expect(view.getByTestId('name')).toHaveTextContent('Bob');
    expect(client.getQueryData(myAccountKey('user-a'))).toBeUndefined();
    view.unmount(); client.clear();
  });
  it('isolates actual French/Japanese text and stored selections across direct user switches and restoration', async () => {
    const client = new QueryClient();
    const view = render(<QueryClientProvider client={client}><LanguageRoot><Probe /></LanguageRoot></QueryClientProvider>);
    await chooseLanguage('fr');
    await waitFor(() => expect(view.getByTestId('text')).toHaveTextContent('Changer de langue'));
    expect(window.localStorage.getItem('animatic:lang:user-a')).toBe('fr');
    switchUser('user-b');
    await applyProfileLanguage('ja');
    await chooseLanguage('ja');
    await waitFor(() => expect(view.getByTestId('text')).toHaveTextContent('言語を変更'));
    expect(window.localStorage.getItem('animatic:lang:user-b')).toBe('ja');
    switchUser('user-a');
    await applyProfileLanguage(null);
    await waitFor(() => expect(getUiLanguage()).toBe('fr'));
    expect(view.getByTestId('language-fr')).toHaveAttribute('aria-pressed', 'true');
    switchUser('user-b');
    await applyProfileLanguage(null);
    expect(getUiLanguage()).toBe('ja');
    view.unmount(); client.clear();
  });
  it('drops A delayed preference write and touched/local state when B signs in', async () => {
    const client = new QueryClient();
    const view = render(<QueryClientProvider client={client}><LanguageRoot><Probe /></LanguageRoot></QueryClientProvider>);
    await waitFor(() => expect(view.getByTestId('name')).toHaveTextContent('Alice'));
    fireEvent.click(view.getByRole('button', { name: 'Change' }));
    expect(view.getByTestId('pref')).toHaveTextContent('99');
    switchUser('user-b');
    await waitFor(() => expect(view.getByTestId('name')).toHaveTextContent('Bob'));
    expect(view.getByTestId('pref')).toHaveTextContent('10');
    await new Promise(resolve => setTimeout(resolve, 850));
    expect(state.saves).toEqual([]);
    expect(window.localStorage.getItem('animatic:ui:user-a:isolation-size')).toBe('99');
    expect(window.localStorage.getItem('animatic:ui:user-b:isolation-size')).toBeNull();
    view.unmount(); client.clear();
  });
});