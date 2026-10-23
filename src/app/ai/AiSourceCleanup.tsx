import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";

import { previewAiSourceCleanup, confirmAiSourceCleanup } from "@/adapters/ai/source-cleanup.functions";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { t } from "@/core/i18n/keyed";

export function AiSourceCleanup({ projectId }: { projectId: string }) {
  const preview = useServerFn(previewAiSourceCleanup);
  const confirm = useServerFn(confirmAiSourceCleanup);
  const [files, setFiles] = useState<{ path: string; bytes: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function check() {
    setBusy(true); setMessage(null);
    try {
      const candidates = await preview({ data: { projectId } });
      if (candidates.length) setFiles(candidates);
      else setMessage(t("app-ai-ai-source-cleanup.check.set-message.c6c21d76901b"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("app-ai-ai-source-cleanup.check.set-message.830fe31eda70")); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!files) return;
    setBusy(true);
    try {
      const result = await confirm({ data: { projectId, paths: files.map((f) => f.path) } });
      setMessage(t("app-ai-ai-source-cleanup.remove.set-message.990678b39c26", { deleted: String(result.deleted) }));
      setFiles(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : t("app-ai-ai-source-cleanup.remove.set-message.674989d04326")); }
    finally { setBusy(false); }
  }
  return <div className="mt-2" data-testid="ai-source-cleanup">
    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void check()}><Trash2 className="size-3.5" aria-hidden />{t("app-ai-ai-source-cleanup.ai-source-cleanup.button.4cfe31fe5977")}</Button>
    {message ? <p role="status" className="text-xs text-text-secondary">{message}</p> : null}
    <AlertDialog open={files !== null} onOpenChange={(open) => { if (!open && !busy) setFiles(null); }}>
      <AlertDialogContent uiId="V-029">
        <AlertDialogHeader><AlertDialogTitle>{t("app-ai-ai-source-cleanup.ai-source-cleanup.alert-dialog-title.be771709a32f")}</AlertDialogTitle>
          <AlertDialogDescription>{t("app-ai-ai-source-cleanup.ai-source-cleanup.alert-dialog-description.56b2b4d2141c", { value1: String(files?.length ?? 0) })}</AlertDialogDescription></AlertDialogHeader>
        <ul className="max-h-48 overflow-y-auto text-xs text-text-secondary">{files?.map((f) => <li key={f.path}>{f.path.split("/").at(-1)}</li>)}</ul>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>{t("app-ai-ai-source-cleanup.ai-source-cleanup.alert-dialog-cancel.4586a298507b")}</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void remove(); }}>{t("app-ai-ai-source-cleanup.ai-source-cleanup.alert-dialog-action.e5e72ed20924")}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}