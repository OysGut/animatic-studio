/**
 * Lagrede varighetsestimater (REQ-0120) og eksportloggen (REQ-0037) i appen (migrasjon 0028). Med en eldre
 * database (før 0028) er alt dette slått av: listene er tomme og ingenting lagres.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { DurationAssumptions } from "@/core";
import {
  storedEstimateFromRow,
  type DurationSnapshot,
  type StoredDurationEstimate,
} from "@/core/screenplay/duration-snapshot";
import {
  exportRecordFromRow,
  normalizeExportRecord,
  type ExportKind,
  type ExportRecord,
  type NewExportRecord,
} from "@/core/export-records";
import {
  listDurationEstimates,
  listExportRecords,
  recordExport,
  saveDurationEstimate,
} from "@/adapters/browser/history-records";
import { useSchemaAtLeast } from "@/app/shell/use-schema";

/** Skjemaversjonen som har lagrede estimater og eksportloggen. */
export const HISTORY_SCHEMA = 28;

export const estimatesKey = (productionId: string) => ["duration-estimates", productionId] as const;
export const exportRecordsKey = (productionId: string) => ["export-records", productionId] as const;

export function useStoredEstimates(productionId: string, enabled: boolean) {
  const schema = useSchemaAtLeast(HISTORY_SCHEMA);
  return useQuery({
    queryKey: estimatesKey(productionId),
    enabled: enabled && schema,
    // Lagrede estimater endres aldri; nye kommer bare når noen lagrer
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<StoredDurationEstimate[]> =>
      (await listDurationEstimates(productionId))
        .map((r) => storedEstimateFromRow(r as Record<string, unknown>))
        .filter((x): x is StoredDurationEstimate => x !== null),
  });
}

export function useSaveDurationEstimate(projectId: string, productionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      assumptions: DurationAssumptions;
      snapshot: DurationSnapshot;
      scriptVersionId?: string | null;
    }) => saveDurationEstimate({ projectId, productionId, ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: estimatesKey(productionId) }),
  });
}

export function useExportRecords(
  productionId: string,
  kinds: readonly ExportKind[],
  enabled: boolean,
) {
  const schema = useSchemaAtLeast(HISTORY_SCHEMA);
  return useQuery({
    queryKey: [...exportRecordsKey(productionId), kinds.join(",")],
    enabled: enabled && schema,
    queryFn: async (): Promise<ExportRecord[]> =>
      (await listExportRecords(productionId, kinds))
        .map((r) => exportRecordFromRow(r as Record<string, unknown>))
        .filter((x): x is ExportRecord => x !== null),
  });
}

/**
 * Registrerer en fullført eksport (REQ-0037). Kalles etter at filen er laget; feiler registreringen, er
 * eksporten likevel ferdig (filen er laget), så feilen vises bare i konsollen. Uten migrasjon 0028: ingenting.
 */
export function useRecordExport(projectId: string): (record: NewExportRecord) => Promise<string | null> {
  const schema = useSchemaAtLeast(HISTORY_SCHEMA);
  const qc = useQueryClient();
  return useCallback(
    async (record: NewExportRecord): Promise<string | null> => {
      if (!schema) return null;
      let clean: NewExportRecord;
      try {
        clean = normalizeExportRecord(record);
      } catch (e) {
        console.warn("[eksportlogg]", (e as Error).message);
        return null;
      }
      // Id-en brukes av QR-delingen (GP5): delingen er bundet til denne filmversjonen
      try {
        const id = await recordExport(projectId, clean);
        void qc.invalidateQueries({ queryKey: exportRecordsKey(clean.productionId) });
        return id;
      } catch (e) {
        console.warn("[eksportlogg]", (e as Error).message);
        return null;
      }
    },
    [schema, qc, projectId],
  );
}
