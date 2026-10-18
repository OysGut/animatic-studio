/** Presentation grouping for the existing screenplay search, not a separate search engine. */
import { assetNames } from "../library";
import { matchingScenes } from "../assembly/status";
import { annotationsOfVariant, searchHits, type HitKind } from "../notes";
import { blocksOfVariant, orderedOccurrences, sceneNumberOf } from "../views";
import type { ProjectState } from "../model";
import { characterName, matchingOccurrences, mentions, sceneMentions, sceneSpeakers, type SceneFilter } from "./filter";
import { formatHeading } from "./paginate";

export interface ExplorerHit {
  readonly occurrenceId: string;
  readonly blockId: string | null;
  readonly kind: HitKind;
  readonly text: string;
  readonly query: string;
}
export interface ExplorerGroup {
  readonly occurrenceId: string;
  readonly heading: string;
  readonly number: string | null;
  readonly role: "participates" | "mentioned" | null;
  readonly hits: readonly ExplorerHit[];
}
export function explorerContext(state: ProjectState, occurrenceId: string, blockId: string | null) {
  const occurrence = state.occurrences[occurrenceId];
  if (!occurrence) return [];
  const blocks = blocksOfVariant(state, occurrence.variantId);
  const index = blockId ? blocks.findIndex((b) => b.id === blockId) : 0;
  return index < 0 ? [] : blocks.slice(Math.max(0, index - 2), index + 3);
}
export function explorerGroups(state: ProjectState, productionId: string, filter: SceneFilter, kind?: "dialogue" | "heading"): ExplorerGroup[] {
  const query = filter.text?.trim() ?? "";
  const lower = query.toLocaleLowerCase("nb");
  const asset = filter.assetId ? state.assets[filter.assetId] : undefined;
  const names = asset ? assetNames(asset) : filter.characterNames ?? (filter.character ? [filter.character] : []);
  // Character mentions include other speakers' dialogue, while the legacy character filter also
  // supplies the action/heading matches. Library resource matching remains authoritative.
  const candidates = matchingOccurrences(state, productionId, { text: query });
  const library = asset ? matchingScenes(state, productionId, { assetId: asset.id }) : null;
  const existingHits = searchHits(state, productionId, query);
  const out: ExplorerGroup[] = [];
  for (const occurrence of orderedOccurrences(state, productionId).filter((o) => o.active)) {
    if (!candidates.has(occurrence.id)) continue;
    const variant = state.variants[occurrence.variantId];
    if (!variant) continue;
    const blocks = blocksOfVariant(state, variant.id);
    const participates = names.some((name) => sceneSpeakers(state, variant.id).has(characterName(name)));
    const mentioned = names.some((name) => sceneMentions(state, variant.id, characterName(name)) ||
      blocks.some((b) => b.kind !== "character" && mentions(b.text, characterName(name))));
    if (filter.character && !participates && !mentioned) continue;
    if (asset && !library?.has(occurrence.id) && !mentioned && !participates &&
      !names.some((name) => [formatHeading(variant.heading), ...blocks.map((b) => b.text)].some((text) => text.toLocaleLowerCase("nb").includes(name.toLocaleLowerCase("nb"))))) continue;
    const kinds = existingHits.get(occurrence.id) ?? [];
    if (query && kind && !kinds.includes(kind)) continue;
    const heading = formatHeading(variant.heading);
    const hits: ExplorerHit[] = [];
    const add = (blockId: string | null, hitKind: HitKind, text: string, term: string) => hits.push({ occurrenceId: occurrence.id, blockId, kind: hitKind, text, query: term });
    if ((!kind || kind === "heading") && (query ? heading.toLocaleLowerCase("nb").includes(lower) : !names.length || names.some((name) => heading.toLocaleLowerCase("nb").includes(name.toLocaleLowerCase("nb"))))) add(null, "heading", heading, query || names.find((name) => heading.toLocaleLowerCase("nb").includes(name.toLocaleLowerCase("nb"))) || "");
    for (const block of blocks) {
      if (kind && block.kind !== kind) continue;
      const term = query || names.find((name) => block.text.toLocaleLowerCase("nb").includes(name.toLocaleLowerCase("nb"))) || "";
      if (!term || !block.text.toLocaleLowerCase("nb").includes(term.toLocaleLowerCase("nb"))) continue;
      const hitKind: HitKind = block.kind === "action" || block.kind === "dialogue" || block.kind === "character" || block.kind === "parenthetical" || block.kind === "transition" ? block.kind : "other";
      add(block.id, hitKind, block.text, term);
    }
    if (query && !kind) {
      for (const note of annotationsOfVariant(state, variant.id)) if (note.text.toLocaleLowerCase("nb").includes(lower)) add(note.blockId, "note", note.text, query);
      if ((occurrence.productionNumber ?? "").includes(query)) add(null, "number", occurrence.productionNumber ?? "", query);
    }
    if (!hits.length && !query) add(null, "heading", heading, "");
    if (hits.length) out.push({ occurrenceId: occurrence.id, heading, number: sceneNumberOf(state, occurrence), role: filter.character ? participates ? "participates" : "mentioned" : null, hits });
  }
  return out;
}