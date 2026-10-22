/** Administratorens innstillinger for AI-modellene i nettleseren (DEC-0088, migrasjon 0034). */
import { useQuery } from "@tanstack/react-query";
import { setCatalogSettings, type ModelSetting } from "@/core";
import { fetchAiModelSettings } from "@/adapters/account/ai-models.functions";

/** Administratorens innstillinger for AI-modellene (DEC-0088), felles for hele appen. */
export const AI_MODEL_SETTINGS_KEY = ["ai-model-settings"] as const;

/**
 * Henter administratorens av/på-innstillinger og egne modeller én gang (bufret i React Query) og gjør dem
 * gjeldende for katalogen, så alle valglister (providersFor, effortChoice) skjuler det som er slått av og viser
 * modellene administrator har lagt til. Feiler hentingen (eller databasen er eldre enn 0034), gjelder
 * katalogen som før – serveren avviser uansett avslåtte modeller.
 */
export function useAiModelSettings(enabled = true) {
  const q = useQuery({
    queryKey: AI_MODEL_SETTINGS_KEY,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ModelSetting[]> => {
      try {
        return (await fetchAiModelSettings())?.settings ?? [];
      } catch {
        return [];
      }
    },
  });
  // Synkront under tegningen, så listene i samme komponent bruker innstillingene med en gang
  if (q.data) setCatalogSettings(q.data);
  return q;
}
