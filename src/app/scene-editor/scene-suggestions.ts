/**
 * Navn fra manuset i én scene som ikke finnes i biblioteket (KI-49): forslagene fra `librarySuggestions`
 * (samme som «Forslag fra manuset» i biblioteket) som opptrer i scenen. En scene regnes med når forslaget
 * forekommer i færre scener (eller forsvinner) uten den – så samme regler og sammenslåinger gjelder.
 */
import { librarySuggestions, type LibrarySuggestion, type ProjectState } from "@/core";
import { analysisScenes, mergeAnalysis, type StoredSceneAnalysis } from "@/core/library/analysis-hash";

const id = (x: LibrarySuggestion) => `${x.kind}|${x.reason}|${x.name}`;

export function sceneSuggestions(
  state: ProjectState,
  productionId: string,
  occurrenceId: string,
  all: readonly LibrarySuggestion[] = librarySuggestions(state, productionId),
  stored: readonly StoredSceneAnalysis[] = [],
): LibrarySuggestion[] {
  const occ = state.occurrences[occurrenceId];
  if (!occ || occ.productionId !== productionId || all.length === 0) return [];
  const rest = { ...state.occurrences };
  delete rest[occurrenceId];
  const without = librarySuggestions({ ...state, occurrences: rest }, productionId);
  const scenesWithout = new Map(without.map((x) => [id(x), x.scenes]));
  // Determine scene membership before applying AI types: the lexical identity includes the kind.
  const local = all.filter((x) => (scenesWithout.get(id(x)) ?? 0) < x.scenes);
  const ai = mergeAnalysis(local, stored, analysisScenes(state, productionId));
  return local.map((x) => {
    const hit = ai[x.name];
    return hit ? {
      ...x,
      kind: hit.kind,
      confidence: hit.confidence,
      evidence: hit.reason,
      uncertain: hit.confidence !== "high",
      kindUncertain: hit.confidence !== "high",
    } : x;
  });
}
