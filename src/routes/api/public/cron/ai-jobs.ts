/**
 * Bakgrunnskø for AI-jobber (DEC-0070, REQ-0291, REQ-0293, REQ-0504): Lovable Cloud kaller denne adressen
 * på en fast plan (med hemmeligheten LOVABLE_CRON_SECRET). Videojobber som kjører hos leverandørene, følges
 * opp og hentes inn til lagringen selv om ingen har prosjektet åpent. Versjonen legges inn i scenen neste
 * gang noen med redigeringstilgang åpner prosjektet (AI-jobbene, «Legg inn»), så alt kan angres som før.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/ai-jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { followUpRunningVideoJobs, markStoppedSyncJobs, pumpVideoQueue } =
          await import("@/adapters/ai/video-followup.server");
        const { checkSchema } = await import("@/adapters/storage/project-rows");
        const db = supabaseAdmin as unknown as import("@/adapters/storage/project-rows").AnyClient;
        const schema = await checkSchema(db);
        if (schema.kind === "missing" || schema.version < 24)
          return Response.json({ ok: true, skipped: "schema" });
        const stopped = await markStoppedSyncJobs(db);
        const summary = await followUpRunningVideoJobs(db, { budgetMs: 25_000 });
        // Køen (fra 0025): send ventende jobber der det er blitt ledig plass
        const sent = schema.version >= 25 ? await pumpVideoQueue(db, { budgetMs: 20_000 }) : 0;
        return Response.json({ ok: true, stopped, sent, ...summary });
      },
    },
  },
});
