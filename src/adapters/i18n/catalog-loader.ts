/** Vite's split JSON imports belong to the adapter, not the portable core. */
import { installCatalogLoader } from '@/core/i18n/keyed';
import type { MessageCatalog } from '@/core/i18n/messages';
const loaders = import.meta.glob<{ default: MessageCatalog }>('../../core/i18n/locales/*.json');
/** Explicit startup call survives production tree shaking with package sideEffects: false. */
export function initializeUiCatalogLoader() {
  installCatalogLoader(async language => {
    const loader = loaders[`../../core/i18n/locales/${language}.json`];
    return loader ? (await loader()).default : undefined;
  }, import.meta.env.DEV);
}