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
import { t, tLocalized } from "@/core/i18n/keyed";

type Run = (command: Command, label: string, group?: string) => string | null;

const KIND_LABEL: Record<ScriptChange["kind"], string> = tLocalized({ changed: "app-assembly-script-changes.kind-label.changed.ae3016118a56", added: "app-assembly-script-changes.kind-label.added.31d38e95b60c", removed: "app-assembly-script-changes.kind-label.removed.b27783470548" });
const BLOCK_LABEL: Record<string, string> = tLocalized({ action: "app-assembly-script-changes.block-label.action.ee8e866e26ba", character: "app-assembly-script-changes.block-label.character.0469bdf9cd69", parenthetical: "app-assembly-script-changes.block-label.parenthetical.d522e2896d55", dialogue: "app-assembly-script-changes.block-label.dialogue.42c9ace5fada", transition: "app-assembly-script-changes.block-label.transition.9c6eafc661b2", shot: "app-assembly-script-changes.block-label.shot.2f1d222efcf4", note: "app-assembly-script-changes.block-label.note.8ea9ea73de7c" });

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
        t("app-assembly-script-changes.accept.set-error.20b4e675ea8c"),
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
        t("app-assembly-script-changes.accept.run.19e7a21a6fbc"),
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
        t("app-assembly-script-changes.revert.set-error.54686c2defae"),
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
          t("app-assembly-script-changes.revert.set-error.b7b6c7de1c03", { message: String(r.error.message) }),
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
          ? t("app-assembly-script-changes.err.run.e13f1a16d396")
          : t("app-assembly-script-changes.err.run.a650eeadf3fd"),
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
      aria-label={t("app-assembly-script-changes.script-changes.aria-label.f59d7fa8a8ea")}
      className="flex flex-col gap-2 border border-status-danger/40 bg-status-danger-bg p-3"
    >
      <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
        <AlertTriangle className="size-4 text-status-danger" aria-hidden />
        {t("app-assembly-script-changes.script-changes.h3.f59d7fa8a8ea")}
      </h3>
      <p className="text-xs text-text-secondary">
        {t("app-assembly-script-changes.script-changes.p.7944b2da44d5")}{" "}
        {mats.map((m) => `${m.label}${m.inUse ? t("app-assembly-script-changes.script-changes.mats-map.162242c259fd") : ""}`).join(", ")}.{" "}
        {t("app-assembly-script-changes.script-changes.p.8badd53c669b")}
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
                  title={t("app-assembly-script-changes.script-changes.title.cc920a262c60")}
                >
                  <Undo2 className="size-3" aria-hidden /> {t("app-assembly-script-changes.script-changes.button.5620fee34f5e")}
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
            aria-label={t("app-assembly-script-changes.script-changes.aria-label.934b8ec4ecf3")}
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
                {t("app-assembly-script-changes.script-changes.button.21037f1fa2c8")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmUndo(false)}>
                {t("app-assembly-script-changes.script-changes.button.8f4b9b46eb57")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={accept}
              title={t("app-assembly-script-changes.script-changes.title.62670b210884")}
            >
              <Check />
              {t("app-assembly-script-changes.script-changes.button.fb637a851499")}
            </Button>
            {hasComposition && showEditorLink ? (
              <Button size="sm" variant="secondary" asChild>
                <Link
                  to="/prosjekt/$projectId/scene"
                  params={{ projectId }}
                  search={{ scene: occurrenceId }}
                  title={t("app-assembly-script-changes.script-changes.title.f7139e770dc3")}
                >
                  <Layers />
                  {t("app-assembly-script-changes.script-changes.link.41ed5a0c21bb")}
                </Link>
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              disabled={reversible === 0}
              onClick={() => setConfirmUndo(true)}
              title={t("app-assembly-script-changes.script-changes.title.dce647973f82")}
            >
              <Undo2 />
              {t("app-assembly-script-changes.script-changes.button.43036cac0cc8")}
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
          {t("app-assembly-script-changes.script-changes.p.a52d400b509a")}
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
