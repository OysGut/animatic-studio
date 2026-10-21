/**
 * Lagringsadapter (ADR-0003): leser prosjektrader fra Lovable Cloud (Supabase) og gjør dem om til domenetilstand.
 * Fungerer med både nettleserklienten (RLS – bare egne prosjekter) og serverens admin-klient.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { stateFromRows, type ProjectRows, type ProjectState, type Row } from "@/core";
import { t } from "@/core/i18n/keyed";

/** Skjemaversjonen denne koden forventer (db/migrations). Øk ved hver ny migrasjon. */
export const EXPECTED_SCHEMA_VERSION = 70;

const PAGE = 1000;

/** Stabil sortering for sidevis lesing. Ikke alle tabeller har kolonnen `id` (historikk har (block_id, rev)). */
export const ORDER_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  script_block_revisions: ["block_id", "rev"],
};

// Typene i src/integrations/supabase/types.ts genereres av Lovable etter at migrasjonen er kjørt.
// Til da brukes en utypet klient her.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyClient = SupabaseClient<any, any, any>;

async function fetchAll(db: AnyClient, table: string, projectId: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = db.from(table).select("*").eq("project_id", projectId);
    for (const col of ORDER_COLUMNS[table] ?? ["id"]) query = query.order(col);
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error)
      throw new Error(
        t("adapters-storage-project-rows.fetch-all.message.516b76fc3c7f", { table: String(table), message: String(error.message) }),
      );
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) return out;
  }
}

/** Tabeller fra en nyere migrasjon: mangler de (migrasjonen er ikke kjørt ennå), brukes en tom liste. */
async function fetchOptional(db: AnyClient, table: string, projectId: string): Promise<Row[]> {
  try {
    return await fetchAll(db, table, projectId);
  } catch (e) {
    if (/does not exist|schema cache|Could not find the table/i.test(String(e))) return [];
    throw e;
  }
}

/** Alle rader i en tabell for prosjektet (sidevis). `optional`: tabell som mangler, gir tom liste. */
export function fetchProjectTable(
  db: AnyClient,
  table: string,
  projectId: string,
  optional = true,
): Promise<Row[]> {
  return optional ? fetchOptional(db, table, projectId) : fetchAll(db, table, projectId);
}

