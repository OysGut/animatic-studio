/**
 * C-1: HandoffStore against Lovable Cloud (service role, server only). Token lookups via the 0110 RPC;
 * candidates go through apply_changes as the acting editor (role check there).
 */
import { diffStates } from "@/core";
import { loadProjectState, type AnyClient } from "@/adapters/storage/project-rows";
import { applyLocally, type HandoffRecord, type HandoffStore, type ReturnTransfer } from "./intake";

const chunkPath = (t: { projectId: string; id: string }, i: number) => `${t.projectId}/connectors/${t.id}/part-${i}`;
export const handoffRow = (r: Record<string, any>): HandoffRecord => ({
  id: r["id"], projectId: r["project_id"], createdBy: r["created_by"], targetKind: r["target_kind"], targetId: r["target_id"],
  assetId: r["asset_id"] ?? null, variantId: r["variant_id"] ?? null, sceneId: r["scene_id"] ?? null, baseVersionId: r["base_version_id"] ?? null,
  baseRevision: Number(r["base_revision"] ?? 1), format: r["format"], fileName: r["file_name"], expiresAt: r["expires_at"], status: r["status"],
});
const transferRow = (r: Record<string, any>): ReturnTransfer => ({
  id: r["id"], projectId: r["project_id"], handoffId: r["handoff_id"], sender: r["sender"], fileName: r["file_name"], byteSize: Number(r["byte_size"]),
  sha256: r["sha256"], assetId: r["asset_id"], variantId: r["variant_id"], baseVersionId: r["base_version_id"] ?? null,
  status: r["status"], candidateVersionId: r["candidate_version_id"] ?? null, conflictId: r["conflict_id"] ?? null,
});

export async function cloudHandoffStore(): Promise<HandoffStore & { db: AnyClient }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as AnyClient;
  return {
    db,
    async rateLimit(scope, keys) { const r = await db.rpc("rate_limit_hit", { p_scope: scope, p_keys: keys }); return !r.error; },
    async byToken(hash) { const { data, error } = await db.rpc("handoff_by_token", { p_hash: hash }); return error || !data ? null : handoffRow(data); },
    async getTransfer(id) {
      if (!/^[0-9a-f-]{36}$/.test(id)) return null;
      const { data } = await db.from("connector_transfers").select("*").eq("id", id).maybeSingle();
      return data && data["handoff_id"] ? transferRow(data) : null;
    },
    async insertTransfer(t, key) {
      const { error } = await db.from("connector_transfers").insert({ id: t.id, project_id: t.projectId, handoff_id: t.handoffId, sender: t.sender, direction: "in", idempotency_key: key, fingerprint: `handoff:${t.handoffId}:${t.sha256}:${t.byteSize}`, file_name: t.fileName, byte_size: t.byteSize, sha256: t.sha256, asset_id: t.assetId, variant_id: t.variantId, base_version_id: t.baseVersionId });
      if (error) throw error;
    },
    async setTransfer(id, p) {
      await db.from("connector_transfers").update({ ...(p.status ? { status: p.status } : {}), ...(p.candidateVersionId !== undefined ? { candidate_version_id: p.candidateVersionId } : {}), ...(p.conflictId !== undefined ? { conflict_id: p.conflictId } : {}), updated_at: new Date().toISOString() }).eq("id", id);
    },
    async checkQuota(projectId, bytes) { const r = await db.rpc("connector_check_quota", { p_project: projectId, p_bytes: bytes }); return r.data === true; },
    async putChunk(t, i, bytes) { const up = await db.storage.from("assets").upload(chunkPath(t, i), bytes, { upsert: true, contentType: "application/octet-stream" }); if (up.error) throw up.error; },
    async chunkIndexes(t) {
      const { data } = await db.storage.from("assets").list(`${t.projectId}/connectors/${t.id}`, { limit: 100 });
      return ((data ?? []) as { name: string }[]).map((f) => /^part-(\d+)$/.exec(f.name)?.[1]).filter((x): x is string => !!x).map(Number);
    },
    async readChunk(t, i) { const { data, error } = await db.storage.from("assets").download(chunkPath(t, i)); if (error || !data) throw error ?? new Error("chunk"); return new Uint8Array(await data.arrayBuffer()); },
    async removeChunks(t) { const n = Math.ceil(t.byteSize / (4 * 1024 * 1024)); await db.storage.from("assets").remove(Array.from({ length: n }, (_, i) => chunkPath(t, i))); },
    async loadState(projectId) { return loadProjectState(db, projectId); },
    async uploadFile(path, parts, mimeType) { const up = await db.storage.from("assets").upload(path, new Blob(parts as BlobPart[], { type: mimeType }), { contentType: mimeType, upsert: false }); if (up.error) throw up.error; },
    async applyCommands(projectId, actor, state, commands) {
      let s = state;
      for (const command of commands) {
        const r = applyLocally(s, actor, command);
        const { error } = await db.rpc("apply_changes", { p_project: projectId, p_actor: actor, p_command_id: crypto.randomUUID(), p_command: command, p_inverse: r.inverse, p_changes: diffStates(s, r.state) });
        if (error) throw error;
        s = r.state;
      }
      return s;
    },
    async insertConflict(c) {
      const { data, error } = await db.from("connector_conflicts").insert({ project_id: c.projectId, transfer_id: c.transferId, variant_id: c.variantId, base_version_id: c.baseVersionId, current_version_id: c.currentVersionId, incoming_version_id: c.incomingVersionId }).select("id").single();
      if (error) throw error; return String(data["id"]);
    },
    async markHandoff(id, p) { await db.from("connector_handoffs").update({ status: p.status, transfer_id: p.transferId, candidate_version_id: p.candidateVersionId, updated_at: new Date().toISOString() }).eq("id", id); },
  };
}
