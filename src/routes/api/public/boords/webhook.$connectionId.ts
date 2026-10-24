/**
 * C-4 Boords-webhook. Offentlig adresse, så handleren verifiserer selv: HMAC-SHA-256 over
 * `${timestamp}.${råkropp}` med tilkoblingens krypterte webhook-hemmelighet (konstant-tids sammenligning),
 * tidsvindu på 5 minutter og hendelses-ID én gang (idempotens). En gyldig hendelse starter bare en henting
 * med updated_since; innholdet i meldingen stoles ikke på, og ingenting tas i bruk automatisk.
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyBoordsWebhook } from "@/core/connectors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 256 * 1024;

export const Route = createFileRoute("/api/public/boords/webhook/$connectionId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const no = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
        if (!UUID.test(params.connectionId)) return no(404);
        const raw = await request.text();
        if (raw.length > MAX_BODY) return no(413);
        const { adminDb, decryptConnection, cloudBoordsStore } = await import("@/adapters/connectors/boords-store.server");
        const db = await adminDb();
        const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
        if ((await db.rpc("rate_limit_hit", { p_scope: "boords_webhook", p_keys: [`c:${params.connectionId}`, `ip:${ip}`] })).error) return no(429);
        const c = (await db.from("boords_connections").select("*").eq("id", params.connectionId).maybeSingle()).data as import("@/adapters/connectors/boords-store.server").ConnectionRow | null;
        if (!c) return no(404);
        let secrets: { apiKey: string; webhookSecret: string | null };
        try { secrets = await decryptConnection(c); } catch { return no(401); }
        if (!secrets.webhookSecret) return no(401);
        const check = verifyBoordsWebhook({ rawBody: raw, signature: request.headers.get("x-boords-signature"), timestamp: request.headers.get("x-boords-timestamp"), eventId: request.headers.get("x-boords-event-id"), secret: secrets.webhookSecret, nowMs: Date.now() });
        if (!check.ok) return no(check.reason === "format" ? 400 : 401);
        const once = await db.rpc("boords_webhook_once", { p_connection: c.id, p_event: check.eventId });
        if (once.error) return no(500);
        if (once.data !== true) return Response.json({ ok: true, duplicate: true });
        const { BoordsClient, pullStoryboard } = await import("@/adapters/connectors/boords.server");
        const projects = ((await db.from("boords_project_links").select("project_id").eq("connection_id", c.id)).data as { project_id: string }[]) ?? [];
        for (const p of projects) {
          try { await pullStoryboard({ client: new BoordsClient(secrets.apiKey), store: cloudBoordsStore(db), projectId: p.project_id, connectionId: c.id, since: c.sync_cursor }); }
          catch { console.error("boords webhook sync failed"); }
        }
        return Response.json({ ok: true });
      },
    },
  },
});
