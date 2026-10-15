/**
 * Innstillingene for AI-modellene (DEC-0088, migrasjon 0034) for alle innloggede: hvilke leverandører og
 * modeller administrator har slått av, og modellene administrator har lagt til. Valglistene i appen henter
 * dette én gang (React Query, `useAiModelSettings`) og skjuler det som er av. Serveren kontrollerer det samme
 * på nytt før hvert betalte kall (ai-models.server.ts → checkModelAllowed).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ModelSetting } from "@/core";
import type { AnyClient } from "@/adapters/storage/project-rows";

export interface AiModelSettingsResult {
  /** Tabellen finnes (migrasjon 0034). Uten den gjelder katalogen som før. */
  readonly ready: boolean;
  readonly settings: ModelSetting[];
}

export const fetchAiModelSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiModelSettingsResult> => {
    // Alle innloggede kan lese tabellen (RLS); brukerens egen klient er nok
    const { loadModelSettings } = await import("./ai-models.server");
    return loadModelSettings(context.supabase as unknown as AnyClient);
  });
