/** C-1: hand-off rows for a project (status surface). Read-only; refreshes every 30 s while shown. */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listHandoffs } from "@/adapters/handoff/handoff.functions";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
import type { HandoffRow } from "@/core/handoff";

export const handoffsKey = (projectId: string) => ["handoffs", projectId] as const;
export function useHandoffs(projectId: string): readonly HandoffRow[] {
  const ready = useSchemaAtLeast(110);
  const list = useServerFn(listHandoffs);
  const q = useQuery({ queryKey: handoffsKey(projectId), queryFn: () => list({ data: { projectId } }), enabled: ready && !!projectId, refetchInterval: 30_000 });
  return q.data ?? [];
}
