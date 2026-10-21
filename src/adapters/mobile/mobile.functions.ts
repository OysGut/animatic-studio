/**
 * Serverfunksjoner for mobilbroen (fase 2, bolk A, DEC-0090).
 * - På datamaskinen (innlogget redaktør): lag en opplastingsøkt for en kontekst; tokenet vises som QR-kode.
 * - På mobilen (uten innlogging): tokenet gir bare rett til å laste opp i sin kontekst. Filen lastes direkte til
 *   lagringen med en signert opplastingslenke (ikke gjennom serveren), og serveren sjekker innholdet etterpå.
 *   Mobilsiden får aldri lese manus, ressurser eller innstillinger, og kan ikke bruke prosjektets AI-tjenester.
 * Tokenet lagres bare som SHA-256. Utløp, tilbakekalling og tak håndheves i databasen (migrasjon 0035).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PERSONAL_MAX_BYTES, PERSONAL_MAX_FILES, PERSONAL_SESSION_MS, SHARED_MAX_BYTES, SHARED_MAX_FILES, SHARED_SESSION_MS, checkMobileFile, cleanContributorName, isUuid, mediaKindOf, mediaKindsFor, mobileFilePath, parseUploadContext, scriptForLine, sniffMatches, type MobileMediaKind, type MobileScript, type UploadContext } from "@/core";
import type { AnyClient } from "@/adapters/storage/project-rows";
import { t } from "@/core/i18n/keyed";

const BUCKET = "assets";
const ROLE_RANK: Record<string, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

async function service(): Promise<AnyClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyClient;
}

async function hashToken(token: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(token).digest("hex");
}

async function newToken(): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  return randomBytes(32).toString("base64url");
}

const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;

function missingSchema(message: string): boolean {
  return /does not exist|schema cache|Could not find the (table|function)/i.test(message);
}

const SCHEMA_MESSAGE = t("adapters-mobile-mobile-functions.schema-message.message.9443d2639538");

/** Feilmeldingene fra databasen på norsk og engelsk. */
function dbMessage(message: string): string {
  if (missingSchema(message)) return SCHEMA_MESSAGE;
  if (/utløpt eller tilbakekalt/.test(message))
    return t("adapters-mobile-mobile-functions.db-message.message.089685f21124");
  if (/Taket for opplastinger/.test(message))
    return t("adapters-mobile-mobile-functions.db-message.message.36d37f5588e9");
  if (/filtypen kan ikke/.test(message))
    return t("adapters-mobile-mobile-functions.db-message.message.1c8d654cd2f6");
  return t("adapters-mobile-mobile-functions.db-message.message.4e3db25eced1");
}

// ---------------------------------------------------------------- datamaskinen

export interface CreatedUploadSession {
  readonly ok: boolean;
  readonly message: string;
  readonly sessionId?: string;
  readonly token?: string;
  readonly expiresAt?: string;
}

