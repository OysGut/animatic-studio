/**
 * Innlogging med Google: ren logikk uten nettleser eller backend. Testes med falske klienter.
 * - Retursti: bare stier på samme nettsted («/…», aldri «//» eller fullstendige adresser).
 * - Feil tilbake fra innloggingstjenesten tolkes til en rolig melding (stengt registrering eller feil).
 * - Visningsnavn fra Google brukes bare når profilen fortsatt har standardnavnet fra e-postadressen.
 * - Innloggingsmetoder for Konto-siden.
 */

export const MAX_RETURN_PATH = 2000;

/** Godtar bare en sti på samme nettsted. Alt annet gir null. */
export function sanitizeReturnPath(path: unknown): string | null {
  if (typeof path !== "string" || path.length === 0 || path.length > MAX_RETURN_PATH) return null;
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  if (/[\u0000-\u001f]/.test(path)) return null;
  return path;
}

export type OAuthReturnError = "closed" | "blocked" | "failed";

/** Leser feil fra adressen innloggingstjenesten sender brukeren tilbake til (query eller hash). */
export function oauthReturnError(search: string, hash: string): OAuthReturnError | null {
  const params = [new URLSearchParams(search.replace(/^\?/, "")), new URLSearchParams(hash.replace(/^#/, ""))];
  const p = params.find((x) => x.has("error") || x.has("error_description"));
  if (!p) return null;
  return classifyOAuthError(`${p.get("error") ?? ""} ${p.get("error_description") ?? ""}`);
}

/** Feilteksten fra innloggingstjenesten eller hjelpemodulen. */
export function classifyOAuthError(message: string): OAuthReturnError {
  const m = message.toLowerCase();
  // Databasevakten (B-109) gir «registration_closed»; innloggingstjenesten pakker den som «Database error saving new user»
  if (m.includes("registration_closed") || m.includes("database error saving new user") || m.includes("ptg01")) return "closed";
  if (m.includes("banned")) return "blocked";
  return "failed";
}

/** Navnet Google oppgir (full_name eller name), trimmet til profilens grense. */
export function googleDisplayName(meta: Record<string, unknown> | null | undefined): string | null {
  const raw = meta?.["full_name"] ?? meta?.["name"];
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim().slice(0, 100);
  return name || null;
}

/** Sant når profilen fortsatt har standardnavnet (tomt eller første del av e-postadressen). */
export function shouldAdoptGoogleName(current: string, email: string | null | undefined, googleName: string | null): boolean {
  if (!googleName) return false;
  const c = current.trim();
  if (c === googleName) return false;
  const local = (email ?? "").split("@")[0]?.trim().toLowerCase() ?? "";
  return c === "" || c.toLowerCase() === local;
}

export type LoginMethod = "google" | "email";

/** Innloggingsmetodene kontoen har (fra app_metadata.providers og identitetene). */
export function loginMethods(user: {
  app_metadata?: { provider?: unknown; providers?: unknown } | null;
  identities?: readonly { provider?: unknown }[] | null;
} | null | undefined): LoginMethod[] {
  const found = new Set<string>();
  const meta = user?.app_metadata;
  if (Array.isArray(meta?.providers)) for (const p of meta.providers) if (typeof p === "string") found.add(p);
  if (typeof meta?.provider === "string") found.add(meta.provider);
  for (const i of user?.identities ?? []) if (typeof i.provider === "string") found.add(i.provider);
  const out: LoginMethod[] = [];
  if (found.has("google")) out.push("google");
  if (found.has("email")) out.push("email");
  return out;
}
