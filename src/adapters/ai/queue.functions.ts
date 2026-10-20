/**
 * Køen for AI-jobber (DEC-0070, REQ-0289, REQ-0300, REQ-0301): redaktører kan sende ventende jobber (når
 * ingen bakgrunnskø er satt opp, gjør nettleseren det mens prosjektet er åpent), endre prioritet og avbryte
 * jobber som ikke er sendt ennå (de koster ingenting og frigjør taket).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUuid } from "@/core";
import { checkSchema, type AnyClient } from "@/adapters/storage/project-rows";
import { t } from "@/core/i18n/keyed";

const isId = (x: unknown): x is string => typeof x === "string" && isUuid(x);

async function editorDb(
  supabase: unknown,
  projectId: string,
  userId: string,
): Promise<AnyClient | null> {
  const gate = await import("./ai-gate.server");
  const role = await gate.memberRole(supabase as AnyClient, projectId, userId);
  if ((gate.ROLE_RANK[role ?? ""] ?? 0) < gate.ROLE_RANK["editor"]!) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as AnyClient;
  const schema = await checkSchema(db);
  return schema.kind !== "missing" && schema.version >= 25 ? db : null;
}

export const pumpProjectQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    if (!isId(x["projectId"])) throw new Error(t("adapters-ai-queue-functions.pump-project-queue.create-server-fn-method-post-middleware-require-supabase-auth-validator.6372a4c86d83"));
    return { projectId: x["projectId"] };
  })
  .handler(async ({ data, context }): Promise<{ sent: number }> => {
    const db = await editorDb(context.supabase, data.projectId, context.userId);
    if (!db) return { sent: 0 };
    const { pumpVideoQueue, markStoppedSyncJobs } = await import("./video-followup.server");
    // Uten bakgrunnsjobb (DEC-0072/0073) gjør nettleseren det cron ville gjort, for dette prosjektet:
    // jobber plattformen stoppet merkes, og ventende jobber brukeren har lagt i kø sendes
    const stopped = await markStoppedSyncJobs(db, Date.now(), data.projectId);
    return {
      sent:
        (await pumpVideoQueue(db, { projectId: data.projectId, max: 50, budgetMs: 20_000 })) +
        stopped,
    };
  });

export const updateQueuedJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    if (!isId(x["projectId"]) || !isId(x["jobId"]))
      throw new Error(t("adapters-ai-queue-functions.update-queued-job.create-server-fn-method-post-middleware-require-supabase-auth-validator.0cefaab4bcf2"));
    const action = x["action"];
    if (action !== "cancel" && action !== "priority" && action !== "first")
      throw new Error(t("adapters-ai-queue-functions.update-queued-job.create-server-fn-method-post-middleware-require-supabase-auth-validator.cfade47340f1"));
    const priority = x["priority"];
    if (action === "priority" && priority !== 1 && priority !== 2 && priority !== 3)
      throw new Error(t("adapters-ai-queue-functions.update-queued-job.create-server-fn-method-post-middleware-require-supabase-auth-validator.80ac8784e612"));
    return {
      projectId: x["projectId"],
      jobId: x["jobId"],
      action: action as "cancel" | "priority" | "first",
      priority: (priority as 1 | 2 | 3 | undefined) ?? 2,
    };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; message?: string }> => {
    const db = await editorDb(context.supabase, data.projectId, context.userId);
    if (!db)
      return {
        ok: false,
        message: t("adapters-ai-queue-functions.message.message.162acdc743f0"),
      };
    const patch =
      data.action === "cancel"
        ? {
            status: "failed",
            error: t("adapters-ai-queue-functions.error.error.ba9c7dcb3c16"),
            finished_at: new Date().toISOString(),
          }
        : data.action === "priority"
          ? { priority: data.priority }
          : { priority: 1, queue_position: 0 };
    // Bare jobber som fortsatt venter, kan endres
    const { data: rows } = await db
      .from("generation_jobs")
      .update(patch as never)
      .eq("id", data.jobId)
      .eq("project_id", data.projectId)
      .eq("status", "queued")
      .select("id");
    return (rows as unknown[] | null)?.length
      ? { ok: true }
      : {
          ok: false,
          message: t("adapters-ai-queue-functions.message.message.61b1218293ba"),
        };
  });
