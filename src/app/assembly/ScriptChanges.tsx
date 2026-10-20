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
  scriptRevertCommands,
  L,
  localized,
  type Command,
  type Discrepancy,
  type ProjectState,
  type ScriptChange,
} from "@/core";
import { Button } from "@/components/ui/button";
import { AiUpdateSection } from "./AiUpdateSection";
import { MaterialUpdateSection } from "./MaterialUpdateSection";

type Run = (command: Command, label: string, group?: string) => string | null;

const KIND_LABEL: Record<ScriptChange["kind"], string> = localized({
  changed: ["Endret", "Changed"],
  added: ["Ny", "New"],
  removed: ["Fjernet", "Removed"],
});
const BLOCK_LABEL: Record<string, string> = localized({
  action: ["Handling", "Action"],
  character: ["Karakter", "Character"],
  parenthetical: ["Parentes", "Parenthetical"],
  dialogue: ["Replikk", "Dialogue"],
  transition: ["Overgang", "Transition"],
  shot: ["Bilde", "Shot"],
  note: ["Notat", "Note"],
});

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
  // AI-videoer som avviker: kan oppdateres med AI (valg B, DEC-0070)
  const aiTakeIds = mats
    .filter((m) => m.kind === "take" && state.takes[m.id]?.kind === "ai_video")
    .map((m) => m.id);

  // 2D-scenen deles med hovedfilmen i en avledet produksjon (DEC-0057): godkjennes bare i hovedfilmen
  const sharedComp = isSharedIn(state, o.productionId, o.variantId);

  function accept() {
    const compositionIds = sharedComp
      ? []
      : mats.filter((m) => m.kind === "composition").map((m) => m.id);
    const takeIds = mats.filter((m) => m.kind === "take").map((m) => m.id);
    if (compositionIds.length + takeIds.length === 0) {
      setError(
        L(
          "2D-scenen deles med hovedfilmen. Godkjenn den i hovedfilmen, eller lag egen versjon.",
          "The 2D scene is shared with the main film. Approve it in the main film, or make your own version.",
        ),
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
        L("Godkjenn manusendringer", "Approve script changes"),
      ),
    );
  }

  /** Commands som setter blokkene tilbake slik materialet ble laget (selektiv angring, REQ-0311). */
  const revertCommands = (items: readonly ScriptChange[]): Command[] =>
    o ? scriptRevertCommands(state, o.productionId, items) : [];

  function revert(items: readonly ScriptChange[]) {
    setConfirmUndo(false);
    const cmds = revertCommands(items);
    if (cmds.length === 0) {
      setError(
        L(
          "Endringen kan ikke angres herfra (den gamle teksten finnes ikke lenger).",
          "The change cannot be undone from here (the old text no longer exists).",
        ),
      );
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
        setError(
          L(
            `Manusendringen kan ikke angres herfra: ${r.error.message}`,
            `The script change cannot be undone from here: ${r.error.message}`,
          ),
        );
        return;
      }
      probe = r.state;
    }
    const group = newId();
    for (const c of cmds) {
      const err = run(
        c,
        items.length === 1
          ? L("Angre manusendring", "Undo script change")
          : L("Angre manusendringer", "Undo script changes"),
        group,
      );
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
      aria-label={L(
        "Manuset er endret etter materialet",
        "The script has changed since the material was made",
      )}
      className="flex flex-col gap-2 border border-status-danger/40 bg-status-danger-bg p-3"
    >
      <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
        <AlertTriangle className="size-4 text-status-danger" aria-hidden />
        {L(
          "Manuset er endret etter materialet",
          "The script has changed since the material was made",
        )}
      </h3>
      <p className="text-xs text-text-secondary">
        {L("Gjelder:", "Applies to:")}{" "}
        {mats.map((m) => `${m.label}${m.inUse ? L(" (i bruk)", " (in use)") : ""}`).join(", ")}.{" "}
        {L(
          "Velg selv hva som skal skje – ingenting endres automatisk.",
          "Choose what should happen – nothing changes automatically.",
        )}
      </p>
      <ul className="flex max-h-60 flex-col gap-1.5 overflow-y-auto">
        {list.map((c) => (
          <li key={c.blockId} className="rounded-sm bg-surface-1 px-2 py-1.5 text-xs">
            <div className="flex items-center gap-1.5">
              <span
                className={
                  "rounded-sm px-1 text-[11px] font-medium " +
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
                  title={L(
                    "Sett bare denne linjen tilbake slik den var da materialet ble laget",
                    "Set only this line back to how it was when the material was made",
                  )}
                >
                  <Undo2 className="size-3" aria-hidden /> {L("Angre denne", "Undo this")}
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
            aria-label={L("Bekreft angring", "Confirm undo")}
            className="flex flex-col gap-2 rounded-sm border border-border bg-surface-2 p-2"
          >
            <p className="text-xs text-text-primary">
              {L(
                `Sette ${reversible === 1 ? "linjen" : `${reversible} linjer`} i manuset tilbake slik ${reversible === 1 ? "den" : "de"} var da materialet ble laget? Det kan angres.`,
                `Set ${reversible === 1 ? "the line" : `${reversible} lines`} in the script back to how ${reversible === 1 ? "it was" : "they were"} when the material was made? This can be undone.`,
              )}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={() => revert(list)}>
                <Undo2 />
                {L("Ja, angre manusendringene", "Yes, undo the script changes")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmUndo(false)}>
                {L("Avbryt", "Cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={accept}
              title={L(
                "Materialet passer fortsatt: godkjenn manuset slik det er nå",
                "The material still fits: approve the script as it is now",
              )}
            >
              <Check />
              {L("Godkjenn", "Approve")}
            </Button>
            {hasComposition && showEditorLink ? (
              <Button size="sm" variant="secondary" asChild>
                <Link
                  to="/prosjekt/$projectId/scene"
                  params={{ projectId }}
                  search={{ scene: occurrenceId }}
                  title={L(
                    "Oppdater 2D-scenen i sceneeditoren; godkjenn etterpå",
                    "Update the 2D scene in the scene editor; approve afterwards",
                  )}
                >
                  <Layers />
                  {L("Oppdater i sceneeditoren", "Update in the scene editor")}
                </Link>
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              disabled={reversible === 0}
              onClick={() => setConfirmUndo(true)}
              title={L(
                "Sett manuset tilbake slik det var da materialet ble laget",
                "Set the script back to how it was when the material was made",
              )}
            >
              <Undo2 />
              {L("Angre manusendringene", "Undo script changes")}
            </Button>
          </div>
        )
      ) : null}
      {editable && aiTakeIds.length ? (
        <AiUpdateSection
          state={state}
          occurrenceId={occurrenceId}
          changes={list}
          takeIds={aiTakeIds}
        />
      ) : null}
      {editable && hasComposition ? (
        <MaterialUpdateSection state={state} occurrenceId={occurrenceId} changes={list} run={run} />
      ) : null}
      {mats.some((m) => m.kind === "take" && state.takes[m.id]?.kind !== "ai_video") ? (
        <p className="text-[11px] text-text-tertiary">
          {L(
            "Film oppdateres ved å importere en ny versjon («Importer ferdig film …»); den gamle beholdes.",
            "The film is updated by importing a new version («Import finished film …»); the old one is kept.",
          )}
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
