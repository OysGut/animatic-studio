/**
 * «Slettede objekter» – slett for godt (DEC-0079, migrasjon 0029). Slettede ressurser og bilder fjernes fra
 * databasen (public.purge_removed_assets, bare service_role), og filene slettes fra lagringen etterpå her.
 * Bare prosjektets eier kan slette for godt; alle med skriverett kan slette og hente inn igjen (det kan angres).
 * Det som fortsatt brukes i filmen, avvises med en forklaring – ingenting slettes da.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUuid } from "@/core";
import { checkSchema, type AnyClient } from "./project-rows";
import { removeFiles } from "./project-admin.functions";

export interface PurgeInput {
  readonly projectId: string;
  readonly assetIds: readonly string[];
  readonly versionIds: readonly string[];
}

export type PurgeResult =
  | {
      readonly ok: true;
      readonly assets: number;
      readonly versions: number;
      /** Filer som ikke kunne slettes fra lagringen (blir liggende; ingen kan nå dem fra appen). */
      readonly leftoverFiles: number;
    }
  | { readonly ok: false; readonly message: string };

function validate(d: unknown): PurgeInput {
  if (!d || typeof d !== "object") throw new Error("Ugyldig forespørsel");
  const x = d as Record<string, unknown>;
  const ids = (v: unknown) =>
    Array.isArray(v) && v.length <= 500 && v.every((i) => typeof i === "string" && isUuid(i))
      ? (v as string[])
      : null;
  const assetIds = ids(x["assetIds"] ?? []);
  const versionIds = ids(x["versionIds"] ?? []);
  if (typeof x["projectId"] !== "string" || !isUuid(x["projectId"]))
    throw new Error("Ugyldig prosjekt");
  if (!assetIds || !versionIds || assetIds.length + versionIds.length === 0)
    throw new Error("Velg hva som skal slettes");
  return { projectId: x["projectId"], assetIds, versionIds };
}

export const purgeRemoved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validate)
  .handler(async ({ data, context }): Promise<PurgeResult> => {
    const userDb = context.supabase as unknown as AnyClient;
    const { data: member } = await userDb
      .from("project_members")
      .select("role")
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .is("removed_at", null)
      .maybeSingle();
    if ((member as { role?: string } | null)?.role !== "owner")
      return { ok: false, message: "Bare prosjektets eier kan slette for godt." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AnyClient;
    const schema = await checkSchema(admin);
    if (schema.kind === "missing" || schema.version < 29)
      return {
        ok: false,
        message:
          "Databasen er ikke oppdatert for slettede objekter. Lim inn meldingen i LOVABLE_SYNC.md i Lovable (migrasjon 0029).",
      };
    const { data: res, error } = await admin.rpc("purge_removed_assets", {
      p_project: data.projectId,
      p_actor: context.userId,
      p_assets: data.assetIds,
      p_versions: data.versionIds,
    });
    if (error) {
      const m = error.message ?? "Ukjent feil";
      return { ok: false, message: m.length > 300 ? `${m.slice(0, 300)} …` : m };
    }
    const r = res as { paths?: string[]; assets?: number; versions?: number };
    const leftover = await removeFiles(admin, "assets", data.projectId, r.paths ?? []);
    return { ok: true, assets: r.assets ?? 0, versions: r.versions ?? 0, leftoverFiles: leftover };
  });
