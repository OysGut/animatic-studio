/**
 * Alvorlige handlinger i prosjektlisten (DEC-0046): slett prosjekt (eier), forlat prosjekt (invitert), og
 * slett ressursene i et slettet prosjekt for godt (egen operasjon). Alle sier tydelig at handlingen ikke
 * kan angres. Sletting krever at prosjektnavnet skrives inn.
 */
import { AlertTriangle, Loader2, LogOut, Trash2 } from "lucide-react";
import { L, tm } from "@/core";
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
        {L("Skriv prosjektnavnet", "Type the project name")}{" "}
        <span className="font-medium text-text-primary">{name}</span>{" "}
        {L("for å bekrefte", "to confirm")}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        aria-label={L("Prosjektnavnet", "Project name")}
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
        L(
          `«${target.name}» er slettet. Ressursene ligger under «Ressurser fra slettede prosjekter».`,
          `“${target.name}” has been deleted. The assets are under “Assets from deleted projects”.`,
        ) +
          (r.leftoverFiles > 0
            ? L(
                ` ${r.leftoverFiles} filer i lagringen kunne ikke slettes og blir liggende (de kan ikke nås fra appen).`,
                ` ${r.leftoverFiles} files in storage could not be deleted and will remain (they cannot be reached from the app).`,
              )
            : ""),
      );
    } catch (e) {
      setError(
        (e as Error).message || L("Prosjektet ble ikke slettet.", "The project was not deleted."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-[560px] overflow-y-auto border-status-danger/40 bg-surface-2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-status-danger">
            <Trash2 className="size-5" aria-hidden />{" "}
            {L(`Slett prosjektet «${target.name}»`, `Delete the project “${target.name}”`)}
          </DialogTitle>
          <DialogDescription>
            {L("Dette kan ikke angres.", "This cannot be undone.")}
          </DialogDescription>
        </DialogHeader>
        <Warning>
          <p className="font-medium">{L("Dette slettes for godt:", "This is deleted for good:")}</p>
          <ul className="list-disc pl-4 text-text-secondary">
            <li>
              {L(
                "manuset med alle versjoner, scener, notater og historikk",
                "the script with all versions, scenes, notes and history",
              )}
            </li>
            <li>{L("importerte manusfiler", "imported script files")}</li>
            <li>
              {L(
                "2D-scener, kamera og lydklipp i scenene",
                "2D scenes, camera and audio clips in the scenes",
              )}
            </li>
            <li>{L("importert ferdig film", "imported finished film")}</li>
          </ul>
          {target.others > 0 ? (
            <p>
              {target.others === 1
                ? L(
                    "Én annen person mister tilgangen til prosjektet med én gang.",
                    "One other person loses access to the project immediately.",
                  )
                : L(
                    `${target.others} andre personer mister tilgangen til prosjektet med én gang.`,
                    `${target.others} other people lose access to the project immediately.`,
                  )}
            </p>
          ) : null}
          <p className="text-text-secondary">
            {L("Ressursene (bilder og lyd) slettes", "The assets (images and sound) are")}{" "}
            <span className="font-medium text-text-primary">{L("ikke", "not")}</span>{" "}
            {L(
              "nå. De blir liggende hos deg under «Ressurser fra slettede prosjekter», der du kan laste dem ned eller slette dem for godt senere.",
              "deleted now. They stay with you under “Assets from deleted projects”, where you can download them or delete them for good later.",
            )}
          </p>
        </Warning>
        <div className="rounded-sm border border-border bg-surface-1 p-3">
          <p className="mb-2 text-xs text-text-secondary">
            {L(
              "Vil du ta vare på noe først? Last ned ressursene og den importerte filmen som zip:",
              "Want to keep anything first? Download the assets and the imported film as a zip:",
            )}
          </p>
          {zipState.data ? (
            <AssetZipPanel state={zipState.data} projectName={target.name} compact />
          ) : zipState.isError ? (
            <p className="text-xs text-status-danger">
              {L("Ressursene kunne ikke hentes.", "The assets could not be loaded.")}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-xs text-text-tertiary">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />{" "}
              {L("Henter ressursene …", "Loading the assets …")}
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
            {L("Avbryt", "Cancel")}
          </Button>
          <Button variant="destructive" disabled={!ok || busy} onClick={() => void run()}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {L("Slett prosjektet for godt", "Delete the project for good")}
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
          ? L(
              "Databasen er ikke oppdatert ennå (migrasjon 0011).",
              "The database is not updated yet (migration 0011).",
            )
          : e.message,
      );
      return;
    }
    onDone(L(`Du har forlatt «${target.name}».`, `You have left “${target.name}”.`));
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-[480px] border-status-danger/40 bg-surface-2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="size-5 text-status-danger" aria-hidden />{" "}
            {L(`Forlat «${target.name}»`, `Leave “${target.name}”`)}
          </DialogTitle>
          <DialogDescription>
            {L("Dette kan ikke angres.", "This cannot be undone.")}
          </DialogDescription>
        </DialogHeader>
        <Warning>
          <p>
            {L(
              "Du mister tilgangen til prosjektet med én gang. Du kan ikke få den tilbake selv – en eier må invitere deg på nytt.",
              "You lose access to the project immediately. You cannot get it back yourself – an owner must invite you again.",
            )}
          </p>
          <p className="text-text-secondary">
            {L(
              "Prosjektet og det du har laget i det, blir værende.",
              "The project and what you have made in it will remain.",
            )}
          </p>
        </Warning>
        {error ? (
          <p role="alert" className="text-xs text-status-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {L("Avbryt", "Cancel")}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void run()}>
            {busy ? <Loader2 className="animate-spin" /> : <LogOut />}
            {L("Forlat prosjektet", "Leave the project")}
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
        L(
          `Ressursene fra «${target.name}» er slettet for godt.`,
          `The assets from “${target.name}” have been deleted for good.`,
        ),
      );
    } catch (e) {
      setError(
        (e as Error).message || L("Ressursene ble ikke slettet.", "The assets were not deleted."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-[500px] border-status-danger/40 bg-surface-2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-status-danger">
            <Trash2 className="size-5" aria-hidden />{" "}
            {L(`Slett ressursene fra «${target.name}»`, `Delete the assets from “${target.name}”`)}
          </DialogTitle>
          <DialogDescription>
            {L("Dette kan ikke angres.", "This cannot be undone.")}
          </DialogDescription>
        </DialogHeader>
        <Warning>
          <p>
            {L(
              "Alle bilder og lydfiler fra prosjektet slettes for godt, med alle versjoner og loggen over AI-genereringer. Prosjektet forsvinner helt fra lista.",
              "All images and sound files from the project are deleted for good, with all versions and the log of AI generations. The project disappears from the list entirely.",
            )}
          </p>
          <p className="text-text-secondary">
            {L(
              "Last dem ned som zip først hvis du vil ta vare på dem.",
              "Download them as a zip first if you want to keep them.",
            )}
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
            {L("Avbryt", "Cancel")}
          </Button>
          <Button variant="destructive" disabled={!ok || busy} onClick={() => void run()}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {L("Slett ressursene for godt", "Delete the assets for good")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
