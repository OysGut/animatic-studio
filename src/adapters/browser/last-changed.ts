/**
 * B-097: siste lagrede endring per scene (migrasjon 0073, RPC scene_last_changes) og sanntidsvarsel når
 * endringsloggen får en ny rad eller scene-ID-er. Før migrasjonen gir oppslaget null (ingen kolonne vises).
 */
import { browserClient, db, uniqueChannelName } from "./client";

export interface SceneLastChange {
  readonly at: string;
  readonly actorName: string | null;
  /** false = ingen loggført endring; tiden er opprettelsestiden. */
  readonly logged: boolean;
}

export async function fetchSceneLastChanges(projectId: string): Promise<ReadonlyMap<string, SceneLastChange> | null> {
  const { data, error } = await db.rpc("scene_last_changes", { p_project: projectId }); // i18n-ignore: funksjonsnavn
  if (error || !Array.isArray(data)) return null;
  const out = new Map<string, SceneLastChange>();
  for (const r of data as Record<string, unknown>[]) {
    if (typeof r["scene_id"] !== "string" || typeof r["changed_at"] !== "string") continue;
    out.set(r["scene_id"], {
      at: r["changed_at"],
      actorName: typeof r["actor_name"] === "string" && r["actor_name"] ? r["actor_name"] : null,
      logged: r["logged"] === true,
    });
  }
  return out;
}

/** Lytter på nye og oppdaterte rader i endringsloggen (scene_ids fylles rett etter innsettingen). */
export function subscribeChangeLog(projectId: string, onChange: () => void): () => void {
  const channel = browserClient
    .channel(uniqueChannelName(`sist-endret-${projectId}`)) // i18n-ignore: kanalnavn
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "change_log", filter: `project_id=eq.${projectId}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void browserClient.removeChannel(channel);
  };
}

/** B-118: siste endring av arbeidsstatus og farge per sceneforekomst (fra endringsloggen). */
export interface SceneMarkChange {
  readonly at: string;
  readonly actor: string;
}
export interface SceneMarkChanges {
  readonly status: ReadonlyMap<string, SceneMarkChange>;
  readonly color: ReadonlyMap<string, SceneMarkChange>;
}

export async function fetchSceneMarkChanges(projectId: string): Promise<SceneMarkChanges> {
  const { data, error } = await db
    .from("change_log") // i18n-ignore: tabellnavn
    .select("command_type,command,actor,created_at") // i18n-ignore: kolonner
    .eq("project_id", projectId)
    .in("command_type", ["SetOccurrenceWorkStatus", "SetOccurrenceColor"]) // i18n-ignore: kommandonavn
    .order("created_at", { ascending: false })
    .limit(1000);
  const status = new Map<string, SceneMarkChange>();
  const color = new Map<string, SceneMarkChange>();
  if (error || !Array.isArray(data)) return { status, color };
  for (const r of data as Record<string, unknown>[]) {
    const cmd = r["command"] as { occurrenceId?: unknown } | null;
    const occ = typeof cmd?.occurrenceId === "string" ? cmd.occurrenceId : null;
    if (!occ || typeof r["created_at"] !== "string" || typeof r["actor"] !== "string") continue;
    const target = r["command_type"] === "SetOccurrenceColor" ? color : status;
    if (!target.has(occ)) target.set(occ, { at: r["created_at"], actor: r["actor"] });
  }
  return { status, color };
}
