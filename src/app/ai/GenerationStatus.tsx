/**
 * Status for AI-genereringene i prosjektet, øverst i toppfeltet (DEC-0085, Mars 15.10.2026): «i toppen av
 * menyen … en liten status, som viser hvordan det går med generingen, slik at brukeren kan jobbe videre med
 * andre deler av filmen». Viser hvor mange som lages og står i kø, og hva som nylig ble ferdig eller feilet.
 * Et klikk åpner listen med lenke til scenen. Gjelder alle genereringer (bilder, video, lyd), ikke tekst.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { JOB_STATE_LABEL, formatHeading, jobQualityProfile, jobState, locale, tm, type GenerationJob, type ProjectState } from "@/core";
import { useAiJobs } from "./use-ai-jobs";
import { RefetchVideoButton, canRefetchVideo } from "./RefetchVideoButton";
import { projectStateKey } from "@/app/project/use-project";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { t } from "@/core/i18n/keyed";

/** Hvor lenge en ferdig eller feilet jobb vises som «nylig» (ms). */
const RECENT_MS = 30 * 60 * 1000;

const KIND_LABEL = (k: GenerationJob["kind"]) =>
  k === "video"
    ? t("app-ai-generation-status.kind-label.message.d951bb8fd767")
    : k === "image"
      ? t("app-ai-generation-status.kind-label.message.61079e421e39")
      : k === "sound"
        ? t("app-ai-generation-status.kind-label.message.7b8e15eae019")
        : t("app-ai-generation-status.kind-label.message.3f5b26cf401f");

/** Hva jobben gjelder, kort: scenen (nummer og overskrift) eller ressursen. */
function jobSubject(s: ProjectState | undefined, j: GenerationJob): string {
  if (s && j.occurrenceId) {
    const o = s.occurrences[j.occurrenceId as never];
    const v = o ? s.variants[o.variantId] : undefined;
    if (v)
      return `${o!.productionNumber ? `${o!.productionNumber} ` : ""}${formatHeading(v.heading)}`;
  }
  if (s && j.assetId) return s.assets[j.assetId as never]?.name ?? "";
  return "";
}

export function GenerationStatus({ projectId }: { projectId: string }) {
  const jobs = useAiJobs(projectId);
  // Prosjektet fra hurtigbufferen (samme spørring som sidene; hentes ikke på nytt her)
  const qc = useQueryClient();
  const projectData = qc.getQueryData<ProjectState>(projectStateKey(projectId));
  const [open, setOpen] = useState(false);
  const now = new Date();
  const list = useMemo(
    () => (jobs.data?.jobs ?? []).filter((j) => j.kind !== "prompt"),
    [jobs.data],
  );
  const running = list.filter((j) => jobState(j, now) === "running").length;
  const queued = list.filter((j) => jobState(j, now) === "queued").length;
  const recent = list.filter(
    (j) =>
      (j.status === "done" || j.status === "failed" || j.status === "lost") &&
      now.getTime() - Date.parse(j.finishedAt ?? j.createdAt) < RECENT_MS,
  );
  const failed = recent.filter((j) => j.status !== "done").length;
  const done = recent.length - failed;
  if (!list.length) return null;
  const busy = running + queued > 0;
  const summary = busy
    ? [
        running ? t("app-ai-generation-status.summary.running-l-running-lages-running-in-progress-queued-l-queued-i-k-queued-queued-filter.e4f5fba2fca7", { running: String(running) }) : "",
        queued ? t("app-ai-generation-status.summary.running-l-running-lages-running-in-progress-queued-l-queued-i-k-queued-queued-filter.f8adaa61ecf3", { queued: String(queued) }) : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : failed
      ? t("app-ai-generation-status.summary.message.656f23349e8a", { failed: String(failed) })
      : done
        ? t("app-ai-generation-status.summary.message.a286b0b6765e", { done: String(done) })
        : t("app-ai-generation-status.summary.message.cd840264e782");
  const shown = list.slice(0, 20);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="generation-status"
          className="flex h-7 items-center gap-1.5 rounded-sm border border-border bg-surface-2 px-2 text-xs text-text-secondary hover:bg-surface-3 hover:text-text-primary"
          title={t("app-ai-generation-status.generation-status.title.4ad93883f8ee")}
          aria-label={t("app-ai-generation-status.generation-status.aria-label.ad6a78d7509d", { summary: String(summary) })}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin text-accent-brand" aria-hidden />
          ) : failed ? (
            <TriangleAlert className="size-3.5 text-status-danger" aria-hidden />
          ) : done ? (
            <CheckCircle2 className="size-3.5 text-status-success" aria-hidden />
          ) : (
            <AiGlyph className="size-3.5" aria-hidden />
          )}
          <span>{summary}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="border-b border-border px-3 py-2 text-xs font-medium text-text-primary">
          {t("app-ai-generation-status.generation-status.div.df5170190148")}
        </div>
        <ul className="max-h-[60vh] overflow-y-auto">
          {shown.map((j) => {
            const st = jobState(j, now);
            const subject = jobSubject(projectData, j);
            const params = j.params ?? {};
            const part =
              typeof params["pieces"] === "number" && params["pieces"] > 1
                ? t("app-ai-generation-status.part.shown-map.b693d0ae1f9b", { value1: String(Number(params["piece"] ?? 0) + 1), value2: String(params["pieces"]) })
                : "";
            return (
              <li
                key={j.id}
                className="border-b border-border/60 px-3 py-1.5 text-xs last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-text-tertiary">{KIND_LABEL(j.kind)}</span>
                  <span className="min-w-0 flex-1 truncate text-text-primary">
                    {j.occurrenceId && j.kind === "video" ? (
                      <Link
                        to="/prosjekt/$projectId/scene"
                        params={{ projectId }}
                        search={{ scene: j.occurrenceId }}
                        onClick={() => setOpen(false)}
                        className="hover:underline"
                      >
                        {subject || t("app-ai-generation-status.generation-status.link.6d0aecfbe617")}
                      </Link>
                    ) : (
                      subject || j.model
                    )}
                    <span className="text-text-tertiary">{part}</span>
                  </span>
                  <span
                    className={
                      "shrink-0 " +
                      (st === "done"
                        ? "text-status-success"
                        : st === "running" || st === "queued"
                          ? "text-text-secondary"
                          : "text-status-danger")
                    }
                  >
                    {JOB_STATE_LABEL[st]}
                    {st === "running" && typeof j.progress === "number"
                      ? ` ${Math.round(j.progress * 100)} %`
                      : ""}
                  </span>
                </div>
                <div className="flex gap-2 text-[11px] text-text-tertiary">
                  <span>
                    {new Date(j.createdAt).toLocaleString(locale(), {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="truncate">
                    {j.provider} · {j.model}
                    {jobQualityProfile(j) ? t("app-ai-generation-status.generation-status.span.97306b01e2fb", { name: String(jobQualityProfile(j)?.name) }) : ""}
                  </span>
                </div>
                {j.error && st !== "done" ? (
                  <p className="text-[11px] text-status-danger">{tm(j.error).slice(0, 200)}</p>
                ) : null}
                {canRefetchVideo(j) ? (
                  <div className="mt-1">
                    <RefetchVideoButton projectId={projectId} job={j} size="xs" />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="border-t border-border px-3 py-2 text-[11px] text-text-tertiary">
          {t("app-ai-generation-status.generation-status.p.9a7dec43aba7")}
        </p>
      </PopoverContent>
    </Popover>
  );
}
