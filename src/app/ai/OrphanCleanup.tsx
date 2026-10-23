/**
 * R2: «Rydd opp i ubrukte AI-filer» for prosjekteieren. Forhåndsvisning (antall, størrelse og miniatyrer) og
 * eksplisitt bekreftelse før noe slettes. Serveren sjekker alt på nytt ved sletting.
 */
import { useState } from "react";
import { Thumbnail } from "@/app/shared/Thumbnail";
import { useServerFn } from "@tanstack/react-start";
import { Eraser } from "lucide-react";
import { previewOrphanCleanup, confirmOrphanCleanup } from "@/adapters/storage/orphan-cleanup.functions";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { locale } from "@/core";
import { t } from "@/core/i18n/keyed";

type Preview = { files: { path: string; bytes: number; createdAt: string; thumbUrl: string | null }[]; totalBytes: number };

const mb = (b: number) => (b / 1e6).toLocaleString(locale(), { maximumFractionDigits: 1 });

export function OrphanCleanup({ projectId }: { projectId: string }) {
  const preview = useServerFn(previewOrphanCleanup);
  const confirm = useServerFn(confirmOrphanCleanup);
  const [found, setFound] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function check() {
    setBusy(true); setMessage(null);
    try {
      const result = (await preview({ data: { projectId } })) as Preview;
      if (result.files.length) setFound(result);
      else setMessage(t("r2-orphan-cleanup.none"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("r2-orphan-cleanup.error.generic")); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!found) return;
    setBusy(true);
    try {
      const r = (await confirm({ data: { projectId, paths: found.files.map((f) => f.path), confirmed: true } })) as { deleted: number; skipped: number; bytes: number };
      setMessage(t("r2-orphan-cleanup.done", { count: r.deleted, skipped: r.skipped, size: mb(r.bytes) }));
      setFound(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : t("r2-orphan-cleanup.error.generic")); }
    finally { setBusy(false); }
  }
  return <div className="mt-2" data-testid="orphan-cleanup">
    <Button variant="ghost" size="sm" disabled={busy} data-testid="orphan-cleanup-open" onClick={() => void check()}>
      <Eraser className="size-3.5" aria-hidden />{t("r2-orphan-cleanup.open")}
    </Button>
    {message ? <p role="status" data-testid="orphan-cleanup-status" className="text-xs text-text-secondary">{message}</p> : null}
    <AlertDialog open={found !== null} onOpenChange={(open) => { if (!open && !busy) setFound(null); }}>
      <AlertDialogContent data-testid="orphan-cleanup-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("r2-orphan-cleanup.title")}</AlertDialogTitle>
          <AlertDialogDescription data-testid="orphan-cleanup-summary">
            {t("r2-orphan-cleanup.summary", { count: found?.files.length ?? 0, size: mb(found?.totalBytes ?? 0) })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto text-xs text-text-secondary">
          {found?.files.map((f) => <li key={f.path} data-testid="orphan-cleanup-file" className="flex flex-col gap-1">
            {f.thumbUrl
              ? <span className="block aspect-square w-full overflow-hidden rounded-sm border border-border"><Thumbnail src={f.thumbUrl} alt={f.path.split("/").at(-1) ?? ""} loading="lazy" /></span>
              : <div className="flex aspect-square w-full items-center justify-center rounded-sm border border-border bg-surface-3 text-text-tertiary">{(f.path.split(".").at(-1) ?? "").toUpperCase()}</div>}
            <span className="truncate" title={f.path.split("/").at(-1)}>{f.path.split("/").at(-1)}</span>
          </li>)}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} data-testid="orphan-cleanup-cancel">{t("r2-orphan-cleanup.cancel")}</AlertDialogCancel>
          <AlertDialogAction disabled={busy} data-testid="orphan-cleanup-confirm" onClick={(event) => { event.preventDefault(); void remove(); }}>{t("r2-orphan-cleanup.confirm")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
