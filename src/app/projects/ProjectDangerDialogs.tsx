/**
 * Alvorlige handlinger i prosjektlisten (DEC-0046): slett prosjekt (eier), forlat prosjekt (invitert), og
 * slett ressursene i et slettet prosjekt for godt (egen operasjon). Alle sier tydelig at handlingen ikke
 * kan angres. Sletting krever at prosjektnavnet skrives inn.
 */
import { AlertTriangle, Loader2, LogOut, Trash2 } from "lucide-react";
import { tm } from "@/core";
import { useEffect, useState } from "react";
import { leaveProject } from "@/adapters/browser/projects";
import {
  deleteProject,
  nameMatches,
  purgeProjectAssets,
} from "@/adapters/storage/project-admin.functions";
import { AssetZipPanel, useZipState } from "@/app/library/AssetZip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/core/i18n/keyed";

export interface ProjectTarget {
  readonly id: string;
  readonly name: string;
  /** Andre aktive medlemmer (mister tilgangen ved sletting). */
  readonly others: number;
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-sm border border-status-danger/50 bg-status-danger-bg p-2.5 text-xs text-text-primary">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-danger" aria-hidden />
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function ConfirmName({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-secondary">
      <span>
        {t("app-projects-project-danger-dialogs.confirm-name.span.f99fe2efcec7")}{" "}
        <span className="font-medium text-text-primary">{name}</span>{" "}
        {t("app-projects-project-danger-dialogs.confirm-name.span.19ecec4b39d2")}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        aria-label={t("app-projects-project-danger-dialogs.confirm-name.aria-label.3687c351c49b")}
        className="h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
      />
    </label>
  );
}

export function DeleteProjectDialog({
  target,
  onClose,
  onDone,
}: {
  target: ProjectTarget | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setTyped("");
    setError(null);
  }, [target?.id]);
  const zipState = useZipState(target?.id ?? "", target !== null);
  if (!target) return null;
  const ok = nameMatches(typed, target.name);

