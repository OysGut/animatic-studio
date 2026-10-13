/** Registrering av importerte manusoriginaler (REQ-0053, DEC-0074) for nettleseren (KI-181). */
import { db, plainError, type BackendError } from "./client";

/** Når samme fil (sha256) sist ble importert i prosjektet, eller null. Feil regnes som «aldri». */
export async function findPreviousImport(
  projectId: string,
  sha256: string,
): Promise<string | null> {
  const { data } = await db
    .from("imported_documents")
    .select("created_at")
    .eq("project_id", projectId)
    .eq("sha256", sha256)
    .limit(1)
    .maybeSingle();
  return data ? (data as { created_at: string }).created_at : null;
}

/** Om originalen allerede er registrert for denne endringen. */
export async function isImportRegistered(
  projectId: string,
  sha256: string,
  changeId: string | null,
): Promise<boolean> {
  const { data: found } = await db
    .from("imported_documents")
    .select("id")
    .eq("project_id", projectId)
    .eq("sha256", sha256)
    .eq("change_id", changeId)
    .limit(1);
  return !!(found && (found as unknown[]).length);
}

export interface ImportedDocumentInput {
  readonly projectId: string;
  readonly productionId: string;
  readonly storageKey: string;
  readonly fileName: string;
  readonly sha256: string;
  readonly format: string;
  readonly pageCount: number;
  readonly byteSize: number;
  readonly language: string;
  readonly changeId: string | null;
}

/** Registrer originalen. Gir feilen (null = registrert). */
export async function registerImportedDocument(
  d: ImportedDocumentInput,
): Promise<BackendError | null> {
  const { error } = await db.rpc("register_imported_document", {
    p_project: d.projectId,
    p_production: d.productionId,
    p_storage_key: d.storageKey,
    p_file_name: d.fileName,
    p_sha256: d.sha256,
    p_format: d.format,
    p_page_count: d.pageCount,
    p_byte_size: d.byteSize,
    p_language: d.language,
    p_change_id: d.changeId,
  });
  return plainError(error);
}
