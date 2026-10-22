/**
 * B-114 C0: mottakeroppslag for en publisering. Databasen (publication_for_me) avgjør om brukeren kan se den
 * (funksjonsbryter, mottaker, tidsrom, tilbaketrekking, blokkering). Serveren signerer bare filene som hører
 * til publiseringen, og lenkene varer 600 sekunder.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUuid } from "@/core";
import type { AnyClient } from "@/adapters/storage/project-rows";
import type { PublicationRights } from "@/core/community";

const BUCKET = "assets";
export const PUBLICATION_SIGNED_SECONDS = 600;

export interface PublicationForMe {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly license: string | null;
  readonly rights: PublicationRights;
  readonly expiresAt: string | null;
  readonly media: readonly { id: string; url: string | null; mime: string; durationMs: number | null; width: number | null; height: number | null }[];
}

/** Bare filer under <prosjekt>/shares/ uten «..» signeres. */
export function shareKeyAllowed(key: unknown): key is string {
  return typeof key === "string" && /^[0-9a-f-]{36}\/shares\/[^\s]+$/i.test(key) && !key.split("/").includes("..");
}

export const getPublicationForMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { publicationId: string }) => {
    if (!isUuid(d?.publicationId)) throw new Error("invalid");
    return { publicationId: d.publicationId };
  })
  .handler(async ({ data, context }): Promise<PublicationForMe | null> => {
    const db = context.supabase as unknown as AnyClient;
    const { data: row, error } = await db.rpc("publication_for_me", { p_id: data.publicationId });
    if (error || !row || typeof row !== "object") return null;
    const r = row as Record<string, unknown>;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AnyClient;
    const media = [];
    for (const m of (Array.isArray(r["media"]) ? r["media"] : []) as Record<string, unknown>[]) {
      let url: string | null = null;
      if (shareKeyAllowed(m["storage_key"])) {
        const s = await admin.storage.from(BUCKET).createSignedUrl(m["storage_key"], PUBLICATION_SIGNED_SECONDS);
        url = (s.data as { signedUrl?: string } | null)?.signedUrl ?? null;
      }
      media.push({
        id: String(m["id"]),
        url,
        mime: String(m["mime"] ?? ""),
        durationMs: typeof m["duration_ms"] === "number" ? m["duration_ms"] : null,
        width: typeof m["width"] === "number" ? m["width"] : null,
        height: typeof m["height"] === "number" ? m["height"] : null,
      });
    }
    const rights = (r["rights"] ?? {}) as Record<string, unknown>;
    return {
      id: String(r["id"]),
      title: String(r["title"] ?? ""),
      description: String(r["description"] ?? ""),
      license: typeof r["license"] === "string" ? r["license"] : null,
      rights: { view: rights["view"] === true, comment: rights["comment"] === true, download: rights["download"] === true, remix: rights["remix"] === true },
      expiresAt: typeof r["expires_at"] === "string" ? r["expires_at"] : null,
      media,
    };
  });
