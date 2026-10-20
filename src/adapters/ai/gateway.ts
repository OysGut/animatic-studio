
import { t as tk } from "@/core/i18n/keyed";
/**
 * Felles for kallene til Lovable AI Gateway (bilder og tekst, DEC-0045/0066). Bare på serveren:
 * nøkkelen (LOVABLE_API_KEY) er en hemmelighet i Lovable Cloud og sendes aldri til nettleseren.
 */

export const GATEWAY = "https://ai.gateway.lovable.dev/v1";

export const ROLE_RANK: Record<string, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

/** En sti i bøtta «assets» som hører til prosjektet (ingen «..», ikke for lang). */
export function validReferencePath(projectId: string, p: unknown): p is string {
  return (
    typeof p === "string" && p.startsWith(`${projectId}/`) && !p.includes("..") && p.length <= 600
  );
}

/** Feilmelding fra tjenesten på norsk, uten hemmeligheter. */
export function gatewayError(status: number, body: string): string {
  if (status === 402)
    return tk("adapters-ai-gateway.gateway-error.message.a8c2618882f0");
  if (status === 429)
    return tk("adapters-ai-gateway.gateway-error.message.a2733082ef14");
  if (status === 401 || status === 403)
    return tk("adapters-ai-gateway.gateway-error.message.55ea69b40055");
  if (status === 400 && /safety|policy|moderation/i.test(body))
    return tk("adapters-ai-gateway.gateway-error.message.b3ef724feea9");
  // Tjenestens egen forklaring (ingen hemmeligheter), kortet ned, så feilen kan forstås og rettes
  const detail = (() => {
    try {
      const j = JSON.parse(body.slice(body.indexOf("{"))) as {
        error?: { message?: string } | string;
        message?: string;
      };
      return typeof j.error === "string" ? j.error : (j.error?.message ?? j.message ?? "");
    } catch {
      return body;
    }
  })()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
  return tk("adapters-ai-gateway.gateway-error.message.8927da2af3e3", { status: String(status), value2: String(detail ? `: ${detail}` : ".") });
}

/** Største bilde som sendes til bildemodellen. */
export const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;

interface CountableClient {
  from: (t: string) => {
    select: (c: string) => {
      eq: (
        k: string,
        v: string,
      ) => {
        in: (
          k: string,
          v: readonly string[],
        ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
      };
    };
  };
}

/**
 * Forbildebildene må være bildeversjoner i prosjektets bibliotek (ikke filmer, lyd eller andre filer i
 * bøtta) og ikke for store. Gir størrelsen per sti, eller en feilmelding.
 */
export async function referenceImages(
  admin: unknown,
  projectId: string,
  paths: readonly string[],
): Promise<{ ok: true; sizes: Map<string, number> } | { ok: false; message: string }> {
  if (!paths.length) return { ok: true, sizes: new Map() };
  const { data, error } = await (admin as CountableClient)
    .from("asset_versions")
    .select("media_path, mime_type, byte_size")
    .eq("project_id", projectId)
    .in("media_path", paths);
  if (error)
    return {
      ok: false,
      message: tk("adapters-ai-gateway.message.message.9c6171831bff", { message: String(error.message) }),
    };
  const sizes = new Map<string, number>();
  for (const r of (data ?? []) as { media_path: string; mime_type: string; byte_size: number }[])
    if (r.mime_type.startsWith("image/")) sizes.set(r.media_path, Number(r.byte_size));
  if (paths.some((p) => !sizes.has(p)))
    return {
      ok: false,
      message: tk("adapters-ai-gateway.message.message.f070d15c27c0"),
    };
  if ([...sizes.values()].some((b) => b > MAX_REFERENCE_BYTES))
    return {
      ok: false,
      message: tk("adapters-ai-gateway.message.message.6e1fac914a42"),
    };
  return { ok: true, sizes };
}

/** Lovable kjenner ikke modellnavnet (og bare det – ikke f.eks. for lang tekst). */
export function isUnknownModelError(status: number, body: string): boolean {
  return (
    (status === 400 || status === 404) &&
    /(unknown|invalid|unsupported|not (?:found|supported)|does not exist)[^.]{0,40}model|model[^.]{0,60}(not found|does not exist|not supported|unknown|invalid)/i.test(
      body,
    )
  );
}
