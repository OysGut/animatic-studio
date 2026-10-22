/**
 * B-116: utstillingsvindu – serverfunksjonene som ikke kan gå direkte mot databasen fra nettleseren:
 * filkopiering til <prosjekt>/shares/ og signering av medier gjøres med service role, etter at
 * databasefunksjonene (0087) har godkjent handlingen. Alt annet (liste, endre, trekke tilbake,
 * kommentarer, admin) går gjennom RPC-ene med brukerens egen tilkobling (RLS).
 */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUuid } from "@/core";
import { showcaseDraftError, showcaseMediaKeyValid, parseShowcaseFeed, type ShowcaseItem, type ShowcaseDraft } from "@/core/community";
import { shareKeyAllowed, PUBLICATION_SIGNED_SECONDS } from "@/adapters/community/publication.functions";
import type { AnyClient } from "@/adapters/storage/project-rows";

const BUCKET = "assets";

async function admin(): Promise<AnyClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyClient;
}

/** Offentlig feed: visningsfelter fra RPC; nøkkelen slås opp separat kun på serveren. */
export const getShowcaseFeed = createServerFn({ method: "POST" }).handler(
  async (): Promise<readonly ShowcaseItem[]> => {
    const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
    const address = process.env['SUPABASE_URL'];
    if (!key || !address) return [];
    const publicDb = createClient(address, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      } },
    });
    const { data, error } = await publicDb.rpc("showcase_feed", {});
    if (error || !Array.isArray(data)) return [];
    const a = await admin();
    const out: ShowcaseItem[] = [];
    for (const item of parseShowcaseFeed(data)) {
      const { storageKey: _privateKey, ...safe } = item;
      const { data: media, error: mediaError } = await a.rpc("showcase_media", { p_item: item.id });
      const key = media && typeof media === "object" ? (media as Record<string, unknown>)["storage_key"] : null;
      let url: string | null = null;
      if (!mediaError && shareKeyAllowed(key)) {
        const signed = await a.storage.from(BUCKET).createSignedUrl(key, PUBLICATION_SIGNED_SECONDS);
        url = (signed.data as { signedUrl?: string } | null)?.signedUrl ?? null;
      }
      out.push({ ...safe, url });
    }
    return out;
  },
);

export interface CreateShowcaseInput extends ShowcaseDraft {
  readonly projectId: string;
  /** Registrert ressursversjon eller take. Ingen klientoppgitt filsti. */
  readonly sourceId: string | null;
}

export const createShowcaseItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: CreateShowcaseInput) => {
    if (!d || !isUuid(d.projectId)) throw new Error("invalid");
    const err = showcaseDraftError(d, Date.now());
    if (err) throw new Error(err);
    if (d.kind !== "script" && (typeof d.sourceId !== "string" || !isUuid(d.sourceId))) throw new Error("showcase.error.media");
    if (!Array.isArray(d.lineIds) || d.lineIds.some(id => !isUuid(id))) throw new Error("showcase.error.excerpt");
    // Velg feltene uttrykkelig: ukjente klientfelter (inkludert stier) når aldri RPC.
    return { projectId: d.projectId, kind: d.kind, title: d.title, text: d.text,
      expiresAt: d.expiresAt, sourceId: d.sourceId, lineIds: d.lineIds };
  })
  .handler(async ({ data, context }): Promise<{ id: string; status: string }> => {
    const db = context.supabase as unknown as AnyClient;
    const { data: prepared, error } = await db.rpc("prepare_showcase_item", {
      p_project: data.projectId, p_kind: data.kind, p_title: data.title, p_text: data.text,
      p_source: data.sourceId, p_lines: data.lineIds, p_expires_at: data.expiresAt,
    });
    if (error || !prepared || typeof prepared !== "object") throw new Error("showcase.error.media");
    const r = prepared as Record<string, unknown>;
    if (typeof r["id"] !== "string" || !isUuid(r["id"])) throw new Error("showcase.error.media");
    // Privilegert klient lastes først ETTER autorisasjon/kildekontroll.
    const a = await admin();
    const { completeShowcaseCopy } = await import("./showcase-copy.server");
    await completeShowcaseCopy(a, context.userId, data.projectId, {
      id: r["id"], sourceKey: typeof r["source_key"] === "string" ? r["source_key"] : null,
      storageKey: typeof r["storage_key"] === "string" ? r["storage_key"] : null,
    });
    const mine = await db.rpc("my_showcase_items", {});
    const row = Array.isArray(mine.data)
      ? (mine.data as Record<string, unknown>[]).find(row => row["id"] === r["id"]) : null;
    return { id: r["id"], status: typeof row?.["status"] === "string" ? row["status"] : "pending" };
  });

/** Opplasting av avatar: signert opplastingslenke under avatars/<bruker>/ (samme regel som 0080). */
export const prepareAvatarUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ext: string }) => {
    if (!d || typeof d.ext !== "string" || !/^[a-z0-9]{1,8}$/i.test(d.ext)) throw new Error("invalid");
    return { ext: d.ext.toLowerCase() };
  })
  .handler(async ({ data, context }): Promise<{ path: string; token: string }> => {
    const path = `avatars/${context.userId}/${crypto.randomUUID()}.${data.ext}`;
    const { data: up, error } = await (await admin() as unknown as {
      storage: { from: (b: string) => { createSignedUploadUrl: (p: string, o: { upsert: boolean }) => Promise<{ data: { path: string; token: string } | null; error: { message: string } | null }> } };
    }).storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error || !up) throw new Error(error?.message ?? "invalid");
    return { path: up.path, token: up.token };
  });

/** Egen profil til redigering, med signert avatarlenke (600 s). */
export const getMyShowcaseProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ handle: string | null; displayName: string; bio: string; avatarUrl: string | null; isPublic: boolean } | null> => {
    const db = context.supabase as unknown as AnyClient;
    const { data, error } = await db.rpc("my_public_profile", {} as never);
    if (error || !data || typeof data !== "object") return null;
    const r = data as Record<string, unknown>;
    let avatarUrl: string | null = null;
    const key = typeof r["avatar_key"] === "string" ? r["avatar_key"] : null;
    if (key && key.startsWith(`avatars/${context.userId}/`) && !key.includes("..")) {
      const s = await (await admin() as unknown as {
        storage: { from: (b: string) => { createSignedUrl: (k: string, s: number) => Promise<{ data: { signedUrl?: string } | null }> } };
      }).storage.from(BUCKET).createSignedUrl(key, PUBLICATION_SIGNED_SECONDS);
      avatarUrl = s.data?.signedUrl ?? null;
    }
    return {
      handle: typeof r["handle"] === "string" ? r["handle"] : null,
      displayName: typeof r["display_name"] === "string" ? r["display_name"] : "",
      bio: typeof r["bio"] === "string" ? r["bio"] : "",
      avatarUrl,
      isPublic: r["is_public"] === true,
    };
  });

/** Filnøkkelen et bidrag peker på, brukt av kopieringen ovenfor (regel 36-testen bruker denne). */
export function showcaseCopyTarget(projectId: string, key: string): string | null {
  return showcaseMediaKeyValid(projectId, key) ? key : null;
}
