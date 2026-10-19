import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { L } from "@/core";
import { previewAiSourceCleanup, confirmAiSourceCleanup } from "@/adapters/ai/source-cleanup.functions";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

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
      else setMessage(L("Ingen gamle, ubrukte videokilder kan slettes nå.", "No old, unused video sources can be deleted now."));
    } catch (error) { setMessage(error instanceof Error ? error.message : L("Oppryddingen feilet.", "Cleanup failed.")); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!files) return;
    setBusy(true);
    try {
      const result = await confirm({ data: { projectId, paths: files.map((f) => f.path) } });
      setMessage(L(`${result.deleted} videokilder slettet.`, `${result.deleted} video sources deleted.`));
      setFiles(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : L("Oppryddingen feilet.", "Cleanup failed.")); }
    finally { setBusy(false); }
  }
  return <div className="mt-2" data-testid="ai-source-cleanup">
    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void check()}><Trash2 className="size-3.5" aria-hidden />{L("Rydd gamle videokilder …", "Clean up old video sources …")}</Button>
    {message ? <p role="status" className="text-xs text-text-secondary">{message}</p> : null}
    <AlertDialog open={files !== null} onOpenChange={(open) => { if (!open && !busy) setFiles(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{L("Slett gamle videokilder?", "Delete old video sources?")}</AlertDialogTitle>
          <AlertDialogDescription>{L(`${files?.length ?? 0} ubrukte videokilder eldre enn 30 dager slettes for godt. Ferdige filmer og filer som fortsatt brukes, beholdes.`, `${files?.length ?? 0} unused video sources older than 30 days will be permanently deleted. Finished films and files still in use are kept.`)}</AlertDialogDescription></AlertDialogHeader>
        <ul className="max-h-48 overflow-y-auto text-xs text-text-secondary">{files?.map((f) => <li key={f.path}>{f.path.split("/").at(-1)}</li>)}</ul>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>{L("Avbryt", "Cancel")}</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void remove(); }}>{L("Slett for godt", "Delete permanently")}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}