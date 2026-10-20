import { useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { L } from "@/core";
import { Button } from "@/components/ui/button";
import { exportQueue, type ExportTask } from "./export-queue";
const empty: readonly ExportTask[] = [];
export function ExportQueueStatus() {
  const tasks = useSyncExternalStore(exportQueue.subscribe, exportQueue.snapshot, () => empty);
  if (!tasks.length) return null;
  return <aside data-testid="export-queue" aria-label={L("Eksportkø", "Export queue")} className="fixed bottom-3 right-3 z-40 flex max-h-64 w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-2 overflow-y-auto border border-border bg-surface-2 p-3 text-xs text-text-primary">
    {tasks.map(task => <div key={task.id} data-testid="export-queue-task" data-status={task.status} className="flex items-start gap-2">
      <div className="min-w-0 flex-1"><p className="truncate">{task.name}</p>
        <p role="status">{task.status === "queued" ? L("I kø", "Queued") : task.status === "running" ? L(`Eksporterer ${task.done} av ${task.total}`, `Exporting ${task.done} of ${task.total}`) : task.status === "done" ? L("Ferdig", "Done") : task.status === "cancelled" ? L("Avbrutt", "Cancelled") : L("Feilet", "Failed")}</p>
        {task.status === "running" ? <progress className="w-full" value={task.done} max={task.total} /> : null}
        {task.profile ? <p>{L(`Laget med profil ${task.profile.name}`, `Made with profile ${task.profile.name}`)}</p> : null}
        {task.error ? <p role="alert" className="text-status-danger">{task.error}</p> : null}
      </div>
      <Button size="icon" variant="ghost" data-testid="export-queue-cancel" title={L("Avbryt / fjern eksport", "Cancel / dismiss export")} aria-label={L("Avbryt / fjern eksport", "Cancel / dismiss export")} onClick={() => task.status === "queued" || task.status === "running" ? exportQueue.cancel(task.id) : exportQueue.dismiss(task.id)}><X /></Button>
    </div>)}
  </aside>;
}