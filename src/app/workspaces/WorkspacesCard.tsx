/**
 * Arbeidsgruppene mine på kontosiden (GP1): liste med rolle, lenke til gruppesiden og «Ny arbeidsgruppe».
 * Vises bare når databasen har migrasjon 0045.
 */
import { useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { L, tm, WORKSPACE_ROLE_LABEL } from "@/core";
import { createWorkspace, listMyWorkspaces } from "@/adapters/browser/workspaces";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
import { Button } from "@/components/ui/button";
import { t } from "@/core/i18n/keyed";

export const MY_WORKSPACES_KEY = ["my-workspaces"] as const;

const input =
  "h-8 w-full rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";

export function WorkspacesCard({ userId }: { userId: string }) {
  const ready = useSchemaAtLeast(45);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useQuery({
    queryKey: [...MY_WORKSPACES_KEY, userId],
    queryFn: () => listMyWorkspaces(userId),
    enabled: ready,
  });
  if (!ready) return null;

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const id = await createWorkspace(name.trim());
      setName("");
      void qc.invalidateQueries({ queryKey: MY_WORKSPACES_KEY });
      void navigate({ to: "/gruppe/$workspaceId", params: { workspaceId: id } });
    } catch (e) {
      setMsg(tm((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      data-testid="account-workspaces"
      className="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-4"
    >
      <h2 className="text-sm font-semibold text-text-primary">
        {t("app-workspaces-workspaces-card.workspaces-card.h2.d8a76c716a20")}
      </h2>
      <p className="text-xs text-text-tertiary">
        {t("app-workspaces-workspaces-card.workspaces-card.p.83c05b086205")}
      </p>
      {list.data?.length ? (
        <ul className="flex flex-col gap-1">
          {list.data.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-2 text-[13px]">
              <Link
                to="/gruppe/$workspaceId"
                params={{ workspaceId: w.id }}
                className="text-accent-brand underline-offset-2 hover:underline"
                data-testid={`workspace-link-${w.id}`}
              >
                {w.name}
              </Link>
              <span className="text-xs text-text-tertiary">{WORKSPACE_ROLE_LABEL[w.role]}</span>
            </li>
          ))}
        </ul>
      ) : list.isSuccess ? (
        <p className="text-xs text-text-secondary">
          {t("app-workspaces-workspaces-card.workspaces-card.p.a3a6ede1a37c")}
        </p>
      ) : null}
      <div className="flex gap-2">
        <input
          className={input}
          value={name}
          maxLength={200}
          aria-label={t("app-workspaces-workspaces-card.workspaces-card.aria-label.ddc2b6b3f64a")}
          placeholder={t("app-workspaces-workspaces-card.workspaces-card.placeholder.ddc2b6b3f64a")}
          onChange={(e) => setName(e.target.value)}
          data-testid="workspace-new-name"
        />
        <Button
          size="sm"
          disabled={busy || !name.trim()}
          onClick={() => void create()}
          data-testid="workspace-create"
        >
          {t("app-workspaces-workspaces-card.workspaces-card.button.ff2ce537682b")}
        </Button>
      </div>
      {msg ? (
        <p role="alert" className="text-xs text-status-danger">
          {msg}
        </p>
      ) : null}
    </section>
  );
}
