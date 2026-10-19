/**
 * Mobilimporten i nettleseren (fase 2, bolk A, DEC-0090): økter og filer fra mobilen (lesing via RLS),
 * sanntid, og redaktørens handlinger (ta til behandling, knytte, skjule, tilbakekalle). Mobilsiden laster opp
 * med en signert lenke fra serveren.
 */
import { browserClient, db, plainError, uniqueChannelName, type BackendError } from "./client";
import type { MobileMediaKind } from "@/core";

export interface UploadSessionRow {
  readonly id: string;
  readonly project_id: string;
  readonly kind: "personal" | "shared";
  readonly parent_id: string | null;
  readonly created_by: string;
  readonly creator_name: string;
  readonly context: Record<string, unknown>;
  readonly label: string;
  readonly media_kinds: MobileMediaKind[];
  readonly expires_at: string;
  readonly revoked_at: string | null;
  readonly max_files: number;
  readonly max_bytes: number;
  readonly files_count: number;
  readonly bytes_total: number;
  readonly last_seen_at: string | null;
  readonly created_at: string;
}

export interface MobileImportRow {
  readonly id: string;
  readonly project_id: string;
  readonly session_id: string;
  readonly client_file_id: string;
  readonly path: string;
  readonly kind: MobileMediaKind;
  readonly mime_type: string;
  readonly byte_size: number;
  readonly file_name: string;
  readonly contributor_name: string;
  readonly status: "pending" | "done" | "failed";
  readonly error: string | null;
  readonly context: Record<string, unknown>;
  readonly asset_id: string | null;
  readonly asset_version_id: string | null;
  readonly take_id: string | null;
  readonly claimed_by: string | null;
  readonly claimed_at: string | null;
  readonly dismissed: boolean;
  readonly created_at: string;
  readonly confirmed_at: string | null;
}

const missing = (m: string) => /does not exist|schema cache|Could not find the table/i.test(m);

/** Filene fra mobilen i prosjektet (nyeste først), eller null før migrasjon 0035. */
export async function fetchMobileImports(projectId: string): Promise<MobileImportRow[] | null> {
  const { data, error } = await db
    .from("mobile_imports")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) {
    if (missing(error.message)) return null;
    throw new Error(error.message);
  }
  return (data ?? []) as MobileImportRow[];
}

/** Øktene i prosjektet (nyeste først), eller null før migrasjon 0035. */
export async function fetchUploadSessions(projectId: string): Promise<UploadSessionRow[] | null> {
  const { data, error } = await db
    .from("upload_sessions")
    .select(
      // i18n-ignore: kolonnenavn
      "id, project_id, kind, parent_id, created_by, creator_name, context, label, media_kinds, expires_at, revoked_at, max_files, max_bytes, files_count, bytes_total, last_seen_at, created_at",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    if (missing(error.message)) return null;
    throw new Error(error.message);
  }
  return (data ?? []) as UploadSessionRow[];
}

/** Lytt på nye og endrede filer og økter i prosjektet. Returnerer en funksjon som stopper lyttingen. */
export function subscribeMobileImports(projectId: string, onChange: () => void): () => void {
  const channel = browserClient
    .channel(uniqueChannelName(`mobilimport-${projectId}`))
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "mobile_imports",
        filter: `project_id=eq.${projectId}`,
      },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "upload_sessions",
        filter: `project_id=eq.${projectId}`,
      },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void browserClient.removeChannel(channel);
  };
}

/** Ta en fil til behandling (bare én fane vinner). */
export async function claimMobileImport(id: string): Promise<boolean> {
  const { data, error } = await db.rpc("claim_mobile_import", { p_id: id });
  if (error) return false;
  return data === true;
}

export async function linkMobileImport(
  id: string,
  link: { assetId?: string | null; versionId?: string | null; takeId?: string | null },
): Promise<BackendError | null> {
  const { error } = await db.rpc("link_mobile_import", {
    p_id: id,
    p_asset: link.assetId ?? null,
    p_version: link.versionId ?? null,
    p_take: link.takeId ?? null,
  });
  return plainError(error);
}

export async function attachMobileDraft(
  projectId: string,
  draftKey: string,
  assetId: string,
): Promise<BackendError | null> {
  const { error } = await db.rpc("attach_mobile_draft", {
    p_project: projectId,
    p_draft: draftKey,
    p_asset: assetId,
  });
  return plainError(error);
}

export async function dismissMobileImport(
  id: string,
  dismissed: boolean,
): Promise<BackendError | null> {
  const { error } = await db.rpc("dismiss_mobile_import", { p_id: id, p_dismissed: dismissed });
  return plainError(error);
}

export async function revokeUploadSession(id: string): Promise<BackendError | null> {
  const { error } = await db.rpc("revoke_upload_session", { p_id: id });
  return plainError(error);
}

/** Mobilsiden: last opp filen med lenken fra serveren (rett til lagringen). */
export async function uploadWithTicket(
  path: string,
  uploadToken: string,
  body: Blob,
  contentType: string,
): Promise<BackendError | null> {
  const { error } = await browserClient.storage
    .from("assets")
    .uploadToSignedUrl(path, uploadToken, body, { contentType, upsert: false });
  // Ø-11: lenken kan ikke overskrive en fil. Finnes filen allerede (et tidligere forsøk kom fram), er den
  // lastet opp; serveren kontrollerer innholdet ved bekreftelsen.
  if (error && /exist|duplicate|409/i.test(`${(error as { statusCode?: string }).statusCode ?? ""} ${error.message}`)) return null;
  return plainError(error);
}
