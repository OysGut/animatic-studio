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
  translate = createTranslator(manifest, { nb, en, 'en-XA': pseudo });
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
