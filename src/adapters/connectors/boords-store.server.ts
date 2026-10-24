/**
 * C-4: BoordsStore mot Lovable Cloud (service role, bare på serveren) og oppslag av tilkoblingen med
 * dekryptert nøkkel. Nøkkelen forlater aldri denne modulen annet enn til BoordsClient.
 */
import { newId, type ProjectState } from "@/core";
import { sha256Hex, BOORDS_CLIENT_ID, type PanelLike } from "@/core/connectors";
import { loadProjectState, type AnyClient } from "@/adapters/storage/project-rows";
import type { BoordsStore } from "./boords.server";

export async function adminDb(): Promise<AnyClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyClient;
}

/** Identiteten som binder chifferet (AAD): eier-bruker eller arbeidsgruppe. */
export const ownerAad = (c: { owner_kind: string; user_id: string; workspace_id: string | null }) => (c.owner_kind === "workspace" ? `workspace:${c.workspace_id}` : String(c.user_id));

export interface ConnectionRow { id: string; owner_kind: "user" | "workspace"; user_id: string; workspace_id: string | null; ciphertext: string; iv: string; key_version: number; webhook_ciphertext: string | null; webhook_iv: string | null; webhook_key_version: number | null; sync_cursor: string | null }

export async function decryptConnection(c: ConnectionRow): Promise<{ apiKey: string; webhookSecret: string | null }> {
  const { decryptKey } = await import("@/adapters/ai/key-vault.server");
  const ctx = { userId: ownerAad(c), provider: "boords", rowId: c.id };
  const apiKey = await decryptKey({ ciphertext: c.ciphertext, iv: c.iv, key_version: c.key_version }, ctx);
  const webhookSecret = c.webhook_ciphertext && c.webhook_iv ? await decryptKey({ ciphertext: c.webhook_ciphertext, iv: c.webhook_iv, key_version: c.webhook_key_version ?? c.key_version }, { ...ctx, provider: "boords-webhook" }) : null;
  return { apiKey, webhookSecret };
}

export function panelsOf(s: ProjectState): Map<string, PanelLike> {
  const out = new Map<string, PanelLike>();
  for (const c of Object.values(s.compositions)) {
    if (c.removed || c.kind !== "storyboard") continue;
    const d = c.storyboard;
    const dialogueLines = (d?.dialogueIds ?? []).map(id => s.blocks[id as never]).filter(b => b && !b.removed).map(b => b!.text);
    out.set(c.id, { id: c.id, number: d?.number ?? "", fields: d?.fields ?? {}, dialogueLines });
  }
  return out;
}

