/**
 * B-097: «Sist endret» per scene. Hentes én gang per prosjekt, på nytt ved sanntidsendringer i
 * endringsloggen (samlet over ett sekund) og hvert minutt.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSceneLastChanges, subscribeChangeLog } from "@/adapters/browser/last-changed";

export const sceneLastChangesKey = (projectId: string) => ["scene-last-changes", projectId] as const; // i18n-ignore: nøkkel

export function useSceneLastChanges(projectId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = subscribeChangeLog(projectId, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void qc.invalidateQueries({ queryKey: sceneLastChangesKey(projectId) }), 1000);
    });
    return () => {
      if (timer) clearTimeout(timer);
      stop();
    };
  }, [projectId, qc]);
  return useQuery({
    queryKey: sceneLastChangesKey(projectId),
    queryFn: () => fetchSceneLastChanges(projectId),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
