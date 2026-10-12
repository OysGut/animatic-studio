/** Leverandørene prosjektet kan bruke (DEC-0069): innebygd + eiernes tilkoblede. */
import { useQuery } from "@tanstack/react-query";
import { projectAiProviders } from "@/adapters/ai/provider-keys.functions";

export const projectProvidersKey = (projectId: string) =>
  ["project-ai-providers", projectId] as const;

export function useProjectProviders(projectId: string, enabled = true) {
  return useQuery({
    queryKey: projectProvidersKey(projectId),
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        return await projectAiProviders({ data: { projectId } });
      } catch {
        return { providers: ["lovable"], missing: false };
      }
    },
  });
}
