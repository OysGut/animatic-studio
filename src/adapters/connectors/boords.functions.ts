/**
 * C-4 Boords: serverfunksjoner for innstillinger, sending, henting og kandidatvalg.
 * Nøkkelen sendes én gang fra nettleseren, prøves mot Boords, krypteres og lagres. Den returneres aldri;
 * nettleseren ser bare eier, navn, de fire siste tegnene og status.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { keyHint, newId } from "@/core";
import type { AnyClient } from "@/adapters/storage/project-rows";
import { t } from "@/core/i18n/keyed";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const fail = () => new Error(t("c4.error"));

export interface BoordsConnectionView { id: string; ownerKind: "user" | "workspace"; workspaceId: string | null; label: string; keyHint: string; status: string; statusMessage: string | null; lastSyncAt: string | null; webhook: boolean }

async function rateLimit(db: AnyClient, scope: string, key: string): Promise<boolean> {
  const r = await db.rpc("rate_limit_hit", { p_scope: scope, p_keys: [key] });
  return !r.error;
}

async function canManage(user: AnyClient, userId: string, owner: { kind: "user" | "workspace"; workspaceId: string | null }): Promise<boolean> {
  if (owner.kind === "user") return true;
  const r = await user.from("workspace_members").select("role").eq("workspace_id", owner.workspaceId).eq("user_id", userId).is("removed_at", null).maybeSingle();
  return (r.data as { role?: string } | null)?.role === "owner";
}

/** Tilkoblingen en bruker kan bruke for et prosjekt (egen, eller prosjektets arbeidsgruppe), og redaktørsjekk. */
async function connectionForProject(user: AnyClient, db: AnyClient, userId: string, projectId: string, connectionId: string) {
  const m = await user.from("project_members").select("role").eq("project_id", projectId).eq("user_id", userId).is("removed_at", null).maybeSingle();
  const role = (m.data as { role?: string } | null)?.role;
  if (role !== "owner" && role !== "editor") throw fail();
  const c = await db.from("boords_connections").select("*").eq("id", connectionId).maybeSingle();
  const row = c.data as import("./boords-store.server").ConnectionRow | null;
  if (!row) throw fail();
  if (row.owner_kind === "user" && row.user_id !== userId) throw fail();
  if (row.owner_kind === "workspace") {
    const p = await db.from("projects").select("workspace_id").eq("id", projectId).maybeSingle();
    if ((p.data as { workspace_id?: string } | null)?.workspace_id !== row.workspace_id) throw fail();
    const w = await user.from("workspace_members").select("role").eq("workspace_id", row.workspace_id).eq("user_id", userId).is("removed_at", null).maybeSingle();
    if (!w.data) throw fail();
  }
  return row;
}

export const myBoordsConnections = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }): Promise<BoordsConnectionView[]> => {
  const user = context.supabase as unknown as AnyClient;
  // Kolonnetilgang: nettleserens klient kan ikke lese chifferet; vi spør bare etter trygge kolonner.
  const r = await user.from("boords_connections").select(["id", "owner_kind", "workspace_id", "label", "key_hint", "status", "status_message", "last_sync_at"].join(",")).order("created_at");
  if (r.error) return [];
  const { adminDb } = await import("./boords-store.server");
  const db = await adminDb();
  const ids = ((r.data as Record<string, unknown>[]) ?? []).map(x => x["id"]);
  const hooks = ids.length ? (((await db.from("boords_connections").select("id,webhook_iv").in("id", ids)).data as Record<string, unknown>[]) ?? []) : [];
  const withHook = new Set(hooks.filter(h => h["webhook_iv"]).map(h => h["id"]));
  return ((r.data as Record<string, any>[]) ?? []).map(x => ({ id: x["id"], ownerKind: x["owner_kind"], workspaceId: x["workspace_id"], label: x["label"], keyHint: x["key_hint"], status: x["status"], statusMessage: x["status_message"], lastSyncAt: x["last_sync_at"], webhook: withHook.has(x["id"]) }));
});

