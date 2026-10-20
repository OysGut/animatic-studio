/** ML1 opt-in keyed API. Existing L/localized/tm deliberately remain unchanged. */
import manifest from './manifest.json';
import nb from './locales/nb.json';
import en from './locales/en.json';
import pseudo from './locales/en-XA.json';
import { createTranslator, type MessageParameters } from './messages';
import { getUiLanguage } from './index';
let translate: ReturnType<typeof createTranslator> | undefined;
export function t(key: string, params: MessageParameters = {}, language: string = getUiLanguage()): string {
  translate ??= createTranslator(manifest, { nb, en, 'en-XA': pseudo });
  return translate(key, params, language);
}
