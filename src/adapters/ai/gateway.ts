import { L } from "@/core";
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
    return L(
      "Lovable-kredittene i arbeidsområdet er brukt opp. Fyll på i Lovable og prøv igjen.",
      "The Lovable credits in the workspace are used up. Top up in Lovable and try again.",
    );
  if (status === 429)
    return L(
      "For mange forespørsler akkurat nå. Vent et minutt og prøv igjen.",
      "Too many requests right now. Wait a minute and try again.",
    );
  if (status === 401 || status === 403)
    return L(
      "AI-tjenesten i Lovable godtok ikke nøkkelen. Sjekk at Lovable AI er slått på for prosjektet.",
      "The AI service in Lovable did not accept the key. Check that Lovable AI is turned on for the project.",
    );
  if (status === 400 && /safety|policy|moderation/i.test(body))
    return L(
      "AI-tjenesten avviste beskrivelsen (innholdsregler). Endre beskrivelsen og prøv igjen.",
      "The AI service rejected the description (content rules). Change the description and try again.",
    );
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
  return L(
    `AI-tjenesten svarte med feil ${status}${detail ? `: ${detail}` : "."}`,
    `The AI service responded with an error ${status}${detail ? `: ${detail}` : "."}`,
  );
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
      message: L(
        `Forbildebildene kunne ikke kontrolleres: ${error.message}`,
        `The reference images could not be checked: ${error.message}`,
      ),
    };
  const sizes = new Map<string, number>();
  for (const r of (data ?? []) as { media_path: string; mime_type: string; byte_size: number }[])
    if (r.mime_type.startsWith("image/")) sizes.set(r.media_path, Number(r.byte_size));
  if (paths.some((p) => !sizes.has(p)))
    return {
      ok: false,
      message: L(
        "Et forbildebilde finnes ikke i prosjektets bibliotek.",
        "A reference image does not exist in the project's library.",
      ),
    };
  if ([...sizes.values()].some((b) => b > MAX_REFERENCE_BYTES))
    return {
      ok: false,
      message: L(
        "Et forbildebilde er for stort (over 20 MB) til å sendes med.",
        "A reference image is too large (over 20 MB) to be sent with the request.",
      ),
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
