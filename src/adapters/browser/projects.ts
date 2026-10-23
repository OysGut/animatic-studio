import { locale } from "@/core/i18n";
import { t } from "@/core/i18n/keyed";
/** Prosjektlisten og prosjekter som opprettes eller forlates, for nettleseren (KI-181). */
import { db, plainError, type BackendError, type BackendResult } from "./client";

/** Prosjektene brukeren har tilgang til, med medlemmene, nyeste først. Kaster med feilmeldingen. */
export async function listProjects(): Promise<unknown[]> {
  const { data, error } = await db
    .from("projects")
    .select("*, project_members(role, user_id, removed_at)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Nytt prosjekt. Gir ID-en. Kaster med feilmeldingen. */
export async function createProject(name: string, sourceLanguage = locale()): Promise<string> {
  const { data, error } = await db.rpc("create_project", { p_name: name, p_source_language: sourceLanguage });
  if (error) throw new Error(error.code === "PTG11" ? t("adapters-storage-commands-functions.quota-projects") : error.message);
  return data as string;
}

/** Nytt prosjekt med bildefrekvens (gjenoppretting). Feilen gis tilbake. */
export async function createProjectWithFps(
  name: string,
  fpsNum: number,
  fpsDen: number,
  sourceLanguage = locale(),
): Promise<BackendResult<unknown>> {
  const { data, error } = await db.rpc("create_project", {
    p_name: name,
    p_fps_num: fpsNum,
    p_fps_den: fpsDen,
    p_source_language: sourceLanguage,
  });
  return { data, error: plainError(error) };
}

/** Hovedfilmen(e) i prosjektet. */
export async function findMainProductions(
  projectId: string,
): Promise<BackendResult<{ id: string }[] | null>> {
  const { data, error } = await db
    .from("productions")
    .select("id")
    .eq("project_id", projectId)
    .eq("kind", "main");
  return { data: data as { id: string }[] | null, error: plainError(error) };
}

/** Forlat et prosjekt. Gir feilen (null = forlatt). */
export async function leaveProject(projectId: string): Promise<BackendError | null> {
  const { error } = await db.rpc("leave_project", { p_project: projectId });
  return plainError(error);
}

/** Navnet på prosjektet og om det er slettet (prosjektrammen). */
export async function fetchProjectName(
  projectId: string,
): Promise<{ name: string; deleted: boolean }> {
  const { data } = await db.from("projects").select("*").eq("id", projectId).maybeSingle();
  const p = data as { name: string; deleted_at?: string | null } | null;
  return { name: p?.name ?? "", deleted: Boolean(p?.deleted_at) };
}

/** Oppdaterer visningsnavnet for innlogget bruker (migrasjon 0002). Feiler stille. */
export async function upsertMyProfile(): Promise<void> {
  await db.rpc("upsert_my_profile", {});
}

/** En produksjon slik prosjektlisten viser den (DEC-0082). */
export interface ProductionSummary {
  readonly id: string;
  readonly project_id: string;
  readonly kind: string;
  readonly name: string;
  readonly parent_production_id: string | null;
  readonly created_at: string;
  /** Notatet (migrasjon 0031); mangler i eldre databaser. */
  readonly description?: string | null;
}

/** Produksjonene (hovedfilm, spinoffer, varianter) i prosjektene. Kaster med feilmeldingen. */
export async function listProductionsFor(
  projectIds: readonly string[],
): Promise<ProductionSummary[]> {
  if (!projectIds.length) return [];
  const { data, error } = await db
    .from("productions")
    .select("*")
    .in("project_id", [...projectIds])
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductionSummary[];
}
