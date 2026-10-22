/**
 * B-116: utstillingsvindu – serverfunksjonene som ikke kan gå direkte mot databasen fra nettleseren:
 * filkopiering til <prosjekt>/shares/ og signering av medier gjøres med service role, etter at
 * databasefunksjonene (0087) har godkjent handlingen. Alt annet (liste, endre, trekke tilbake,
 * kommentarer, admin) går gjennom RPC-ene med brukerens egen tilkobling (RLS).
 */
import { createServerFn } from "@tanstack/react-start";
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

/** Signerer mediefilen til ett bidrag; bare nøkler under <prosjekt>/shares/ signeres. */
async function signItem(a: AnyClient, item: ShowcaseItem): Promise<ShowcaseItem> {
  if (!item.storageKey || !shareKeyAllowed(item.storageKey)) return item;
  const s = await (a as unknown as {
    storage: { from: (b: string) => { createSignedUrl: (k: string, s: number) => Promise<{ data: { signedUrl?: string } | null }> } };
  }).storage.from(BUCKET).createSignedUrl(item.storageKey, PUBLICATION_SIGNED_SECONDS);
  return { ...item, url: s.data?.signedUrl ?? null };
}

/** Karusellen er offentlig: godkjente, aktive bidrag fra showcase_feed, med signerte medielenker. */
export const getShowcaseFeed = createServerFn({ method: "POST" }).handler(
  async (): Promise<readonly ShowcaseItem[]> => {
    const a = await admin();
    const { data, error } = await a.rpc("showcase_feed", {});
    if (error || !Array.isArray(data)) return [];
    const items = parseShowcaseFeed(data);
    const out: ShowcaseItem[] = [];
    for (const item of items) out.push(await signItem(a, item));
    return out;
  },
);

export interface CreateShowcaseInput extends ShowcaseDraft {
  readonly projectId: string;
  /** Kildefilen i prosjektet (kopieres til shares/); tom for manusutdrag. */
  readonly sourceKey: string;
  readonly mime: string | null;
  readonly durationMs: number | null;
  readonly width: number | null;
  readonly height: number | null;
}

/** Nytt bidrag: validerer, kopierer filen til <prosjekt>/shares/ og oppretter raden via RPC-en. */
export const createShowcaseItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: CreateShowcaseInput) => {
    if (!d || !isUuid(d.projectId)) throw new Error("invalid");
    const err = showcaseDraftError(d, Date.now());
    if (err) throw new Error(err);
    if (d.kind !== "script" && (typeof d.sourceKey !== "string" || !d.sourceKey.startsWith(`${d.projectId}/`) || d.sourceKey.includes("..")))
      throw new Error("showcase.error.media");
    return d;
  })
  .handler(async ({ data, context }): Promise<{ id: string; status: string }> => {
    const db = context.supabase as unknown as AnyClient;
    const a = await admin();
    let storageKey: string | null = null;
    if (data.kind !== "script") {
      const ext = data.sourceKey.includes(".") ? data.sourceKey.slice(data.sourceKey.lastIndexOf(".")) : "";
      storageKey = `${data.projectId}/shares/showcase/${crypto.randomUUID()}${ext.slice(0, 12)}`;
      const { error } = await (a as unknown as {
        storage: { from: (b: string) => { copy: (f: string, t: string) => Promise<{ error: { message: string } | null }> } };
      }).storage.from(BUCKET).copy(data.sourceKey, storageKey);
      if (error) throw new Error(error.message);
    }
    const { data: id, error } = await db.rpc("create_showcase_item", {
      p_project: data.projectId,
      p_kind: data.kind,
      p_title: data.title,
      p_text: data.text,
      p_excerpt: data.kind === "script" ? data.excerpt : null,
      p_storage_key: storageKey,
      p_mime: data.kind === "script" ? null : data.mime,
      p_duration_ms: data.durationMs,
      p_width: data.width,
      p_height: data.height,
      p_expires_at: data.expiresAt,
    } as never);
    if (error || typeof id !== "string") throw new Error(error?.message ?? "invalid");
    const mine = await db.rpc("my_showcase_items", {} as never);
    const row = Array.isArray(mine.data)
      ? (mine.data as Record<string, unknown>[]).find((r) => r["id"] === id)
      : null;
    return { id, status: typeof row?.["status"] === "string" ? row["status"] : "pending" };
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
