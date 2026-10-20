/**
 * DV7: én felles avviksvisning for alle manusflater (sceneeditorens manus, manusutforskeren og dialogeditoren).
 * Statusen beregnes i kjernen (lineDrift); rødt flagg lagres aldri.
 */
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { L, DRIFT_LABEL, driftDiff, lineDrift, newId, scriptLanguageOf, type Command, type ProjectState } from "@/core";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { t } from "@/core/i18n/keyed";

export function DriftDiffView({ state, occurrenceId, blockId }: { state: ProjectState; occurrenceId: string; blockId: string }) {
  const d = lineDrift(state, occurrenceId, blockId);
  const parts = driftDiff(state, d, scriptLanguageOf(state, blockId));
  if (!parts) return <p className="text-xs text-text-tertiary">{t("app-dialogue-drift-badge.drift-diff-view.p.d44a5b18ae23")}</p>;
  const removed = parts.filter(p => p.kind === "removed" && p.text.trim());
  return <div data-testid="drift-diff" className="flex flex-col gap-1 text-xs">
    <p className="whitespace-pre-wrap break-words text-text-primary">{parts.filter(p => p.kind !== "removed").map((p, i) => p.kind === "added" ? <mark key={i} data-diff="added" className="rounded-sm bg-status-danger-bg text-status-danger">{p.text}</mark> : <span key={i}>{p.text}</span>)}</p>
    {removed.length ? <p data-testid="drift-removed" className="break-words text-text-secondary">{t("app-dialogue-drift-badge.drift-diff-view.p.cc20a2ce0e31")} {removed.map((p, i) => <del key={i} data-diff="removed" className="mr-1 text-status-danger">{p.text.trim()}</del>)}</p> : null}
  </div>;
}

export function DriftBadge({ state, projectId, occurrenceId, blockId, run, editable, onGo }: {
  state: ProjectState; projectId: string; occurrenceId: string; blockId: string;
  run?: ((command: Command, label: string) => string | null) | undefined;
  editable: boolean;
  /** I sceneeditoren: flytt avspillingshodet uten å navigere. Ellers lenkes det til scenen. */
  onGo?: (() => void) | undefined;
}) {
  const d = lineDrift(state, occurrenceId, blockId);
  if (d.status === "none" || d.status === "ok") return null;
  const Icon = d.status === "drift" ? AlertTriangle : d.status === "reviewed" ? CheckCircle2 : HelpCircle;
  const tone = d.status === "drift" ? "text-status-danger" : d.status === "reviewed" ? "text-text-tertiary" : "text-status-uncertain";
  const label = DRIFT_LABEL(d.status);
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" data-testid="drift-badge" data-drift-status={d.status} data-block-id={blockId} aria-label={label} title={label} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} className={"inline-flex size-5 items-center justify-center rounded-sm align-middle hover:bg-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-brand " + tone}>
        <Icon className="size-3.5" aria-hidden />
      </button>
    </PopoverTrigger>
    <PopoverContent data-testid="drift-popover" className="w-80 font-sans" onClick={e => e.stopPropagation()}>
      <p role="status" className={"mb-2 text-xs font-medium " + tone}>{label}</p>
      {d.audioRevision !== null ? <p className="mb-2 text-[11px] text-text-tertiary">{t("app-dialogue-drift-badge.drift-badge.p.74e451770e4c", { audioRevision: String(d.audioRevision), currentRevision: String(d.currentRevision) })}</p> : null}
      {d.status !== "reviewed" ? <DriftDiffView state={state} occurrenceId={occurrenceId} blockId={blockId} /> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {onGo ? <Button size="sm" variant="secondary" data-testid="drift-go" onClick={onGo}>{t("app-dialogue-drift-badge.drift-badge.button.ee059ae96fa9")}</Button>
          : <Button asChild size="sm" variant="secondary"><Link data-testid="drift-go" to="/prosjekt/$projectId/scene" params={{ projectId }} search={{ scene: occurrenceId, line: blockId }}>{t("app-dialogue-drift-badge.drift-badge.link.8405fd7f7571")}</Link></Button>}
        {editable && run && d.clipId && (d.status === "drift" || d.status === "unknown") ? <Button size="sm" data-testid="drift-review" onClick={() => { run({ type: "ReviewDialogueDrift", reviewId: newId<"command">(), clipId: d.clipId! }, t("app-dialogue-drift-badge.drift-badge.run.fc76bdd38a50")); }}>{t("app-dialogue-drift-badge.drift-badge.button.6c649dd082db")}</Button> : null}
      </div>
    </PopoverContent>
  </Popover>;
}
