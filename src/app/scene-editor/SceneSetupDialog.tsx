/**
 * SB-5: «Opprett sceneoppsett fra storyboard». Brukeren velger panel (ved flere), ser en
 * forhåndsvisning av hva som kopieres (ressurslag, bakgrunn, kameramerke som kamerautgangspunkt)
 * og hva som bevisst utelates (lapper, piler, tekst- og reginotater), og bekrefter. Kommandoene
 * kjøres som én angregruppe. En scene med innhold overskrives aldri: brukeren må velge
 * «nytt utkast», som legger lagene øverst som et nytt lagsett og bevarer alt eksisterende.
 */
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { filmClips, planSceneSetup, storyboardPanelsOf, type ProjectState } from "@/core";
import { t as tk } from "@/core/i18n/keyed";
import { runGroup } from "@/app/storylab/canvas/run-group";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResizableDialogContent } from "@/app/shared/ResizableDialogContent";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  projectId: string;
  productionId: string;
  occurrenceId: string;
  initialPanelId: string | null;
  cmds: Commands;
}

export function SceneSetupDialog({ open, onOpenChange, state, productionId, occurrenceId, initialPanelId, cmds }: Props) {
  const panels = useMemo(() => storyboardPanelsOf(state, occurrenceId), [state, occurrenceId]);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [draft, setDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = panelId && panels.some((p) => p.id === panelId) ? panelId : initialPanelId && panels.some((p) => p.id === initialPanelId) ? initialPanelId : panels[0]?.id ?? null;
  const clips = useMemo(() => filmClips(state, productionId), [state, productionId]);
  const plan = useMemo(
    () => (chosen ? planSceneSetup(state, clips, occurrenceId, chosen, { draft }) : null),
    [state, clips, occurrenceId, chosen, draft],
  );

  const confirm = async () => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    // Planlegg på nytt mot fersk tilstand etter at køen har roet seg (som CanvasTransferDialog)
    await cmds.whenIdle();
    const current = cmds.current() ?? state;
    const fresh = planSceneSetup(current, filmClips(current, productionId), occurrenceId, chosen, { draft });
    if (!fresh.ok) {
      setBusy(false);
      setError(fresh.reason === "has_content" ? tk("sb5.setup-has-content") : tk("sb5.setup-failed"));
      return;
    }
    const e = await runGroup(cmds, fresh.commands, tk("sb5.undo-setup"));
    setBusy(false);
    if (e) setError(e);
    else onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <ResizableDialogContent uiId="V-173" sizeKey="scene-setup" className="max-h-[86vh] max-w-[560px] overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>{tk("sb5.setup-title")}</DialogTitle>
          <DialogDescription>{tk("sb5.setup-description")}</DialogDescription>
        </DialogHeader>
        {panels.length > 1 ? (
          <fieldset className="mt-2">
            <legend className="text-[13px] font-medium text-text-primary">{tk("sb5.setup-choose-panel")}</legend>
            <div className="mt-1 flex flex-col gap-1" data-testid="sb5-panel-choice">
              {panels.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-[13px] text-text-secondary">
                  <input type="radio" name="sb5-panel" checked={chosen === p.id} onChange={() => setPanelId(p.id)} />
                  <span className="font-mono text-[11px] text-text-tertiary">{p.storyboard?.number ?? ""}</span>
                  {p.name || tk("sb5.untitled-panel")}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        {plan?.ok === false && plan.reason === "has_content" ? (
          <div className="mt-3 rounded-sm border border-status-uncertain bg-status-uncertain-bg p-2 text-[13px] text-status-uncertain" data-testid="sb5-has-content">
            <p>{tk("sb5.setup-has-content")}</p>
            <label className="mt-1 flex items-center gap-2">
              <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} data-testid="sb5-draft" />
              {tk("sb5.setup-new-draft")}
            </label>
          </div>
        ) : null}
        {plan?.ok ? (
          <ul className="mt-3 list-inside list-disc text-[13px] text-text-secondary" data-testid="sb5-preview">
            <li>{tk("sb5.setup-preview-copied", { count: String(plan.summary.copied) })}</li>
            {plan.summary.skippedNotes + plan.summary.skippedArrows > 0 ? (
              <li>{tk("sb5.setup-preview-skipped", { notes: String(plan.summary.skippedNotes), arrows: String(plan.summary.skippedArrows) })}</li>
            ) : null}
            {plan.summary.cameraAdded ? <li>{tk("sb5.setup-preview-camera")}</li> : null}
            {plan.mode === "create" ? <li>{tk("sb5.setup-preview-background")}</li> : null}
            {plan.mode === "layers" ? <li>{tk("sb5.setup-preview-layers")}</li> : null}
          </ul>
        ) : null}
        {error ? <p role="alert" className="mt-2 text-[13px] text-status-danger">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>{tk("sb5.setup-cancel")}</Button>
          <Button size="sm" onClick={confirm} disabled={busy || !plan?.ok} data-testid="sb5-setup-confirm">
            {busy ? <Loader2 className="animate-spin" /> : null}
            {tk("sb5.setup-confirm")}
          </Button>
        </div>
      </ResizableDialogContent>
    </Dialog>
  );
}
