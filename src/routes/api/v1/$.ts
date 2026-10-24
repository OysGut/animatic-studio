import { createFileRoute } from "@tanstack/react-router";

/** C-0 API v1 for Creative Connectors. Hver handler sjekker bearer-token, scope og prosjekt selv. */
async function handle(request: Request): Promise<Response> {
  const { handleApiV1 } = await import("@/adapters/connectors/api-v1");
  const { cloudConnectorStore } = await import("@/adapters/connectors/store.server");
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/v1/openapi.json") {
    const spec = (await import("../../../../docs/api/openapi-v1.json")).default;
    return Response.json(spec, { headers: { "Cache-Control": "no-store" } });
  }
  return handleApiV1(request, {
    store: await cloudConnectorStore(),
    now: () => Date.now(),
    random: (n) => crypto.getRandomValues(new Uint8Array(n)),
    ip: request.headers.get("cf-connecting-ip") ?? "unknown",
  });
}

export const Route = createFileRoute("/api/v1/$")({
  server: { handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request), PUT: ({ request }) => handle(request) } },
});
