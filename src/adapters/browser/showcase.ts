/**
 * B-116: utstillingsvindu – nettleserkallene som går direkte mot databasefunksjonene (0087) med
 * brukerens egen tilkobling. Filkopiering og signering skjer i serverfunksjonene
 * (src/adapters/community/showcase.functions.ts). Ved feil regnes alt som tomt/av.
 */
import { db, browserClient, plainError, type BackendError } from "./client";
import { ASSET_BUCKET, createSignedUrls } from "./storage-files";
import {
  parseAdminShowcaseQueue,
  parseMyShowcaseItems,
  parseShowcaseComments,
  type AdminShowcaseQueue,
  type MyShowcaseItem,
  type ShowcaseComment,
} from "@/core/community";

/** Egne bidrag med signerte medielenker (600 s), til «Mine delinger». */
export async function fetchMyShowcaseItems(now: number): Promise<readonly MyShowcaseItem[]> {
  const { data, error } = await db.rpc("my_showcase_items" as never, {} as never);
  if (error) return [];
  const items = parseMyShowcaseItems(data, now);
  const keys = items.map((i) => i.storageKey).filter((k): k is string => k !== null);
  if (!keys.length) return items;
  let urls: Record<string, string> = {};
  try {
    urls = Object.fromEntries((await createSignedUrls(ASSET_BUCKET, keys, 600)).map((u) => [u.path, u.signedUrl]));
  } catch {
    return items;
  }
  return items.map((i) => (i.storageKey && urls[i.storageKey] ? { ...i, url: urls[i.storageKey] ?? i.url } : i));
}

export async function updateShowcaseItem(
  id: string,
  patch: { title?: string; text?: string; expires_at?: string },
): Promise<BackendError | null> {
  const { error } = await db.rpc("update_showcase_item" as never, { p_id: id, p_patch: patch } as never);
  return plainError(error);
}

export async function revokeShowcaseItem(id: string): Promise<BackendError | null> {
  const { error } = await db.rpc("revoke_showcase_item" as never, { p_id: id } as never);
  return plainError(error);
}

/** Kommentarene til et synlig bidrag (leses også utlogget). */
export async function fetchShowcaseComments(itemId: string): Promise<readonly ShowcaseComment[]> {
  const { data, error } = await db.rpc("showcase_comments" as never, { p_item: itemId } as never);
  return error ? [] : parseShowcaseComments(data);
}

export async function addShowcaseComment(itemId: string, text: string): Promise<BackendError | null> {
  const { error } = await db.rpc("add_showcase_comment" as never, { p_item: itemId, p_text: text } as never);
  return plainError(error);
}

export async function removeShowcaseComment(id: string): Promise<BackendError | null> {
  const { error } = await db.rpc("remove_showcase_comment" as never, { p_id: id } as never);
  return plainError(error);
}

/** Rapportering av bidrag («showcase») og kommentarer («comment») – samme kø som C0. */
export async function reportContent(kind: "showcase" | "comment", targetId: string, reason: string, text: string): Promise<BackendError | null> {
  const { error } = await db.rpc("report_content" as never, { p_kind: kind, p_target: targetId, p_reason: reason, p_text: text } as never);
  return plainError(error);
}

/* ---------- kandidater fra egne prosjekter ---------- */

export interface ShowcaseCandidate {
  readonly id: string;
  readonly name: string;
  /** Kildefilen i prosjektet som kopieres ved deling. */
  readonly sourceKey: string;
  readonly mime: string;
  readonly durationMs: number | null;
  readonly width: number | null;
  readonly height: number | null;
}

interface VersionRow {
  id: string;
  created_at: string;
  media_path: string | null;
  mime_type: string | null;
  number: number;
  removed: boolean;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
}

function newest(rows: readonly VersionRow[], mimePrefix: string): VersionRow | null {
  const ok = rows.filter((v) => !v.removed && v.media_path && v.mime_type?.startsWith(mimePrefix));
  ok.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  return ok[0] ?? null;
}

