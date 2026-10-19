/** DV6: language preferences are independent from UI locale and recorded audio. */
import type { ProjectState } from "../model";
import { L } from "../i18n";

export function languageTagError(value: string): string | null {
  try {
    if (!value || value.length > 100 || Intl.getCanonicalLocales(value).length !== 1) throw new Error();
    return null;
  } catch { return L("Ugyldig BCP-47-språkkode.", "Invalid BCP-47 language tag."); }
}
export function scriptLanguageOf(s: ProjectState, blockId: string): string {
  const b = s.blocks[blockId];
  return b?.scriptLanguage ?? s.variants[b?.variantId ?? ""]?.scriptLanguage ?? s.project.scriptLanguage ?? s.project.primaryLanguage;
}
export function speechLanguageOf(s: ProjectState, occurrenceId: string, blockId: string, characterId: string | null, generation?: string): string {
  const clip = Object.values(s.audioClips).find(c => !c.removed && c.occurrenceId === occurrenceId && c.blockId === blockId);
  return generation ?? clip?.speechLanguage ?? s.blocks[blockId]?.speechLanguage ?? (characterId ? s.assets[characterId]?.voice?.language : undefined) ?? "no";
}
/** Canonical comparison retains scripts without whitespace and combining accents. */
export function unicodeTextParts(text: string, language = "und"): string[] {
  const normalized = text.normalize("NFC");
  return [...new Intl.Segmenter(language, { granularity: "word" }).segment(normalized)]
    .filter(p => p.isWordLike).map(p => p.segment.toLocaleLowerCase(language === "und" ? undefined : language));
}
export function detectDialogueLanguage(text: string, declared: string) {
  const tests: readonly [RegExp, string][] = [[/\p{Script=Hiragana}|\p{Script=Katakana}/u, "ja"], [/\p{Script=Han}/u, "zh"], [/\p{Script=Hangul}/u, "ko"], [/\p{Script=Arabic}/u, "ar"], [/\p{Script=Cyrillic}/u, "ru"], [/\p{Script=Devanagari}/u, "hi"]];
  // Script is a hint, never certainty about the spoken language.
  const hint = tests.find(([re]) => re.test(text));
  return { language: hint?.[1] ?? declared, declared, uncertain: true };
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
export const existingSpeechWarning = () => L(
  "Noen av de valgte scenene har allerede innspilt eller generert tale. Nye lydfiler blir lagt til som alternative versjoner og settes som aktive for de aktuelle replikkene. Ingen eksisterende lydfiler eller redigeringer blir slettet. Du kan senere velge tilbake en tidligere versjon.",
  "Some of the selected scenes already have recorded or generated speech. New audio files will be added as alternative versions and made active for the selected lines. No existing audio files or edits will be deleted. You can choose a previous version again later.");
export const multilingualSpeechWarning = () => L(
  "Denne karakteren har replikker på flere språk. Kontroller hvilket språk som skal brukes før du genererer tale.",
  "This character has lines in several languages. Check which language to use before generating speech.");