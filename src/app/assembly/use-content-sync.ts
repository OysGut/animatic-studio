/** Flagget «Ressurs oppdatert» per scene (REQ-0022): data til ContentSyncFlag. */
import { useMemo } from "react";
import { contentSyncByScene, type ProjectState, type SceneContentSync } from "@/core";
import { useAiJobs } from "@/app/ai/use-ai-jobs";

/** Scenene i produksjonen som er laget med en eldre ressursversjon (nøkkel: sceneforekomst). */
export function useContentSync(
  state: ProjectState,
  projectId: string,
  productionId: string,
): ReadonlyMap<string, SceneContentSync> {
  const jobs = useAiJobs(projectId);
  return useMemo(
    () =>
      productionId
        ? contentSyncByScene(state, productionId, { jobs: jobs.data?.jobs ?? [] })
        : new Map<string, SceneContentSync>(),
    [state, productionId, jobs.data],
  );
}