/** Ressurser med bilde (karakter/ressurs) eller lyd (lydbit): nyeste ikke-fjernede versjon per ressurs. */
export async function listAssetCandidates(projectId: string): Promise<{ images: ShowcaseCandidate[]; audio: ShowcaseCandidate[] }> {
  const { data, error } = await db
    .from("assets")
    .select("id,kind,name,asset_variants(asset_versions(id,created_at,media_path,mime_type,number,removed,duration_ms,width,height))")
    .eq("project_id", projectId)
    .eq("removed", false);
  if (error || !Array.isArray(data)) return { images: [], audio: [] };
  const images: ShowcaseCandidate[] = [];
  const audio: ShowcaseCandidate[] = [];
  for (const a of data as Record<string, unknown>[]) {
    const versions = ((a["asset_variants"] as Record<string, unknown>[] | null) ?? []).flatMap(
      (v) => (v["asset_versions"] as VersionRow[] | null) ?? [],
    );
    const img = newest(versions, "image/");
    if (img?.media_path && img.mime_type)
      images.push({ id: img.id, name: String(a["name"] ?? ""), sourceKey: img.media_path, mime: img.mime_type, durationMs: img.duration_ms, width: img.width, height: img.height });
    const snd = newest(versions, "audio/");
    if (snd?.media_path && snd.mime_type)
      audio.push({ id: snd.id, name: String(a["name"] ?? ""), sourceKey: snd.media_path, mime: snd.mime_type, durationMs: snd.duration_ms, width: null, height: null });
  }
  return { images, audio };
}

/** Scener med en eksportert klippfil (takes med media_ref), til «en kort scene». */
export async function listSceneCandidates(projectId: string): Promise<ShowcaseCandidate[]> {
  const { data, error } = await db
    .from("takes")
    .select("id,kind,duration_frames,media_ref,created_at,scene_occurrences(production_number,productions(fps_num,fps_den))")
    .eq("project_id", projectId)
    .not("media_ref", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !Array.isArray(data)) return [];
  const out: ShowcaseCandidate[] = [];
  for (const t of data as Record<string, unknown>[]) {
    const key = typeof t["media_ref"] === "string" ? t["media_ref"] : null;
    if (!key || !key.startsWith(`${projectId}/`)) continue;
    const occ = t["scene_occurrences"] as { production_number?: string | null; productions?: { fps_num: number; fps_den: number } | null } | null;
    const still = t["kind"] === "still";
    const fps = occ?.productions;
    const frames = t["duration_frames"];
    const durationMs = !still && typeof frames === "number" && fps && fps.fps_num > 0
      ? Math.ceil(frames * fps.fps_den * 1000 / fps.fps_num) : null;
    if (!still && (durationMs === null || durationMs < 1 || durationMs > 15000)) continue;
    const num = occ?.production_number ? ` ${occ.production_number}` : "";
    out.push({ id: String(t["id"]), name: `${num}`.trim() ? `Scene${num}` : String(t["id"]).slice(0, 8), sourceKey: key, mime: still ? "image/png" : "video/mp4", durationMs, width: null, height: null });
  }
  return out;
}

/** Kun valgbare replikker fra prosjektet; teksten er lokal forhåndsvisning, aldri skriveinput. */
export async function listDialogueCandidates(projectId: string): Promise<readonly { id: string; text: string }[]> {
  const { data, error } = await db.from("script_blocks").select("id,text")
    .eq("project_id", projectId).eq("kind", "dialogue").eq("removed", false).order("order_key");
  if (error || !Array.isArray(data)) return [];
  return data.flatMap(row => typeof row.id === "string" && typeof row.text === "string"
    ? [{ id: row.id, text: row.text }] : []);
}

/* ---------- profil og avatar ---------- */

export async function saveMyPublicProfile(input: { handle: string | null; bio: string; avatarKey: string | null; isPublic: boolean }): Promise<BackendError | null> {
  const { error } = await db.rpc("set_my_public_profile" as never, {
    p_handle: input.handle, p_bio: input.bio, p_avatar_key: input.avatarKey, p_is_public: input.isPublic, p_fields: {},
  } as never);
  return plainError(error);
}

/** Laster opp avataren med den signerte lenken fra prepareAvatarUpload. */
export async function uploadAvatar(path: string, token: string, file: Blob): Promise<BackendError | null> {
  const { error } = await browserClient.storage.from(ASSET_BUCKET).uploadToSignedUrl(path, token, file);
  return plainError(error);
}

/* ---------- admin ---------- */

export async function fetchAdminShowcaseQueue(): Promise<AdminShowcaseQueue | null> {
  const { data, error } = await db.rpc("admin_showcase_queue" as never, {} as never);
  return error ? null : parseAdminShowcaseQueue(data);
}

export async function reviewShowcaseItem(id: string, approve: boolean): Promise<BackendError | null> {
  const { error } = await db.rpc("admin_review_showcase_item" as never, { p_id: id, p_approve: approve } as never);
  return plainError(error);
}

export async function setShowcaseApproval(required: boolean): Promise<BackendError | null> {
  const { error } = await db.rpc("admin_set_showcase_approval" as never, { p_required: required } as never);
  return plainError(error);
}
