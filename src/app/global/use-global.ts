/**
 * Felles spørringer for det globale biblioteket (GP2): prosjektets arbeidsgruppe, min rolle der og innholdet.
 */
import { useQuery } from "@tanstack/react-query";
import { workspaceRights, type WorkspaceRole } from "@/core";
import { getSession } from "@/adapters/browser/auth";
import { getProjectWorkspace, listGlobalBundles } from "@/adapters/browser/global-library";
import { listMyWorkspaces } from "@/adapters/browser/workspaces";
import { useSchemaAtLeast } from "@/app/shell/use-schema";

export const GLOBAL_SCHEMA = 46;

export function globalBundlesKey(workspaceId: string | null) {
  return ["global-bundles", workspaceId] as const;
}

export function useProjectWorkspace(projectId: string) {
  const ready = useSchemaAtLeast(GLOBAL_SCHEMA);
  const ws = useQuery({
    queryKey: ["project-workspace", projectId],
    queryFn: () => getProjectWorkspace(projectId),
    enabled: ready,
  });
  const me = useQuery({ queryKey: ["session-user"], queryFn: async () => (await getSession())?.user.id ?? null });
  const mine = useQuery({
    queryKey: ["my-workspaces", me.data],
    queryFn: () => listMyWorkspaces(me.data!),
    enabled: ready && !!me.data,
  });
  const workspaceId = ws.data ?? null;
  const role: WorkspaceRole | null = mine.data?.find((w) => w.id === workspaceId)?.role ?? null;
  return {
    ready,
    loaded: ws.isSuccess && mine.isSuccess,
    workspaceId,
    workspaceName: mine.data?.find((w) => w.id === workspaceId)?.name ?? null,
    role,
    rights: workspaceRights(role),
  };
}

export function useGlobalBundles(workspaceId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: globalBundlesKey(workspaceId),
    queryFn: () => listGlobalBundles(workspaceId!),
    enabled: enabled && !!workspaceId,
  });
}
