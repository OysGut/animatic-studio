
import { ANIMAL_VERBS, LIVING_VERBS, LEXICON_FORMS, type EntityKind } from "./lexicon";
import { t as tk } from "@/core/i18n/keyed";

export type Confidence = "high" | "medium" | "low";
export interface EntityClassification { kind: EntityKind; confidence: Confidence; evidence: string }
export interface ClassificationCandidate { name: string; speaker?: boolean; heading?: boolean; contexts?: readonly string[] }
const words = (s: string): string[] => s.toLocaleLowerCase("und").match(/[\p{L}]+/gu) ?? [];
export function classifySuggestion(candidate: ClassificationCandidate): EntityClassification {
  const result = (kind: EntityKind, confidence: Confidence, evidence: string): EntityClassification => ({ kind, confidence, evidence });
  const nameWords = words(candidate.name);
  const direct = nameWords.map((w) => LEXICON_FORMS.get(w)).find(Boolean);
  const contexts = candidate.contexts ?? [];
  // Associate descriptions with the candidate, not every animal in the scene.
  const nearby = contexts.flatMap((text) => {
    const tokens = words(text);
    return tokens.flatMap((w, i) => nameWords.includes(w) ? [tokens.slice(Math.max(0, i - 4), i + 4)] : []);
  });
  const animalDescription = direct?.kind === "animal" || nearby.some((ws) => ws.some((w) => LEXICON_FORMS.get(w)?.kind === "animal"));
  if (animalDescription) return result("animal", "high", tk("core-library-classify.classify-suggestion.result.d0552e022141"));
  if (candidate.speaker) return result("character", "high", tk("core-library-classify.classify-suggestion.result.a2afa1939e0b"));
  if (candidate.heading) return result(direct?.kind === "environment" ? "environment" : "location", "high", tk("core-library-classify.classify-suggestion.result.9d5240d52568"));
  if (nearby.some((ws) => ws.some((w) => ANIMAL_VERBS.includes(w)))) return result("animal", "medium", tk("core-library-classify.classify-suggestion.result.fdc3ef35926b"));
  if (contexts.some((t) => /(?:lyden av|lyden frå|vi hører|vi høyrer|sound of|we hear)\s+/iu.test(t) && words(t).some((w) => nameWords.includes(w)))) return result("sound", "medium", tk("core-library-classify.classify-suggestion.result.cb7245b6d1b7"));
  if (direct) return result(direct.kind, "high", tk("core-library-classify.classify-suggestion.result.2046dfa25053"));
  if (nearby.some((ws) => ws.some((w) => LIVING_VERBS.includes(w)))) return result("character", "medium", tk("core-library-classify.classify-suggestion.result.9236eaa34df5"));
  return result("object", "low", tk("core-library-classify.classify-suggestion.result.225fca15e26d"));
}