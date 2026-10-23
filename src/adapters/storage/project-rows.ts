/**
 * Lagringsadapter (ADR-0003): leser prosjektrader fra Lovable Cloud (Supabase) og gjør dem om til domenetilstand.
 * Fungerer med både nettleserklienten (RLS – bare egne prosjekter) og serverens admin-klient.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { stateFromRows, type ProjectRows, type ProjectState, type Row } from "@/core";
import { t } from "@/core/i18n/keyed";

/** Skjemaversjonen denne koden forventer (db/migrations). Øk ved hver ny migrasjon. */
export const EXPECTED_SCHEMA_VERSION = 93;

const PAGE = 1000;

/** Stabil sortering for sidevis lesing. Ikke alle tabeller har kolonnen `id` (historikk har (block_id, rev)). */
export const ORDER_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  script_block_revisions: ["block_id", "rev"],
};

// Typene i src/integrations/supabase/types.ts genereres av Lovable etter at migrasjonen er kjørt.
// Til da brukes en utypet klient her.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyClient = SupabaseClient<any, any, any>;

/**
 * G-2 (A1): sidevis lesing med keyset (id > siste id, ordnet på id; indeks (project_id, id) fra 0093) i stedet
 * for OFFSET, som måtte lese og kaste alle tidligere sider på nytt for hver side.
 */