/** Finnes det kontekstens mål i prosjektet? (Hindrer at en økt peker inn i et annet prosjekt.) */
async function contextBelongs(
  db: AnyClient,
  projectId: string,
  c: UploadContext,
): Promise<boolean> {
  const one = async (table: string, id: string) => {
    const { data } = await db
      .from(table)
      .select("id")
      .eq("id", id)
      .eq("project_id", projectId)
      .maybeSingle();
    return !!data;
  };
  switch (c.type) {
    case "rig": {
      const { data: v } = await db.from("asset_versions").select("variant_id, mime_type, removed").eq("id", c.target.sourceVersionId).eq("project_id", projectId).maybeSingle();
      const { data: a } = await db.from("asset_variants").select("asset_id, archived").eq("id", c.target.variantId).eq("project_id", projectId).maybeSingle();
      return !!v && !v.removed && String(v.mime_type).startsWith("image/") && v.variant_id === c.target.variantId && !!a && !a.archived && a.asset_id === c.target.assetId;
    }
    case "project":
    case "draft":
      return true;
    case "asset":
      return (
        (await one("assets", c.assetId)) &&
        (!c.variantId || (await one("asset_variants", c.variantId)))
      );
    case "occurrence":
    case "scene_sound":
      return one("scene_occurrences", c.occurrenceId);
    case "sound": {
      const { data: a } = await db
        .from("assets")
        .select("id, kind")
        .eq("id", c.assetId)
        .eq("project_id", projectId)
        .maybeSingle();
      return (
        (a as { kind?: string } | null)?.kind === "sound" &&
        (!c.variantId || (await one("asset_variants", c.variantId)))
      );
    }
    case "line": {
      const { data: occ } = await db
        .from("scene_occurrences")
        .select("variant_id")
        .eq("id", c.occurrenceId)
        .eq("project_id", projectId)
        .maybeSingle();
      const { data: b } = await db
        .from("script_blocks")
        .select("variant_id, kind")
        .eq("id", c.blockId)
        .eq("project_id", projectId)
        .maybeSingle();
      const bb = b as { variant_id?: string; kind?: string } | null;
      if (c.clipId) {
        const { data: clip } = await db.from("audio_clips").select("occurrence_id, block_id, removed")
          .eq("id", c.clipId).eq("project_id", projectId).maybeSingle();
        if (!clip || clip.removed || clip.occurrence_id !== c.occurrenceId || clip.block_id !== c.blockId) return false;
      }
      return (
        !!occ &&
        bb?.kind === "dialogue" &&
        bb.variant_id === (occ as { variant_id?: string }).variant_id
      );
    }
    case "layer":
      return (
        (await one("composition_layers", c.layerId)) &&
        (await one("assets", c.assetId)) &&
        (!c.variantId || (await one("asset_variants", c.variantId)))
      );
  }
}

export const createUploadSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    if (typeof x["projectId"] !== "string" || !isUuid(x["projectId"]))
      throw new Error(t("adapters-mobile-mobile-functions.create-upload-session.create-server-fn-method-post-middleware-require-supabase-auth-validator.fc0e6332865f"));
    const context = parseUploadContext(x["context"]);
    if (!context) throw new Error(t("adapters-mobile-mobile-functions.create-upload-session.create-server-fn-method-post-middleware-require-supabase-auth-validator.60b92238b5ea"));
    const label = typeof x["label"] === "string" ? x["label"].trim().slice(0, 200) : "";
    return { projectId: x["projectId"], context, label };
  })
  .handler(async ({ data, context }): Promise<CreatedUploadSession> => {
    const userDb = context.supabase as unknown as AnyClient;
    const { data: member } = await userDb
      .from("project_members")
      .select("role")
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .is("removed_at", null)
      .maybeSingle();
    const rank = ROLE_RANK[(member as { role?: string } | null)?.role ?? ""] ?? 0;
    if (rank < ROLE_RANK["editor"]!)
      return {
        ok: false,
        message: t("adapters-mobile-mobile-functions.message.message.000c6715628a"),
      };
    const db = await service();
    if (!(await contextBelongs(db, data.projectId, data.context)))
      return {
        ok: false,
        message: t("adapters-mobile-mobile-functions.message.message.21b72981ca75"),
      };
    const { data: profile } = await db
      .from("profiles")
      .select("display_name")
      .eq("user_id", context.userId)
      .maybeSingle();
    const token = await newToken();
    const expiresAt = new Date(Date.now() + PERSONAL_SESSION_MS).toISOString();
    const { data: row, error } = await db
      .from("upload_sessions")
      .insert({
        project_id: data.projectId,
        token_hash: await hashToken(token),
        kind: "personal",
        created_by: context.userId,
        creator_name: String(
          (profile as { display_name?: string } | null)?.display_name ?? "",
        ).slice(0, 100),
        context: data.context,
        label: data.label,
        media_kinds: mediaKindsFor(data.context),
        expires_at: expiresAt,
        max_files: PERSONAL_MAX_FILES,
        max_bytes: PERSONAL_MAX_BYTES,
      } as never)
      .select("id")
      .single();
    if (error || !row) return { ok: false, message: dbMessage(error?.message ?? "") };
    return { ok: true, message: "", sessionId: (row as { id: string }).id, token, expiresAt };
  });

// ---------------------------------------------------------------- mobilen (uten innlogging)

interface SessionRow {
  readonly id: string;
  readonly project_id: string;
  readonly kind: "personal" | "shared";
  readonly label: string;
  readonly creator_name: string;
  readonly media_kinds: MobileMediaKind[];
  readonly expires_at: string;
  readonly files_count: number;
  readonly max_files: number;
  readonly bytes_total: number;
  readonly max_bytes: number;
  readonly context?: unknown;
}

