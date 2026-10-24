/**
 * C-0: ConnectorStore mot Lovable Cloud. Bare på serveren (service role). Tokenoppslag, koder og sesjoner
 * går via security-definer-RPC-er i 0109; kandidatversjonen går via apply_changes som brukeren som
 * godkjente tilkoblingen (redaktørsjekk der).
 */
import { applyCommand, diffStates, newId } from "@/core";
import { planCandidate } from "@/core/connectors";
import { loadProjectState, type AnyClient } from "@/adapters/storage/project-rows";
import type { ConnectorStore, StoredTransfer } from "./api-v1";

const chunkPath = (t: { projectId: string; id: string }, i: number) => `${t.projectId}/connectors/${t.id}/part-${i}`;
const row = (r: Record<string, any>): StoredTransfer => ({
  id: r["id"], projectId: r["project_id"], sessionId: r["session_id"], idempotencyKey: r["idempotency_key"], fingerprint: r["fingerprint"],
  fileName: r["file_name"], byteSize: Number(r["byte_size"]), sha256: r["sha256"], assetId: r["asset_id"], variantId: r["variant_id"],
  baseVersionId: r["base_version_id"], status: r["status"], candidateVersionId: r["candidate_version_id"], conflictId: r["conflict_id"],
});

export async function cloudConnectorStore(): Promise<ConnectorStore> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as AnyClient;
  const rpc = async (fn: string, args: Record<string, unknown>) => { const r = await db.rpc(fn, args); if (r.error) throw r.error; return r.data; };
  const projectOf = new Map<string, string>();
  return {
    async rateLimit(scope, keys) { const r = await db.rpc("rate_limit_hit", { p_scope: scope, p_keys: keys }); return !r.error; },
    async consumeCode(hash) { return await rpc("connector_consume_code", { p_hash: hash }); },
    async createSession(s) {
      const { data, error } = await db.from("connector_sessions").insert({ project_id: s.projectId, user_id: s.userId, client_id: s.clientId, scopes: s.scopes, access_hash: s.accessHash, refresh_hash: s.refreshHash, access_expires_at: s.accessExpiresAt, refresh_expires_at: s.refreshExpiresAt }).select("id").single();
      if (error) throw error; return String(data["id"]);
    },
    async sessionByAccess(hash) { return await rpc("connector_session_by_access", { p_hash: hash }); },
    async rotateRefresh(old, n) { return await rpc("connector_rotate_refresh", { p_old: old, p_access: n.accessHash, p_refresh: n.refreshHash, p_access_exp: n.accessExpiresAt, p_refresh_exp: n.refreshExpiresAt }); },
    async createDevice(d) { await rpc("connector_create_device", { p_hash: d.deviceHash, p_user_code: d.userCode, p_client: d.clientId, p_scopes: d.scopes, p_expires: d.expiresAt }); },
    async pollDevice(hash) { return await rpc("connector_poll_device", { p_hash: hash }); },
    async revokeByToken(hash) { await rpc("connector_revoke_token", { p_hash: hash }); },
    async loadState(projectId) { return loadProjectState(db, projectId); },
    async findTransfer(projectId, key) {
      const { data } = await db.from("connector_transfers").select("*").eq("project_id", projectId).eq("idempotency_key", key).maybeSingle();
      return data ? row(data) : null;
    },
    async getTransfer(projectId, id) {
      if (!/^[0-9a-f-]{36}$/.test(id)) return null;
      const { data } = await db.from("connector_transfers").select("*").eq("project_id", projectId).eq("id", id).maybeSingle();
      if (data) projectOf.set(id, projectId);
      return data ? row(data) : null;
    },
    async insertTransfer(t) {
      const sess = await db.from("connector_sessions").select("user_id").eq("id", t.sessionId).single();
      const { error } = await db.from("connector_transfers").insert({ id: t.id, project_id: t.projectId, session_id: t.sessionId, sender: sess.data?.["user_id"], idempotency_key: t.idempotencyKey, fingerprint: t.fingerprint, file_name: t.fileName, byte_size: t.byteSize, sha256: t.sha256, asset_id: t.assetId, variant_id: t.variantId, base_version_id: t.baseVersionId });
      if (error) throw error; projectOf.set(t.id, t.projectId);
    },
    async checkQuota(projectId, bytes) { return (await rpc("connector_check_quota", { p_project: projectId, p_bytes: bytes })) === true; },
    async putChunk(id, i, bytes) {
      const projectId = projectOf.get(id)!;
      const up = await db.storage.from("assets").upload(chunkPath({ projectId, id }, i), bytes, { upsert: true, contentType: "application/octet-stream" });
      if (up.error) throw up.error;
      // Mottatte biter leses fra lagringen.
    },
    async chunkIndexes(id) {
      const projectId = projectOf.get(id);
      if (!projectId) return [];
      const { data } = await db.storage.from("assets").list(`${projectId}/connectors/${id}`, { limit: 100 });
      return ((data ?? []) as { name: string }[]).map(f => /^part-(\d+)$/.exec(f.name)?.[1]).filter((x): x is string => !!x).map(Number);
    },
    async readChunk(id, i) {
      const { data, error } = await db.storage.from("assets").download(chunkPath({ projectId: projectOf.get(id)!, id }, i));
      if (error || !data) throw error ?? new Error("chunk");
      return new Uint8Array(await data.arrayBuffer());
    },
    async createCandidate(t, file, actor) {
      let state = await loadProjectState(db, t.projectId);
      const variant = state.assetVariants[t.variantId];
      if (!variant) throw new Error("target");
      const versionId = newId<"assetVersion">();
      const path = `${t.projectId}/${t.assetId}/${versionId}/${t.fileName}`;
      const blob = new Blob(file.bytes as BlobPart[], { type: file.mimeType });
      const up = await db.storage.from("assets").upload(path, blob, { contentType: file.mimeType, upsert: false });
      if (up.error) throw up.error;
      const plan = planCandidate({ versionId, variantId: t.variantId, approvedVersionId: variant.approvedVersionId, baseVersionId: t.baseVersionId, media: { path, mimeType: file.mimeType, byteSize: t.byteSize, sha256: file.sha256, width: null, height: null }, note: `connector:${t.id}` });
      for (const command of plan.commands) {
        const id = newId<"command">();
        const r = applyCommand(state, { id, actor: actor as never, at: new Date().toISOString(), command });
        if (!r.ok) throw new Error(r.error.message);
        const { error } = await db.rpc("apply_changes", { p_project: t.projectId, p_actor: actor, p_command_id: id, p_command: command, p_inverse: r.inverse, p_changes: diffStates(state, r.state) });
        if (error) throw error;
        state = r.state;
      }
      let conflictId: string | null = null;
      if (plan.conflict) {
        const c = await db.from("connector_conflicts").insert({ project_id: t.projectId, transfer_id: t.id, variant_id: t.variantId, base_version_id: t.baseVersionId, current_version_id: variant.approvedVersionId, incoming_version_id: versionId }).select("id").single();
        if (c.error) throw c.error; conflictId = String(c.data["id"]);
      }
      await db.from("connector_transfers").update({ status: "candidate", candidate_version_id: versionId, conflict_id: conflictId, updated_at: new Date().toISOString() }).eq("id", t.id);
      await db.storage.from("assets").remove(Array.from({ length: Math.ceil(t.byteSize / (8 * 1024 * 1024)) }, (_, i) => chunkPath(t, i)));
      return { versionId, conflictId };
    },
    async setTransferStatus(id, status) { await db.from("connector_transfers").update({ status, updated_at: new Date().toISOString() }).eq("id", id); },
    async readFile(projectId, path) {
      if (!path.startsWith(projectId + "/")) return null; // bare filer i prosjektets egen mappe
      const { data, error } = await db.storage.from("assets").download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    async resolveConflict(projectId, userId, id, choice, revision) {
      const r = await db.rpc("connector_resolve_conflict_for", { p_user: userId, p_project: projectId, p_id: id, p_choice: choice, p_revision: revision });
      if (r.error) return "not_found";
      return r.data as "ok" | "stale" | "not_found" | "forbidden" | "choice";
    },
    async listConflicts(projectId) {
      const { data } = await db.from("connector_conflicts").select("id,variant_id,base_version_id,current_version_id,incoming_version_id,status,choice,created_at,revision").eq("project_id", projectId).order("created_at", { ascending: false }).limit(200);
      return data ?? [];
    },
  };
}
