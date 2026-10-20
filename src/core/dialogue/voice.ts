import { normalizeLanguageTag } from "./languages";
/** DV4: live provider capabilities, separate speech language and immutable generation settings. */
import { L } from "../i18n";
import type { AssetVoice } from "../model";
import { languageTagError } from "./languages";

export interface SpeechModel {
  readonly modelId: string;
  readonly name: string;
  readonly languages: readonly { readonly code: string; readonly name: string }[];
  readonly maxCharacters: number | null;
  readonly costMultiplier: number | null;
}
export type SpeechSettings = Readonly<Record<string, number | boolean>>;
export function speechSettingsError(settings: unknown): string | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return L("Ugyldige stemmeinnstillinger", "Invalid voice settings");
  for (const [key, value] of Object.entries(settings)) {
    if (key === "use_speaker_boost" && typeof value === "boolean") continue;
    const bounds = key === "speed" ? [0.7, 1.2] : ["stability", "similarity_boost", "style"].includes(key) ? [0, 1] : null;
    if (!bounds || typeof value !== "number" || !Number.isFinite(value) || value < (bounds[0] ?? 0) || value > (bounds[1] ?? 1))
      return L("Ugyldige stemmeinnstillinger", "Invalid voice settings");
  }
  return null;
}
export function assetVoiceError(voice: AssetVoice | null): string | null {
  if (voice === null) return null;
  if (voice.provider !== "elevenlabs" || !/^[A-Za-z0-9_-]{1,64}$/.test(voice.voiceId) ||
      typeof voice.label !== "string" || voice.label.length > 120 ||
      (voice.modelId !== undefined && !/^[A-Za-z0-9_-]{1,100}$/.test(voice.modelId)) ||
      (voice.language !== undefined && languageTagError(voice.language)))
    return L("Ugyldig stemme", "Invalid voice");
  return voice.settings === undefined ? null : speechSettingsError(voice.settings);
}
/** DV6-rest: modellens språkkode for et BCP-47-valg («nb» ↔ leverandørens «no»); null når modellen ikke har språket. */
export function providerLanguageCode(model: SpeechModel, language: string): string | null {
  const want = normalizeLanguageTag(language);
  const exact = model.languages.find(l => l.code === language || normalizeLanguageTag(l.code) === want);
  if (exact) return exact.code;
  const primary = want.split("-")[0];
  return model.languages.find(l => normalizeLanguageTag(l.code) === primary)?.code ?? null;
}
export function speechLanguageError(model: SpeechModel, language: string): string | null {
  return providerLanguageCode(model, language) !== null ? null : L(
    "Modellen støtter ikke det valgte talespråket. Velg språk eller modell selv.",
    "The model does not support the selected speech language. Choose a language or model yourself.");
}