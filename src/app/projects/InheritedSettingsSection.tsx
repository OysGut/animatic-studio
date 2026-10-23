/**
 * G-6 del 2: hva prosjektet arver fra arbeidsgruppen. Profiler (resolveWorkspaceProfile: prosjektets egne
 * vinner) og innstillinger (resolveSettings: prosjekt → arbeidsgruppe → bruker → land → standard), med
 * kilden vist for hver verdi. Bare visning; endringer gjøres der profilene og innstillingene bor.
 */
import { useQuery } from "@tanstack/react-query";
import type { ProjectState } from "@/core";
import { WORKSPACE_PROFILE_KINDS, resolveWorkspaceProfile, type WorkspaceProfileKind } from "@/core/global/workspace-profiles";
import { resolveSettings, settingLevelFrom, type SettingSource } from "@/core/settings/resolve";
import { listWorkspaceProfiles } from "@/adapters/browser/global-library";
import { getWorkspaceSettings } from "@/adapters/browser/workspaces";
import { useProjectWorkspace } from "@/app/global/use-global";
import { profileKindLabel, workspaceProfilesKey } from "@/app/workspaces/WorkspaceProfilesCard";
import { t } from "@/core/i18n/keyed";

function sourceLabel(s: SettingSource | "project" | "workspace"): string {
  switch (s) {
    case "project": return t("g6-inherit.source.project");
    case "workspace": return t("g6-inherit.source.workspace");
    case "user": return t("g6-inherit.source.user");
    case "country": return t("g6-inherit.source.country");
    default: return t("g6-inherit.source.default");
  }
}

function projectProfiles(s: ProjectState, k: WorkspaceProfileKind): { name: string }[] {
  if (k === "quality") return Object.values(s.qualityProfiles ?? {}).filter((p) => !p.removed);
  if (k === "style") return Object.values(s.styleProfiles ?? {}).filter((p) => !(p as { removed?: boolean }).removed) as { name: string }[];
  return [];
}

export function InheritedSettingsSection({ state, projectId }: { state: ProjectState; projectId: string }) {
  const ws = useProjectWorkspace(projectId);
  const id = ws.workspaceId;
  const profiles = useQuery({ queryKey: workspaceProfilesKey(id ?? ""), queryFn: () => listWorkspaceProfiles(id!), enabled: !!id });
  const settings = useQuery({ queryKey: ["workspace-settings", id], queryFn: () => getWorkspaceSettings(id!), enabled: !!id });
  if (!ws.ready || !id) return null;
  const resolved = resolveSettings({
    workspace: settings.data ? settingLevelFrom(settings.data.settings, settings.data.timeZone) : null,
  });
  const shown = ["paper", "currency", "timeZone", "units"] as const;
  const settingName = (k: (typeof shown)[number]) =>
    k === "paper" ? t("g6-inherit.paper") : k === "currency" ? t("g6-inherit.currency") : k === "timeZone" ? t("g6-inherit.time-zone") : t("g6-inherit.units");
  return (
    <section className="mt-8" aria-labelledby="inherit-title" data-testid="inherited-settings">
      <h2 id="inherit-title" className="text-sm font-semibold text-text-primary">
        {t("g6-inherit.title", { name: ws.workspaceName ?? "" })}
      </h2>
      <ul className="mt-2 flex flex-col gap-1 text-[13px]">
        {WORKSPACE_PROFILE_KINDS.map((k) => {
          const r = resolveWorkspaceProfile(k, projectProfiles(state, k), profiles.data ?? []);
          return (
            <li key={k} className="flex justify-between gap-3">
              <span className="text-text-secondary">{profileKindLabel(k)}</span>
              <span className="text-text-primary" dir="auto">
                {r ? `${r.profile.name} · ${sourceLabel(r.source)}` : t("g6-inherit.none")}
              </span>
            </li>
          );
        })}
        {shown.map((k) => (
          <li key={k} className="flex justify-between gap-3">
            <span className="text-text-secondary">{settingName(k)}</span>
            <span className="text-text-primary">{`${String(resolved[k].value)} · ${sourceLabel(resolved[k].source)}`}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
