import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useAiModelSettings } from '@/app/ai/use-ai-model-settings';
import { setCatalogSettings } from '@/core';

const fetchSettings = vi.hoisted(() => vi.fn());
vi.mock('@/adapters/account/ai-models.functions', () => ({ fetchAiModelSettings: fetchSettings }));
afterEach(() => { cleanup(); fetchSettings.mockReset(); setCatalogSettings([]); });

it.each([undefined, null, {}, { ready: true, settings: [] }])('empty settings response %j produces a successful empty query, never undefined', async response => {
  fetchSettings.mockResolvedValue(response);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = renderHook(() => useAiModelSettings(), { wrapper });
  await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
  expect(view.result.current.data).toEqual([]);
  expect(view.result.current.error).toBeNull();
  view.unmount(); client.clear();
});

it('keeps valid settings from the server', async () => {
  const settings = [{ provider: 'lovable', model: '*', enabled: false, custom: false, kind: null, label: '', priceUsd: null, priceUnit: '', note: '', updatedAt: null }];
  fetchSettings.mockResolvedValue({ ready: true, settings });
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = renderHook(() => useAiModelSettings(), { wrapper });
  await waitFor(() => expect(view.result.current.data).toEqual(settings));
  view.unmount(); client.clear();
});