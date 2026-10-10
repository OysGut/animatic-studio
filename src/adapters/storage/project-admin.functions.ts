/**
 * Slette prosjekt og slette ressursene i et slettet prosjekt for godt (DEC-0046). Bare eieren, og bare når
 * prosjektnavnet er skrevet inn som bekreftelse. Databasedelen kjøres atomisk i public.delete_project /
 * public.purge_project_assets (bare service_role, migrasjon 0011); filene i lagringen slettes etterpå her.
 *
 * Sletting av prosjektet fjerner manus, versjoner, scener, 2D-scener, lydklipp, notater, historikk,
 * importerte manusfiler og importert film. Ressursene (bilder og lyd) blir liggende hos eieren til de slettes
 * i en egen operasjon, så de kan lastes ned og senere gjøres globale (REQ-0571).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUuid } from "@/core";
import { checkSchema, type AnyClient } from "./project-rows";

export interface ProjectAdminInput {
  readonly projectId: string;
  /** Prosjektnavnet slik brukeren skrev det inn (bekreftelse). */
  readonly confirmName: string;
}

export type ProjectAdminResult =
  | {
      readonly ok: true;
      /** Antall andre medlemmer som mistet tilgangen. */
      readonly removedMembers: number;
      /** Filer i lagringen som ikke kunne slettes (blir liggende; ingen kan nå dem fra appen). */
      readonly leftoverFiles: number;
    }
  | { readonly ok: false; readonly message: string };

function validate(d: unknown): ProjectAdminInput {
  if (!d || typeof d !== "object") throw new Error("Ugyldig forespørsel");
  const x = d as Record<string, unknown>;
  if (typeof x["projectId"] !== "string" || !isUuid(x["projectId"]))
    throw new Error("Ugyldig prosjekt");
  if (typeof x["confirmName"] !== "string" || x["confirmName"].length > 400)
    throw new Error("Ugyldig bekreftelse");
  return { projectId: x["projectId"], confirmName: x["confirmName"] };
}

/** Samme sammenligning som i vinduet: mellomrom i endene teller ikke, store og små bokstaver gjør. */
export function nameMatches(typed: string, name: string): boolean {
  return typed.trim() === name.trim() && name.trim().length > 0;
}

interface Ctx {
  readonly admin: AnyClient;
  readonly name: string;
  readonly deleted: boolean;
}

async function ownerContext(
  userDb: AnyClient,
  userId: string,
  projectId: string,
): Promise<Ctx | string> {
  const { data: member } = await userDb
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .is("removed_at", null)
    .maybeSingle();
  if ((member as { role?: string } | null)?.role !== "owner")
    return "Bare prosjekteieren kan gjøre dette.";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as AnyClient;
  const schema = await checkSchema(admin);
  if (schema.kind === "missing" || schema.version < 11)
    return "Databasen er ikke oppdatert for sletting ennå. Lim inn meldingen i LOVABLE_SYNC.md i Lovable (migrasjon 0011).";
  const { data: project } = await admin
    .from("projects")
    .select("name, deleted_at")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return "Prosjektet finnes ikke.";
  const p = project as { name: string; deleted_at: string | null };
  return { admin, name: p.name, deleted: p.deleted_at !== null };
}

/**
 * Alle filer under en mappe i bøtta (også filer som ble lastet opp uten å bli lagret i prosjektet, f.eks.
 * ved avbrutt opplasting). Mapper har id null i lista fra lagringstjenesten.
 */
async function listFolder(
  admin: AnyClient,
  bucket: string,
  prefix: string,
  depth = 0,
): Promise<string[]> {
  if (depth > 5) return [];
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error || !data) return out;
    for (const e of data as { name: string; id: string | null }[]) {
      const path = `${prefix}/${e.name}`;
      if (e.id === null) out.push(...(await listFolder(admin, bucket, path, depth + 1)));
      else out.push(path);
    }
    if (data.length < 1000) return out;
  }
}

/**
 * Sletter filene i bøtta i porsjoner, bare innenfor prosjektets egen mappe. Returnerer antall som ikke
 * kunne slettes.
 */
async function removeFiles(
  admin: AnyClient,
  bucket: string,
  projectId: string,
  paths: readonly string[],
) {
  let failed = 0;
  const list = [
    ...new Set(
      paths.filter(
        (p) => typeof p === "string" && p.startsWith(`${projectId}/`) && !p.includes(".."),
      ),
    ),
  ];
  for (let i = 0; i < list.length; i += 100) {
    const part = list.slice(i, i + 100);
    const { error } = await admin.storage.from(bucket).remove(part);
    if (error) failed += part.length;
  }
  return failed;
}

function dbMessage(e: { message?: string } | null): string {
  const m = e?.message ?? "Ukjent feil";
  return m.length > 300 ? `${m.slice(0, 300)} …` : m;
}

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }): Promise<ProjectAdminResult> => {
    const ctx = await ownerContext(
      context.supabase as unknown as AnyClient,
      context.userId,
      data.projectId,
    );
    if (typeof ctx === "string") return { ok: false, message: ctx };
    if (ctx.deleted) return { ok: false, message: "Prosjektet er allerede slettet." };
    if (!nameMatches(data.confirmName, ctx.name))
      return { ok: false, message: "Navnet stemmer ikke med prosjektnavnet." };
    const { data: res, error } = await ctx.admin.rpc("delete_project", {
      p_project: data.projectId,
      p_actor: context.userId,
    });
    if (error) return { ok: false, message: `Prosjektet ble ikke slettet: ${dbMessage(error)}` };
    const r = res as { sources?: string[]; films?: string[]; removed_members?: number };
    const sources = [
      ...(r.sources ?? []),
      ...(await listFolder(ctx.admin, "sources", data.projectId)),
    ];
    const films = [
      ...(r.films ?? []),
      ...(await listFolder(ctx.admin, "assets", `${data.projectId}/films`)),
    ];
    const leftover =
      (await removeFiles(ctx.admin, "sources", data.projectId, sources)) +
      (await removeFiles(ctx.admin, "assets", data.projectId, films));
    return { ok: true, removedMembers: r.removed_members ?? 0, leftoverFiles: leftover };
  });

export const purgeProjectAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }): Promise<ProjectAdminResult> => {
    const ctx = await ownerContext(
      context.supabase as unknown as AnyClient,
      context.userId,
      data.projectId,
    );
    if (typeof ctx === "string") return { ok: false, message: ctx };
    if (!ctx.deleted)
      return {
        ok: false,
        message: "Ressursene kan bare slettes for godt etter at prosjektet er slettet.",
      };
    if (!nameMatches(data.confirmName, ctx.name))
      return { ok: false, message: "Navnet stemmer ikke med prosjektnavnet." };
    const { data: res, error } = await ctx.admin.rpc("purge_project_assets", {
      p_project: data.projectId,
      p_actor: context.userId,
    });
    if (error) return { ok: false, message: `Ressursene ble ikke slettet: ${dbMessage(error)}` };
    const r = res as { paths?: string[] };
    const paths = [...(r.paths ?? []), ...(await listFolder(ctx.admin, "assets", data.projectId))];
    const leftover = await removeFiles(ctx.admin, "assets", data.projectId, paths);
    return { ok: true, removedMembers: 0, leftoverFiles: leftover };
  });