export const saveBoordsKey = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { owner: "user" | "workspace"; workspaceId: string | null; key: string; label: string; webhookSecret: string }) => {
    if (!d || (d.owner !== "user" && d.owner !== "workspace") || (d.owner === "workspace" && !isUuid(d.workspaceId))) throw fail();
    if (typeof d.key !== "string" || d.key.trim().length < 8 || d.key.length > 512 || typeof d.webhookSecret !== "string" || d.webhookSecret.length > 512) throw fail();
    return { owner: d.owner, workspaceId: d.owner === "workspace" ? d.workspaceId : null, key: d.key.trim(), label: typeof d.label === "string" ? d.label.trim().slice(0, 80) : "", webhookSecret: d.webhookSecret.trim() };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const user = context.supabase as unknown as AnyClient;
    if (!(await canManage(user, context.userId, { kind: data.owner, workspaceId: data.workspaceId }))) return { ok: false, message: t("c4.error.owner") };
    const { adminDb, ownerAad } = await import("./boords-store.server");
    const db = await adminDb();
    if (!(await rateLimit(db, "boords_key", `u:${context.userId}`))) return { ok: false, message: t("c4.error.rate") };
    const { BoordsClient, BoordsError } = await import("./boords.server");
    let status: "ok" | "untested" = "untested";
    try { await new BoordsClient(data.key).request("GET", "/me"); status = "ok"; }
    catch (e) { if (e instanceof BoordsError && (e.status === 401 || e.status === 403)) return { ok: false, message: t("c4.error.rejected") }; }
    const q = db.from("boords_connections").select("id");
    const existing = (await (data.owner === "user" ? q.eq("owner_kind", "user").eq("user_id", context.userId) : q.eq("owner_kind", "workspace").eq("workspace_id", data.workspaceId)).maybeSingle()).data as { id?: string } | null;
    const id = existing?.id ?? newId();
    const { encryptKey } = await import("@/adapters/ai/key-vault.server");
    const ctx = { userId: ownerAad({ owner_kind: data.owner, user_id: context.userId, workspace_id: data.workspaceId }), provider: "boords", rowId: id };
    const sealed = await encryptKey(data.key, ctx);
    const hook = data.webhookSecret ? await encryptKey(data.webhookSecret, { ...ctx, provider: "boords-webhook" }) : null;
    const row = { id, owner_kind: data.owner, user_id: context.userId, workspace_id: data.workspaceId, label: data.label, ciphertext: sealed.ciphertext, iv: sealed.iv, key_version: sealed.version, key_hint: keyHint(data.key),
      webhook_ciphertext: hook?.ciphertext ?? null, webhook_iv: hook?.iv ?? null, webhook_key_version: hook?.version ?? null, status, status_message: null, updated_at: new Date().toISOString() };
    const { error } = existing ? await db.from("boords_connections").update(row).eq("id", id) : await db.from("boords_connections").insert(row);
    if (error) return { ok: false, message: t("c4.error") };
    return { ok: true, message: status === "ok" ? t("c4.saved.ok") : t("c4.saved.untested") };
  });

export const removeBoordsKey = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => { if (!d || !isUuid(d.id)) throw fail(); return d; })
  .handler(async ({ data, context }) => {
    const user = context.supabase as unknown as AnyClient;
    const r = (await user.from("boords_connections").select("owner_kind,workspace_id,user_id").eq("id", data.id).maybeSingle()).data as Record<string, string | null> | null;
    if (!r) throw fail();
    if (r["owner_kind"] === "user" && r["user_id"] !== context.userId) throw fail();
    if (!(await canManage(user, context.userId, { kind: r["owner_kind"] as "user" | "workspace", workspaceId: r["workspace_id"] ?? null }))) throw fail();
    const { adminDb } = await import("./boords-store.server");
    // Sletting fjerner chifferet helt (ingen kopi av hemmeligheten blir liggende).
    const { error } = await (await adminDb()).from("boords_connections").delete().eq("id", data.id);
    if (error) throw fail();
    return true;
  });

const MAX_PANELS = 500, MAX_IMAGE_B64 = 11_000_000;
export const pushToBoords = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; connectionId: string; title: string; panelIds: string[]; images: Record<string, string> }) => {
    if (!d || !isUuid(d.projectId) || !isUuid(d.connectionId) || typeof d.title !== "string" || !Array.isArray(d.panelIds) || d.panelIds.length === 0 || d.panelIds.length > MAX_PANELS || !d.panelIds.every(isUuid)) throw fail();
    const images = d.images && typeof d.images === "object" ? d.images : {};
    if (Object.entries(images).some(([k, v]) => !isUuid(k) || typeof v !== "string" || v.length > MAX_IMAGE_B64)) throw fail();
    return { ...d, title: d.title.slice(0, 200), images };
  })
  .handler(async ({ data, context }) => {
    const user = context.supabase as unknown as AnyClient;
    const { adminDb, cloudBoordsStore, decryptConnection, newManifestId } = await import("./boords-store.server");
    const db = await adminDb();
    const conn = await connectionForProject(user, db, context.userId, data.projectId, data.connectionId);
    if (!(await rateLimit(db, "boords_sync", `u:${context.userId}`))) throw new Error(t("c4.error.rate"));
    const { apiKey } = await decryptConnection(conn);
    const { BoordsClient, pushStoryboard } = await import("./boords.server");
    const images = new Map(Object.entries(data.images).map(([k, v]) => [k, Uint8Array.from(atob(v), c => c.charCodeAt(0))]));
    try {
      return await pushStoryboard({ client: new BoordsClient(apiKey), store: cloudBoordsStore(db), projectId: data.projectId, connectionId: conn.id, userId: context.userId, title: data.title, panelOrder: data.panelIds, images, newManifestId });
    } catch { throw fail(); }
  });

