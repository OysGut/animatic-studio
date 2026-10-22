/**
 * Sammenlign AI-videoer (forsøk og kandidater) for et segment side ved side (mandat 19.7 og 21.5, REQ-0258,
 * REQ-0285, REQ-0318, DEC-0070). Begge kan spilles samtidig. «Velg denne» gjør videoen til den som brukes for
 * segmentet (godkjent) uten å slette de andre; valget kan angres. Beskrivelse, modell og pris vises fra
 * AI-jobben som laget videoen.
 */
import { CheckCircle2, CircleHelp, Pause, Play, TriangleAlert } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { qualityDisclaimer, QUALITY_LABEL, chooseAttemptCommands, filmClips, videoQualityChecks, type QualityCheck, formatUsd, locale, newId, videoAttempts, type GenerationJob, type ProjectState, type Take } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { useImageUrls } from "@/app/library/asset-images";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t as tk } from "@/core/i18n/keyed";
import { CompareVersionsDialog } from "./CompareVersionsDialog";

export function CompareTakesDialog(props: Parameters<typeof CompareAiTakesDialog>[0] & { importedOnly?: boolean }) {
  if (props.importedOnly) return <CompareVersionsDialog open={props.open} onOpenChange={props.onOpenChange} state={props.state}
    projectId={props.state.project.id} productionId={props.productionId} occurrenceId={props.occurrenceId} title={props.title} />;
  return <CompareAiTakesDialog {...props} />;
}

