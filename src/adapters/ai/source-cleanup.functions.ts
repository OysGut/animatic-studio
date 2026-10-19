import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUuid, L } from "@/core";

function validate(input: unknown) {
  const data = input as { projectId?: unknown; paths?: unknown } | null;
  if (!data || typeof data.projectId !== "string" || !isUuid(data.projectId)) throw new Error(L("Ugyldig prosjekt", "Invalid project"));
  if (data.paths !== undefined && (!Array.isArray(data.paths) || data.paths.length > 100 || !data.paths.every((p) => typeof p === "string" && p.length <= 600)))
    throw new Error(L("Ugyldige filer", "Invalid files"));
  return { projectId: data.projectId, paths: data.paths as string[] | undefined };
}

export const previewAiSourceCleanup = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(validate)
  .handler(async ({ data, context }) => {
    const { aiSourceCandidates } = await import("./source-cleanup.server");
    return aiSourceCandidates(context, data.projectId);
  });

export const confirmAiSourceCleanup = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(validate)
  .handler(async ({ data, context }) => {
    if (!data.paths?.length) throw new Error(L("Velg filer før sletting", "Select files before deleting"));
    const { aiSourceCandidates } = await import("./source-cleanup.server");
    const candidates = await aiSourceCandidates(context, data.projectId);
    const allowed = new Set(candidates.map((c) => c.path));
    if (data.paths.some((p) => !allowed.has(p))) throw new Error(L("Filene er endret eller brukes fortsatt. Beregn på nytt.", "The files have changed or are still in use. Check again."));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage.from("assets").remove(data.paths);
    if (error) throw new Error(L("Filene kunne ikke slettes. Prøv igjen.", "The files could not be deleted. Try again."));
    return { deleted: data.paths.length };
  });