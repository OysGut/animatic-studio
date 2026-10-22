import { db } from "./client";
import { t } from "@/core/i18n/keyed";

export async function reserveInterchangeExport(input: {
  projectId: string; productionId: string; occurrenceIds: readonly string[]; fileName: string;
  settings: Readonly<Record<string, string | number | boolean | null>>;
}): Promise<{ batchId: string; versions: Record<string, number> }> {
  const { data, error } = await db.rpc("reserve_interchange_export", {
    p_project: input.projectId, p_production: input.productionId, p_occurrence_ids: [...input.occurrenceIds],
    p_file_name: input.fileName, p_settings: input.settings,
  });
  if (error) throw new Error(error.message);
  const r = data as { batchId?: string; versions?: Record<string, number> } | null;
  if (!r?.batchId || !r.versions || input.occurrenceIds.some(id => !Number.isInteger(r.versions?.[id]))) throw new Error(t("ptg1.export-failed"));
  return { batchId: r.batchId, versions: r.versions };
}
export async function completeInterchangeExport(projectId: string, batchId: string): Promise<void> {
  const { error } = await db.rpc("complete_interchange_export", { p_project: projectId, p_batch: batchId });
  if (error) throw new Error(error.message);
}