function CompareAiTakesDialog({
  open,
  onOpenChange,
  state,
  occurrenceId,
  segmentId,
  title,
  jobs,
  editable,
  cmds,
  productionId,
}: {
  productionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  occurrenceId: string;
  segmentId: string | null;
  title: string;
  jobs: readonly GenerationJob[];
  editable: boolean;
  cmds: Commands;
}) {
  const clip = useMemo(
    () => filmClips(state, productionId).find((c) => c.occurrenceId === occurrenceId) ?? null,
    [state, productionId, occurrenceId],
  );
  const attempts = useMemo(
    () => videoAttempts(state, occurrenceId, segmentId),
    [state, occurrenceId, segmentId],
  );
  const urls = useImageUrls(open ? attempts.map((t) => t.mediaRef!) : []);
  const [left, setLeft] = useState<string | null>(null);
  const [right, setRight] = useState<string | null>(null);
  const a = attempts.find((t) => t.id === left) ?? attempts[0] ?? null;
  const b = attempts.find((t) => t.id === right) ?? attempts.find((t) => t.id !== a?.id) ?? null;
  const refs = useRef<(HTMLVideoElement | null)[]>([]);
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function playBoth() {
    const vs = refs.current.filter((v): v is HTMLVideoElement => !!v);
    if (playing) {
      vs.forEach((v) => v.pause());
      setPlaying(false);
      return;
    }
    vs.forEach((v) => {
      v.currentTime = 0;
      void v.play().catch(() => undefined);
    });
    setPlaying(true);
  }

  function choose(t: Take) {
    setErr(null);
    const group = newId();
    for (const c of chooseAttemptCommands(state, t.id)) {
      const e = cmds.run(
        c as never,
        tk("app-assembly-compare-takes-dialog.e.cmds-run.5d3ed1c21627"),
        group,
      );
      if (e) {
        setErr(e);
        return;
      }
    }
  }

  const jobFor = (t: Take) => jobs.find((j) => j.resultPath === t.mediaRef);
  const label = (t: Take) =>
    tk("app-assembly-compare-takes-dialog.label.message.1012531e32d6", { value1: String(attempts.length - attempts.indexOf(t)) });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {attempts.length > 1
              ? tk("app-assembly-compare-takes-dialog.compare-takes-dialog.dialog-title.d8f3a66ebb07")
              : tk("app-assembly-compare-takes-dialog.compare-takes-dialog.dialog-title.deeb8f5ce259")}{" "}
            – {title}
          </DialogTitle>
          <DialogDescription>
            {attempts.length} {attempts.length === 1 ? tk("app-assembly-compare-takes-dialog.compare-takes-dialog.dialog-description.93a24aff6e86") : tk("app-assembly-compare-takes-dialog.compare-takes-dialog.dialog-description.a38b23af0f30")}{" "}
            {tk("app-assembly-compare-takes-dialog.compare-takes-dialog.dialog-description.6aefb9d4f1e7")}
          </DialogDescription>
        </DialogHeader>
        {attempts.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            {tk("app-assembly-compare-takes-dialog.compare-takes-dialog.p.84eb6cbd2bf3")}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={playBoth}>
                {playing ? <Pause /> : <Play />}
                {playing
                  ? tk("app-assembly-compare-takes-dialog.compare-takes-dialog.button.bdf702937f90")
                  : tk("app-assembly-compare-takes-dialog.compare-takes-dialog.button.c5fcd510e773")}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(attempts.length > 1 ? [a, b] : [a]).map((t, side) =>
                t ? (
                  <div key={side} className="flex flex-col gap-1.5">
                    <select
                      aria-label={
                        side === 0
                          ? tk("app-assembly-compare-takes-dialog.compare-takes-dialog.aria-label.ccddf4b89d08")
                          : tk("app-assembly-compare-takes-dialog.compare-takes-dialog.aria-label.321fdb8e858c")
                      }
                      value={t.id}
                      onChange={(e) => (side === 0 ? setLeft : setRight)(e.target.value)}
                      className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                    >
                      {attempts.map((x) => (
                        <option key={x.id} value={x.id}>
                          {label(x)}
                          {x.status === "approved" ? tk("app-assembly-compare-takes-dialog.compare-takes-dialog.option.aea8a8e0f589") : ""}
                        </option>
                      ))}
                    </select>
                    <video
                      ref={(el) => {
                        refs.current[side] = el;
                      }}
                      src={urls.data?.[t.mediaRef!]}
                      controls
                      playsInline
                      muted={side === 1}
                      onEnded={() => setPlaying(false)}
                      className="aspect-video w-full bg-media"
                      aria-label={label(t)}
                    />
                    <AttemptInfo take={t} job={jobFor(t)} />
                    {clip ? (
                      <QualityList
                        checks={videoQualityChecks(state, productionId, clip, t, jobFor(t) ?? null)}
                      />
                    ) : null}
                    {editable ? (
                      t.status === "approved" ? (
                        <span className="flex items-center gap-1 text-xs text-status-success">
                          <CheckCircle2 className="size-3.5" aria-hidden />{" "}
                          {tk("app-assembly-compare-takes-dialog.compare-takes-dialog.span.8b060a4a961a")}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="self-start"
                          onClick={() => choose(t)}
                        >
                          {tk("app-assembly-compare-takes-dialog.compare-takes-dialog.button.23c2eacd1ae6")}
                        </Button>
                      )
                    ) : null}
                  </div>
                ) : null,
              )}
            </div>
            <p className="text-[11px] text-text-tertiary">
              {tk("app-assembly-compare-takes-dialog.compare-takes-dialog.p.88c2b3ac2d8a")}
            </p>
          </>
        )}
        {err ? (
          <p role="alert" className="text-xs text-status-danger">
            {err}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AttemptInfo({ take, job }: { take: Take; job: GenerationJob | undefined }) {
  const secs = take.media ? (take.media.durationMs / 1000).toFixed(1) : null;
  return (
    <div className="text-[11px] text-text-tertiary">
      <p>
        {job ? `${job.provider} – ${job.model}` : tk("app-assembly-compare-takes-dialog.attempt-info.p.87a1b2fcbf2b")}
        {secs ? ` · ${secs} s` : ""}
        {take.media?.width ? ` · ${take.media.width}×${take.media.height}` : ""}
        {job?.costUsd ? ` · ~${formatUsd(job.costUsd)}` : ""}
        {job ? ` · ${new Date(job.createdAt).toLocaleString(locale())}` : ""}
      </p>
      {job ? (
        <details>
          <summary className="cursor-pointer">
            {tk("app-assembly-compare-takes-dialog.attempt-info.summary.b33bd5a787fe")}
          </summary>
          <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] text-text-secondary">
            {job.prompt}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

/** Rådgivende sjekkliste (mandat 19.8, REQ-0287/0288). */
function QualityList({ checks }: { checks: readonly QualityCheck[] }) {
  return (
    <div className="rounded-sm border border-border bg-surface-1 p-2 text-[11px]">
      <p className="mb-1 font-medium text-text-secondary">{tk("app-assembly-compare-takes-dialog.quality-list.p.d733cdacdafa")}</p>
      <ul className="flex flex-col gap-0.5" aria-label={tk("app-assembly-compare-takes-dialog.quality-list.aria-label.d733cdacdafa")}>
        {checks.map((c) => (
          <li key={c.criterion} className="flex items-start gap-1.5">
            {c.status === "ok" ? (
              <CheckCircle2 className="mt-px size-3 shrink-0 text-status-success" aria-hidden />
            ) : c.status === "warn" ? (
              <TriangleAlert className="mt-px size-3 shrink-0 text-status-uncertain" aria-hidden />
            ) : (
              <CircleHelp className="mt-px size-3 shrink-0 text-text-tertiary" aria-hidden />
            )}
            <span>
              <span className="text-text-primary">{QUALITY_LABEL[c.criterion]}:</span>{" "}
              <span className="text-text-secondary">{c.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-text-tertiary">{qualityDisclaimer()}</p>
    </div>
  );
}
