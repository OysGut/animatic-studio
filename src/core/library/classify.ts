import { L } from "../i18n";
import { ANIMAL_VERBS, LIVING_VERBS, LEXICON_FORMS, type EntityKind } from "./lexicon";

export type Confidence = "high" | "medium" | "low";
export interface EntityClassification { kind: EntityKind; confidence: Confidence; evidence: string }
export interface ClassificationCandidate { name: string; speaker?: boolean; heading?: boolean; contexts?: readonly string[] }
const words = (s: string): string[] => s.toLocaleLowerCase("nb").match(/[\p{L}]+/gu) ?? [];
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
  if (animalDescription) return result("animal", "high", L("Dyrenavn eller dyrebeskrivelse ved navnet", "Animal name or animal description beside the name"));
  if (candidate.speaker) return result("character", "high", L("Har replikk i manuset", "Has dialogue in the script"));
  if (candidate.heading) return result(direct?.kind === "environment" ? "environment" : "location", "high", L("Står i sceneoverskriften", "Appears in the scene heading"));
  if (nearby.some((ws) => ws.some((w) => ANIMAL_VERBS.includes(w)))) return result("animal", "medium", L("Navnet står ved et dyreverb", "The name appears beside an animal verb"));
  if (contexts.some((t) => /(?:lyden av|lyden frå|vi hører|vi høyrer|sound of|we hear)\s+/iu.test(t) && words(t).some((w) => nameWords.includes(w)))) return result("sound", "medium", L("Omtales som noe vi hører", "Described as something we hear"));
  if (direct) return result(direct.kind, "high", L("Gjenkjent i leksikonet", "Recognized in the lexicon"));
  if (nearby.some((ws) => ws.some((w) => LIVING_VERBS.includes(w)))) return result("character", "medium", L("Navnet står ved et verb for et levende vesen", "The name appears beside a verb for a living being"));
  return result("object", "low", L("Navn uten tydelig typesignal – må vurderes", "Name without a clear type signal – needs review"));
}