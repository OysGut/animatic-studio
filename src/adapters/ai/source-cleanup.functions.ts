import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUuid } from "@/core";
import { t } from "@/core/i18n/keyed";

function validate(input: unknown) {
  const data = input as { projectId?: unknown; paths?: unknown } | null;
  if (!data || typeof data.projectId !== "string" || !isUuid(data.projectId)) throw new Error(t("adapters-ai-source-cleanup-functions.validate.message.74b89b7b6bc5"));
  if (data.paths !== undefined && (!Array.isArray(data.paths) || data.paths.length > 100 || !data.paths.every((p) => typeof p === "string" && p.length <= 600)))
    throw new Error(t("adapters-ai-source-cleanup-functions.validate.message.82c79dbb496d"));
  return { projectId: data.projectId, paths: data.paths as string[] | undefined };
}

export const previewAiSourceCleanup = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(validate)
  .handler(async ({ data, context }) => {
    const { aiSourceCandidates } = await import("./source-cleanup.server");
    return aiSourceCandidates(context, data.projectId);
  });

export const confirmAiSourceCleanup = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(validate)
  .handler(async ({ data, context }) => {
    if (!data.paths?.length) throw new Error(t("adapters-ai-source-cleanup-functions.confirm-ai-source-cleanup.create-server-fn-method-post-middleware-require-supabase-auth-input-validator-validate-handler.30e7f7313728"));
    const { aiSourceCandidates } = await import("./source-cleanup.server");
    const candidates = await aiSourceCandidates(context, data.projectId);
    const allowed = new Set(candidates.map((c) => c.path));
    if (data.paths.some((p) => !allowed.has(p))) throw new Error(t("adapters-ai-source-cleanup-functions.confirm-ai-source-cleanup.create-server-fn-method-post-middleware-require-supabase-auth-input-validator-validate-handler.ebab0d696cf4"));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage.from("assets").remove(data.paths);
    if (error) throw new Error(t("adapters-ai-source-cleanup-functions.confirm-ai-source-cleanup.create-server-fn-method-post-middleware-require-supabase-auth-input-validator-validate-handler.2e536dd3d3d7"));
    return { deleted: data.paths.length };
  });