/** DV6: language preferences are independent from UI locale and recorded audio. */
import type { ProjectState } from "../model";
import { locale } from "../i18n";
import { t } from "@/core/i18n/keyed";

/** Standard talespråk når ingenting er valgt: norsk bokmål. */
export const DEFAULT_SPEECH_LANGUAGE = "nb";
/**
 * Konsekvente BCP-47-koder: makrospråket «no» (lagret i eldre data) vises og sammenlignes som «nb».
 * Andre koder kanoniseres (f.eks. «EN-us» → «en-US»). Ugyldige koder returneres uendret.
 */
export function normalizeLanguageTag(value: string): string {
  try {
    const [tag] = Intl.getCanonicalLocales(value);
    if (!tag) return value;
    return tag === "no" ? "nb" : tag.startsWith("no-") ? "nb" + tag.slice(2) : tag;
  } catch { return value; }
}
/** Språkets navn på brukerens språk, med koden i parentes: «norsk bokmål (nb)». */
export function languageLabel(tag: string, ui: string = locale()): string {
  const code = normalizeLanguageTag(tag);
  try {
    const name = new Intl.DisplayNames([ui.toLowerCase().startsWith("en") ? "en" : "nb"], { type: "language" }).of(code);
    return name && name !== code ? `${name} (${code})` : code;
  } catch { return code; }
}

export function languageTagError(value: string): string | null {
  try {
    if (!value || value.length > 100 || Intl.getCanonicalLocales(value).length !== 1) throw new Error();
    return null;
  } catch { return t("core-dialogue-languages.language-tag-error.message.3028cba16405"); }
}
/**
 * Intern lagringsnøkkel for kildeteksten (manusblokkene). Nøkkelen betyr «kilden», ikke «norsk»: manuset kan
 * være skrevet på et hvilket som helst språk. Vis aldri denne verdien som språknavn – bruk sourceLanguageOf.
 */
export const SOURCE_TEXT_KEY = "nb";
/** Manusets språk, det vil si kildespråket for alle språkversjoner (aldri fast norsk). */
export function sourceLanguageOf(s: Pick<ProjectState, "project">): string {
  return normalizeLanguageTag(s.project?.scriptLanguage || s.project?.primaryLanguage || "nb");
}
/** Er språket kilden? Den interne nøkkelen SOURCE_TEXT_KEY og manusets eget språk betyr begge kilden. */
export function isSourceLanguage(s: Pick<ProjectState, "project">, tag: string): boolean {
  if (tag === SOURCE_TEXT_KEY) return true;
  return normalizeLanguageTag(tag).toLowerCase() === sourceLanguageOf(s).toLowerCase();
}
export function scriptLanguageOf(s: ProjectState, blockId: string): string {
  const b = s.blocks[blockId];
  return normalizeLanguageTag(b?.scriptLanguage ?? s.variants[b?.variantId ?? ""]?.scriptLanguage ?? s.project.scriptLanguage ?? s.project.primaryLanguage);
}
export function speechLanguageOf(s: ProjectState, occurrenceId: string, blockId: string, characterId: string | null, generation?: string): string {
  const clip = Object.values(s.audioClips).find(c => !c.removed && c.occurrenceId === occurrenceId && c.blockId === blockId);
  return normalizeLanguageTag(generation ?? clip?.speechLanguage ?? s.blocks[blockId]?.speechLanguage ?? (characterId ? s.assets[characterId]?.voice?.language : undefined) ?? DEFAULT_SPEECH_LANGUAGE);
}
/** Canonical comparison retains scripts without whitespace and combining accents. */
export function unicodeTextParts(text: string, language = "und"): string[] {
  const normalized = text.normalize("NFC");
  return [...new Intl.Segmenter(language, { granularity: "word" }).segment(normalized)]
    .filter(p => p.isWordLike).map(p => p.segment.toLocaleLowerCase(language === "und" ? undefined : language));
}
export function detectDialogueLanguage(text: string, declared: string) {
  const tests: readonly [RegExp, string][] = [[/\p{Script=Hiragana}|\p{Script=Katakana}/u, "ja"], [/\p{Script=Han}/u, "zh"], [/\p{Script=Hangul}/u, "ko"], [/\p{Script=Arabic}/u, "ar"], [/\p{Script=Cyrillic}/u, "ru"], [/\p{Script=Devanagari}/u, "hi"]]; // i18n-ignore: BCP-47 language identifiers, not UI copy
  // Script is a hint, never certainty about the spoken language.
  const hint = tests.find(([re]) => re.test(text));
  const base = normalizeLanguageTag(declared);
  return { language: hint?.[1] ?? base, declared: base, uncertain: true };
}
export function unicodeSentences(text: string, language = "und"): string[] {
  return [...new Intl.Segmenter(language, { granularity: "sentence" }).segment(text.normalize("NFC"))].map(s => s.segment.trim()).filter(Boolean);
}
/** A planning range, not a provider promise: includes sequential request overhead and text volume. */
export function batchTimeEstimate(lines: readonly { text: string }[]) {
  if (!lines.length) return null;
  const characters = lines.reduce((n,l) => n + [...l.text].length, 0);
  return { minSeconds: Math.ceil(lines.length * 2 + characters / 250), maxSeconds: Math.ceil(lines.length * 20 + characters / 25), uncertain: true };
}
export const existingSpeechWarning = () => t("core-dialogue-languages.existing-speech-warning.message.9a2fb570e056");
export const multilingualSpeechWarning = () => t("core-dialogue-languages.multilingual-speech-warning.message.1d1ded01f164");