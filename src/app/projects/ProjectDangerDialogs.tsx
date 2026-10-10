/**
 * Alvorlige handlinger i prosjektlisten (DEC-0046): slett prosjekt (eier), forlat prosjekt (invitert), og
 * slett ressursene i et slettet prosjekt for godt (egen operasjon). Alle sier tydelig at handlingen ikke
 * kan angres. Sletting krever at prosjektnavnet skrives inn.
 */
import { AlertTriangle, Loader2, LogOut, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { db } from "@/app/db";
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
        Skriv prosjektnavnet <span className="font-medium text-text-primary">{name}</span> for å
        bekrefte
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        aria-label="Prosjektnavnet"
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
        setError(r.message);
        return;
      }
      onDone(
        `«${target.name}» er slettet. Ressursene ligger under «Ressurser fra slettede prosjekter».` +
          (r.leftoverFiles > 0
            ? ` ${r.leftoverFiles} filer i lagringen kunne ikke slettes og blir liggende (de kan ikke nås fra appen).`
            : ""),
      );
    } catch (e) {
      setError((e as Error).message || "Prosjektet ble ikke slettet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-[560px] overflow-y-auto border-status-danger/40 bg-surface-2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-status-danger">
            <Trash2 className="size-5" aria-hidden /> Slett prosjektet «{target.name}»
          </DialogTitle>
          <DialogDescription>Dette kan ikke angres.</DialogDescription>
        </DialogHeader>
        <Warning>
          <p className="font-medium">Dette slettes for godt:</p>
          <ul className="list-disc pl-4 text-text-secondary">
            <li>manuset med alle versjoner, scener, notater og historikk</li>
            <li>importerte manusfiler</li>
            <li>2D-scener, kamera og lydklipp i scenene</li>
            <li>importert ferdig film</li>
          </ul>
          {target.others > 0 ? (
            <p>
              {target.others === 1 ? "Én annen person" : `${target.others} andre personer`} mister
              tilgangen til prosjektet med én gang.
            </p>
          ) : null}
          <p className="text-text-secondary">
            Ressursene (bilder og lyd) slettes{" "}
            <span className="font-medium text-text-primary">ikke</span> nå. De blir liggende hos deg
            under «Ressurser fra slettede prosjekter», der du kan laste dem ned eller slette dem for
            godt senere.
          </p>
        </Warning>
        <div className="rounded-sm border border-border bg-surface-1 p-3">
          <p className="mb-2 text-xs text-text-secondary">
            Vil du ta vare på noe først? Last ned ressursene og den importerte filmen som zip:
          </p>
          {zipState.data ? (
            <AssetZipPanel state={zipState.data} projectName={target.name} compact />
          ) : zipState.isError ? (
            <p className="text-xs text-status-danger">Ressursene kunne ikke hentes.</p>
          ) : (
            <p className="flex items-center gap-2 text-xs text-text-tertiary">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Henter ressursene …
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
            Avbryt
          </Button>
          <Button variant="destructive" disabled={!ok || busy} onClick={() => void run()}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Slett prosjektet for godt
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
    const { error: e } = await db.rpc("leave_project", { p_project: target.id });
    setBusy(false);
    if (e) {
      setError(
        /function .* does not exist|schema cache/i.test(e.message)
          ? "Databasen er ikke oppdatert ennå (migrasjon 0011)."
          : e.message,
      );
      return;
    }
    onDone(`Du har forlatt «${target.name}».`);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-[480px] border-status-danger/40 bg-surface-2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="size-5 text-status-danger" aria-hidden /> Forlat «{target.name}»
          </DialogTitle>
          <DialogDescription>Dette kan ikke angres.</DialogDescription>
        </DialogHeader>
        <Warning>
          <p>
            Du mister tilgangen til prosjektet med én gang. Du kan ikke få den tilbake selv – en
            eier må invitere deg på nytt.
          </p>
          <p className="text-text-secondary">Prosjektet og det du har laget i det, blir værende.</p>
        </Warning>
        {error ? (
          <p role="alert" className="text-xs text-status-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Avbryt
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void run()}>
            {busy ? <Loader2 className="animate-spin" /> : <LogOut />}
            Forlat prosjektet
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
        setError(r.message);
        return;
      }
      onDone(`Ressursene fra «${target.name}» er slettet for godt.`);
    } catch (e) {
      setError((e as Error).message || "Ressursene ble ikke slettet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-[500px] border-status-danger/40 bg-surface-2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-status-danger">
            <Trash2 className="size-5" aria-hidden /> Slett ressursene fra «{target.name}»
          </DialogTitle>
          <DialogDescription>Dette kan ikke angres.</DialogDescription>
        </DialogHeader>
        <Warning>
          <p>
            Alle bilder og lydfiler fra prosjektet slettes for godt, med alle versjoner og loggen
            over AI-genereringer. Prosjektet forsvinner helt fra lista.
          </p>
          <p className="text-text-secondary">
            Last dem ned som zip først hvis du vil ta vare på dem.
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
            Avbryt
          </Button>
          <Button variant="destructive" disabled={!ok || busy} onClick={() => void run()}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Slett ressursene for godt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
