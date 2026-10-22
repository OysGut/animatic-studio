import { act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { LanguageSwitch } from '@/app/i18n/language';

vi.mock('@/adapters/browser/auth', () => ({ getSessionUserId: () => null, onSessionIdentityChange: () => () => {} }));
vi.mock('@/adapters/browser/features', () => ({ fetchMyFeatures: async () => ({ 'ui.test_languages': false }) }));
afterEach(() => { window.localStorage.clear(); });

it.each([false, true])('browser developer options never change initial SSR markup (compact=%s)', async compact => {
  const client = new QueryClient();
  const element = <QueryClientProvider client={client}><LanguageSwitch compact={compact} /></QueryClientProvider>;
  const html = renderToString(element);
  expect(html).not.toContain('data-testid="language-en-XA"');
  window.localStorage.setItem('animatic:test-languages', '1');
  window.localStorage.setItem('animatic:incomplete-languages', '1');
  const container = document.createElement('div');
  container.innerHTML = html; document.body.append(container);
  const errors: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | undefined;
  await act(async () => { root = hydrateRoot(container, element, { onRecoverableError: error => errors.push(error) }); });
  expect(errors).toEqual([]);
  expect(container.querySelector('[data-testid="language-en-XA"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="language-fr"]')).not.toBeNull();
  await act(async () => root?.unmount());
  container.remove(); client.clear();
});