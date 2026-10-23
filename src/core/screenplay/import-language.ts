/**
 * G-1b: forslag til manusets språk ved import. Rekkefølgen er metadata i filen (Word),
 * skriftsystem i teksten (sikre hint som kana/Han/hangul), og til slutt prosjektets
 * kildespråk. Forslaget er alltid usikkert – brukeren bekrefter, ingenting påstås.
 */
import { normalizeLanguageTag } from "../dialogue/languages";
import { canonicalLanguageTag } from "../translation/language-tags";

export interface ImportLanguageSuggestion {
  readonly language: string;
  readonly basis: "metadata" | "script" | "project";
  /** Forslaget er et hint, aldri en sikker påstand. */
  readonly uncertain: true;
}

/** Skriftsystemer med et entydig dominerende språk. Latinske bokstaver gir bevisst ingen treff. */
const SCRIPT_HINTS: readonly (readonly [RegExp, string])[] = [
  [/\p{Script=Hiragana}|\p{Script=Katakana}/u, "ja"], // i18n-ignore: BCP-47 language identifiers, not UI copy
  [/\p{Script=Hangul}/u, "ko"], // i18n-ignore: BCP-47 language identifiers, not UI copy
  [/\p{Script=Han}/u, "zh"], // i18n-ignore: BCP-47 language identifiers, not UI copy
  [/\p{Script=Arabic}/u, "ar"], // i18n-ignore: BCP-47 language identifiers, not UI copy
  [/\p{Script=Hebrew}/u, "he"], // i18n-ignore: BCP-47 language identifiers, not UI copy
  [/\p{Script=Devanagari}/u, "hi"], // i18n-ignore: BCP-47 language identifiers, not UI copy
  [/\p{Script=Thai}/u, "th"], // i18n-ignore: BCP-47 language identifiers, not UI copy
  [/\p{Script=Cyrillic}/u, "ru"], // i18n-ignore: BCP-47 language identifiers, not UI copy
  [/\p{Script=Greek}/u, "el"], // i18n-ignore: BCP-47 language identifiers, not UI copy
];

/** Språkhint fra skriftsystemet i teksten, eller null når skriften ikke skiller språk (latin). */
export function scriptLanguageHint(text: string): string | null {
  return SCRIPT_HINTS.find(([re]) => re.test(text))?.[1] ?? null;
}

/**
 * Foreslår språket for en importert fil. `metadataLanguage` er språket filen selv oppgir
 * (for eksempel w:lang i Word), `text` er et utdrag av innholdet og `projectSource` er
 * prosjektets kildespråk (siste utvei).
 */
export function suggestImportLanguage(
  text: string,
  metadataLanguage: string | null | undefined,
  projectSource: string,
): ImportLanguageSuggestion {
  const meta = metadataLanguage ? canonicalLanguageTag(metadataLanguage) : null;
  if (meta) return { language: meta, basis: "metadata", uncertain: true };
  const hint = scriptLanguageHint(text.slice(0, 4000));
  if (hint) return { language: hint, basis: "script", uncertain: true };
  return { language: normalizeLanguageTag(projectSource), basis: "project", uncertain: true };
}
