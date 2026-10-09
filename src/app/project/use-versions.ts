/**
 * Manusversjoner (migrasjon 0003, REQ-0032, REQ-0076–0078). Listen hentes uten øyeblikksbilder;
 * et øyeblikksbilde hentes først når det trengs (sammenligning, visning, eksport).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ScriptSnapshot } from "@/core";
import { db } from "@/app/db";

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
    queryFn: async (): Promise<VersionRow[]> => {
      const { data, error } = await db
        .from("script_versions")
        .select("id, number, name, note, parent_version_id, created_at, created_by")
        .eq("production_id", productionId)
        .order("number", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as VersionRow[];
    },
  });
}

export function useVersionSnapshot(versionId: string | null) {
  return useQuery({
    queryKey: ["script-version-snapshot", versionId],
    enabled: versionId !== null,
    staleTime: Infinity, // uforanderlig
    queryFn: async (): Promise<ScriptSnapshot> => {
      const { data, error } = await db
        .from("script_versions")
        .select("snapshot")
        .eq("id", versionId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Versjonen finnes ikke");
      return (data as { snapshot: ScriptSnapshot }).snapshot;
    },
  });
}

export function useCreateVersion(projectId: string, productionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; note: string }) => {
      const { data, error } = await db.rpc("create_script_version", {
        p_project: projectId,
        p_production: productionId,
        p_name: input.name,
        p_note: input.note || null,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: versionsKey(productionId) }),
  });
}
