/**
 * G-6 del 2: profiler på arbeidsgruppen (stil, kvalitet, fonter, maler) som prosjektene arver når de ikke
 * har en egen. Redaktører og eiere kan legge til, gi nytt navn, gjøre til standard og arkivere; databasen
 * håndhever rollen og revisjonen (workspace_save_profile / workspace_archive_profile, 0098).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tm } from "@/core";
import { WORKSPACE_PROFILE_KINDS, type WorkspaceProfile, type WorkspaceProfileKind } from "@/core/global/workspace-profiles";
import { archiveWorkspaceProfile, listWorkspaceProfiles, saveWorkspaceProfile } from "@/adapters/browser/global-library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/core/i18n/keyed";

export const workspaceProfilesKey = (id: string) => ["workspace-profiles", id] as const;

export function profileKindLabel(k: WorkspaceProfileKind): string {
  return k === "style"
    ? t("g6-profiles.kind.style")
    : k === "quality"
      ? t("g6-profiles.kind.quality")
      : k === "font"
        ? t("g6-profiles.kind.font")
        : t("g6-profiles.kind.template");
}

export function WorkspaceProfilesCard({ workspaceId, canEdit }: { workspaceId: string; canEdit: boolean }) {
  const q = useQuery({ queryKey: workspaceProfilesKey(workspaceId), queryFn: () => listWorkspaceProfiles(workspaceId) });
  return (
    <section data-testid="workspace-profiles" className="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-4">
      <h2 className="text-sm font-semibold text-text-primary">{t("g6-profiles.title")}</h2>
      <p className="text-xs text-text-tertiary">{t("g6-profiles.note")}</p>
      {!q.data ? (
        <p className="text-xs text-text-tertiary">{q.isLoading ? t("b109.admin.loading") : t("g6-profiles.unavailable")}</p>
      ) : (
        WORKSPACE_PROFILE_KINDS.map((k) => (
          <KindGroup key={k} kind={k} workspaceId={workspaceId} canEdit={canEdit} profiles={q.data.filter((p) => p.kind === k)} />
        ))
      )}
    </section>
  );
}

function KindGroup({
  kind,
  workspaceId,
  canEdit,
  profiles,
}: {
  kind: WorkspaceProfileKind;
  workspaceId: string;
  canEdit: boolean;
  profiles: readonly WorkspaceProfile[];
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: workspaceProfilesKey(workspaceId) });
  async function run(fn: () => Promise<unknown>) {
    setMsg(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setMsg(tm((e as Error).message));
    }
  }
  const active = profiles.filter((p) => !p.archived);
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2" data-testid={`workspace-profiles-${kind}`}>
      <h3 className="text-xs font-semibold text-text-primary">{profileKindLabel(kind)}</h3>
      {active.length === 0 ? <p className="text-xs text-text-tertiary">{t("g6-profiles.none")}</p> : null}
      <ul className="flex flex-col gap-1">
        {active.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-text-primary" dir="auto">{p.name}</span>
            {p.isDefault ? <span className="text-xs text-text-tertiary">{t("g6-profiles.default")}</span> : null}
            {canEdit ? (
              <span className="ml-auto flex gap-1">
                {!p.isDefault ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void run(() =>
                        saveWorkspaceProfile(workspaceId, { id: p.id, kind, name: p.name, spec: { ...p.spec }, isDefault: true, revision: p.revision }),
                      )
                    }
                  >
                    {t("g6-profiles.make-default")}
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => void run(() => archiveWorkspaceProfile(p.id, true))}>
                  {t("g6-profiles.archive")}
                </Button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim();
            if (!n) return;
            void run(async () => {
              await saveWorkspaceProfile(workspaceId, { id: null, kind, name: n, spec: {}, isDefault: active.length === 0, revision: 0 });
              setName("");
            });
          }}
        >
          <Input
            className="h-8 flex-1"
            maxLength={120}
            value={name}
            aria-label={t("g6-profiles.new-name", { kind: profileKindLabel(kind) })}
            placeholder={t("g6-profiles.new-name", { kind: profileKindLabel(kind) })}
            onChange={(e) => setName(e.target.value)}
          />
          <Button size="sm" type="submit" disabled={!name.trim()}>
            {t("g6-profiles.add")}
          </Button>
        </form>
      ) : null}
      {msg ? <p role="alert" className="text-xs text-status-danger">{msg}</p> : null}
    </div>
  );
}
