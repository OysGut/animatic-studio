// G-8: svar fra serverfunksjoner, API-ruter og tokensider (/se/, /m/) kan inneholde personlige data
// eller tilgangsnøkler i adressen, og skal aldri bufres av nettleser eller mellomlager.
const DYNAMIC_PREFIXES = ["/_serverFn", "/api/", "/se/", "/m/"] as const;

export function needsNoStore(pathname: string): boolean {
  return DYNAMIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export function withNoStore(request: Request, response: Response): Response {
  if (!needsNoStore(new URL(request.url).pathname)) return response;
  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
