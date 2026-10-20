import { useSyncExternalStore } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { exportQueue, type ExportTask } from "./export-queue";
import { t } from "@/core/i18n/keyed";
const empty: readonly ExportTask[] = [];
export function ExportQueueStatus() {
  const tasks = useSyncExternalStore(exportQueue.subscribe, exportQueue.snapshot, () => empty);
  if (!tasks.length) return null;
  return <aside data-testid="export-queue" aria-label={t("app-assembly-export-queue-status.export-queue-status.aria-label.73998bbbd4d4")} className="fixed bottom-3 right-3 z-40 flex max-h-64 w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-2 overflow-y-auto border border-border bg-surface-2 p-3 text-xs text-text-primary">
    {tasks.map(task => <div key={task.id} data-testid="export-queue-task" data-status={task.status} className="flex items-start gap-2">
      <div className="min-w-0 flex-1"><p className="truncate">{task.name}</p>
        <p role="status">{task.status === "queued" ? t("app-assembly-export-queue-status.export-queue-status.p.f66f1a482169") : task.status === "running" ? t("app-assembly-export-queue-status.export-queue-status.p.64c3eaa0b78b", { done: String(task.done), total: String(task.total) }) : task.status === "done" ? t("app-assembly-export-queue-status.export-queue-status.p.8b3a5f6dc7d3") : task.status === "cancelled" ? t("app-assembly-export-queue-status.export-queue-status.p.1f1d503f0280") : t("app-assembly-export-queue-status.export-queue-status.p.2c2d7a557513")}</p>
        {task.status === "running" ? <progress className="w-full" value={task.done} max={task.total} /> : null}
        {task.profile ? <p>{t("app-assembly-export-queue-status.export-queue-status.p.a4fc60296eb0", { name: String(task.profile.name) })}</p> : null}
        {task.error ? <p role="alert" className="text-status-danger">{task.error}</p> : null}
      </div>
      <Button size="icon" variant="ghost" data-testid="export-queue-cancel" title={t("app-assembly-export-queue-status.export-queue-status.title.9052913c895d")} aria-label={t("app-assembly-export-queue-status.export-queue-status.aria-label.9052913c895d")} onClick={() => task.status === "queued" || task.status === "running" ? exportQueue.cancel(task.id) : exportQueue.dismiss(task.id)}><X /></Button>
    </div>)}
  </aside>;
}