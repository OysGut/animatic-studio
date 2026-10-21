/**
 * R2: opprydding av foreldreløse AI-filer for prosjekteieren. Forhåndsvisning sletter ingenting. Sletting krever
 * eksplisitt bekreftelse med listen fra forhåndsvisningen, beregner kandidatene på nytt og sletter bare filer
 * som fortsatt er foreldreløse. Hver sletting logges i storage_cleanups.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUuid } from "@/core";
import { orphanBytes } from "@/core/generation/orphan-files";
import { t } from "@/core/i18n/keyed";

function validate(input: unknown) {
  const data = input as { projectId?: unknown; paths?: unknown; confirmed?: unknown } | null;
  if (!data || typeof data.projectId !== "string" || !isUuid(data.projectId)) throw new Error(t("r2-orphan-cleanup.error.input"));
  if (data.paths !== undefined && (!Array.isArray(data.paths) || data.paths.length > 200 || !data.paths.every((p) => typeof p === "string" && p.length <= 600)))
    throw new Error(t("r2-orphan-cleanup.error.input"));
  return { projectId: data.projectId, paths: data.paths as string[] | undefined, confirmed: data.confirmed === true };
}

export const previewOrphanCleanup = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(validate)
  .handler(async ({ data, context }) => {
    const { orphanCandidates } = await import("./orphan-cleanup.server");
    const files = await orphanCandidates(context, data.projectId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const images = files.filter((f) => (f.mimeType ?? "").startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(f.path)).map((f) => f.path);
    const thumbs = new Map<string, string>();
    if (images.length) {
      const signed = await supabaseAdmin.storage.from("assets").createSignedUrls(images, 600);
      for (const s of signed.data ?? []) if (s.path && s.signedUrl) thumbs.set(s.path, s.signedUrl);
    }
    return { files: files.map((f) => ({ ...f, thumbUrl: thumbs.get(f.path) ?? null })), totalBytes: orphanBytes(files) };
  });

export const confirmOrphanCleanup = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(validate)
  .handler(async ({ data, context }) => {
    if (!data.confirmed || !data.paths?.length) throw new Error(t("r2-orphan-cleanup.error.confirm"));
    const { orphanCandidates } = await import("./orphan-cleanup.server");
    const fresh = await orphanCandidates(context, data.projectId);
    const still = new Map(fresh.map((f) => [f.path, f]));
    const remove = [...new Set(data.paths)].filter((p) => still.has(p));
    const skipped = data.paths.length - remove.length;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (remove.length) {
      const { error } = await supabaseAdmin.storage.from("assets").remove(remove);
      if (error) throw new Error(t("r2-orphan-cleanup.error.remove"));
    }
    const bytes = orphanBytes(remove.map((p) => still.get(p)!));
    const log = await (supabaseAdmin as unknown as { from: (t: string) => { insert: (r: unknown) => Promise<{ error: unknown }> } }).from("storage_cleanups")
      .insert({ project_id: data.projectId, actor: context.userId, file_count: remove.length, total_bytes: bytes, skipped_count: skipped, paths: remove });
    if (log.error) console.error("[orphan-cleanup] log failed", { projectId: data.projectId, count: remove.length });
    return { deleted: remove.length, skipped, bytes };
  });
