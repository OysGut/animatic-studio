/**
 * AI-budsjett og AI-jobber på prosjektoversikten (DEC-0053):
 * - Budsjett (REQ-0282/0284/0528): eieren setter høyeste antall genereringer per måned og en anslått pris
 *   per bilde. Serveren stopper genereringer når rammen er nådd.
 * - Forbruk (REQ-0283): denne måneden, anslått kostnad (alltid merket som anslag, REQ-0281).
 * - Jobber (REQ-0292/0294/0296/0297/0299/0303): alle genereringer med status, feilmelding, resultat og
 *   «Prøv igjen». Fullførte resultater ligger i biblioteket og blir aldri slettet av en ny generering.
 */
import { ResizableDialogContent } from "@/app/shared/ResizableDialogContent";
import { TraceDetails } from "./TraceDetails";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  ListOrdered,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { useEffect, useMemo, useState } from "react";
import { aiUsage, EFFORT_LABEL, formatCredits, formatUsd, type GenerationJob, JOB_STATE_LABEL, jobEffort, jobProgress, type JobState, jobState, jobQualityProfile, locale, newId, PRIORITY_LABEL, type ProjectState, PROVIDERS, catalogSettings, isProviderEnabled, tm, unclaimedImageJobs, unclaimedVideoJobs, variantsOf, versionIdFromResultPath } from "@/core";
import { useCommands, type Commands } from "@/app/project/use-commands";
import { useActiveProduction } from "@/app/project/use-production";
import { useProfiles } from "@/app/project/use-project";
import { GenerateImagePanel } from "@/app/library/GenerateImagePanel";
import { mediaFromStoredFile } from "@/app/library/asset-images";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { updateQueuedJob } from "@/adapters/ai/queue.functions";
import { aiJobsKey, useAiJobs } from "./use-ai-jobs";
import { RefetchVideoButton, canRefetchVideo } from "./RefetchVideoButton";
import { ProvidersDialog } from "./ProvidersDialog";
import { claimVideo } from "./video-jobs";
import { useProjectProviders } from "./use-project-providers";
import { AiSourceCleanup } from "./AiSourceCleanup";
import { OrphanCleanup } from "./OrphanCleanup";
import { t as tk } from "@/core/i18n/keyed";

/** Leverandørene prosjektet kan bruke, og veien til å koble til flere (DEC-0069). */
function ProviderLine({ projectId, userId }: { projectId: string; userId: string }) {
  const [open, setOpen] = useState(false);
  const p = useProjectProviders(projectId);
  // Leverandører administrator har slått av for alle, vises ikke (DEC-0088)
  const names = (p.data?.providers ?? ["lovable"])
    .filter((id) => isProviderEnabled(catalogSettings(), id))
    .map((id) => PROVIDERS.find((x) => x.id === id)?.name ?? id)
    .join(", ");
  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
      {tk("app-ai-ai-panel.provider-line.p.f0131ba43df8")}{" "}
      <span className="text-text-primary">{names}</span>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        {tk("app-ai-ai-panel.provider-line.button.330d5f2883fc")}
      </Button>
      <ProvidersDialog open={open} onOpenChange={setOpen} userId={userId} />
    </p>
  );
}

const ctl =
  "h-8 w-32 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary disabled:opacity-50";

const STATE_ICON: Record<JobState, typeof Clock> = {
  queued: ListOrdered,
  running: Loader2,
  done: CheckCircle2,
  failed: AlertTriangle,
  lost: AlertTriangle,
  stale: Clock,
};
const STATE_CLASS: Record<JobState, string> = {
  queued: "text-text-secondary",
  running: "text-text-secondary",
  done: "text-status-success",
  failed: "text-status-danger",
  lost: "text-status-danger",
  stale: "text-status-uncertain",
};

