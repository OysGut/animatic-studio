/**
 * Manusversjoner (migrasjon 0003, REQ-0032, REQ-0076–0078). Listen hentes uten øyeblikksbilder;
 * et øyeblikksbilde hentes først når det trengs (sammenligning, visning, eksport).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  L,
  estimateProduction,
  productionStatus,
  projectDurationAssumptions,
  scriptPages,
  type DurationAssumptions,
  type ProjectState,
  type ScriptSnapshot,
} from "@/core";
import { durationSnapshot, type DurationSnapshot } from "@/core/screenplay/duration-snapshot";
import {
  createScriptVersion,
  fetchScriptSnapshot,
  listScriptVersions,
} from "@/adapters/browser/versions";
import { saveDurationEstimate } from "@/adapters/browser/history-records";
import { estimatesKey } from "@/app/projects/use-history-records";

export interface VersionRow {
  readonly id: string;
  readonly number: number;
  readonly name: string;
  readonly note: string | null;
  readonly parent_version_id: string | null;
  readonly created_at: string;
  readonly created_by: string;
}

export const versionsKey = (productionId: string) => ["script-versions", productionId] as const;

export function useVersionList(productionId: string, enabled = true) {
  return useQuery({
    queryKey: versionsKey(productionId),
    enabled,
    queryFn: async (): Promise<VersionRow[]> =>
      (await listScriptVersions(productionId)) as VersionRow[],
  });
}

export function useVersionSnapshot(versionId: string | null) {
  return useQuery({
    queryKey: ["script-version-snapshot", versionId],
    enabled: versionId !== null,
    staleTime: Infinity, // uforanderlig
    queryFn: async (): Promise<ScriptSnapshot> => {
      const snapshot = await fetchScriptSnapshot(versionId!);
      if (!snapshot) throw new Error(L("Versjonen finnes ikke", "The version does not exist"));
      return snapshot;
    },
  });
}

/**
 * Varighetsestimatet for manuset slik det er nå (REQ-0120): samme beregning som varighetsoversikten, med
 * prosjektets antakelser og låste sider. Lagres sammen med hver nye manusversjon.
 */
export function versionDurationEstimate(
  state: ProjectState,
  productionId: string,
  assumptions: DurationAssumptions = projectDurationAssumptions(state.project),
): { assumptions: DurationAssumptions; snapshot: DurationSnapshot } {
  const pages = scriptPages(state, productionId, { lockedPages: true });
  const estimate = estimateProduction(state, productionId, assumptions, pages);
  return {
    assumptions,
    snapshot: durationSnapshot(productionStatus(state, productionId, estimate)),
  };
}

export interface CreatedVersion {
  readonly id: string;
  /** Satt når estimatet ikke ble lagret (versjonen er likevel lagret). */
  readonly estimateError: string | null;
}

/** Køen med endringer (useCommands): vent til alt er lagret, og tilstanden etterpå. */
export interface CommandQueueAccess {
  readonly whenIdle?: () => Promise<void>;
  readonly current?: () => ProjectState | null;
}

/**
 * Lagrer en ny manusversjon. Med `saveEstimate` (databasen har migrasjon 0028) og tilstanden lagres også
 * varighetsestimatet knyttet til versjonen (REQ-0120). Feiler det, er versjonen likevel lagret; feilen gis
 * tilbake som `estimateError` for en stille melding.
 * Med `queue` ventes det først til alle endringer i køen er lagret, og estimatet regnes fra tilstanden etterpå
 * (den samme som serveren lager versjonen fra), ikke fra lokale endringer som ennå ikke er lagret.
 */
export function useCreateVersion(
  projectId: string,
  productionId: string,
  saveEstimate = false,
  queue: CommandQueueAccess = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      note: string;
      state?: ProjectState;
    }): Promise<CreatedVersion> => {
      if (queue.whenIdle) await queue.whenIdle();
      const state = (queue.current ? queue.current() : null) ?? input.state;
      const id = await createScriptVersion({
        projectId,
        productionId,
        name: input.name,
        note: input.note,
      });
      if (!saveEstimate || !state) return { id, estimateError: null };
      try {
        const e = versionDurationEstimate(state, productionId);
        await saveDurationEstimate({ projectId, productionId, ...e, scriptVersionId: id });
        void qc.invalidateQueries({ queryKey: estimatesKey(productionId) });
        return { id, estimateError: null };
      } catch (err) {
        return { id, estimateError: err instanceof Error ? err.message : String(err) };
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: versionsKey(productionId) }),
  });
}
