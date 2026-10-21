/**
 * Serverfunksjoner for QR-deling av en ferdig filmversjon (GP5, spes. §29–35).
 * - Innlogget redaktør: aktiver en deling etter opplastingen. Serveren sjekker at filen faktisk ligger i
 *   lagringen med riktig størrelse og starter som mp4 før lenken lages (QR vises ikke før filmen kan spilles).
 * - Offentlig (uten innlogging): nøkkelen gir bare tittel, format, varighet og en kortlivet signert lenke til
 *   filmfilen. Ingenting annet fra prosjektet. Nøkkelen sammenlignes bare som SHA-256.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SHARE_TOKEN, isUuid } from "@/core";
import type { AnyClient } from "@/adapters/storage/project-rows";
import { t } from "@/core/i18n/keyed";

const BUCKET = "assets";
/** Signerte lenker til filmen varer kort; spilleren henter en ny ved behov. */
const SIGNED_SECONDS = 10 * 60;

async function service(): Promise<AnyClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyClient;
}

/** mp4 har «ftyp» i byte 4–7. */
function looksLikeMp4(head: Uint8Array): boolean {
  return head.length >= 8 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70;
}

export const activateFilmShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { shareId: string }) => {
    if (!isUuid(d?.shareId)) throw new Error(t("adapters-share-film-share-functions.activate-film-share.create-server-fn-method-post-middleware-require-supabase-auth-input-validator.64942bb5ba75"));
    return { shareId: d.shareId };
  })
  .handler(async ({ data, context }): Promise<{ token: string }> => {
    const db = context.supabase as unknown as AnyClient;
    // Lesing som brukeren (RLS): bare medlemmer ser raden
    const { data: row, error } = await db
      .from("film_shares")
      .select("id, project_id, storage_key, byte_size, status")
      .eq("id", data.shareId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error(t("adapters-share-film-share-functions.activate-film-share.create-server-fn-method-post-middleware-require-supabase-auth-input-validator-d-share-id-string-if-is-uuid-d-share-id-throw-new-error-l-ugyldig-deling-invalid-share-return-share-id-d-share-id-handler.e7e4af470ab7"));
    const key = String(row["storage_key"]);
    const admin = await service();
    const folder = key.split("/").slice(0, -1).join("/");
    const { data: files, error: le } = await admin.storage.from(BUCKET).list(folder, { limit: 10 });
    if (le) throw new Error(le.message);
    const file = (files ?? []).find((f: { name: string }) => f.name === "film.mp4") as
      | { name: string; metadata?: { size?: number } }
      | undefined;
    const size = Number(file?.metadata?.size ?? -1);
    if (!file || size !== Number(row["byte_size"]))
      throw new Error(
        t("adapters-share-film-share-functions.activate-film-share.create-server-fn-method-post-middleware-require-supabase-auth-input-validator-d-share-id-string-if-is-uuid-d-share-id-throw-new-error-l-ugyldig-deling-invalid-share-return-share-id-d-share-id-handler.6df8afe7b4d6"),
      );
    // Sjekk at filen er mp4 (de første bytene)
    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(key, 60);
    if (signed?.signedUrl) {
      const head = await fetch(signed.signedUrl, { headers: { Range: "bytes=0-15" } })
        .then((r) => r.arrayBuffer())
        .catch(() => null);
      if (head && !looksLikeMp4(new Uint8Array(head)))
        throw new Error(t("adapters-share-film-share-functions.activate-film-share.create-server-fn-method-post-middleware-require-supabase-auth-input-validator-d-share-id-string-if-is-uuid-d-share-id-throw-new-error-l-ugyldig-deling-invalid-share-return-share-id-d-share-id-handler.e93a41872b64"));
    }
    // Rollen sjekkes i databasen
    const { data: token, error: ae } = await db.rpc("activate_film_share", {
      p_share: data.shareId,
      p_byte_size: size,
    });
    if (ae) throw new Error(ae.message);
    return { token: String(token) };
  });

export interface PublicFilm {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
  readonly url: string;
}

/** Den offentlige visningssiden /se/$token. Gir bare det spilleren trenger. */
export const resolveFilmShare = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => {
    const token = typeof d?.token === "string" ? d.token.toLowerCase() : "";
    return { token };
  })
  .handler(async ({ data }): Promise<{ ok: true; film: PublicFilm } | { ok: false }> => {
    // Samme svar for ugyldig, ukjent, utløpt og tilbakekalt nøkkel
    if (!SHARE_TOKEN.test(data.token)) return { ok: false };
    const admin = await service();
    // Oppslag via pepret hash i databasen (0070); nøkkelen logges aldri
    const { data: shareId, error: le } = await admin.rpc("film_share_lookup", { p_token: data.token });
    if (le || typeof shareId !== "string") return { ok: false };
    const { data: row } = await admin
      .from("film_shares")
      .select("title, storage_key, width, height, duration_ms, status, expires_at, project_id")
      .eq("id", shareId)
      .maybeSingle();
    if (!row || row["status"] !== "ready") return { ok: false };
    const expires = row["expires_at"] ? Date.parse(String(row["expires_at"])) : null;
    if (expires !== null && expires <= Date.now()) return { ok: false };
    // Slettet prosjekt: ikke lenger delt
    const { data: project } = await admin
      .from("projects")
      .select("deleted_at")
      .eq("id", String(row["project_id"]))
      .maybeSingle();
    if (!project || project["deleted_at"]) return { ok: false };
    const { data: signed, error } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(String(row["storage_key"]), SIGNED_SECONDS);
    if (error || !signed?.signedUrl) return { ok: false };
    return {
      ok: true,
      film: {
        title: String(row["title"]),
        width: Number(row["width"]),
        height: Number(row["height"]),
        durationMs: Number(row["duration_ms"]),
        url: signed.signedUrl,
      },
    };
  });
