/** B-107: manifest.json is the only registry. Add a locale file and one registry entry. */
import manifest from './manifest.json';
export type UiLang = string;
export const LANGUAGE_REGISTRY = manifest.languages;
export const UI_LANGUAGES: readonly UiLang[] = LANGUAGE_REGISTRY.map(l => l.tag);
export function isUiLang(value: unknown): value is UiLang {
  return typeof value === 'string' && UI_LANGUAGES.includes(value);
}
export function languageFormatLocale(tag: string): string {
  return LANGUAGE_REGISTRY.find(l => l.tag === tag)?.formatLocale ?? 'en-GB';
}
export function matchUiLanguage(preferences: readonly string[], includeIncomplete = false): UiLang | null {
  const supported = LANGUAGE_REGISTRY.filter(l => !('testOnly' in l && l.testOnly) && (includeIncomplete || l.complete));
  for (const preference of preferences) {
    const normalized = preference.toLowerCase();
    const exact = supported.find(l => l.tag.toLowerCase() === normalized);
    if (exact) return exact.tag;
    const base = normalized.split('-')[0];
    // Norwegian browser aliases; these do not change the script's language.
    const alias = ['no', 'nn'].includes(base ?? '') ? 'nb' : base;
    const match = supported.find(l => l.tag.toLowerCase().split('-')[0] === alias);
    if (match) return match.tag;
  }
  return null;
}
export function acceptLanguagePreferences(header: string): string[] {
  return header.split(',').map((item, index) => {
    const [tag, ...parameters] = item.trim().split(';');
    const q = parameters.find(p => p.trim().startsWith('q='));
    return { tag: tag ?? '', weight: q ? Number(q.trim().slice(2)) : 1, index };
  }).filter(p => p.tag && p.tag !== '*' && p.weight > 0 && p.weight <= 1).sort((a, b) => b.weight - a.weight || a.index - b.index).map(p => p.tag);
}