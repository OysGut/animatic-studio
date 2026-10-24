import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";

import { previewAiSourceCleanup, confirmAiSourceCleanup } from "@/adapters/ai/source-cleanup.functions";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { formatBytes } from "@/core/prores-export";
import { t } from "@/core/i18n/keyed";

export function AiSourceCleanup({ projectId }: { projectId: string }) {
  const preview = useServerFn(previewAiSourceCleanup);
  const confirm = useServerFn(confirmAiSourceCleanup);
  const [files, setFiles] = useState<{ path: string; bytes: number }[] | null>(null);
  // KI-207: brukeren velger selv hvilke filer som ryddes; alt er valgt fra starten
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function check() {
    setBusy(true); setMessage(null);
    try {
      const candidates = await preview({ data: { projectId } });
      if (candidates.length) {
        setFiles(candidates);
        setSelected(new Set(candidates.map((f) => f.path)));
      }
      else setMessage(t("app-ai-ai-source-cleanup.check.set-message.c6c21d76901b"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("app-ai-ai-source-cleanup.check.set-message.830fe31eda70")); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!files) return;
    const paths = files.filter((f) => selected.has(f.path)).map((f) => f.path);
    if (!paths.length) return;
    setBusy(true);
    try {
      const result = await confirm({ data: { projectId, paths } });
      setMessage(t("app-ai-ai-source-cleanup.remove.set-message.990678b39c26", { deleted: String(result.deleted) }));
      setFiles(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : t("app-ai-ai-source-cleanup.remove.set-message.674989d04326")); }
    finally { setBusy(false); }
  }
  const totalBytes = (files ?? []).filter((f) => selected.has(f.path)).reduce((sum, f) => sum + f.bytes, 0);
  return <div className="mt-2" data-testid="ai-source-cleanup">
    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void check()}><Trash2 className="size-3.5" aria-hidden />{t("app-ai-ai-source-cleanup.ai-source-cleanup.button.4cfe31fe5977")}</Button>
    {message ? <p role="status" className="text-xs text-text-secondary">{message}</p> : null}
    <AlertDialog open={files !== null} onOpenChange={(open) => { if (!open && !busy) setFiles(null); }}>
      <AlertDialogContent uiId="V-029">
        <AlertDialogHeader><AlertDialogTitle>{t("app-ai-ai-source-cleanup.ai-source-cleanup.alert-dialog-title.be771709a32f")}</AlertDialogTitle>
          <AlertDialogDescription>{t("app-ai-ai-source-cleanup.ai-source-cleanup.alert-dialog-description.56b2b4d2141c", { value1: String(files?.length ?? 0) })}</AlertDialogDescription></AlertDialogHeader>
        <ul className="max-h-48 overflow-y-auto text-xs text-text-secondary">{files?.map((f) => {
          const name = f.path.split("/").at(-1) ?? f.path;
          return <li key={f.path} className="flex items-center gap-2 py-0.5">
            <input
              type="checkbox"
              data-testid="ai-cleanup-select"
              data-path={f.path}
              checked={selected.has(f.path)}
              aria-label={t("ai-cleanup.select-file", { name })}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(f.path); else next.delete(f.path);
                setSelected(next);
              }}
            />
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <span className="shrink-0 tabular-nums text-text-tertiary">{formatBytes(f.bytes)}</span>
          </li>;
        })}</ul>
        {files ? <p className="text-xs text-text-secondary" data-testid="ai-cleanup-total">{t("ai-cleanup.total", { size: formatBytes(totalBytes) })}</p> : null}
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>{t("app-ai-ai-source-cleanup.ai-source-cleanup.alert-dialog-cancel.4586a298507b")}</AlertDialogCancel>
          <AlertDialogAction disabled={busy || selected.size === 0} onClick={(event) => { event.preventDefault(); void remove(); }}>{t("app-ai-ai-source-cleanup.ai-source-cleanup.alert-dialog-action.e5e72ed20924")}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
