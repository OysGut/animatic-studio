/**
 * K-1: diskret merke når andre står i samme scene, og valget etter en lagringskonflikt
 * («Legg min endring oppå» / «Forkast min endring»). Ingenting skjer automatisk.
 */
import { TriangleAlert, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/core/i18n/keyed";
import type { SceneLastChange } from "@/adapters/browser/last-changed";
import type { ConflictedEdit } from "@/app/project/use-commands";
import { alsoEditingText } from "@/app/project/presence-view";
import { useTimeFormat } from "@/app/i18n/time-format";

export function ScenePresenceBadge({ names }: { names: readonly string[] | undefined }) {
  const text = alsoEditingText(names);
  if (!text) return null;
  return (
    <div
      role="status"
      data-testid="scene-presence-badge"
      className="flex shrink-0 items-center gap-1.5 border-b border-border bg-surface-2 px-3 py-1 text-xs text-text-secondary"
    >
      <Users className="size-3.5 shrink-0 text-accent-brand" aria-hidden />
      <span>{text}</span>
    </div>
  );
}

export interface ConflictSource {
  readonly conflicts: readonly ConflictedEdit[];
  readonly resolveConflict: (id: string, choice: "rebase" | "discard") => Promise<string | null>;
}

export function SceneConflictNotice({
  cmds,
  lastChange,
}: {
  cmds: ConflictSource;
  /** Siste lagrede endring av scenen (scene_last_changes), for «Sist endret av …». */
  lastChange: SceneLastChange | undefined;
}) {
  if (cmds.conflicts.length === 0) return null;
  return (
    <div className="flex max-h-[30vh] shrink-0 flex-col overflow-y-auto">
      {cmds.conflicts.map((c) => (
        <ConflictItem key={c.id} c={c} cmds={cmds} lastChange={lastChange} />
      ))}
    </div>
  );
}

function ConflictItem({ c, cmds, lastChange }: { c: ConflictedEdit; cmds: ConflictSource; lastChange: SceneLastChange | undefined }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const time = useTimeFormat();
  const by = lastChange?.logged
    ? lastChange.actorName
      ? t("k1.conflict.by", { name: lastChange.actorName, time: time.exact(lastChange.at) })
      : t("k1.conflict.by-unknown", { time: time.exact(lastChange.at) })
    : null;
  const choose = async (choice: "rebase" | "discard") => {
    setBusy(true);
    setError(null);
    try {
      setError(await cmds.resolveConflict(c.id, choice));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      role="alert"
      aria-label={t("k1.conflict.aria")}
      data-testid="scene-conflict"
      className="flex shrink-0 flex-col gap-1.5 border-b border-status-uncertain/40 bg-status-uncertain-bg px-3 py-2 text-xs"
    >
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-status-uncertain" aria-hidden />
        <p className="min-w-0 flex-1 text-text-primary">
          {c.label ? <span className="font-medium">{c.label}: </span> : null}
          {t("k1.conflict.title")}
          {by ? <span data-testid="scene-conflict-by"> {by}</span> : null}
        </p>
      </div>
      <div className="ml-5 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void choose("rebase")} data-testid="scene-conflict-rebase">
          {t("k1.conflict.rebase")}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void choose("discard")} data-testid="scene-conflict-discard">
          {t("k1.conflict.discard")}
        </Button>
        {error ? <span className="text-status-danger">{error}</span> : null}
      </div>
    </section>
  );
}
