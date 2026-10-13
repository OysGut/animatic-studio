/**
 * Lagrede varighetsestimater og eksportloggen (migrasjon 0028, REQ-0120, REQ-0037) for nettleseren (KI-181).
 * Begge er uforanderlige rader som skrives med egne databasefunksjoner (som manusversjoner), ikke via
 * apply_changes: de er historikk, ikke del av prosjektstrukturen, og kan ikke angres.
 */
import type { DurationAssumptions } from "@/core";
import type { DurationSnapshot } from "@/core/screenplay/duration-snapshot";
import type { ExportKind, NewExportRecord } from "@/core/export-records";
import { db } from "./client";

/** De siste manusversjonene med øyeblikksbilde (for omregning av versjoner uten lagret estimat), eldste først. */
export async function listScriptVersionsWithSnapshots(
  productionId: string,
  limit = 30,
): Promise<unknown[]> {
  const { data, error } = await db
    .from("script_versions")
    .select("id, number, name, created_at, snapshot")
    .eq("production_id", productionId)
    .order("number", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown[]).reverse();
}

/** De siste lagrede estimatene for produksjonen, eldste først. Kaster med feilmeldingen fra databasen. */
export async function listDurationEstimates(productionId: string, limit = 60): Promise<unknown[]> {
  const { data, error } = await db
    .from("duration_estimates")
    .select("id, production_id, script_version_id, assumptions, estimate, created_at, created_by")
    .eq("production_id", productionId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown[]).reverse();
}

/**
 * Lagrer et estimat. Uten `scriptVersionId` knytter databasen det til den nyeste manusversjonen bare når
 * ingenting er endret siden versjonen ble lagret. Gir ID-en og versjonen det ble knyttet til.
 */
export async function saveDurationEstimate(input: {
  readonly projectId: string;
  readonly productionId: string;
  readonly assumptions: DurationAssumptions;
  readonly snapshot: DurationSnapshot;
  readonly scriptVersionId?: string | null;
}): Promise<{ id: string; scriptVersionId: string | null }> {
  const { data, error } = await db.rpc("save_duration_estimate", {
    p_project: input.projectId,
    p_production: input.productionId,
    p_assumptions: input.assumptions,
    p_estimate: input.snapshot,
    p_script_version: input.scriptVersionId ?? null,
  });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as { id?: string; script_version_id?: string | null };
  return { id: String(r.id ?? ""), scriptVersionId: r.script_version_id ?? null };
}

/** De siste eksportene i produksjonen (valgfritt bare av gitte typer), nyeste først. */
export async function listExportRecords(
  productionId: string,
  kinds?: readonly ExportKind[],
  limit = 30,
): Promise<unknown[]> {
  let q = db
    .from("export_records")
    .select("id, production_id, kind, file_name, settings, occurrence_ids, created_at, created_by")
    .eq("production_id", productionId);
  if (kinds?.length) q = q.in("kind", [...kinds]);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown[];
}

/** Registrerer en fullført eksport. Gir ID-en. Kaster med feilmeldingen fra databasen. */
export async function recordExport(projectId: string, r: NewExportRecord): Promise<string> {
  const { data, error } = await db.rpc("record_export", {
    p_project: projectId,
    p_production: r.productionId,
    p_kind: r.kind,
    p_file_name: r.fileName,
    p_settings: r.settings,
    p_occurrence_ids: r.occurrenceIds,
  });
  if (error) throw new Error(error.message);
  return String(data);
}
