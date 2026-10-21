/**
 * Story Lab (SL1): fakta og hemmeligheter, og hva en karakter vet på et tidspunkt.
 * Tidspunktet er FORTELLINGSTID (samme ordning som kontinuiteten, storyTimesCached), ikke rekkefølgen i filmen:
 * et tilbakeblikk som kommer sent i filmen, kjenner ikke til det som skjer senere i fortellingen.
 */

import type { AssetId, SceneId } from "../ids";
import type { ProjectState, StoryFact, StoryFactKind, StoryFactKnower } from "../model";
import { storyTimesCached } from "../continuity";
import { t as tk } from "@/core/i18n/keyed";

export const MAX_FACT_CHARS = 4000;
export const MAX_FACT_KNOWERS = 50;

export interface StoryFactFields {
  readonly text: string;
  readonly kind: StoryFactKind;
  readonly atSceneId: SceneId | null;
  readonly knownBy: readonly StoryFactKnower[];
}

/** Formkontroll (referansene kontrolleres i kommandoene). */
export function factError(f: unknown): string | null {
  if (!f || typeof f !== "object") return tk("core-storylab-facts.fact-error.message.4290c084fed9");
  const x = f as Record<string, unknown>;
  if (typeof x["text"] !== "string" || !x["text"].trim())
    return tk("core-storylab-facts.fact-error.message.43505969a727");
  if (x["text"].length > MAX_FACT_CHARS) return tk("core-storylab-facts.fact-error.message.3a501081a5a9");
  if (x["kind"] !== "fact" && x["kind"] !== "secret")
    return tk("core-storylab-facts.fact-error.message.ba38d4b33896");
  if (x["atSceneId"] !== null && typeof x["atSceneId"] !== "string")
    return tk("core-storylab-facts.fact-error.message.6d025d417478");
  const k = x["knownBy"];
  if (!Array.isArray(k) || k.length > MAX_FACT_KNOWERS)
    return tk("core-storylab-facts.fact-error.message.cc2906b15f7d");
  const seen = new Set<string>();
  for (const w of k as unknown[]) {
    const o = w as Record<string, unknown> | null;
    if (
      !o ||
      typeof o["assetId"] !== "string" ||
      (o["fromSceneId"] !== null && typeof o["fromSceneId"] !== "string")
    )
      return tk("core-storylab-facts.fact-error.message.cc2906b15f7d.2");
    if (seen.has(o["assetId"]))
      return tk("core-storylab-facts.fact-error.message.40d66c6d8444");
    seen.add(o["assetId"]);
  }
  return null;
}

/** Fortellingstiden for en scene; ukjent scene = `fallback`. */
export function storyTimeOf(s: ProjectState, sceneId: string | null, fallback: number): number {
  if (sceneId === null) return Number.NEGATIVE_INFINITY;
  return storyTimesCached(s).get(sceneId) ?? fallback;
}

/** Har faktumet skjedd ved tidspunktet T? */
function happened(s: ProjectState, f: StoryFact, t: number): boolean {
  return storyTimeOf(s, f.atSceneId, Number.POSITIVE_INFINITY) <= t;
}

/** Vet karakteren om faktumet ved tidspunktet T? */
export function knowsAt(s: ProjectState, f: StoryFact, assetId: string, t: number): boolean {
  if (f.removed || !happened(s, f, t)) return false;
  const k = f.knownBy.find((w) => w.assetId === assetId);
  return !!k && storyTimeOf(s, k.fromSceneId, Number.POSITIVE_INFINITY) <= t;
}

/**
 * Det karakteren vet i scenen (fortellingstid): vanlige fakta og egne hemmeligheter for seg. Fakta uten
 * `knownBy` (bare regissøren vet) og alt som skjer senere i fortellingen, er aldri med.
 */
export function knowledgeAt(
  s: ProjectState,
  assetId: AssetId | string,
  sceneId: SceneId | string,
): { readonly facts: StoryFact[]; readonly ownSecrets: StoryFact[] } {
  const t = storyTimeOf(s, sceneId, Number.NEGATIVE_INFINITY);
  const known = Object.values(s.storyFacts)
    .filter((f) => knowsAt(s, f, assetId, t))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    facts: known.filter((f) => f.kind === "fact"),
    ownSecrets: known.filter((f) => f.kind === "secret"),
  };
}

/** Alle fakta som har skjedd ved scenen (for regissøren og analysen), uansett hvem som vet. */
export function factsUntil(s: ProjectState, sceneId: SceneId | string | null): StoryFact[] {
  const t =
    sceneId === null ? Number.POSITIVE_INFINITY : storyTimeOf(s, sceneId, Number.NEGATIVE_INFINITY);
  return Object.values(s.storyFacts)
    .filter((f) => !f.removed && happened(s, f, t))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
