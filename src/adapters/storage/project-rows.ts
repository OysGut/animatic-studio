/**
 * Lagringsadapter (ADR-0003): leser prosjektrader fra Lovable Cloud (Supabase) og gjør dem om til domenetilstand.
 * Fungerer med både nettleserklienten (RLS – bare egne prosjekter) og serverens admin-klient.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { stateFromRows, type ProjectRows, type ProjectState, type Row } from "@/core";

/** Skjemaversjonen denne koden forventer (db/migrations). Øk ved hver ny migrasjon. */
export const EXPECTED_SCHEMA_VERSION = 8;

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
    if (error) throw new Error(`Kunne ikke lese ${table}: ${error.message}`);
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

export async function loadProjectRows(db: AnyClient, projectId: string): Promise<ProjectRows> {
  const { data: project, error } = await db
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(`Kunne ikke lese prosjektet: ${error.message}`);
  if (!project) throw new Error("Prosjektet finnes ikke, eller du har ikke tilgang");
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
