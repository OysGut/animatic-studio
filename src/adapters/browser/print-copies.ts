/**
 * Rigg runde 5 (B-087, 0079): kopier og koder for utskriftsjobber. Kodene lages og slås opp i databasen
 * (pepret hash); nøkkelen og den korte koden finnes bare i minnet mens PDF-en lages, og logges aldri.
 */
import { normalizeShortCode } from "@/core/print/job";
import { db } from "./client";

export interface CopyCode {
  readonly copyId: string;
  readonly elementId: string;
  readonly copyNumber: number;
  readonly key: string;
  readonly shortCode: string;
}

/** Lager manglende kopier (eksisterende beholder kodene) og henter kodene for utskrift. */
export async function issuePrintCopies(projectId: string, jobId: string): Promise<CopyCode[]> {
  const issued = await db.rpc("issue_print_copies" as never, { p_project: projectId, p_job: jobId } as never);
  if (issued.error) throw new Error(issued.error.message);
  const { data, error } = await db.rpc("print_copy_codes" as never, { p_project: projectId, p_job: jobId } as never);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    copyId: String(r["copy_id"]),
    elementId: String(r["element_id"]),
    copyNumber: Number(r["copy_number"]),
    key: String(r["key"]),
    shortCode: String(r["short_code"]),
  }));
}

export interface CopyTarget {
  readonly projectId: string;
  readonly sceneId: string;
  readonly frame: number;
  readonly layerId: string;
  readonly copyNumber: number;
}

/** QR-nøkkel eller kort kode. Ukjent, tilbaketrukket eller uten tilgang gir null (nøytralt). */
export async function lookupPrintCopy(code: string, projectId?: string): Promise<CopyTarget | null> {
  const raw = code.trim();
  const value = /^[A-Za-z0-9_-]{43}$/.test(raw) ? raw : normalizeShortCode(raw);
  if (!value) return null;
  const { data, error } = await db.rpc("lookup_print_copy" as never, { p_code: value, p_project: projectId ?? null } as never);
  if (error) return null;
  const r = ((data ?? []) as Record<string, unknown>[])[0];
  if (!r) return null;
  return {
    projectId: String(r["project_id"]),
    sceneId: String(r["scene_id"]),
    frame: Number(r["frame"]),
    layerId: String(r["layer_id"]),
    copyNumber: Number(r["copy_number"]),
  };
}

export async function revokePrintCopies(projectId: string, jobId: string): Promise<number> {
  const { data, error } = await db.rpc("revoke_print_copies" as never, { p_project: projectId, p_job: jobId } as never);
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/** Personlig: x/y-forskyvning for tosidig utskrift per skriver (lagres i kontoens visningsvalg). */
export interface DuplexCalibration {
  readonly printer: string;
  readonly x: number;
  readonly y: number;
}