async function fetchAll(db: AnyClient, table: string, projectId: string): Promise<Row[]> {
  const out: Row[] = [];
  const cols = ORDER_COLUMNS[table] ?? ["id"];
  let last: Row | null = null;
  for (;;) {
    let query = db.from(table).select("*").eq("project_id", projectId);
    if (last) {
      if (cols.length === 1) query = query.gt(cols[0]!, String(last[cols[0]!]));
      else {
        const [a, b] = [cols[0]!, cols[1]!];
        query = query.or(`${a}.gt.${String(last[a])},and(${a}.eq.${String(last[a])},${b}.gt.${String(last[b])})`);
      }
    }
    for (const col of cols) query = query.order(col);
    const { data, error } = await query.limit(PAGE);
    if (error)
      throw new Error(
        t("adapters-storage-project-rows.fetch-all.message.516b76fc3c7f", { table: String(table), message: String(error.message) }),
      );
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
    last = rows[rows.length - 1]!;
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

/** Tabellene i øyeblikksbildet (samme som project_snapshot i 0093 og listen under). */
export const SNAPSHOT_TABLES = [
  "productions", "scenes", "scene_variants", "script_blocks", "script_block_revisions", "scene_occurrences",
  "production_segments", "takes", "assets", "asset_variants", "asset_versions", "script_annotations", "compositions",
  "composition_layers", "audio_clips", "clip_parts", "time_links", "generation_prompts", "continuity_events",
  "translations", "asset_relations", "posters", "style_profiles", "story_profiles", "story_profile_stages",
  "story_facts", "story_canvas_nodes", "story_canvas_edges", "template_instances", "credit_participants",
  "credit_sequences", "animation_rigs", "animation_rig_versions", "animation_uses", "lipsync_results",
  "animation_patterns", "dialogue_versions", "dialogue_reviews", "note_flags", "quality_profiles",
  "translation_line_links", "translation_lines", "style_harmonizations", "style_preferred_references",
  "language_versions", "rig_templates", "rig_setups", "measure_sets", "print_jobs", "print_job_elements",
  "mouth_sets", "mouth_tracks",
] as const;

export interface LoadOptions {
  /** «current»: bare gjeldende revisjon per blokk (rask åpning); full historikk hentes etterpå. Standard: full. */
  readonly history?: "full" | "current";
}

export interface ProjectSnapshot {
  readonly rows: ProjectRows;
  /** Siste project_seq i kommandologgen som tilstanden bygger på; null når det ikke kan vites sikkert. */
  readonly logSeq: number | null;
  /** Hvordan prosjektet ble lest (til måling og logg). */
  readonly via: "snapshot" | "pages";
}

/** Lyktes ikke RPC-en fordi den ikke finnes ennå (0093 ikke kjørt)? */
function missingFunction(message: string): boolean {
  return /project_snapshot|Could not find the function|does not exist|schema cache/i.test(message);
}

/**
 * Prosjektet i ett kall (project_snapshot, 0093): alle kjernetabellene og log_seq fra samme øyeblikk. Faller
 * tilbake på sidevis lesing når funksjonen mangler eller kallet feiler (for eksempel tidsavbrudd).
 */
export async function loadProjectSnapshot(db: AnyClient, projectId: string, opts: LoadOptions = {}): Promise<ProjectSnapshot> {
  const full = opts.history !== "current";
  const { data, error } = await db.rpc("project_snapshot", { p_project: projectId, p_full_history: full });
  if (!error && data && typeof data === "object") {
    const snap = data as { project: Row | null; log_seq: number; history: string; tables: Record<string, Row[]>[] };
    if (!snap.project)
      throw new Error(t("adapters-storage-project-rows.load-project-rows.message.e88457a4b9f7"));
    const tables = Object.assign({}, ...snap.tables) as Record<string, Row[]>;
    const rows = Object.fromEntries(SNAPSHOT_TABLES.map((name) => [name, tables[name] ?? []])) as unknown as ProjectRows;
    return {
      rows: { ...rows, project: snap.project, ...(snap.history === "current" ? { history_partial: true } : {}) },
      logSeq: Number(snap.log_seq),
      via: "snapshot",
    };
  }
  if (error && !missingFunction(error.message)) console.warn("[project-snapshot] reserve: sidevis lesing", error.code); // i18n-ignore: logg
  // Reserve: sidevis. log_seq leses før og etter; er de like, bygger radene på akkurat den loggposisjonen.
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await fetchLogSeq(db, projectId);
    const rows = await loadProjectRows(db, projectId);
    const after = await fetchLogSeq(db, projectId);
    if (before !== null && before === after) return { rows, logSeq: before, via: "pages" };
    if (before === null || after === null) return { rows, logSeq: null, via: "pages" };
  }
  return { rows: await loadProjectRows(db, projectId), logSeq: null, via: "pages" };
}

/** Siste project_seq i kommandologgen (null før 0093). */
export async function fetchLogSeq(db: AnyClient, projectId: string): Promise<number | null> {
  const { data, error } = await db
    .from("change_log")
    .select("project_seq")
    .eq("project_id", projectId)
    .order("project_seq", { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) return null;
  const v = (data?.[0] as { project_seq?: number | null } | undefined)?.project_seq;
  return data && data.length === 0 ? 0 : typeof v === "number" ? v : null;
}

/** Loggradene etter `after` (project_seq), i rekkefølge. Brukes til å tette hull i sanntidsvarslene. */
export async function fetchChangeLogAfter(db: AnyClient, projectId: string, after: number, limit = 500): Promise<Row[]> {
  const { data, error } = await db
    .from("change_log")
    .select("id, project_seq, actor, created_at, command, affected_ids")
    .eq("project_id", projectId)
    .gt("project_seq", after)
    .order("project_seq")
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
}

/** Full teksthistorikk (script_block_revisions), sidevis med keyset på (block_id, rev). */
export function fetchBlockHistoryRows(db: AnyClient, projectId: string): Promise<Row[]> {
  return fetchAll(db, "script_block_revisions", projectId);
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
    rigTemplates, rigSetups, measureSets, printJobs, printJobElements,
    mouthSets, mouthTracks,
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
    fetchOptional(db, "rig_templates", projectId),
    fetchOptional(db, "rig_setups", projectId),
    fetchOptional(db, "measure_sets", projectId),
    fetchOptional(db, "print_jobs", projectId),
    fetchOptional(db, "print_job_elements", projectId),
    fetchOptional(db, "mouth_sets", projectId),
    fetchOptional(db, "mouth_tracks", projectId),
  ]);
  return {
    project: project as Row,
    mouth_sets: mouthSets, mouth_tracks: mouthTracks,
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
    measure_sets: measureSets,
    print_jobs: printJobs,
    print_job_elements: printJobElements,
    rig_templates: rigTemplates,
    rig_setups: rigSetups,
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