async function touch(db: AnyClient, token: string): Promise<SessionRow | null> {
  if (!TOKEN_RE.test(token)) return null;
  const { data, error } = await db.rpc("mobile_session_touch", {
    p_token_hash: await hashToken(token),
  });
  if (error) {
    if (missingSchema(error.message)) throw new Error(SCHEMA_MESSAGE);
    return null;
  }
  const r = data as SessionRow | null;
  return r && r.id ? r : null;
}

const tokenOnly = (d: unknown) => {
  const x = (d ?? {}) as Record<string, unknown>;
  if (typeof x["token"] !== "string" || !TOKEN_RE.test(x["token"]))
    throw new Error(t("adapters-mobile-mobile-functions.token-only.message.f8b14a79c470"));
  return { token: x["token"] };
};

export interface MobileSessionInfo {
  readonly ok: boolean;
  readonly message: string;
  readonly kind?: "personal" | "shared";
  /** Hva filene gjelder, f.eks. «Bilder av Maja». Prosjektets navn vises ikke for delte lenker. */
  readonly label?: string;
  readonly from?: string;
  readonly mediaKinds?: MobileMediaKind[];
  readonly expiresAt?: string;
  readonly remainingFiles?: number;
  /** Replikken som tas opp (bolk B, REQ-0685): vises på mobilen så man kan lese fra telefonen. */
  readonly script?: MobileScript | null;
  readonly rigCapture?: { readonly referenceUrl: string; readonly slot: string };

}

/** Replikken for en «line»-kontekst, lest fra databasen (aldri fra nettleseren). */
async function lineScript(
  db: AnyClient,
  projectId: string,
  c: unknown,
): Promise<MobileScript | null> {
  const ctx = parseUploadContext(c);
  if (!ctx || ctx.type !== "line") return null;
  const { data: b } = await db
    .from("script_blocks")
    .select("variant_id")
    .eq("id", ctx.blockId)
    .eq("project_id", projectId)
    .maybeSingle();
  const variantId = (b as { variant_id?: string } | null)?.variant_id;
  if (!variantId) return null;
  const { data: rows } = await db
    .from("script_blocks")
    .select("id, kind, text, order_key, removed")
    .eq("variant_id", variantId)
    .eq("project_id", projectId)
    .eq("removed", false)
    .order("order_key", { ascending: true })
    .limit(2000);
  return scriptForLine((rows ?? []) as { id: string; kind: string; text: string }[], ctx.blockId);
}

export const mobileSession = createServerFn({ method: "POST" })
  .validator(tokenOnly)
  .handler(async ({ data }): Promise<MobileSessionInfo> => {
    const db = await service();
    const s = await touch(db, data.token);
    if (!s)
      return {
        ok: false,
        message: t("adapters-mobile-mobile-functions.message.message.3bec875be49f"),
      };
    const uploadContext = parseUploadContext(s.context);
    let rigCapture: MobileSessionInfo["rigCapture"];
    if (uploadContext?.type === "rig") {
      const { data: v } = await db.from("asset_versions").select("media_path").eq("id", uploadContext.target.sourceVersionId).eq("project_id", s.project_id).maybeSingle();
      if (v?.media_path) {
        const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(String(v.media_path), 300);
        if (signed?.signedUrl) {
          const browserOrigin = process.env["VITE_SUPABASE_URL"];
          const referenceUrl = browserOrigin ? new URL(new URL(signed.signedUrl).pathname + new URL(signed.signedUrl).search, browserOrigin).href : signed.signedUrl;
          rigCapture = { referenceUrl, slot: uploadContext.target.slot };
        }
      }
    }
    return {
      ok: true,
      message: "",
      ...(rigCapture ? { rigCapture } : {}),
      kind: s.kind,
      label: s.label,
      from: s.creator_name,
      mediaKinds: s.media_kinds,
      expiresAt: s.expires_at,
      remainingFiles: Math.max(0, s.max_files - s.files_count),
      script: await lineScript(db, s.project_id, s.context),
    };
  });

export interface MobileUploadTicket {
  readonly ok: boolean;
  readonly message: string;
  readonly path?: string;
  readonly uploadToken?: string;
  /** Filen er allerede mottatt (nytt forsøk etter brutt forbindelse): ikke last opp igjen. */
  readonly done?: boolean;
}

