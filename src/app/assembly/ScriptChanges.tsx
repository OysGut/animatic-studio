/**
 * «Manuset er endret etter materialet» (M6 del 1, DEC-0054, REQ-0026/0306/0311/0315). Viser endringene
 * (gammel og ny tekst) for en scene og de tre valgene: godkjenn, oppdater materialet eller angre
 * manusendringen. Ingenting skjer automatisk. Brukes i monteringen, i manuset og i sceneeditoren.
 */
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check, Layers, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  applyCommand,
  discrepancies,
  isSharedIn,
  filmClips,
  newId,
  type Command,
  type Discrepancy,
  type ProjectState,
  type ScriptChange,
} from "@/core";
import { Button } from "@/components/ui/button";

type Run = (command: Command, label: string, group?: string) => string | null;

const KIND_LABEL: Record<ScriptChange["kind"], string> = {
  changed: "Endret",
  added: "Ny",
  removed: "Fjernet",
};
const BLOCK_LABEL: Record<string, string> = {
  action: "Handling",
  character: "Karakter",
  parenthetical: "Parentes",
  dialogue: "Replikk",
  transition: "Overgang",
  shot: "Bilde",
  note: "Notat",
};

/** Avvikene for én scene (samme beregning som i tidslinjen). */
export function useSceneDiscrepancies(state: ProjectState, occurrenceId: string | null) {
  return useMemo(() => {
    if (!occurrenceId) return [];
    const o = state.occurrences[occurrenceId];
    if (!o) return [];
    const clips = filmClips(state, o.productionId).filter((c) => c.occurrenceId === occurrenceId);
    return discrepancies(state, clips);
  }, [state, occurrenceId]);
}

