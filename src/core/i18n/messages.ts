/** ML1 pure, injected catalog engine. No browser state or request-global locale mutation. */
export type MessageValue = string | number | boolean | Date;
export type MessageParameters = Readonly<Record<string, MessageValue>>;
export interface CatalogMessage {
  readonly text: string | null;
  readonly sourceHash?: string;
  readonly review?: 'user' | 'machine';
  readonly executable?: boolean;
  readonly source?: string;
  readonly parameters?: readonly { readonly name: string; readonly expression?: string; readonly conditional?: boolean }[];
  readonly plural?: { readonly parameter: string; readonly forms: Readonly<Record<string, string>>; readonly type?: 'cardinal' | 'ordinal' };
  readonly formats?: Readonly<Record<string, { readonly type: 'number' | 'date'; readonly options?: Intl.NumberFormatOptions | Intl.DateTimeFormatOptions }>>;
}
export type MessageCatalog = Readonly<Record<string, CatalogMessage>>;
export interface CatalogLanguage {
  readonly tag: string;
  readonly nativeName: string;
  readonly formatLocale: string;
  readonly fallbacks: readonly string[];
  readonly direction: string;
  readonly complete: boolean;
  readonly testOnly?: boolean;
}
export interface LanguageManifest {
  readonly version: number;
  readonly defaultLocale: string;
  readonly maxFallbackDepth: number;
  readonly languages: readonly CatalogLanguage[];
}
export function canonicalLocale(tag: string): string {
  if (!tag || tag.length > 100) throw new Error('Invalid language tag');
  const tags = Intl.getCanonicalLocales(tag);
  const first = tags[0];
  if (!first || tags.length !== 1) throw new Error('Invalid language tag');
  return first;
}
export function validateManifest(manifest: LanguageManifest): void {
  if (manifest.version !== 1 || !['nb', 'en'].includes(manifest.defaultLocale) || !Number.isInteger(manifest.maxFallbackDepth) || manifest.maxFallbackDepth < 1 || manifest.maxFallbackDepth > 32) throw new Error('Invalid language manifest');
  const languages = new Map<string, CatalogLanguage>();
  for (const lang of manifest.languages) {
    const tag = canonicalLocale(lang.tag);
    canonicalLocale(lang.formatLocale);
    if (tag !== lang.tag || languages.has(tag)) throw new Error(`Duplicate or noncanonical language: ${lang.tag}`);
    languages.set(tag, lang);
  }
  const base = languages.get(manifest.defaultLocale);
  if (!base || base.fallbacks.length) throw new Error('Default language must be the final fallback');
  const visit = (tag: string, stack: readonly string[]) => {
    if (stack.includes(tag)) throw new Error(`Fallback cycle: ${[...stack, tag].join(' -> ')}`);
    if (stack.length >= manifest.maxFallbackDepth) throw new Error('Fallback depth exceeded');
    const lang = languages.get(tag);
    if (!lang) throw new Error(`Unknown fallback language: ${tag}`);
    for (const next of lang.fallbacks) visit(canonicalLocale(next), [...stack, tag]);
  };
  for (const tag of languages.keys()) visit(tag, []);
}
export function fallbackChain(manifest: LanguageManifest, requested: string): readonly string[] {
  validateManifest(manifest);
  const tag = canonicalLocale(requested);
  const languages = new Map(manifest.languages.map((lang) => [lang.tag, lang]));
  const chain: string[] = [];
  const walk = (current: string) => {
    if (chain.includes(current)) return;
    if (current !== manifest.defaultLocale) chain.push(current);
    for (const reserve of languages.get(current)?.fallbacks ?? []) walk(reserve);
  };
  if (languages.has(tag)) walk(tag);
  return [...chain, manifest.defaultLocale];
}
const namesIn = (text: string) => [...text.matchAll(/\{([A-Za-z_][\w]*)\}/g)].map((match) => match[1] ?? '').sort();
const unique = (names: readonly string[]) => [...new Set(names)].sort();
export function messageParameterNames(message: CatalogMessage): readonly string[] {
  return unique([...(message.text === null ? [] : namesIn(message.text)), ...Object.values(message.plural?.forms ?? {}).flatMap(namesIn), ...(message.plural ? [message.plural.parameter] : [])]);
}
export function catalogErrors(manifest: LanguageManifest, catalogs: Readonly<Record<string, MessageCatalog>>): readonly string[] {
  validateManifest(manifest);
  const errors: string[] = [];
  const nb = catalogs['nb'];
  const en = catalogs['en'];
  if (!nb || !en) return ['Missing nb/en catalog'];
  const allKeys = new Set([...Object.keys(nb), ...Object.keys(en)]);
  for (const lang of manifest.languages) {
    const catalog = catalogs[lang.tag];
    if (!catalog) { errors.push(`Missing catalog: ${lang.tag}`); continue; }
    for (const key of allKeys) {
      const message = catalog[key];
      const base = nb[key];
      if (!base || !en[key] || (lang.complete && !message)) { errors.push(`Missing required message: ${lang.tag}:${key}`); continue; }
      if (!message) continue;
      if (message.executable === false) {
        // Frozen legacy source expressions stay in the bridge until explicit ML2 conversion.
        if (typeof message.source !== 'string' || !message.source) errors.push(`Missing legacy expression: ${lang.tag}:${key}`);
        continue;
      }
      if (message.text === null && !message.plural) errors.push(`Missing text: ${lang.tag}:${key}`);
      if (JSON.stringify(messageParameterNames(message)) !== JSON.stringify(messageParameterNames(base))) errors.push(`Parameter mismatch: ${lang.tag}:${key}`);
      const declared = message.parameters?.map((p) => p.name);
      if (declared && (new Set(declared).size !== declared.length || declared.some((name) => !/^[A-Za-z_][\w]*$/.test(name)))) errors.push(`Invalid parameter declaration: ${lang.tag}:${key}`);
      if (declared && JSON.stringify(unique(declared)) !== JSON.stringify(messageParameterNames(message))) errors.push(`Parameter contract mismatch: ${lang.tag}:${key}`);
      if (!!message.plural !== !!base.plural || (message.plural && (message.plural.parameter !== base.plural?.parameter || (message.plural.type ?? 'cardinal') !== (base.plural?.type ?? 'cardinal')))) errors.push(`Plural contract mismatch: ${lang.tag}:${key}`);
      if (message.plural) {
        const rules = new Intl.PluralRules(lang.formatLocale, { type: message.plural.type ?? 'cardinal' });
        const categories = rules.resolvedOptions().pluralCategories;
        for (const category of categories) if (typeof message.plural.forms[category] !== 'string') errors.push(`Missing plural form ${category}: ${lang.tag}:${key}`);
        for (const category of Object.keys(message.plural.forms)) if (!categories.includes(category as Intl.LDMLPluralRule)) errors.push(`Invalid plural form ${category}: ${lang.tag}:${key}`);
        const forms = Object.values(message.plural.forms).map((form) => JSON.stringify(unique(namesIn(form))));
        if (new Set(forms).size > 1) errors.push(`Plural parameter mismatch: ${lang.tag}:${key}`);
      }
      for (const name of Object.keys(message.formats ?? {})) if (!messageParameterNames(message).includes(name)) errors.push(`Unknown formatted parameter: ${lang.tag}:${key}`);
    }
    for (const key of Object.keys(catalog)) if (!allKeys.has(key)) errors.push(`Unknown catalog key: ${lang.tag}:${key}`);
  }
  return errors;
}
export function createTranslator(manifest: LanguageManifest, catalogs: Readonly<Record<string, MessageCatalog>>, onMissing?: (event: { readonly key: string; readonly locale: string; readonly fallback: string }) => void, lazy = false) {
  const errors = lazy ? [] : catalogErrors(manifest, catalogs);
  if (errors.length) throw new Error(errors.join('\n'));
  const languages = new Map(manifest.languages.map((lang) => [lang.tag, lang]));
  // Chains are pure per requested tag; cache them so render-time lookups do not revalidate the manifest.
  const chains = new Map<string, { readonly normalized: string; readonly chain: readonly string[] }>();
  const resolve = (requested: string) => {
    let hit = chains.get(requested);
    if (!hit) {
      const normalized = canonicalLocale(requested);
      hit = { normalized, chain: fallbackChain(manifest, normalized) };
      chains.set(requested, hit);
    }
    return hit;
  };
  return (key: string, params: MessageParameters = {}, requested = manifest.defaultLocale): string => {
    const { normalized, chain } = resolve(requested);
    if (!catalogs['nb']?.[key]) throw new Error(`Unknown translation key: ${key}`);
    for (const tag of chain) {
      const message = catalogs[tag]?.[key];
      if (!message) continue;
      if (message.executable === false) throw new Error(`Legacy expression requires explicit migration: ${key}`);
      const expected = messageParameterNames(message);
      const supplied = Object.keys(params).sort();
      if (JSON.stringify(expected) !== JSON.stringify(supplied)) throw new Error(`Invalid parameters for key: ${key}`);
      const formatLocale = languages.get(normalized)?.formatLocale ?? languages.get(tag)?.formatLocale ?? 'en-GB';
      let text = message.text;
      if (message.plural) {
        const count = params[message.plural.parameter];
        if (typeof count !== 'number' || !Number.isFinite(count)) throw new Error(`Invalid plural value: ${key}`);
        const category = new Intl.PluralRules(formatLocale, { type: message.plural.type ?? 'cardinal' }).select(count);
        text = message.plural.forms[category] ?? message.plural.forms['other'] ?? null;
      }
      if (text === null) throw new Error(`Missing message text: ${key}`);
      if (tag !== normalized) onMissing?.({ key, locale: normalized, fallback: tag });
      return text.replace(/\{([A-Za-z_][\w]*)\}/g, (_, name: string) => {
        const value = params[name];
        const format = message.formats?.[name];
        if (format?.type === 'date') {
          if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error(`Invalid date parameter: ${key}`);
          return new Intl.DateTimeFormat(formatLocale, format.options as Intl.DateTimeFormatOptions).format(value);
        }
        if (format?.type === 'number') {
          if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid number parameter: ${key}`);
          return new Intl.NumberFormat(formatLocale, format.options as Intl.NumberFormatOptions).format(value);
        }
        return String(value);
      });
    }
    throw new Error(`Missing translation key: ${key}`);
  };
}