export const mobileUploadTicket = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    const { token } = tokenOnly(d);
    if (typeof x["clientFileId"] !== "string" || !isUuid(x["clientFileId"]))
      throw new Error(t("adapters-mobile-mobile-functions.mobile-upload-ticket.create-server-fn-method-post-validator.1fc98438e8ea"));
    const mime = typeof x["mime"] === "string" ? x["mime"].toLowerCase().split(";")[0]!.trim() : "";
    const bytes = typeof x["bytes"] === "number" ? x["bytes"] : -1;
    const fileName = typeof x["fileName"] === "string" ? x["fileName"].slice(0, 255) : "";
    return {
      token,
      clientFileId: x["clientFileId"],
      mime,
      bytes,
      fileName,
      contributor: cleanContributorName(x["contributor"]),
    };
  })
  .handler(async ({ data }): Promise<MobileUploadTicket> => {
    const db = await service();
    const s = await touch(db, data.token);
    if (!s)
      return {
        ok: false,
        message: t("adapters-mobile-mobile-functions.message.message.3bec875be49f.2"),
      };
    const problem = checkMobileFile(data.mime, data.bytes, s.media_kinds);
    if (problem) return { ok: false, message: problem };
    const kind = mediaKindOf(data.mime)!;
    const path = mobileFilePath(s.project_id, s.id, data.clientFileId, data.mime);
    const { data: row, error } = await db.rpc("mobile_register_upload", {
      p_token_hash: await hashToken(data.token),
      p_client_file_id: data.clientFileId,
      p_path: path,
      p_kind: kind,
      p_mime: data.mime,
      p_bytes: Math.round(data.bytes),
      p_file_name: data.fileName,
      p_contributor: data.contributor,
    });
    if (error) return { ok: false, message: dbMessage(error.message) };
    const r = row as { status?: string; path?: string } | null;
    if (r?.status === "done") return { ok: true, message: "", path: r.path ?? path, done: true };
    const { data: up, error: upErr } = await db.storage
      .from(BUCKET)
      // Ø-11: uten overskriving, så en bekreftet fil ikke kan byttes ut med lenken etterpå
      .createSignedUploadUrl(r?.path ?? path, { upsert: false });
    if (upErr || !up)
      return {
        ok: false,
        message: t("adapters-mobile-mobile-functions.message.message.0cff54ef52fd"),
      };
    return { ok: true, message: "", path: up.path, uploadToken: up.token };
  });

export interface MobileConfirmResult {
  readonly ok: boolean;
  readonly message: string;
}

/** Les de første bytene og den faktiske størrelsen på en fil i lagringen (uten å hente hele filen). */
async function probe(
  db: AnyClient,
  path: string,
): Promise<{ head: Uint8Array; size: number } | null> {
  const { data } = await db.storage.from(BUCKET).createSignedUrl(path, 60);
  if (!data?.signedUrl) return null;
  const res = await fetch(data.signedUrl, { headers: { Range: "bytes=0-31" } });
  if (!res.ok && res.status !== 206) return null;
  const range = res.headers.get("content-range");
  const total = range ? Number(range.split("/")[1]) : Number(res.headers.get("content-length"));
  const head = new Uint8Array(await res.arrayBuffer()).slice(0, 32);
  return Number.isFinite(total) && total > 0 ? { head, size: total } : null;
}