export function cloudBoordsStore(db: AnyClient): BoordsStore {
  const must = <T>(r: { data: T; error: unknown }): T => { if (r.error) throw r.error; return r.data; };
  return {
    async panels(projectId) { return panelsOf(await loadProjectState(db, projectId)); },
    async projectLink(projectId, connectionId) {
      const r = must(await db.from("boords_project_links").select("storyboard_id,manifest_id").eq("project_id", projectId).eq("connection_id", connectionId).maybeSingle()) as Record<string, string> | null;
      return r ? { storyboardId: r["storyboard_id"]!, manifestId: r["manifest_id"]! } : null;
    },
    async saveProjectLink(l) { must(await db.from("boords_project_links").insert({ project_id: l.projectId, connection_id: l.connectionId, storyboard_id: l.storyboardId, manifest_id: l.manifestId, created_by: l.userId })); },
    async links(projectId) {
      const rows = must(await db.from("connector_links").select("id,entity_id,external_id").eq("project_id", projectId).eq("client_id", BOORDS_CLIENT_ID).eq("entity", "panel").eq("removed", false)) as Record<string, string>[];
      return (rows ?? []).map(r => ({ id: r["id"]!, projectId, panelId: r["entity_id"]!, frameId: r["external_id"]! }));
    },
    async saveLink(l) {
      const r = must(await db.from("connector_links").upsert({ project_id: l.projectId, client_id: BOORDS_CLIENT_ID, external_id: l.frameId, entity: "panel", entity_id: l.panelId, created_by: l.userId, removed: false }, { onConflict: "project_id,client_id,external_id,entity" }).select("id").single()) as Record<string, string>;
      return r["id"]!;
    },
    async frameStates(projectId) {
      const links = await this.links(projectId);
      const rows = must(await db.from("boords_frame_state").select("link_id,our_hash,their_hash").eq("project_id", projectId)) as Record<string, string | null>[];
      const by = new Map((rows ?? []).map(r => [r["link_id"], r]));
      return links.map(l => ({ linkId: l.id, panelId: l.panelId, frameId: l.frameId, ourHash: (by.get(l.id)?.["our_hash"] as string | null) ?? null, theirHash: (by.get(l.id)?.["their_hash"] as string | null) ?? null }));
    },
    async saveFrameState(s) {
      const row: Record<string, unknown> = { link_id: s.linkId, project_id: s.projectId, our_hash: s.ourHash, their_hash: s.theirHash, updated_at: new Date().toISOString() };
      if (s.theirImage !== undefined) row["their_image"] = s.theirImage;
      must(await db.from("boords_frame_state").upsert(row, { onConflict: "link_id" }));
    },
    async imageSeen(linkId) { const r = must(await db.from("boords_frame_state").select("their_image").eq("link_id", linkId).maybeSingle()) as Record<string, string | null> | null; return r?.["their_image"] ?? null; },
    async insertCandidate(c) {
      const r = await db.from("boords_candidates").upsert({ project_id: c.projectId, link_id: c.linkId, panel_id: c.panelId, frame_id: c.frameId, kind: c.kind, incoming: c.incoming, incoming_hash: c.incomingHash, conflict: c.conflict, media_path: c.mediaPath, media_sha256: c.mediaSha256 }, { onConflict: "link_id,kind,incoming_hash", ignoreDuplicates: true }).select("id");
      if (r.error) throw r.error;
      return ((r.data as unknown[]) ?? []).length > 0;
    },
    async storeImage(projectId, bytes) {
      const sha = sha256Hex(bytes), path = `${projectId}/connectors/boords/${sha}.png`;
      const up = await db.storage.from("assets").upload(path, bytes, { contentType: "image/png", upsert: true });
      if (up.error) throw up.error;
      return { path, sha256: sha };
    },
    async knownComments(projectId) { const rows = must(await db.from("boords_comments").select("boords_comment_id").eq("project_id", projectId)) as Record<string, string>[]; return new Set((rows ?? []).map(r => r["boords_comment_id"]!)); },
    async insertComment(c) { must(await db.from("boords_comments").upsert({ project_id: c.projectId, panel_id: c.panelId, boords_comment_id: c.boordsId, direction: c.direction, feedback_id: c.feedbackId, author: c.author, text: c.text }, { onConflict: "project_id,boords_comment_id", ignoreDuplicates: true })); },
    async unsentFeedback(projectId) {
      const sent = new Set(((must(await db.from("boords_comments").select("feedback_id").eq("project_id", projectId).eq("direction", "out")) as Record<string, string | null>[]) ?? []).map(r => r["feedback_id"]));
      const fb = (must(await db.from("storyboard_feedback").select("id,share_id,panel_key,guest_name,text").eq("project_id", projectId).neq("text", "").order("created_at").limit(200)) as Record<string, string>[]) ?? [];
      const shares = new Map<string, Map<string, string>>();
      const out: { id: string; panelId: string | null; author: string; text: string }[] = [];
      for (const f of fb) {
        if (sent.has(f["id"]!)) continue;
        if (!shares.has(f["share_id"]!)) {
          const s = must(await db.from("storyboard_shares").select("manifest").eq("id", f["share_id"]).maybeSingle()) as { manifest?: { key: string; panelId: string }[] } | null;
          shares.set(f["share_id"]!, new Map((s?.manifest ?? []).map(p => [p.key, p.panelId])));
        }
        out.push({ id: f["id"]!, panelId: shares.get(f["share_id"]!)!.get(f["panel_key"]!) ?? null, author: f["guest_name"] ?? "", text: f["text"] ?? "" });
      }
      return out;
    },
    async setCursor(connectionId, cursor) { must(await db.from("boords_connections").update({ sync_cursor: cursor, last_sync_at: new Date().toISOString() }).eq("id", connectionId)); },
  };
}

export const newManifestId = (): string => newId();
