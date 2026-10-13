/** Manusversjoner (migrasjon 0003, REQ-0032, REQ-0076–0078) for nettleseren (KI-181). */
import type { ScriptSnapshot } from "@/core";
import { db } from "./client";

/** Versjonene i produksjonen uten øyeblikksbilder, nyeste først. Kaster med feilmeldingen fra databasen. */
export async function listScriptVersions(productionId: string): Promise<unknown[]> {
  const { data, error } = await db
    .from("script_versions")
    .select("id, number, name, note, parent_version_id, created_at, created_by")
    .eq("production_id", productionId)
    .order("number", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Øyeblikksbildet til én versjon (null = finnes ikke). Kaster med feilmeldingen fra databasen. */
export async function fetchScriptSnapshot(versionId: string): Promise<ScriptSnapshot | null> {
  const { data, error } = await db
    .from("script_versions")
    .select("snapshot")
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return (data as { snapshot: ScriptSnapshot }).snapshot;
}

/** Ny manusversjon. Gir ID-en. Kaster med feilmeldingen fra databasen. */
export async function createScriptVersion(input: {
  projectId: string;
  productionId: string;
  name: string;
  note: string;
}): Promise<string> {
  const { data, error } = await db.rpc("create_script_version", {
    p_project: input.projectId,
    p_production: input.productionId,
    p_name: input.name,
    p_note: input.note || null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
