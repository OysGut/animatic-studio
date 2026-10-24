/**
 * R2: finner foreslåtte AI-filer som ingen rad peker på (regler i src/core/generation/orphan-files.ts).
 * Bare på serveren. Eierkontroll med brukerens egen klient før admin-klienten lastes. Filene listes med
 * lagrings-API-et (ingen SQL mot lagringen).
 */
import { collectProjectPaths, FINISHED_JOB_STATUSES, generatedFolder, isOrphanAiFile, ORPHAN_MAX_LIST, protectedFolders, type OrphanFile } from "@/core/generation/orphan-files";
import { fetchProjectTable, type AnyClient } from "@/adapters/storage/project-rows";
import { t } from "@/core/i18n/keyed";

/** Tabellene som leses: materialrader og angrehistorikk (referanser) og jobber/kvitteringer (bare status). */
export const ORPHAN_REFERENCE_TABLES: readonly string[] = [
  "productions", "scenes", "scene_variants", "script_blocks", "scene_occurrences", "production_segments", "takes",
  "assets", "asset_variants", "asset_versions", "script_annotations", "compositions", "composition_layers", "audio_clips",
  "clip_parts", "time_links", "generation_prompts", "continuity_events", "translations", "asset_relations", "posters",
  "style_profiles", "story_profiles", "story_profile_stages", "story_facts", "story_canvas_nodes", "story_canvas_edges",
  "template_instances", "credit_participants", "credit_sequences", "animation_rigs", "animation_rig_versions", "animation_uses",
  "lipsync_results", "animation_patterns", "dialogue_versions", "dialogue_reviews", "note_flags", "quality_profiles",
  "translation_line_links", "translation_lines", "style_harmonizations", "style_preferred_references", "language_versions",
  "generation_jobs", "harmonize_batches", "harmonize_batch_items", "dialogue_batches", "dialogue_batch_items",
  "change_log", "film_shares", "mobile_imports", "export_records", "imported_documents", "script_versions",
  "story_sessions", "story_suggestions", "script_entity_analysis", "duration_estimates",
  // B-114 C0 (0080): mediefilene til publiseringer
  "publication_media", "storyboard_shares",
  // B-116 (0087): kopierte bidragsfiler under <prosjekt>/shares/
  "showcase_items", "showcase_reservations",
  // C-4 (0112): bilder hentet fra Boords som kandidater under <prosjekt>/connectors/boords/
  "boords_candidates",
  "connector_panel_candidates",
];

/** Tabeller der en jobb som ikke er avsluttet, sperrer hele oppryddingen. */
const JOB_TABLES: readonly string[] = ["generation_jobs", "harmonize_batches", "harmonize_batch_items", "dialogue_batches", "dialogue_batch_items"];

export async function requireOwner(context: { supabase: unknown; userId: string }, projectId: string): Promise<void> {
  const user = context.supabase as AnyClient;
  const member = await user.from("project_members").select("role").eq("project_id", projectId).eq("user_id", context.userId).is("removed_at", null).maybeSingle();
  if (member.error || (member.data as { role?: string } | null)?.role !== "owner") throw new Error(t("r2-orphan-cleanup.error.owner"));
}

export async function orphanCandidates(
  context: { supabase: unknown; userId: string },
  projectId: string,
  now = Date.now(),
): Promise<OrphanFile[]> {
  await requireOwner(context, projectId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as AnyClient;
  const protectedPaths = new Set<string>();
  for (const table of ORPHAN_REFERENCE_TABLES) {
    let rows: Record<string, unknown>[];
    try {
      rows = (await fetchProjectTable(admin, table, projectId, true)) as Record<string, unknown>[];
    } catch {
      throw new Error(t("r2-orphan-cleanup.error.references"));
    }
    if (JOB_TABLES.includes(table)) {
      // Valg C: jobber og kvitteringer beholdes, men teller ikke som referanser. En jobb som ikke er avsluttet, sperrer alt.
      if (rows.some((r) => !FINISHED_JOB_STATUSES.has(String(r["status"] ?? "")))) return [];
      continue;
    }
    collectProjectPaths(projectId, rows, protectedPaths);
  }
  const folders = protectedFolders(protectedPaths);
  const found: OrphanFile[] = [];
  let scanned = 0;
  async function scan(folder: string, depth: number): Promise<void> {
    if (depth > 6 || ++scanned > 2000) throw new Error(t("r2-orphan-cleanup.error.too-many"));
    const { data, error } = await admin.storage.from("assets").list(folder, { limit: 1000 });
    if (error || (data?.length ?? 0) >= 1000) throw new Error(t("r2-orphan-cleanup.error.too-many"));
    for (const item of (data ?? []) as { id: string | null; name: string; created_at: string | null; metadata?: Record<string, unknown> | null }[]) {
      const path = `${folder}/${item.name}`;
      if (!item.id) { await scan(path, depth + 1); continue; }
      if (isOrphanAiFile(projectId, { path, createdAt: item.created_at }, protectedPaths, folders, now))
        found.push({ path, bytes: Number(item.metadata?.["size"] ?? 0) || 0, createdAt: String(item.created_at), mimeType: typeof item.metadata?.["mimetype"] === "string" ? String(item.metadata["mimetype"]) : null });
    }
  }
  await scan(generatedFolder(projectId), 0);
  return found.sort((a, b) => a.path.localeCompare(b.path)).slice(0, ORPHAN_MAX_LIST);
}

/**
 * B-116: utløpte delingsreservasjoner (eldre enn TTL + 1 time, uten bidrag) og filene deres under
 * <prosjekt>/shares/<id>/. Filen slettes først; reservasjonen frigjøres bare når slettingen lyktes.
 * Ved feil beholdes reservasjonen til neste kjøring, og feilen logges uten lagringsnøkler.
 */
export async function sweepShowcaseReservations(
  admin: AnyClient, projectId: string, log: (msg: string, meta: Record<string, unknown>) => void = (m, meta) => console.error(m, meta),
): Promise<{ released: number; kept: number }> {
  let listed: { data: unknown; error: unknown };
  try { listed = await admin.rpc("stale_showcase_reservations", { p_project: projectId }); }
  catch { listed = { data: null, error: true }; }
  if (listed.error || !Array.isArray(listed.data)) {
    log("[showcase-sweep] list failed", { projectId });
    return { released: 0, kept: 0 };
  }
  let released = 0, kept = 0;
  for (const row of listed.data as { id?: unknown; storage_key?: unknown }[]) {
    const id = typeof row.id === "string" ? row.id : null;
    if (!id) continue;
    const key = typeof row.storage_key === "string" ? row.storage_key : null;
    if (key !== null) {
      const valid = key.startsWith(`${projectId}/shares/${id}/`) && !key.includes("..") && key.length <= 500;
      if (!valid) { kept++; log("[showcase-sweep] invalid target kept", { projectId, reservation: id }); continue; }
      let ok = false;
      try { ok = !(await admin.storage.from("assets").remove([key])).error; } catch { ok = false; }
      if (!ok) { kept++; log("[showcase-sweep] remove failed, kept for next run", { projectId, reservation: id }); continue; }
    }
    let relError: unknown = null;
    try { relError = (await admin.rpc("release_stale_showcase_reservation", { p_reservation: id })).error; } catch { relError = true; }
    if (relError) { kept++; log("[showcase-sweep] release failed", { projectId, reservation: id }); continue; }
    released++;
  }
  return { released, kept };
}