export const mobileConfirmUpload = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    const { token } = tokenOnly(d);
    if (typeof x["clientFileId"] !== "string" || !isUuid(x["clientFileId"]))
      throw new Error(t("adapters-mobile-mobile-functions.mobile-confirm-upload.create-server-fn-method-post-validator.5b2e5c94213e"));
    return { token, clientFileId: x["clientFileId"] };
  })
  .handler(async ({ data }): Promise<MobileConfirmResult> => {
    const db = await service();
    const hash = await hashToken(data.token);
    const { data: sess } = await db
      .from("upload_sessions")
      .select("id, media_kinds, revoked_at, expires_at")
      .eq("token_hash", hash)
      .maybeSingle();
    const sx = sess as { id: string; media_kinds: MobileMediaKind[]; revoked_at: string | null; expires_at: string } | null;
    // Ø-11: tilbakekalt eller utløpt økt kan ikke bekrefte flere filer
    const s = sx && !sx.revoked_at && Date.parse(sx.expires_at) > Date.now() ? sx : null;
    if (!s) return { ok: false, message: t("adapters-mobile-mobile-functions.message.message.0aa7f47f70e7") };
    const { data: row } = await db
      .from("mobile_imports")
      .select("path, mime_type, status")
      .eq("session_id", s.id)
      .eq("client_file_id", data.clientFileId)
      .maybeSingle();
    const r = row as { path: string; mime_type: string; status: string } | null;
    if (!r) return { ok: false, message: t("adapters-mobile-mobile-functions.message.message.86f3c3d3bbf4") };
    if (r.status === "done") return { ok: true, message: "" };
    const p = await probe(db, r.path);
    const confirm = (ok: boolean, bytes: number, error: string | null) =>
      db.rpc("mobile_confirm_upload", {
        p_token_hash: hash,
        p_client_file_id: data.clientFileId,
        p_ok: ok,
        p_bytes: bytes,
        p_error: error,
      });
    if (!p)
      return {
        ok: false,
        message: t("adapters-mobile-mobile-functions.message.message.393fa803728b"),
      };
    const problem =
      checkMobileFile(r.mime_type, p.size, s.media_kinds) ??
      (sniffMatches(r.mime_type, p.head)
        ? null
        : t("adapters-mobile-mobile-functions.problem.create-server-fn-method-post-validator-d-unknown-const-x-d-as-record-string-unknown-const-token-token-only-d-if-typeof-x-client-file-id-string-is-uuid-x-client-file-id-throw-new-error-l-ugyldig-fil-invalid-file-return-token-client-file-id-x-client-file-id-handler.086eaf25ccb7"));
    if (problem) {
      // Filen som ble avvist, fjernes fra lagringen (den ble aldri registrert som mottatt)
      await db.storage.from(BUCKET).remove([r.path]);
      await confirm(false, p.size, problem);
      return { ok: false, message: problem };
    }
    const { error } = await confirm(true, p.size, null);
    if (error) return { ok: false, message: dbMessage(error.message) };
    return { ok: true, message: "" };
  });

export interface MobileShareResult {
  readonly ok: boolean;
  readonly message: string;
  readonly token?: string;
  readonly expiresAt?: string;
}

/**
 * «Del lenke» fra mobilsiden: en ny, delt økt med samme kontekst, men egne og mindre rettigheter (7 dager, eget
 * tak, kan tilbakekalles). Bare fra en personlig økt – en delt lenke kan ikke deles videre med nye rettigheter.
 */
export const mobileShareLink = createServerFn({ method: "POST" })
  .validator(tokenOnly)
  .handler(async ({ data }): Promise<MobileShareResult> => {
    const db = await service();
    const hash = await hashToken(data.token);
    const s0 = await touch(db, data.token);
    if (!s0)
      return {
        ok: false,
        message: t("adapters-mobile-mobile-functions.message.message.892c226d408b"),
      };
    const { data: full } = await db
      .from("upload_sessions")
      .select("*")
      .eq("token_hash", hash)
      .maybeSingle();
    const s = full as {
      id: string;
      project_id: string;
      kind: string;
      created_by: string;
      creator_name: string;
      context: unknown;
      label: string;
      media_kinds: string[];
    } | null;
    if (!s || s.kind !== "personal")
      return {
        ok: false,
        message: t("adapters-mobile-mobile-functions.message.message.5c6d5f1cd692"),
      };
    const token = await newToken();
    const expiresAt = new Date(Date.now() + SHARED_SESSION_MS).toISOString();
    const { error } = await db.from("upload_sessions").insert({
      project_id: s.project_id,
      token_hash: await hashToken(token),
      kind: "shared",
      parent_id: s.id,
      created_by: s.created_by,
      creator_name: s.creator_name,
      context: s.context,
      label: s.label,
      media_kinds: s.media_kinds,
      expires_at: expiresAt,
      max_files: SHARED_MAX_FILES,
      max_bytes: SHARED_MAX_BYTES,
    } as never);
    if (error) return { ok: false, message: dbMessage(error.message) };
    return { ok: true, message: "", token, expiresAt };
  });
