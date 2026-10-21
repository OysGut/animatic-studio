import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';
import { installRequestLanguageReader } from '@/core/i18n';
import { acceptLanguagePreferences, isUiLang, matchUiLanguage } from '@/core/i18n/languages';
/** Request AsyncLocalStorage belongs to Start; no mutable locale is shared between requests. */
export const requestUiLanguage = createIsomorphicFn()
  .server(() => {
    try {
      const cookie = getRequestHeader('cookie') ?? '';
      const value = cookie.split(';').map(v => v.trim()).find(v => v.startsWith('ptg-ui-language='))?.slice('ptg-ui-language='.length);
      const decoded = value ? decodeURIComponent(value) : undefined;
      if (isUiLang(decoded)) return decoded;
      return matchUiLanguage(acceptLanguagePreferences(getRequestHeader('accept-language') ?? '')) ?? 'en';
    } catch { return 'en'; }
  })
  .client(() => undefined);
export function installUiLanguageReader() { installRequestLanguageReader(requestUiLanguage); }