export const syncBoordsNow = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; connectionId: string }) => { if (!d || !isUuid(d.projectId) || !isUuid(d.connectionId)) throw fail(); return d; })
  .handler(async ({ data, context }) => {
    const user = context.supabase as unknown as AnyClient;
    const { adminDb, cloudBoordsStore, decryptConnection } = await import("./boords-store.server");
    const db = await adminDb();
    const conn = await connectionForProject(user, db, context.userId, data.projectId, data.connectionId);
    if (!(await rateLimit(db, "boords_sync", `u:${context.userId}`))) throw new Error(t("c4.error.rate"));
    const { apiKey } = await decryptConnection(conn);
    const { BoordsClient, pullStoryboard } = await import("./boords.server");
    try { return await pullStoryboard({ client: new BoordsClient(apiKey), store: cloudBoordsStore(db), projectId: data.projectId, connectionId: conn.id, since: conn.sync_cursor }); }
    catch { throw fail(); }
  });

export interface BoordsCandidateView { id: string; projectId: string; panelId: string; kind: "text" | "image"; incoming: Record<string, string>; conflict: boolean; revision: number; createdAt: string; mediaPath: string | null }
export const myBoordsCandidates = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }): Promise<BoordsCandidateView[]> => {
  const user = context.supabase as unknown as AnyClient;
  const r = await user.from("boords_candidates").select("id,project_id,panel_id,kind,incoming,conflict,revision,created_at,media_path").eq("status", "open").order("created_at").limit(200);
  if (r.error) return [];
  return ((r.data as Record<string, any>[]) ?? []).map(x => ({ id: x["id"], projectId: x["project_id"], panelId: x["panel_id"], kind: x["kind"], incoming: x["incoming"] ?? {}, conflict: !!x["conflict"], revision: x["revision"], createdAt: x["created_at"], mediaPath: x["media_path"] }));
});

export const resolveBoordsCandidate = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; choice: string; revision: number }) => {
    if (!d || !isUuid(d.id) || !["keep_both", "choose_current", "choose_incoming", "reject"].includes(d.choice) || !Number.isInteger(d.revision)) throw fail();
    return d;
  })
  .handler(async ({ data, context }) => {
    const user = context.supabase as unknown as AnyClient;
    const r = await user.rpc("boords_resolve_candidate", { p_id: data.id, p_choice: data.choice, p_revision: data.revision });
    if (r.error || r.data !== "ok") throw fail();
    return true;
  });

export const boordsCommentsFor = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => { if (!d || !isUuid(d.projectId)) throw fail(); return d; })
  .handler(async ({ data, context }) => {
    const user = context.supabase as unknown as AnyClient;
    const r = await user.from("boords_comments").select("id,panel_id,direction,author,text,created_at,feedback_id").eq("project_id", data.projectId).order("created_at", { ascending: false }).limit(200);
    if (r.error) return [];
    return ((r.data as Record<string, any>[]) ?? []).map(x => ({ id: String(x["id"]), panelId: x["panel_id"] as string | null, direction: x["direction"] as "in" | "out", author: String(x["author"]), text: String(x["text"]), createdAt: String(x["created_at"]), feedbackId: x["feedback_id"] as string | null }));
  });

/** Cron: periodisk henting for alle tilkoblede prosjekter (webhooks dekker bare noen få endringer). */
export async function syncAllBoords(db: AnyClient, max = 50): Promise<number> {
  const links = ((await db.from("boords_project_links").select("project_id,connection_id").limit(max)).data as Record<string, string>[]) ?? [];
  const { cloudBoordsStore, decryptConnection } = await import("./boords-store.server");
  const { BoordsClient, pullStoryboard } = await import("./boords.server");
  let n = 0;
  for (const l of links) {
    try {
      const c = (await db.from("boords_connections").select("*").eq("id", l["connection_id"]).maybeSingle()).data as import("./boords-store.server").ConnectionRow | null;
      if (!c) continue;
      const { apiKey } = await decryptConnection(c);
      await pullStoryboard({ client: new BoordsClient(apiKey), store: cloudBoordsStore(db), projectId: l["project_id"]!, connectionId: c.id, since: c.sync_cursor });
      n++;
    } catch { console.error("boords sync failed"); }
  }
  return n;
}
