/**
 * C-0 serverfunksjoner for innloggede brukere: godkjenne en tilkobling (PKCE eller enhetskode), liste og
 * trekke tilbake egne sesjoner, og registrere et konfliktvalg. Alle går som brukeren (RLS/RPC-sjekker).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUuid } from "@/core";
import {
  CHALLENGE_RE, CLIENT_ID_RE, CONFLICT_CHOICES, USER_CODE_RE, makeToken, normalizeUserCode, parseScopes, redirectAllowed, tokenHash,
  type ConflictChoice,
} from "@/core/connectors";
import type { AnyClient } from "@/adapters/storage/project-rows";
import { t } from "@/core/i18n/keyed";

const fail = () => new Error(t("c0.error"));
async function noStore() { const { setResponseHeader } = await import("@tanstack/react-start/server"); setResponseHeader("Cache-Control", "no-store"); }

export const approveConnectorCode = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; clientId: string; redirectUri: string; challenge: string; method: string; scope: string; state: string }) => {
    if (!d || !isUuid(d.projectId) || !CLIENT_ID_RE.test(d.clientId) || !redirectAllowed(d.redirectUri) || d.method !== "S256" || !CHALLENGE_RE.test(d.challenge) || !parseScopes(d.scope) || typeof d.state !== "string" || d.state.length > 500) throw fail();
    return d;
  })
  .handler(async ({ data, context }) => {
    await noStore();
    const code = makeToken("code", crypto.getRandomValues(new Uint8Array(32)));
    const db = context.supabase as AnyClient;
    const { error } = await db.rpc("connector_approve_code", { p_project: data.projectId, p_client: data.clientId, p_redirect: data.redirectUri, p_challenge: data.challenge, p_scopes: parseScopes(data.scope), p_code_hash: tokenHash(code) });
    if (error) throw fail();
    const u = new URL(data.redirectUri);
    u.searchParams.set("code", code);
    if (data.state) u.searchParams.set("state", data.state);
    return { redirect: u.toString() };
  });

export const lookupDeviceCode = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { userCode: string }) => { const c = normalizeUserCode(String(d?.userCode ?? "")); if (!USER_CODE_RE.test(c)) throw fail(); return { userCode: c }; })
  .handler(async ({ data, context }) => {
    await noStore();
    const { data: r, error } = await (context.supabase as AnyClient).rpc("connector_device_lookup", { p_user_code: data.userCode });
    if (error || !r) throw fail();
    return { clientId: String(r["client_id"]), scopes: (r["scopes"] as string[]) ?? [] };
  });

export const decideDeviceCode = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { userCode: string; projectId: string; approve: boolean }) => { const c = normalizeUserCode(String(d?.userCode ?? "")); if (!USER_CODE_RE.test(c) || !isUuid(d.projectId) || typeof d.approve !== "boolean") throw fail(); return { ...d, userCode: c }; })
  .handler(async ({ data, context }) => {
    await noStore();
    const { error } = await (context.supabase as AnyClient).rpc("connector_approve_device", { p_user_code: data.userCode, p_project: data.projectId, p_approve: data.approve });
    if (error) throw fail();
    return true;
  });

export interface ConnectorSessionView { id: string; projectId: string; projectName: string; clientId: string; scopes: string[]; createdAt: string; lastUsedAt: string | null; expiresAt: string; revokedAt: string | null }
export const myConnectorSessions = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await noStore();
  const db = context.supabase as AnyClient;
  const { data, error } = await db.from("connector_sessions").select("id,project_id,client_id,scopes,created_at,last_used_at,refresh_expires_at,revoked_at").order("created_at", { ascending: false }).limit(200);
  if (error) throw fail();
  const ids = [...new Set((data ?? []).map((r: Record<string, unknown>) => String(r["project_id"])))];
  const names = new Map<string, string>();
  if (ids.length) { const p = await db.from("projects").select("id,name").in("id", ids); for (const r of p.data ?? []) names.set(String(r["id"]), String(r["name"])); }
  return (data ?? []).map((r: Record<string, unknown>): ConnectorSessionView => ({ id: String(r["id"]), projectId: String(r["project_id"]), projectName: names.get(String(r["project_id"])) ?? "", clientId: String(r["client_id"]), scopes: (r["scopes"] as string[]) ?? [], createdAt: String(r["created_at"]), lastUsedAt: (r["last_used_at"] as string | null) ?? null, expiresAt: String(r["refresh_expires_at"]), revokedAt: (r["revoked_at"] as string | null) ?? null }));
});

export const revokeConnectorSession = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => { if (!isUuid(d?.id)) throw fail(); return d; })
  .handler(async ({ data, context }) => {
    await noStore();
    const { error } = await (context.supabase as AnyClient).rpc("connector_revoke_session", { p_id: data.id });
    if (error) throw fail();
    return true;
  });

export const resolveConnectorConflict = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; choice: ConflictChoice; revision: number }) => { if (!isUuid(d?.id) || !CONFLICT_CHOICES.includes(d.choice) || !Number.isInteger(d.revision)) throw fail(); return d; })
  .handler(async ({ data, context }) => {
    await noStore();
    const { error } = await (context.supabase as AnyClient).rpc("connector_resolve_conflict", { p_id: data.id, p_choice: data.choice, p_revision: data.revision });
    if (error) throw fail();
    return true;
  });