export async function loadProjectRows(db: AnyClient, projectId: string): Promise<ProjectRows> {
  const { data: project, error } = await db
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (error)
    throw new Error(
      t("adapters-storage-project-rows.load-project-rows.message.390061ee2e9e", { message: String(error.message) }),
    );
  if (!project)
    throw new Error(
      t("adapters-storage-project-rows.load-project-rows.message.e88457a4b9f7"),
    );
  const [
    productions,
    scenes,
    variants,
    blocks,
    revisions,
    occurrences,
    segments,
    takes,
    assets,
    assetVariants,
    assetVersions,
    annotations,
    compositions,
    compositionLayers,
    audioClips,
    clipParts,
    timeLinks,
    generationPrompts,
    continuityEvents,
    translations,
    assetRelations,
    posters,
    styleProfiles,
    storyProfiles,
    storyProfileStages,
    storyFacts,
    canvasNodes,
    canvasEdges,
    templateInstances,
    creditParticipants,
    creditSequences, animationRigs, animationRigVersions, animationUses, lipsyncResults, animationPatterns, dialogueVersions, dialogueReviews, noteFlags, qualityProfiles, translationLineLinks, translationLines, styleHarmonizations, stylePreferredReferences, languageVersions,
  ] = await Promise.all([
    fetchAll(db, "productions", projectId),
    fetchAll(db, "scenes", projectId),
    fetchAll(db, "scene_variants", projectId),
    fetchAll(db, "script_blocks", projectId),
    fetchAll(db, "script_block_revisions", projectId),
    fetchAll(db, "scene_occurrences", projectId),
    fetchAll(db, "production_segments", projectId),
    fetchAll(db, "takes", projectId),
    fetchOptional(db, "assets", projectId),
    fetchOptional(db, "asset_variants", projectId),
    fetchOptional(db, "asset_versions", projectId),
    fetchOptional(db, "script_annotations", projectId),
    fetchOptional(db, "compositions", projectId),
    fetchOptional(db, "composition_layers", projectId),
    fetchOptional(db, "audio_clips", projectId),
    fetchOptional(db, "clip_parts", projectId),
    fetchOptional(db, "time_links", projectId),
    fetchOptional(db, "generation_prompts", projectId),
    fetchOptional(db, "continuity_events", projectId),
    fetchOptional(db, "translations", projectId),
    fetchOptional(db, "asset_relations", projectId),
    fetchOptional(db, "posters", projectId),
    fetchOptional(db, "style_profiles", projectId),
    fetchOptional(db, "story_profiles", projectId),
    fetchOptional(db, "story_profile_stages", projectId),
    fetchOptional(db, "story_facts", projectId),
    fetchOptional(db, "story_canvas_nodes", projectId),
    fetchOptional(db, "story_canvas_edges", projectId),
    fetchOptional(db, "template_instances", projectId),
    fetchOptional(db, "credit_participants", projectId),
    fetchOptional(db, "credit_sequences", projectId),
    fetchOptional(db, "animation_rigs", projectId),
    fetchOptional(db, "animation_rig_versions", projectId),
    fetchOptional(db, "animation_uses", projectId),
    fetchOptional(db, "lipsync_results", projectId),
    fetchOptional(db, "animation_patterns", projectId),
    fetchOptional(db, "dialogue_versions", projectId),
    fetchOptional(db, "dialogue_reviews", projectId),
    fetchOptional(db, "note_flags", projectId),
    fetchOptional(db, "quality_profiles", projectId),
    fetchOptional(db, "translation_line_links", projectId),
    fetchOptional(db, "translation_lines", projectId),
    fetchOptional(db, "style_harmonizations", projectId),
    fetchOptional(db, "style_preferred_references", projectId),
    fetchOptional(db, "language_versions", projectId),
  ]);
  return {
    project: project as Row,
    productions,
    scenes,
    scene_variants: variants,
    script_blocks: blocks,
    script_block_revisions: revisions,
    scene_occurrences: occurrences,
    production_segments: segments,
    takes,
    assets,
    asset_variants: assetVariants,
    asset_versions: assetVersions,
    script_annotations: annotations,
    compositions,
    composition_layers: compositionLayers,
    audio_clips: audioClips,
    clip_parts: clipParts,
    time_links: timeLinks,
    generation_prompts: generationPrompts,
    continuity_events: continuityEvents,
    translations,
    asset_relations: assetRelations,
    posters,
    style_profiles: styleProfiles,
    story_profiles: storyProfiles,
    story_profile_stages: storyProfileStages,
    story_facts: storyFacts,
    story_canvas_nodes: canvasNodes,
    story_canvas_edges: canvasEdges,
    template_instances: templateInstances,
    credit_participants: creditParticipants,
    credit_sequences: creditSequences,
    animation_rigs: animationRigs, animation_rig_versions: animationRigVersions, animation_uses: animationUses,
    lipsync_results: lipsyncResults, animation_patterns: animationPatterns,
    dialogue_versions: dialogueVersions,
    dialogue_reviews: dialogueReviews,
    note_flags: noteFlags,
    quality_profiles: qualityProfiles,
    translation_line_links: translationLineLinks,
    translation_lines: translationLines,
    style_harmonizations: styleHarmonizations,
    style_preferred_references: stylePreferredReferences,
    language_versions: languageVersions,
  };
}

export async function loadProjectState(db: AnyClient, projectId: string): Promise<ProjectState> {
  return stateFromRows(await loadProjectRows(db, projectId));
}

export type SchemaStatus =
  | { readonly kind: "ok"; readonly version: number }
  | { readonly kind: "outdated"; readonly version: number; readonly expected: number }
  | { readonly kind: "missing" };

/** Er databasemigrasjonene kjørt i Lovable Cloud? (KI-04) */
export async function checkSchema(db: AnyClient): Promise<SchemaStatus> {
  const { data, error } = await db
    .from("schema_version")
    .select("version")
    .order("version", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return { kind: "missing" };
  const version = Number((data[0] as { version: number }).version);
  return version >= EXPECTED_SCHEMA_VERSION
    ? { kind: "ok", version }
    : { kind: "outdated", version, expected: EXPECTED_SCHEMA_VERSION };
}