  async function run() {
    if (!target || !ok) return;
    setBusy(true);
    setError(null);
    try {
      const r = await deleteProject({ data: { projectId: target.id, confirmName: typed } });
      if (!r.ok) {
        setError(tm(r.message));
        return;
      }
      onDone(
        t("app-projects-project-danger-dialogs.run.on-done.f4a0c5bc7b5d", { name: String(target.name) }) +
          (r.leftoverFiles > 0
            ? t("app-projects-project-danger-dialogs.run.on-done.cc136c86bed6", { leftoverFiles: String(r.leftoverFiles) })
            : ""),
      );
    } catch (e) {
      setError(
        (e as Error).message || t("app-projects-project-danger-dialogs.run.set-error.76738f486184"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent uiId="V-080" className="max-h-[88vh] max-w-[560px] overflow-y-auto border-status-danger/40 bg-surface-2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-status-danger">
            <Trash2 className="size-5" aria-hidden />{" "}
            {t("app-projects-project-danger-dialogs.delete-project-dialog.dialog-title.d97ebb6c50a4", { name: String(target.name) })}
          </DialogTitle>
          <DialogDescription>
            {t("app-projects-project-danger-dialogs.delete-project-dialog.dialog-description.4ebf95c78942")}
          </DialogDescription>
        </DialogHeader>
        <Warning>
          <p className="font-medium">{t("app-projects-project-danger-dialogs.delete-project-dialog.p.0b524d907477")}</p>
          <ul className="list-disc pl-4 text-text-secondary">
            <li>
              {t("app-projects-project-danger-dialogs.delete-project-dialog.li.99180ed7b9ba")}
            </li>
            <li>{t("app-projects-project-danger-dialogs.delete-project-dialog.li.20b3e6b53bed")}</li>
            <li>
              {t("app-projects-project-danger-dialogs.delete-project-dialog.li.50b0831075d2")}
            </li>
            <li>{t("app-projects-project-danger-dialogs.delete-project-dialog.li.c66db6354cf7")}</li>
          </ul>
          {target.others > 0 ? (
            <p>
              {target.others === 1
                ? t("app-projects-project-danger-dialogs.delete-project-dialog.p.173ae6d556fd")
                : t("app-projects-project-danger-dialogs.delete-project-dialog.p.b791022ae6a5", { others: String(target.others) })}
            </p>
          ) : null}
          <p className="text-text-secondary">
            {t("app-projects-project-danger-dialogs.delete-project-dialog.p.5b476a29a137")}{" "}
            <span className="font-medium text-text-primary">{t("app-projects-project-danger-dialogs.delete-project-dialog.span.2c20765e33e3")}</span>{" "}
            {t("app-projects-project-danger-dialogs.delete-project-dialog.p.5a7689500b01")}
          </p>
        </Warning>
        <div className="rounded-sm border border-border bg-surface-1 p-3">
          <p className="mb-2 text-xs text-text-secondary">
            {t("app-projects-project-danger-dialogs.delete-project-dialog.p.826310fe94d3")}
          </p>
          {zipState.data ? (
            <AssetZipPanel state={zipState.data} projectName={target.name} compact />
          ) : zipState.isError ? (
            <p className="text-xs text-status-danger">
              {t("app-projects-project-danger-dialogs.delete-project-dialog.p.83b62c631193")}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-xs text-text-tertiary">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />{" "}
              {t("app-projects-project-danger-dialogs.delete-project-dialog.p.9fb9da1fd4b8")}
            </p>
          )}
        </div>
        <ConfirmName name={target.name} value={typed} onChange={setTyped} disabled={busy} />
        {error ? (
          <p role="alert" className="text-xs text-status-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("app-projects-project-danger-dialogs.delete-project-dialog.button.e5b658a16060")}
          </Button>
          <Button variant="destructive" disabled={!ok || busy} onClick={() => void run()}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {t("app-projects-project-danger-dialogs.delete-project-dialog.button.bc0a7e281b1b")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LeaveProjectDialog({
  target,
  onClose,
  onDone,
}: {
  target: ProjectTarget | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [target?.id]);
  if (!target) return null;

  async function run() {
    if (!target) return;
    setBusy(true);
    setError(null);
    const e = await leaveProject(target.id);
    setBusy(false);
    if (e) {
      setError(
        /function .* does not exist|schema cache/i.test(e.message)
          ? t("app-projects-project-danger-dialogs.run.set-error.4e0cdb68fb60")
          : e.message,
      );
      return;
    }
    onDone(t("app-projects-project-danger-dialogs.run.on-done.b0b8212fc926", { name: String(target.name) }));
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent uiId="V-079" className="max-w-[480px] border-status-danger/40 bg-surface-2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="size-5 text-status-danger" aria-hidden />{" "}
            {t("app-projects-project-danger-dialogs.leave-project-dialog.dialog-title.f22dbe568576", { name: String(target.name) })}
          </DialogTitle>
          <DialogDescription>
            {t("app-projects-project-danger-dialogs.leave-project-dialog.dialog-description.63a27e749aee")}
          </DialogDescription>
        </DialogHeader>
        <Warning>
          <p>
            {t("app-projects-project-danger-dialogs.leave-project-dialog.p.56afd0369427")}
          </p>
          <p className="text-text-secondary">
            {t("app-projects-project-danger-dialogs.leave-project-dialog.p.4c1a45a9fdcc")}
          </p>
        </Warning>
        {error ? (
          <p role="alert" className="text-xs text-status-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("app-projects-project-danger-dialogs.leave-project-dialog.button.837d45676258")}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void run()}>
            {busy ? <Loader2 className="animate-spin" /> : <LogOut />}
            {t("app-projects-project-danger-dialogs.leave-project-dialog.button.f6f664cc605f")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PurgeAssetsDialog({
  target,
  onClose,
  onDone,
}: {
  target: ProjectTarget | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setTyped("");
    setError(null);
  }, [target?.id]);
  if (!target) return null;
  const ok = nameMatches(typed, target.name);

  async function run() {
    if (!target || !ok) return;
    setBusy(true);
    setError(null);
    try {
      const r = await purgeProjectAssets({ data: { projectId: target.id, confirmName: typed } });
      if (!r.ok) {
        setError(tm(r.message));
        return;
      }
      onDone(
        t("app-projects-project-danger-dialogs.run.on-done.100e1e3fb25a", { name: String(target.name) }),
      );
    } catch (e) {
      setError(
        (e as Error).message || t("app-projects-project-danger-dialogs.run.set-error.c4fa650c29f1"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent uiId="V-078" className="max-w-[500px] border-status-danger/40 bg-surface-2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-status-danger">
            <Trash2 className="size-5" aria-hidden />{" "}
            {t("app-projects-project-danger-dialogs.purge-assets-dialog.dialog-title.c0b866755c65", { name: String(target.name) })}
          </DialogTitle>
          <DialogDescription>
            {t("app-projects-project-danger-dialogs.purge-assets-dialog.dialog-description.0c492303fda6")}
          </DialogDescription>
        </DialogHeader>
        <Warning>
          <p>
            {t("app-projects-project-danger-dialogs.purge-assets-dialog.p.48090bc28a0e")}
          </p>
          <p className="text-text-secondary">
            {t("app-projects-project-danger-dialogs.purge-assets-dialog.p.33bb677fe3d1")}
          </p>
        </Warning>
        <ConfirmName name={target.name} value={typed} onChange={setTyped} disabled={busy} />
        {error ? (
          <p role="alert" className="text-xs text-status-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("app-projects-project-danger-dialogs.purge-assets-dialog.button.a7c4bf25a6cb")}
          </Button>
          <Button variant="destructive" disabled={!ok || busy} onClick={() => void run()}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {t("app-projects-project-danger-dialogs.purge-assets-dialog.button.e4e5e0f6d476")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
