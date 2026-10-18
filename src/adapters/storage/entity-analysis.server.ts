/**
 * Lagring av den automatiske gjenkjenningen (OG2, migrasjon 0041). BARE PÅ SERVEREN, med service role.
 * Avledet arbeidslogg per scene – ikke manusdata, og skrives derfor ikke via apply_changes.
 */
import type { AnyClient } from "./project-rows";

export interface EntityAnalysisRow {
  readonly project_id: string;
  readonly scene_id: string;
  readonly content_hash: string;
  readonly result: unknown;
  readonly model: string;
  readonly analyzed_at: string;
  readonly created_by: string;
}

export async function saveEntityAnalysis(
  admin: AnyClient,
  rows: readonly EntityAnalysisRow[],
): Promise<string | null> {
  if (!rows.length) return null;
  const { error } = await admin
    .from("script_entity_analysis")
    .upsert(rows as never, { onConflict: "project_id,scene_id" });
  return error ? error.message : null;
}
