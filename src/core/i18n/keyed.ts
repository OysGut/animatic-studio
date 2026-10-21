/**
 * Nøkkelbasert tekst (B-049 ML1/ML2): `t(nøkkel, parametere)`. Appen laster bare nøklene som faktisk
 * brukes (runtime.gen.json, generert av scripts/i18n/inventory.mjs); de fulle katalogene i locales/ er
 * byggeartefakter. Testspråket `en-XA` lages fra engelsk med samme pseudotekst som inventaret.
 * L/localized/tm virker uendret ved siden av (broen) til inventaret er tomt.
 */
import manifest from './manifest.json';
import runtime from './runtime.gen.json';
import { createTranslator, type MessageCatalog, type MessageParameters } from './messages';
import { getUiLanguage, pseudoText } from './index';

let translate: ReturnType<typeof createTranslator> | undefined;
const catalogs: Record<string, MessageCatalog> = { nb: runtime.nb as MessageCatalog, en: runtime.en as MessageCatalog };
const loaders = import.meta.glob<{ default: MessageCatalog }>('./locales/*.json');
const pending = new Map<string, Promise<void>>();
const missing = new Set<string>();
/** Loads one locale, independently. No English fallback is cached as a translated result. */
export function loadUiCatalog(language: string): Promise<void> {
  if (catalogs[language] || language === 'en-XA') return Promise.resolve();
  const previous = pending.get(language);
  if (previous) return previous;
  const loader = loaders[`./locales/${language}.json`];
  if (!loader) return Promise.resolve();
  const task = loader().then(module => {
    // Only executable runtime keys enter the translator; legacy inventory rows stay build-time data.
    catalogs[language] = Object.fromEntries(Object.entries(module.default).filter(([key]) => key in runtime.en));
    translate = undefined;
  }).catch(error => { pending.delete(language); throw error; });
  pending.set(language, task);
  return task;
}
function translator() {
  if (translate) return translate;
  const nb = runtime.nb as MessageCatalog;
  const en = runtime.en as MessageCatalog;
  const pseudo: Record<string, MessageCatalog[string]> = {};
  for (const [key, msg] of Object.entries(en)) {
    pseudo[key] = {
      ...msg,
      text: msg.text === null ? null : pseudoText(msg.text),
      ...(msg.plural ? { plural: { ...msg.plural, forms: Object.fromEntries(Object.entries(msg.plural.forms).map(([c, f]) => [c, pseudoText(f)])) } } : {}),
    };
  }
  catalogs['en-XA'] = pseudo;
  translate = createTranslator(manifest, catalogs, event => {
    const id = `${event.locale}:${event.key}`;
    if (import.meta.env.DEV && !missing.has(id)) { missing.add(id); console.warn('Translation fallback', event); }
  }, true);
  return translate;
}

export function t(key: string, params: MessageParameters = {}, language: string = getUiLanguage()): string {
  return translator()(key, params, language);
}

/**
 * Fast oppslag (etikett per type o.l.) med nøkler, som alltid svarer på gjeldende språk. Erstatter
 * `localized({ a: ["nb", "en"] })` når alle tekstene er flyttet til nøkler.
 */
export function tLocalized<K extends string | number>(keys: Record<K, string>): Record<K, string> {
  const own = (target: object, prop: PropertyKey) => typeof prop === 'string' && Object.prototype.hasOwnProperty.call(target, prop);
  return new Proxy(keys, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver) as unknown;
      return own(target, prop) && typeof v === 'string' ? t(v) : v;
    },
    getOwnPropertyDescriptor(target, prop) {
      const d = Reflect.getOwnPropertyDescriptor(target, prop);
      return d && typeof d.value === 'string' ? { ...d, value: t(d.value) } : d;
    },
  });
}
