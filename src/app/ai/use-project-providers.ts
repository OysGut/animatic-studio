/** Leverandørene prosjektet kan bruke (DEC-0069): innebygd + eiernes tilkoblede. */
import { useQuery } from "@tanstack/react-query";
import { projectAiProviders } from "@/adapters/ai/provider-keys.functions";
import { useAiModelSettings } from "./use-ai-model-settings";

// Brukes av valglistene; står i egen fil så tester som mocker denne filen, fortsatt får innstillingene
export { AI_MODEL_SETTINGS_KEY, useAiModelSettings } from "./use-ai-model-settings";

export const projectProvidersKey = (projectId: string) =>
  ["project-ai-providers", projectId] as const;

export function useProjectProviders(projectId: string, enabled = true) {
  const settings = useAiModelSettings();
  const q = useQuery({
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
  // Leverandørene vises først når innstillingene er hentet, så en avslått modell aldri blir forhåndsvalgt
  return settings.isPending ? ({ ...q, data: undefined } as typeof q) : q;
}
