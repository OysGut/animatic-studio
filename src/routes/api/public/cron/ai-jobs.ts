/**
 * Bakgrunnskø for AI-jobber (DEC-0070, REQ-0291, REQ-0293, REQ-0504): Lovable Cloud kaller denne adressen
 * på en fast plan (med hemmeligheten LOVABLE_CRON_SECRET). Videojobber som kjører hos leverandørene, følges
 * opp og hentes inn til lagringen selv om ingen har prosjektet åpent. Versjonen legges inn i scenen neste
 * gang noen med redigeringstilgang åpner prosjektet (AI-jobbene, «Legg inn»), så alt kan angres som før.
 * Mars 15.10.2026 (DEC-0087) trakk tilbake nei-et i DEC-0072: jobben settes opp. Den bestiller aldri noe nytt
 * (REQ-0592 gjelder fortsatt); den sender bare jobber brukeren selv har lagt i køen, henter ferdige videoer og
 * sletter kontoer som har stått låst for sletting i 30 dager (DEC-0086).
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
        const db = supabaseAdmin as unknown as import("@/adapters/storage/project-rows").AnyClient;
        // Status for adminsiden (DEC-0088, migrasjon 0034): siste kjøring lagres også når jobben feiler
        const startedAt = Date.now();
        const run = {
          stopped: 0,
          sent: 0,
          purged: 0,
          checked: 0,
          done: 0,
          failed: 0,
          running: 0,
          skipped: null as string | null,
          error: null as string | null,
        };
        try {
          const { followUpRunningVideoJobs, markStoppedSyncJobs, pumpVideoQueue } =
            await import("@/adapters/ai/video-followup.server");
          const { checkSchema } = await import("@/adapters/storage/project-rows");
          const schema = await checkSchema(db);
          if (schema.kind === "missing" || schema.version < 24) {
            run.skipped = "schema";
            return Response.json({ ok: true, skipped: "schema" });
          }
          run.stopped = await markStoppedSyncJobs(db);
          const summary = await followUpRunningVideoJobs(db, { budgetMs: 25_000 });
          Object.assign(run, summary);
          // Køen (fra 0025): send ventende jobber der det er blitt ledig plass
          if (schema.version >= 25) run.sent = await pumpVideoQueue(db, { budgetMs: 20_000 });
          if (schema.version >= 61) {
            const { pumpDialogueBatches } = await import("@/adapters/storage/dialogue-batch.server");
            const speech = await pumpDialogueBatches(db);
            run.checked += speech.processed;
          }
          // P8: masseharmonisering fortsetter selv om fanen lukkes (lease og kvitteringer, 0065)
          if (schema.version >= 65) {
            const { pumpHarmonizeBatches } = await import("@/adapters/storage/harmonize-batch.server");
            const images = await pumpHarmonizeBatches(db);
            run.checked += images.processed;
          }
          // Kontoer der de 30 dagene er gått (fra 0033)
          if (schema.version >= 33) {
            const { purgeDueAccounts } = await import("@/adapters/account/admin.functions");
            run.purged = await purgeDueAccounts(db);
          }
          // C-0 (0111): utløpte koder og brukte refresh-hasher eldre enn 90 dager
          if (schema.version >= 111) {
            const { error } = await (db as unknown as { rpc: (f: string) => Promise<{ error: unknown }> }).rpc("connector_cleanup");
            if (error) console.error("connector_cleanup failed");
          }
          // C-4 (0112): periodisk henting fra Boords (webhooks dekker bare noen få endringer) og rydding
          if (schema.version >= 112) {
            const { syncAllBoords } = await import("@/adapters/connectors/boords.functions");
            await syncAllBoords(db as never);
            const { error } = await (db as unknown as { rpc: (f: string) => Promise<{ error: unknown }> }).rpc("boords_cleanup");
            if (error) console.error("boords_cleanup failed");
          }
          // G-5 (0097): rydd endringsloggen høyst én gang i døgnet (retensjon N dager / N endringer)
          if (schema.version >= 97) {
            const { pruneChangeLogsIfDue } = await import("@/adapters/storage/change-log-prune.server");
            await pruneChangeLogsIfDue(db);
          }
          const { stopped, sent, purged } = run;
          return Response.json({ ok: true, stopped, sent, purged, ...summary });
        } catch (e) {
          run.error = e instanceof Error ? e.message : String(e);
          throw e;
        } finally {
          const { recordCronRun } = await import("@/adapters/account/ai-models.server");
          await recordCronRun(db, {
            at: new Date(startedAt).toISOString(),
            durationMs: Date.now() - startedAt,
            ...run,
          });
        }
      },
    },
  },
});