export function ScriptChanges({
  state,
  projectId,
  occurrenceId,
  found,
  editable,
  run,
  showEditorLink = true,
}: {
  state: ProjectState;
  projectId: string;
  occurrenceId: string;
  found: readonly Discrepancy[];
  editable: boolean;
  run: Run;
  /** Lenke til sceneeditoren (ikke når vi allerede er der). */
  showEditorLink?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const o = state.occurrences[occurrenceId];
  if (!o || found.length === 0) return null;
  // Endringene samlet (samme blokk kan være endret for flere materialer)
  const changes = new Map<string, ScriptChange>();
  for (const d of found)
    for (const c of d.changes) if (!changes.has(c.blockId)) changes.set(c.blockId, c);
  const list = [...changes.values()];
  const mats = found.map((d) => d.material);
  const hasComposition = mats.some((m) => m.kind === "composition");

  // 2D-scenen deles med hovedfilmen i en avledet produksjon (DEC-0057): godkjennes bare i hovedfilmen
  const sharedComp = isSharedIn(state, o.productionId, o.variantId);

  function accept() {
    const compositionIds = sharedComp
      ? []
      : mats.filter((m) => m.kind === "composition").map((m) => m.id);
    const takeIds = mats.filter((m) => m.kind === "take").map((m) => m.id);
    if (compositionIds.length + takeIds.length === 0) {
      setError(
        "2D-scenen deles med hovedfilmen. Godkjenn den i hovedfilmen, eller lag egen versjon.",
      );
      return;
    }
    setError(
      run(
        {
          type: "AcceptScriptChanges",
          occurrenceId: occurrenceId as never,
          compositionIds: compositionIds as never,
          takeIds: takeIds as never,
        },
        "Godkjenn manusendringer",
      ),
    );
  }

  /** Commands som setter blokkene tilbake slik materialet ble laget (selektiv angring, REQ-0311). */
  function revertCommands(items: readonly ScriptChange[]): Command[] {
    const out: Command[] = [];
    for (const c of items) {
      const b = state.blocks[c.blockId];
      if (c.kind === "changed" && c.oldText !== null && b && !b.removed)
        out.push({
          type: "EditBlockText",
          productionId: o!.productionId,
          blockId: c.blockId as never,
          text: c.oldText,
        });
      else if (c.kind === "added" && b && !b.removed)
        out.push({
          type: "RemoveBlock",
          productionId: o!.productionId,
          blockId: c.blockId as never,
        });
      else if (c.kind === "removed" && b && b.removed) {
        out.push({
          type: "RestoreBlock",
          productionId: o!.productionId,
          blockId: c.blockId as never,
        });
        // Var blokken også endret før den ble fjernet, settes teksten tilbake også
        if (c.oldText !== null && c.oldText !== b.text)
          out.push({
            type: "EditBlockText",
            productionId: o!.productionId,
            blockId: c.blockId as never,
            text: c.oldText,
          });
      }
    }
    return out;
  }

  function revert(items: readonly ScriptChange[]) {
    setConfirmUndo(false);
    const cmds = revertCommands(items);
    if (cmds.length === 0) {
      setError("Endringen kan ikke angres herfra (den gamle teksten finnes ikke lenger).");
      return;
    }
    // Prøv alt på en kopi først, så en angring ikke blir halvveis (f.eks. delt scene i en spinoff)
    let probe = state;
    for (const c of cmds) {
      const r = applyCommand(probe, {
        id: newId<"command">(),
        actor: "00000000-0000-7000-8000-000000000000" as never,
        at: new Date().toISOString(),
        command: c,
      });
      if (!r.ok) {
        setError(`Manusendringen kan ikke angres herfra: ${r.error.message}`);
        return;
      }
      probe = r.state;
    }
    const group = newId();
    for (const c of cmds) {
      const err = run(c, items.length === 1 ? "Angre manusendring" : "Angre manusendringer", group);
      if (err) {
        setError(err);
        return;
      }
    }
    setError(null);
  }

  const reversible = revertCommands(list).length;

  return (
    <section
      aria-label="Manuset er endret etter materialet"
      className="flex flex-col gap-2 border border-status-danger/40 bg-status-danger-bg p-3"
    >
      <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
        <AlertTriangle className="size-4 text-status-danger" aria-hidden />
        Manuset er endret etter materialet
      </h3>
      <p className="text-xs text-text-secondary">
        Gjelder: {mats.map((m) => `${m.label}${m.inUse ? " (i bruk)" : ""}`).join(", ")}. Velg selv
        hva som skal skje – ingenting endres automatisk.
      </p>
      <ul className="flex max-h-60 flex-col gap-1.5 overflow-y-auto">
        {list.map((c) => (
          <li key={c.blockId} className="rounded-sm bg-surface-1 px-2 py-1.5 text-xs">
            <div className="flex items-center gap-1.5">
              <span
                className={
                  "rounded-sm px-1 text-[10px] font-medium " +
                  (c.kind === "removed"
                    ? "bg-status-danger-bg text-status-danger"
                    : c.kind === "added"
                      ? "bg-status-success-bg text-status-success"
                      : "bg-status-uncertain-bg text-status-uncertain")
                }
              >
                {KIND_LABEL[c.kind]}
              </span>
              <span className="text-text-tertiary">{BLOCK_LABEL[c.blockKind] ?? c.blockKind}</span>
              {editable ? (
                <button
                  type="button"
                  onClick={() => revert([c])}
                  className="ml-auto flex items-center gap-0.5 rounded-sm px-1 text-[11px] text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
                  title="Sett bare denne linjen tilbake slik den var da materialet ble laget"
                >
                  <Undo2 className="size-3" aria-hidden /> Angre denne
                </button>
              ) : null}
            </div>
            {c.oldText !== null ? (
              <p className="mt-0.5 text-text-tertiary line-through decoration-status-danger/60">
                {c.oldText}
              </p>
            ) : null}
            {c.newText !== null ? <p className="mt-0.5 text-text-primary">{c.newText}</p> : null}
          </li>
        ))}
      </ul>
      {editable ? (
        confirmUndo ? (
          <div
            role="alertdialog"
            aria-label="Bekreft angring"
            className="flex flex-col gap-2 rounded-sm border border-border bg-surface-2 p-2"
          >
            <p className="text-xs text-text-primary">
              Sette {reversible === 1 ? "linjen" : `${reversible} linjer`} i manuset tilbake slik de
              var da materialet ble laget? Det kan angres.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={() => revert(list)}>
                <Undo2 />
                Ja, angre manusendringene
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmUndo(false)}>
                Avbryt
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={accept}
              title="Materialet passer fortsatt: godkjenn manuset slik det er nå"
            >
              <Check />
              Godkjenn
            </Button>
            {hasComposition && showEditorLink ? (
              <Button size="sm" variant="secondary" asChild>
                <Link
                  to="/prosjekt/$projectId/scene"
                  params={{ projectId }}
                  search={{ scene: occurrenceId }}
                  title="Oppdater 2D-scenen i sceneeditoren; godkjenn etterpå"
                >
                  <Layers />
                  Oppdater i sceneeditoren
                </Link>
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              disabled={reversible === 0}
              onClick={() => setConfirmUndo(true)}
              title="Sett manuset tilbake slik det var da materialet ble laget"
            >
              <Undo2 />
              Angre manusendringene
            </Button>
          </div>
        )
      ) : null}
      {mats.some((m) => m.kind === "take") ? (
        <p className="text-[11px] text-text-tertiary">
          Film oppdateres ved å importere en ny versjon («Importer ferdig film …»); den gamle
          beholdes.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-status-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
