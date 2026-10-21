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