export function AiPanel({
  state,
  projectId,
  userId,
  isOwner,
  editable,
}: {
  state: ProjectState;
  projectId: string;
  userId: string;
  isOwner: boolean;
  editable: boolean;
}) {
  const cmds = useCommands(projectId, userId, editable);
  const jobs = useAiJobs(projectId);
  const list = useMemo(() => jobs.data?.jobs ?? [], [jobs.data]);
  const profiles = useProfiles([...new Set(list.map((j) => j.createdBy))]);
  const now = new Date();
  const usage = aiUsage(state.project, list, now, jobs.data?.monthCount ?? undefined);
  const [filter, setFilter] = useState<"all" | "problems">("all");
  const [retry, setRetry] = useState<GenerationJob | null>(null);
  const [showAll, setShowAll] = useState(false);
  /** Bilder som ble laget, men ikke lagt inn i biblioteket (siden ble lukket underveis). */
  // Klokken går: et bilde blir «ikke lagt inn» når fristen er ute, selv om listen ikke endres
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setTick(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const unclaimed = useMemo(
    () => [
      ...unclaimedImageJobs(state, list, new Date(tick)),
      ...unclaimedVideoJobs(state, list, new Date(tick)),
    ],
    [state, list, tick],
  );
  // Videojobber som pågår hos leverandøren følges opp mens oversikten er åpen
  // Oppfølging av jobbene skjer for hele prosjektet (AiJobsWatcher i prosjektets ramme)
  const unclaimedIds = useMemo(() => new Set(unclaimed.map((j) => j.id)), [unclaimed]);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  /** Legg bildet fra en AI-jobb inn som ny versjon (i ressursens første variant, eller en ny). */
  async function claim(jobs: readonly GenerationJob[]) {
    setClaimError(null);
    const errors: string[] = [];
    for (const j of jobs) {
      if (j.kind === "video") {
        // AI-video blir ny versjon av scenen (REQ-0180)
        setClaiming(j.id);
        try {
          const e = await claimVideo(state, cmds, j);
          if (e) errors.push(`Video: ${e}`);
        } catch (e) {
          errors.push(`Video: ${(e as Error).message}`);
        }
        continue;
      }
      const profile = jobQualityProfile(j);
            const asset = j.assetId ? state.assets[j.assetId] : undefined;
      if (!asset || !j.resultPath) continue;
      setClaiming(j.id);
      try {
        const media = await mediaFromStoredFile(j.resultPath);
        // Fersk tilstand: forrige bilde kan ha laget varianten, og noen andre kan ha lagt inn dette
        const now = cmds.current() ?? state;
        const wanted = versionIdFromResultPath(j.resultPath);
        if (
          (wanted && now.assetVersions[wanted]) ||
          Object.values(now.assetVersions).some((v) => v.mediaPath === j.resultPath)
        )
          continue;
        const group = newId();
        // Varianten jobben ble laget for (KI-147), ellers ressursens første
        const remembered =
          typeof j.params?.["variantId"] === "string" ? j.params["variantId"] : null;
        const rv = remembered ? now.assetVariants[remembered] : undefined;
        let variantId =
          rv && rv.assetId === asset.id && !rv.archived
            ? rv.id
            : (variantsOf(now, asset.id).find((v) => !v.archived)?.id ?? null);
        if (!variantId) {
          variantId = newId<"asset_variant">();
          const r = await cmds.runAndWait(
            {
              type: "CreateAssetVariant",
              variantId: variantId as never,
              assetId: asset.id,
              fields: { name: "Animatic", style: "animatic", appearance: "" },
            },
            tk("app-ai-ai-panel.r.cmds-run-and-wait.0217985d73aa", { name: String(asset.name) }),
            group,
          );
          if (r.error) throw new Error(r.error);
        }
        const versionId = wanted ?? newId<"asset_version">();
        const r = await cmds.runAndWait(
          {
            type: "AddAssetVersion",
            versionId: versionId as never,
            variantId: variantId as never,
            media,
            note: tk("app-ai-ai-panel.note.note.744d7cac95d2", { model: String(j.model) }),
          },
          tk("app-ai-ai-panel.r.cmds-run-and-wait.687f2fd9be02", { name: String(asset.name) }),
          group,
        );
        if (r.error) throw new Error(r.error);
      } catch (e) {
        errors.push(`${asset.name}: ${(e as Error).message}`);
      }
    }
    setClaiming(null);
    if (errors.length) setClaimError(errors.join(" · "));
  }

  const shown = list.filter(
    (j) => filter === "all" || jobState(j, now) !== "done" || unclaimedIds.has(j.id),
  );
  const visible = showAll ? shown : shown.slice(0, 20);

  return (
    <section aria-labelledby="ai-title" className="mt-10">
      <h2 id="ai-title" className="mb-2 text-base font-semibold text-text-primary">
        {tk("app-ai-ai-panel.ai-panel.h2.b2157c086bc5")}
      </h2>
      <Budget state={state} cmds={cmds} isOwner={isOwner} />
      <p className="mt-2 text-[13px] text-text-secondary">
        {tk("app-ai-ai-panel.ai-panel.p.1eece335cadc")}{" "}
        <span className="tabular font-medium text-text-primary">{usage.used}</span>{" "}
        {usage.limit !== null ? (
          <>
            {tk("app-ai-ai-panel.ai-panel.p.080d73395c4a")} <span className="tabular">{usage.limit}</span>{" "}
            {tk("app-ai-ai-panel.ai-panel.p.2990ff3912e0")} ({usage.remaining} {tk("app-ai-ai-panel.ai-panel.p.42f093736ea3")})
          </>
        ) : (
          tk("app-ai-ai-panel.ai-panel.p.226910e754c3")
        )}
        {usage.estimatedCost !== null
          ? usage.partlyUnknown ? tk("app-ai-ai-panel.usage-estimate-partly-unknown", { cost: formatCredits(usage.estimatedCost) }) : tk("app-ai-ai-panel.usage-estimate", { cost: formatCredits(usage.estimatedCost) })
          : ""}
        {tk("app-ai-ai-panel.ai-panel.p.4418a73a6199", { value1: String(formatUsd(usage.costUsd ?? 0)) })}
        .
      </p>

      <ProviderLine projectId={projectId} userId={userId} />
      {isOwner ? <AiSourceCleanup projectId={projectId} /> : null}
      {isOwner ? <OrphanCleanup projectId={projectId} /> : null}
      {unclaimed.length ? (
        <div
          role="status"
          className="mt-3 flex flex-wrap items-center gap-2 rounded-sm border border-accent-warm/50 bg-surface-2 px-3 py-2 text-[13px] text-text-primary"
        >
          <AlertTriangle className="size-4 text-status-uncertain" aria-hidden />
          <span className="min-w-0 flex-1">
            {unclaimed.length === 1
              ? tk("app-ai-ai-panel.ai-panel.span.2b76cf4b030c")
              : tk("app-ai-ai-panel.ai-panel.span.0e66e3b81edb", { length: String(unclaimed.length) })}{" "}
            {tk("app-ai-ai-panel.ai-panel.span.9d18584f63ee")}
          </span>
          {editable ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={claiming !== null}
              onClick={() => void claim(unclaimed)}
            >
              {claiming ? <Loader2 className="animate-spin" /> : <Download />}
              {unclaimed.length === 1 ? tk("app-ai-ai-panel.ai-panel.button.c4f50e9742a2") : tk("app-ai-ai-panel.ai-panel.button.e3996d11a49f")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {claimError ? (
        <p role="alert" className="mt-2 text-xs text-status-danger">
          {claimError}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <h3 className="text-[13px] font-medium text-text-primary">{tk("app-ai-ai-panel.ai-panel.h3.d6da1ee56d15")}</h3>
        <div
          role="group"
          aria-label={tk("app-ai-ai-panel.ai-panel.aria-label.e6d7b27d8ef8")}
          className="ml-2 flex items-center gap-0.5"
        >
          {(
            [
              ["all", tk("app-ai-ai-panel.ai-panel.all-l-alle-all-problems-l-ikke-ferdige-not-finished-as-const-map.90fd0f96f77f")],
              ["problems", tk("app-ai-ai-panel.ai-panel.all-l-alle-all-problems-l-ikke-ferdige-not-finished-as-const-map.672049efa92e")],
            ] as const
          ).map(([id, text]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={
                "h-7 rounded-sm px-2 text-xs " +
                (filter === id
                  ? "bg-accent-selection text-text-primary"
                  : "text-text-secondary hover:bg-surface-3")
              }
            >
              {text}
            </button>
          ))}
        </div>
        {jobs.isFetching ? (
          <Loader2 className="size-3.5 animate-spin text-text-tertiary" aria-hidden />
        ) : null}
      </div>
      {jobs.isError ? (
        <p role="alert" className="mt-2 text-xs text-status-danger">
          {tk("app-ai-ai-panel.ai-panel.p.c15bbdac71d9")}{" "}
          {(jobs.error as Error).message}
        </p>
      ) : shown.length === 0 ? (
        <p className="mt-2 text-xs text-text-tertiary">
          {list.length === 0
            ? tk("app-ai-ai-panel.ai-panel.p.0d492a68d97a")
            : tk("app-ai-ai-panel.ai-panel.p.aa7ed8cc5e0f")}
        </p>
      ) : (
        <ul
          className="mt-2 border border-border bg-surface-1"
          aria-label={tk("app-ai-ai-panel.ai-panel.aria-label.5daab1714cc0")}
        >
          {visible.map((j) => {
            const st = jobState(j, now);
            const Icon = STATE_ICON[st];
            const profile = jobQualityProfile(j);
            const asset = j.assetId ? state.assets[j.assetId] : undefined;
            return (
              <li
                key={j.id}
                className="grid grid-cols-[150px_1fr_auto] items-start gap-3 border-b border-border px-4 py-2 text-[13px] last:border-b-0"
              >
                <div className="flex flex-col">
                  <span className={"flex items-center gap-1 font-medium " + STATE_CLASS[st]}>
                    <Icon
                      className={"size-3.5 " + (st === "running" ? "animate-spin" : "")}
                      aria-hidden
                    />
                    {JOB_STATE_LABEL[st]}
                    {profile ? <span data-testid="ai-job-quality-profile">{tk("app-ai-ai-panel.ai-panel.span.037b85777af1", { name: String(profile.name) })}</span> : null}
                  </span>
                  <span className="tabular text-[11px] text-text-tertiary">
                    {new Date(j.createdAt).toLocaleString(locale(), {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="truncate text-[11px] text-text-tertiary">
                    {profiles.data?.[j.createdBy]?.display_name ?? ""}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-text-primary">
                    {j.kind === "video"
                      ? tk("app-ai-ai-panel.ai-panel.p.ab192a3725f8")
                      : j.kind === "prompt"
                        ? tk("app-ai-ai-panel.ai-panel.p.0465d4e1a9b9")
                        : j.kind === "sound"
                          ? tk("app-ai-ai-panel.ai-panel.p.4c0a9e34abd5")
                          : tk("app-ai-ai-panel.ai-panel.p.4359fc475a64")}
                    {asset ? ` ${j.kind === "prompt" ? "for" : tk("app-ai-ai-panel.ai-panel.p.080d73395c4a.2")} «${asset.name}»` : ""}
                    <span className="text-text-tertiary">
                      {" "}
                      · {j.model}
                      {jobEffort(j) ? ` · ${EFFORT_LABEL[jobEffort(j)!]}` : ""}
                      {j.estimatedCost !== null ? ` · ~${formatCredits(j.estimatedCost)}` : ""}
                      {j.costUsd ? ` · ~${formatUsd(j.costUsd)} (${j.provider})` : ""}
                    </span>
                  </p>
                  <details className="text-xs text-text-tertiary">
                    <summary className="cursor-pointer truncate">{j.prompt.split("\n")[0]}</summary>
                    <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-text-secondary">
                      {j.prompt}
                    </pre>
                    {j.resultText ? (
                      <>
                        <p className="mt-1 text-[11px] text-text-tertiary">
                          {tk("app-ai-ai-panel.ai-panel.p.ed03edcfd4fa")}
                        </p>
                        <pre className="whitespace-pre-wrap font-mono text-[11px] text-text-secondary">
                          {j.resultText}
                        </pre>
                      </>
                    ) : null}
                    <TraceDetails job={j} state={state} />
                  </details>
                  {st === "queued" || (st === "running" && j.kind === "video") ? (
                    <JobProgressLine job={j} now={now.getTime()} jobs={list} />
                  ) : null}
                  {(st === "failed" || st === "lost") && j.error ? (
                    <p className="mt-0.5 line-clamp-3 text-xs text-status-danger">{j.error}</p>
                  ) : null}
                  {unclaimedIds.has(j.id) ? (
                    <p className="mt-0.5 text-xs text-status-uncertain">
                      {j.kind === "video"
                        ? tk("app-ai-ai-panel.ai-panel.p.1d8a4db1910a")
                        : tk("app-ai-ai-panel.ai-panel.p.d3adede2ddbf")}
                    </p>
                  ) : null}
                  {st === "stale" ? (
                    <p className="mt-0.5 text-xs text-status-uncertain">
                      {tk("app-ai-ai-panel.ai-panel.p.4c2c4ffce6b0")}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  {editable && st === "queued" ? (
                    <QueueControls projectId={projectId} job={j} />
                  ) : null}
                  {asset ? (
                    <Button size="sm" variant="ghost" asChild>
                      <Link
                        to="/prosjekt/$projectId/bibliotek"
                        params={{ projectId }}
                        search={{ asset: asset.id, ...((j.resultPath ? versionIdFromResultPath(j.resultPath) : null) ? { version: (j.resultPath ? versionIdFromResultPath(j.resultPath) : null)! } : {}) }}
                      >
                        {tk("app-ai-ai-panel.ai-panel.link.4016655f7c25")}
                      </Link>
                    </Button>
                  ) : null}
                  {editable && canRefetchVideo(j) ? (
                    <RefetchVideoButton projectId={projectId} job={j} />
                  ) : null}
                  {editable && unclaimedIds.has(j.id) ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={claiming !== null}
                      onClick={() => void claim([j])}
                    >
                      {claiming === j.id ? <Loader2 className="animate-spin" /> : <Download />}
                      {tk("app-ai-ai-panel.ai-panel.button.c4f50e9742a2.2")}
                    </Button>
                  ) : null}
                  {editable && asset && j.kind === "image" ? (
                    <Button size="sm" variant="secondary" onClick={() => setRetry(j)}>
                      <RotateCcw />
                      {tk("app-ai-ai-panel.ai-panel.button.bdac359e3acb")}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {shown.length > visible.length ? (
        <Button size="sm" variant="ghost" className="mt-1" onClick={() => setShowAll(true)}>
          {tk("app-ai-ai-panel.ai-panel.button.93e7b44b8d04")} ({shown.length})
        </Button>
      ) : null}
      <RetryDialog
        job={retry}
        onClose={() => setRetry(null)}
        state={state}
        projectId={projectId}
        cmds={cmds}
      />
    </section>
  );
}

function Budget({
  state,
  cmds,
  isOwner,
}: {
  state: ProjectState;
  cmds: Commands;
  isOwner: boolean;
}) {
  const p = state.project;
  const [limit, setLimit] = useState(p.aiMonthLimit?.toString() ?? "");
  const [price, setPrice] = useState(p.aiPricePerImage?.toString().replace(".", ",") ?? "");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setLimit(p.aiMonthLimit?.toString() ?? "");
    setPrice(p.aiPricePerImage?.toString().replace(".", ",") ?? "");
  }, [p.aiMonthLimit, p.aiPricePerImage]);
  const parse = (t: string) => (t.trim() === "" ? null : Number(t.trim().replace(",", ".")));
  const lim = parse(limit);
  const raw = parse(price);
  // Prisen lagres med to desimaler; sammenlign det som faktisk lagres
  const pr = raw === null || !Number.isFinite(raw) ? raw : Math.round(raw * 100) / 100;
  const changed = lim !== (p.aiMonthLimit ?? null) || pr !== (p.aiPricePerImage ?? null);

  function save() {
    if (lim !== null && (!Number.isInteger(lim) || lim < 0 || lim > 100000)) {
      setErr(
        tk("app-ai-ai-panel.save.set-err.fa641093c5d4"),
      );
      return;
    }
    if (pr !== null && (!Number.isFinite(pr) || pr < 0 || pr > 100000)) {
      setErr(
        tk("app-ai-ai-panel.save.set-err.ca3c81fd2f43"),
      );
      return;
    }
    setErr(
      cmds.run(
        { type: "SetAiBudget", monthLimit: lim, pricePerImage: pr },
        tk("app-ai-ai-panel.save.cmds-run.332619fcd839"),
      ),
    );
  }

  return (
    <div className="border border-border bg-surface-1 px-4 py-3">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {tk("app-ai-ai-panel.budget.label.a9470dff1b8f")}
          <input
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            disabled={!isOwner}
            inputMode="numeric"
            placeholder={tk("app-ai-ai-panel.budget.placeholder.2becf3cbe4e1")}
            aria-label={tk("app-ai-ai-panel.budget.aria-label.a9470dff1b8f")}
            className={ctl}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {tk("app-ai-ai-panel.budget.label.f895c62aaba5")}
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={!isOwner}
            inputMode="decimal"
            placeholder={tk("app-ai-ai-panel.budget.placeholder.3ccd27a54782")}
            aria-label={tk("app-ai-ai-panel.budget.aria-label.009d21f15bfa")}
            className={ctl}
          />
        </label>
        {isOwner ? (
          <Button size="sm" disabled={!changed} onClick={save}>
            {tk("app-ai-ai-panel.budget.button.13ec0ee5f594")}
          </Button>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-text-tertiary">
        {isOwner
          ? tk("app-ai-ai-panel.budget.p.9eadccb8743b")
          : tk("app-ai-ai-panel.budget.p.cd9d16a09075")}
      </p>
      {err ? (
        <p role="alert" className="mt-1 text-xs text-status-danger">
          {err}
        </p>
      ) : null}
    </div>
  );
}

/** «Prøv igjen»: samme beskrivelse, kan endres før den sendes; resultatet blir en ny versjon. */
function RetryDialog({
  job,
  onClose,
  state,
  projectId,
  cmds,
}: {
  job: GenerationJob | null;
  onClose: () => void;
  state: ProjectState;
  projectId: string;
  cmds: Commands;
}) {
  const [productionId] = useActiveProduction(projectId, state, job?.occurrenceId ?? null);
  const context = useMemo(
    () => ({ state, productionId, occurrenceId: job?.occurrenceId ?? null }),
    [state, productionId, job],
  );
  const asset = job?.assetId ? state.assets[job.assetId] : undefined;
  const variant = asset ? (variantsOf(state, asset.id).find((v) => !v.archived) ?? null) : null;
  return (
    <Dialog open={!!job && !!asset} onOpenChange={(o) => !o && onClose()}>
      <ResizableDialogContent sizeKey="ai-panel" className="max-w-[640px] border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>
            <AiGlyph className="mr-1 inline size-4" aria-hidden />
            {tk("app-ai-ai-panel.retry-dialog.dialog-title.1ccf1e27f0d8")}
            {asset ? `: «${asset.name}»` : ""}
          </DialogTitle>
          <DialogDescription>
            {tk("app-ai-ai-panel.retry-dialog.dialog-description.17d0cfd033f2")}
          </DialogDescription>
        </DialogHeader>
        {job && asset ? (
          <GenerateImagePanel
            projectId={projectId}
            filmTitle={state.project.name}
            asset={asset}
            variant={variant}
            reference={null}
            editable
            disabled={false}
            budget={state.project}
            initialPrompt={job.prompt}
            context={context}
            onGenerated={async (img) => {
              let variantId = variant?.id ?? null;
              if (!variantId) {
                variantId = newId<"asset_variant">();
                const r = await cmds.runAndWait(
                  {
                    type: "CreateAssetVariant",
                    variantId: variantId as never,
                    assetId: asset.id,
                    fields: { name: "Animatic", style: "animatic", appearance: "" },
                  },
                  tk("app-ai-ai-panel.r.cmds-run-and-wait.0217985d73aa.2", { name: String(asset.name) }),
                );
                if (r.error) return r.error;
              }
              const r = await cmds.runAndWait(
                {
                  type: "AddAssetVersion",
                  versionId: img.versionId as never,
                  variantId: variantId as never,
                  media: img.media,
                  note: tk("app-ai-ai-panel.note.note.53aad993372b", { model: String(img.model) }),
                },
                tk("app-ai-ai-panel.r.cmds-run-and-wait.56b486a12ca0", { name: String(asset.name) }),
              );
              return r.error;
            }}
          />
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {tk("app-ai-ai-panel.retry-dialog.button.cd9827760969")}
          </Button>
        </DialogFooter>
      </ResizableDialogContent>
    </Dialog>
  );
}

/** Fremdrift for en jobb i kø eller hos leverandøren (DEC-0070, REQ-0295). */
function JobProgressLine({
  job,
  now,
  jobs,
}: {
  job: GenerationJob;
  now: number;
  jobs: readonly GenerationJob[];
}) {
  const p = jobProgress(job, now, jobs);
  return (
    <div className="mt-1 flex items-center gap-2 text-[11px] text-text-tertiary">
      {p.fraction !== null ? (
        <div
          role="progressbar"
          aria-label={p.label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(p.fraction * 100)}
          className="h-1.5 w-32 overflow-hidden rounded-sm bg-surface-3"
        >
          <div
            className={"h-full " + (p.reported ? "bg-accent-primary" : "bg-text-tertiary")}
            style={{ width: `${Math.round(p.fraction * 100)}%` }}
          />
        </div>
      ) : null}
      <span>{p.label}</span>
    </div>
  );
}

/** Prioritet, «Først» og «Avbryt» for en jobb som venter i køen. */
function QueueControls({ projectId, job }: { projectId: string; job: GenerationJob }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function act(action: "cancel" | "priority" | "first", priority?: 1 | 2 | 3) {
    setBusy(true);
    setErr(null);
    try {
      const r = await updateQueuedJob({
        data: { projectId, jobId: job.id, action, priority },
      });
      if (!r.ok)
        setErr(r.message ? tm(r.message) : tk("app-ai-ai-panel.act.set-err.62534a79515a"));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: aiJobsKey(projectId) });
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      <select
        aria-label={tk("app-ai-ai-panel.queue-controls.aria-label.13421340c9b6")}
        value={job.priority ?? 2}
        disabled={busy}
        onChange={(e) => void act("priority", Number(e.target.value) as 1 | 2 | 3)}
        className="h-7 rounded-sm border border-border-control bg-surface-3 px-1 text-xs text-text-primary"
      >
        {([1, 2, 3] as const).map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </option>
        ))}
      </select>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act("first")}>
        {tk("app-ai-ai-panel.queue-controls.button.c40336910499")}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act("cancel")}>
        {tk("app-ai-ai-panel.queue-controls.button.caad46539049")}
      </Button>
      {err ? (
        <span role="alert" className="text-[11px] text-status-danger">
          {err}
        </span>
      ) : null}
    </div>
  );
}
