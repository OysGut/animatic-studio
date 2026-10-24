/**
 * C-1 server functions. Signed-in editors create hand-offs (token stored only as hash) and list status.
 * The return page works with the short-lived token (no account) or signed in (marker recognition only).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUuid } from "@/core";
import { tokenHash, toHex } from "@/core/connectors";
import { FORMATS_FOR, HANDOFF_FORMATS, HANDOFF_TARGETS, RETURN_TOKEN_PREFIX, RETURN_TOKEN_RE, RETURN_TTL_SECONDS, adapterFor, base64UrlToken, type HandoffFormat, type HandoffRow, type HandoffTarget } from "@/core/handoff";
import type { AnyClient } from "@/adapters/storage/project-rows";
import { t } from "@/core/i18n/keyed";
import { ReturnError, beginReturn, finishReturn, handoffOpen, putReturnChunk, type HandoffRecord, type HandoffStore } from "./intake";

const fail = (code = "unknown") => new Error(`${t("c1.error")} [${code}]`);
async function noStore() { const { setResponseHeader } = await import("@tanstack/react-start/server"); setResponseHeader("Cache-Control", "no-store"); setResponseHeader("Referrer-Policy", "no-referrer"); }
async function ipKey(): Promise<string> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const { clientIp } = await import("@/adapters/auth/turnstile.server");
  return "ip:" + tokenHash(clientIp((n) => getRequestHeader(n)) ?? "unknown");
}
const store = async () => (await import("./intake-store.server")).cloudHandoffStore();
const asCode = (e: unknown) => (e instanceof ReturnError ? e.code : "unknown");
function b64(s: string): Uint8Array {
  if (typeof s !== "string" || s.length > 6_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw fail("chunk");
  const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out;
}

export const createHandoff = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; targetKind: HandoffTarget; targetId: string; assetId: string | null; variantId: string | null; sceneId: string | null; baseVersionId: string | null; baseRevision: number; format: HandoffFormat; fileName: string }) => {
    const opt = (v: string | null) => v === null || isUuid(v);
    if (!d || !isUuid(d.projectId) || !(HANDOFF_TARGETS as readonly string[]).includes(d.targetKind) || !isUuid(d.targetId) || !opt(d.assetId) || !opt(d.variantId) || !opt(d.sceneId) || !opt(d.baseVersionId)
      || !Number.isInteger(d.baseRevision) || d.baseRevision < 0 || !(HANDOFF_FORMATS as readonly string[]).includes(d.format) || !FORMATS_FOR[d.targetKind].includes(d.format) && !(d.targetKind === "asset" && d.format === "wav")
      || typeof d.fileName !== "string" || d.fileName.length < 1 || d.fileName.length > 255 || /[\\/]/.test(d.fileName)) throw fail();
    return d;
  })
  .handler(async ({ data, context }) => {
    await noStore();
    const id = crypto.randomUUID();
    const token = RETURN_TOKEN_PREFIX + base64UrlToken(crypto.getRandomValues(new Uint8Array(32)));
    const expiresAt = new Date(Date.now() + RETURN_TTL_SECONDS * 1000).toISOString();
    const { error } = await (context.supabase as AnyClient).rpc("handoff_create", {
      p_id: id, p_project: data.projectId, p_target_kind: data.targetKind, p_target_id: data.targetId, p_asset: data.assetId, p_variant: data.variantId, p_scene: data.sceneId,
      p_base_version: data.baseVersionId, p_base_revision: data.baseRevision, p_adapter: adapterFor(data.format).id, p_format: data.format, p_file_name: data.fileName, p_token_hash: tokenHash(token), p_expires: expiresAt,
    });
    if (error) throw fail();
    return { id, token, expiresAt, returnPath: `/r/${token}` };
  });

export const listHandoffs = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => { if (!isUuid(d?.projectId)) throw fail(); return d; })
  .handler(async ({ data, context }): Promise<HandoffRow[]> => {
    await noStore();
    const { data: rows } = await (context.supabase as AnyClient).from("connector_handoffs").select("id,target_kind,target_id,asset_id,scene_id,adapter,format,status,expires_at,candidate_version_id,created_at").eq("project_id", data.projectId).order("created_at", { ascending: false }).limit(1000);
    return ((rows ?? []) as Record<string, any>[]).map((r) => ({ id: r["id"], targetKind: r["target_kind"], targetId: r["target_id"], assetId: r["asset_id"], sceneId: r["scene_id"], adapter: r["adapter"], format: r["format"], status: r["status"], expiresAt: r["expires_at"], candidateVersionId: r["candidate_version_id"], createdAt: r["created_at"] }));
  });

export const setHandoffStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "closed" | "revoked" }) => { if (!isUuid(d?.id) || !["closed", "revoked"].includes(d.status)) throw fail(); return d; })
  .handler(async ({ data, context }) => { await noStore(); const { error } = await (context.supabase as AnyClient).rpc("handoff_set_status", { p_id: data.id, p_status: data.status }); if (error) throw fail(); return true; });

// ---- Return page: token path (no account) -------------------------------------------------------------
async function byToken(s: HandoffStore, token: string): Promise<HandoffRecord> {
  if (!RETURN_TOKEN_RE.test(token)) throw fail("unavailable");
  if (!(await s.rateLimit("handoff_return", ["h:" + tokenHash(token), await ipKey()]))) throw fail("rate");
  const h = await s.byToken(tokenHash(token));
  if (!handoffOpen(h, Date.now())) throw fail("unavailable");
  return h;
}
const tokenIn = <T extends { token: string }>(d: T): T => { if (!d || typeof d.token !== "string" || !RETURN_TOKEN_RE.test(d.token)) throw fail("unavailable"); return d; };

export const returnInfo = createServerFn({ method: "POST" }).inputValidator(tokenIn).handler(async ({ data }) => {
  await noStore(); const s = await store(); const h = await byToken(s, data.token);
  return { targetKind: h.targetKind, format: h.format, fileName: h.fileName, expiresAt: h.expiresAt };
});

type BeginIn = { token: string; fileName: string; byteSize: number; sha256: string; idempotencyKey: string };
export const returnBegin = createServerFn({ method: "POST" }).inputValidator((d: BeginIn) => tokenIn(d)).handler(async ({ data }) => {
  await noStore(); const s = await store(); const h = await byToken(s, data.token);
  try { const tr = await beginReturn(s, h, h.createdBy, data); return { transferId: tr.id }; } catch (e) { throw fail(asCode(e)); }
});
export const returnChunk = createServerFn({ method: "POST" }).inputValidator((d: { token: string; transferId: string; index: number; data: string }) => tokenIn(d)).handler(async ({ data }) => {
  await noStore(); const s = await store(); const h = await byToken(s, data.token);
  const tr = await s.getTransfer(data.transferId); if (!tr || tr.handoffId !== h.id) throw fail("unavailable");
  try { await putReturnChunk(s, tr, data.index, b64(data.data)); return true; } catch (e) { throw fail(asCode(e)); }
});
export const returnFinish = createServerFn({ method: "POST" }).inputValidator((d: { token: string; transferId: string }) => tokenIn(d)).handler(async ({ data }) => {
  await noStore(); const s = await store(); const h = await byToken(s, data.token);
  const tr = await s.getTransfer(data.transferId); if (!tr || tr.handoffId !== h.id) throw fail("unavailable");
  try { const r = await finishReturn(s, h, tr, h.createdBy, { linkHandoffId: h.id }); return { versionId: r.versionId, conflict: !!r.conflictId, targetKind: r.targetKind }; } catch (e) { throw fail(asCode(e)); }
});

// ---- Return page: signed in (recognized by embedded marker only) --------------------------------------
async function signedInHandoff(context: { supabase: unknown; userId: string }, handoffId: string): Promise<{ s: HandoffStore; h: HandoffRecord }> {
  const user = context.supabase as AnyClient;
  // RLS: only members see the row; the role check happens again inside apply_changes.
  const { data: row } = await user.from("connector_handoffs").select("id,project_id,created_by,target_kind,target_id,asset_id,variant_id,scene_id,base_version_id,base_revision,format,file_name,expires_at,status").eq("id", handoffId).maybeSingle();
  if (!row) throw fail("unknown");
  const { data: m } = await user.from("project_members").select("role").eq("project_id", row["project_id"]).eq("user_id", context.userId).is("removed_at", null).maybeSingle();
  if (!m || !["owner", "editor"].includes(String(m["role"]))) throw fail("unavailable");
  const { handoffRow } = await import("./intake-store.server");
  const h = handoffRow(row);
  if (!handoffOpen(h, Date.now())) throw fail("unavailable");
  const s = await store();
  if (!(await s.rateLimit("handoff_return", ["u:" + context.userId, await ipKey()]))) throw fail("rate");
  return { s, h };
}
export const returnBeginSignedIn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: Omit<BeginIn, "token"> & { handoffId: string }) => { if (!d || !isUuid(d.handoffId)) throw fail("unknown"); return d; })
  .handler(async ({ data, context }) => { await noStore(); const { s, h } = await signedInHandoff(context, data.handoffId); try { const tr = await beginReturn(s, h, context.userId, data); return { transferId: tr.id }; } catch (e) { throw fail(asCode(e)); } });
export const returnChunkSignedIn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { handoffId: string; transferId: string; index: number; data: string }) => { if (!d || !isUuid(d.handoffId)) throw fail(); return d; })
  .handler(async ({ data, context }) => { await noStore(); const { s, h } = await signedInHandoff(context, data.handoffId); const tr = await s.getTransfer(data.transferId); if (!tr || tr.handoffId !== h.id || tr.sender !== context.userId) throw fail("unavailable"); try { await putReturnChunk(s, tr, data.index, b64(data.data)); return true; } catch (e) { throw fail(asCode(e)); } });
export const returnFinishSignedIn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { handoffId: string; transferId: string }) => { if (!d || !isUuid(d.handoffId)) throw fail(); return d; })
  .handler(async ({ data, context }) => { await noStore(); const { s, h } = await signedInHandoff(context, data.handoffId); const tr = await s.getTransfer(data.transferId); if (!tr || tr.handoffId !== h.id || tr.sender !== context.userId) throw fail("unavailable"); try { const r = await finishReturn(s, h, tr, context.userId, { linkHandoffId: null, knownHandoffIds: [h.id] }); return { versionId: r.versionId, conflict: !!r.conflictId, targetKind: r.targetKind }; } catch (e) { throw fail(asCode(e)); } });

export const sha256OfHex = (b: Uint8Array): string => toHex(b);
