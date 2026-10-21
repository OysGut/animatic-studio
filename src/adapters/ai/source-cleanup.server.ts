
import { removableAiSource } from "@/core/generation/source-cleanup";
import type { AnyClient } from "@/adapters/storage/project-rows";
import { t } from "@/core/i18n/keyed";

export async function aiSourceCandidates(context: { supabase: unknown; userId: string }, projectId: string): Promise<{ path: string; bytes: number }[]> {
  const user = context.supabase as AnyClient;
  const member = await user.from("project_members").select("role").eq("project_id", projectId).eq("user_id", context.userId).is("removed_at", null).maybeSingle();
  if (member.error || (member.data as { role?: string } | null)?.role !== "owner") throw new Error(t("adapters-ai-source-cleanup-server.ai-source-candidates.message.e04e9b34562d"));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as AnyClient;
  // Aktive jobber sperrer all opprydding: de kan få nye referanser under kjøringen.
  const jobs = await admin.from("generation_jobs").select("status, params, result_path").eq("project_id", projectId).limit(1001);
  if (jobs.error || (jobs.data?.length ?? 0) >= 1001) throw new Error(t("adapters-ai-source-cleanup-server.ai-source-candidates.message.507a4dfde77d"));
  const rows = (jobs.data ?? []) as { status: string; params: unknown; result_path: string | null }[];
  if (rows.some((j) => j.status !== "done" && j.status !== "failed")) return [];
  const protectedPaths = new Set<string>();
  const remember = (v: unknown): void => {
    if (typeof v === "string" && v.startsWith(`${projectId}/`)) protectedPaths.add(v);
    else if (Array.isArray(v)) v.forEach(remember);
    else if (v && typeof v === "object") Object.values(v).forEach(remember);
  };
  for (const job of rows) { remember(job.params); remember(job.result_path); }
  for (const [table, column] of [["takes", "media_ref"], ["asset_versions", "media_path"], ["mobile_imports", "path"]] as const) {
    const response = await admin.from(table).select(column).eq("project_id", projectId).limit(10001);
    if (response.error || (response.data?.length ?? 0) >= 10001) throw new Error(t("adapters-ai-source-cleanup-server.ai-source-candidates.message.832a1476c2e2"));
    remember(response.data);
  }
  const found: { path: string; bytes: number }[] = [];
  let scanned = 0;
  async function scan(folder: string, depth: number): Promise<void> {
    if (depth > 6 || ++scanned > 100) throw new Error(t("adapters-ai-source-cleanup-server.scan.message.2453505a500d"));
    const { data, error } = await supabaseAdmin.storage.from("assets").list(folder, { limit: 1000 });
    if (error || (data?.length ?? 0) >= 1000) throw new Error(t("adapters-ai-source-cleanup-server.scan.message.b2f38521fbbc"));
    for (const item of data ?? []) {
      const path = `${folder}/${item.name}`;
      if (!item.id) await scan(path, depth + 1);
      else if (removableAiSource(projectId, path, item.created_at, protectedPaths, Date.now())) found.push({ path, bytes: Number(item.metadata?.["size"] ?? 0) });
    }
  }
  await scan(`${projectId}/temp/ai-source`, 0);
  await scan(`${projectId}/ai-source`, 0);
  return found.slice(0, 100);
}