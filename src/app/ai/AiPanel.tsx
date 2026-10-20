/**
 * AI-budsjett og AI-jobber på prosjektoversikten (DEC-0053):
 * - Budsjett (REQ-0282/0284/0528): eieren setter høyeste antall genereringer per måned og en anslått pris
 *   per bilde. Serveren stopper genereringer når rammen er nådd.
 * - Forbruk (REQ-0283): denne måneden, anslått kostnad (alltid merket som anslag, REQ-0281).
 * - Jobber (REQ-0292/0294/0296/0297/0299/0303): alle genereringer med status, feilmelding, resultat og
 *   «Prøv igjen». Fullførte resultater ligger i biblioteket og blir aldri slettet av en ny generering.
 */
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
import {
  aiUsage,
  EFFORT_LABEL,
  formatCredits,
  formatUsd,
  type GenerationJob,
  JOB_STATE_LABEL,
  jobEffort,
  jobProgress,
  type JobState,
  jobState,
  L, jobQualityProfile,
  locale,
  newId,
  PRIORITY_LABEL,
  type ProjectState,
  PROVIDERS,
  catalogSettings,
  isProviderEnabled,
  tm,
  unclaimedImageJobs,
  unclaimedVideoJobs,
  variantsOf,
  versionIdFromResultPath,
} from "@/core";
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
      {L("Tilgjengelige leverandører:", "Available providers:")}{" "}
      <span className="text-text-primary">{names}</span>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        {L("AI-leverandører …", "AI providers …")}
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
            L(`Ny variant for «${asset.name}»`, `New variant for “${asset.name}”`),
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
            note: L(
              `Generert med AI (${j.model}{jobQualityProfile(j) ? L(` · Laget med profil ${jobQualityProfile(j)?.name}`, ` · Made with profile ${jobQualityProfile(j)?.name}`) : ""}), hentet inn fra AI-jobbene`,
              `Generated with AI (${j.model}), added from the AI jobs`,
            ),
          },
          L(`Hent inn AI-bilde av «${asset.name}»`, `Add AI image of “${asset.name}”`),
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
        {L("AI-budsjett og jobber", "AI budget and jobs")}
      </h2>
      <Budget state={state} cmds={cmds} isOwner={isOwner} />
      <p className="mt-2 text-[13px] text-text-secondary">
        {L("Denne måneden:", "This month:")}{" "}
        <span className="tabular font-medium text-text-primary">{usage.used}</span>{" "}
        {usage.limit !== null ? (
          <>
            {L("av", "of")} <span className="tabular">{usage.limit}</span>{" "}
            {L("genereringer", "generations")} ({usage.remaining} {L("igjen", "left")})
          </>
        ) : (
          L(
            "genereringer (ingen egen ramme – de faste grensene gjelder: 30 per person i timen, 200 per prosjekt i døgnet)",
            "generations (no own limit – the standard limits apply: 30 per person per hour, 200 per project per day)",
          )
        )}
        {usage.estimatedCost !== null
          ? L(
              ` · anslått ${formatCredits(usage.estimatedCost)}${usage.partlyUnknown ? " (noen uten anslag)" : ""}`,
              ` · estimated ${formatCredits(usage.estimatedCost)}${usage.partlyUnknown ? " (some without an estimate)" : ""}`,
            )
          : ""}
        {L(
          ` · API-kostnad med egne nøkler ca. ${formatUsd(usage.costUsd ?? 0)}`,
          ` · API cost with your own keys approx. ${formatUsd(usage.costUsd ?? 0)}`,
        )}
        .
      </p>

      <ProviderLine projectId={projectId} userId={userId} />
      {isOwner ? <AiSourceCleanup projectId={projectId} /> : null}
      {unclaimed.length ? (
        <div
          role="status"
          className="mt-3 flex flex-wrap items-center gap-2 rounded-sm border border-accent-warm/50 bg-surface-2 px-3 py-2 text-[13px] text-text-primary"
        >
          <AlertTriangle className="size-4 text-status-uncertain" aria-hidden />
          <span className="min-w-0 flex-1">
            {unclaimed.length === 1
              ? L(
                  "Ett AI-resultat ble laget, men ikke lagt inn",
                  "One AI result was made but not added",
                )
              : L(
                  `${unclaimed.length} AI-resultater ble laget, men ikke lagt inn`,
                  `${unclaimed.length} AI results were made but not added`,
                )}{" "}
            {L(
              "(bilder i biblioteket, videoer som ny versjon av scenen – siden ble kanskje lukket mens de ble laget). De er betalt og ligger trygt lagret.",
              "(images in the library, videos as a new version of the scene – the page may have been closed while they were made). They are paid for and safely stored.",
            )}
          </span>
          {editable ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={claiming !== null}
              onClick={() => void claim(unclaimed)}
            >
              {claiming ? <Loader2 className="animate-spin" /> : <Download />}
              {unclaimed.length === 1 ? L("Legg inn", "Add") : L("Legg inn alle", "Add all")}
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
        <h3 className="text-[13px] font-medium text-text-primary">{L("Jobber", "Jobs")}</h3>
        <div
          role="group"
          aria-label={L("Vis jobber", "Show jobs")}
          className="ml-2 flex items-center gap-0.5"
        >
          {(
            [
              ["all", L("Alle", "All")],
              ["problems", L("Ikke ferdige", "Not finished")],
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
          {L("Jobbene kunne ikke hentes:", "The jobs could not be loaded:")}{" "}
          {(jobs.error as Error).message}
        </p>
      ) : shown.length === 0 ? (
        <p className="mt-2 text-xs text-text-tertiary">
          {list.length === 0
            ? L("Ingen AI-genereringer ennå.", "No AI generations yet.")
            : L("Ingen jobber som ikke er ferdige.", "No jobs that are not finished.")}
        </p>
      ) : (
        <ul
          className="mt-2 border border-border bg-surface-1"
          aria-label={L("AI-jobber", "AI jobs")}
        >
          {visible.map((j) => {
            const st = jobState(j, now);
            const Icon = STATE_ICON[st];
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
                      ? L("Video", "Video")
                      : j.kind === "prompt"
                        ? L("Beskrivelse skrevet av AI", "Description written by AI")
                        : j.kind === "sound"
                          ? L("Lyd", "Sound")
                          : L("Bilde", "Image")}
                    {asset ? ` ${j.kind === "prompt" ? "for" : L("av", "of")} «${asset.name}»` : ""}
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
                          {L("AI skrev:", "The AI wrote:")}
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
                        ? L(
                            "Videoen er laget, men ikke lagt inn som versjon av scenen.",
                            "The video is made, but not added as a version of the scene.",
                          )
                        : L(
                            "Bildet er laget, men ikke lagt inn i biblioteket.",
                            "The image is made, but not added to the library.",
                          )}
                    </p>
                  ) : null}
                  {st === "stale" ? (
                    <p className="mt-0.5 text-xs text-status-uncertain">
                      {L(
                        "Jobben svarte ikke ferdig (siden ble kanskje lukket). Ingen ny versjon ble lagret; prøv igjen om du trenger bildet.",
                        "The job did not finish in time (the page may have been closed). No new version was saved; try again if you need the image.",
                      )}
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
                        search={{ asset: asset.id }}
                      >
                        {L("Vis", "View")}
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
                      {L("Legg inn", "Add")}
                    </Button>
                  ) : null}
                  {editable && asset && j.kind === "image" ? (
                    <Button size="sm" variant="secondary" onClick={() => setRetry(j)}>
                      <RotateCcw />
                      {L("Prøv igjen", "Try again")}
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
          {L("Vis alle", "Show all")} ({shown.length})
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
        L(
          "Antallet må være et helt tall mellom 0 og 100 000 (tomt = ingen egen ramme).",
          "The number must be a whole number between 0 and 100,000 (empty = no own limit).",
        ),
      );
      return;
    }
    if (pr !== null && (!Number.isFinite(pr) || pr < 0 || pr > 100000)) {
      setErr(
        L(
          "Prisen må være et tall (tomt = ukjent).",
          "The price must be a number (empty = unknown).",
        ),
      );
      return;
    }
    setErr(
      cmds.run(
        { type: "SetAiBudget", monthLimit: lim, pricePerImage: pr },
        L("Endre AI-budsjett", "Change AI budget"),
      ),
    );
  }

  return (
    <div className="border border-border bg-surface-1 px-4 py-3">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {L(
            "Høyst antall AI-genereringer per måned",
            "Highest number of AI generations per month",
          )}
          <input
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            disabled={!isOwner}
            inputMode="numeric"
            placeholder={L("Ingen egen ramme", "No own limit")}
            aria-label={L(
              "Høyst antall AI-genereringer per måned",
              "Highest number of AI generations per month",
            )}
            className={ctl}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {L("Anslått pris per bilde (kreditter)", "Estimated price per image (credits)")}
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={!isOwner}
            inputMode="decimal"
            placeholder={L("Ukjent", "Unknown")}
            aria-label={L(
              "Anslått pris per bilde i kreditter",
              "Estimated price per image in credits",
            )}
            className={ctl}
          />
        </label>
        {isOwner ? (
          <Button size="sm" disabled={!changed} onClick={save}>
            {L("Lagre", "Save")}
          </Button>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-text-tertiary">
        {isOwner
          ? L(
              "Når rammen er nådd, stopper serveren nye genereringer til neste måned. Prisen er ditt eget anslag (Animatic Studio viser forbruket i arbeidsområdet) og brukes bare til å vise anslått kostnad.",
              "When the limit is reached, the server stops new generations until next month. The price is your own estimate (Animatic Studio shows the usage in the workspace) and is only used to show the estimated cost.",
            )
          : L("Bare eieren kan endre budsjettet.", "Only the owner can change the budget.")}
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
      <DialogContent className="max-w-[640px] border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>
            <AiGlyph className="mr-1 inline size-4" aria-hidden />
            {L("Prøv igjen", "Try again")}
            {asset ? `: «${asset.name}»` : ""}
          </DialogTitle>
          <DialogDescription>
            {L(
              "Samme beskrivelse som sist. Det nye bildet lagres som en ny versjon; ingenting eksisterende endres.",
              "The same description as last time. The new image is saved as a new version; nothing existing is changed.",
            )}
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
                  L(`Ny variant for «${asset.name}»`, `New variant for “${asset.name}”`),
                );
                if (r.error) return r.error;
              }
              const r = await cmds.runAndWait(
                {
                  type: "AddAssetVersion",
                  versionId: img.versionId as never,
                  variantId: variantId as never,
                  media: img.media,
                  note: L(
                    `Generert med AI (${img.model}), nytt forsøk`,
                    `Generated with AI (${img.model}), new attempt`,
                  ),
                },
                L(`AI-bilde av «${asset.name}»`, `AI image of “${asset.name}”`),
              );
              return r.error;
            }}
          />
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {L("Lukk", "Close")}
          </Button>
        </DialogFooter>
      </DialogContent>
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
        setErr(r.message ? tm(r.message) : L("Kunne ikke endres.", "Could not be changed."));
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
        aria-label={L("Prioritet i køen", "Priority in the queue")}
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
        {L("Først", "First")}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act("cancel")}>
        {L("Avbryt", "Cancel")}
      </Button>
      {err ? (
        <span role="alert" className="text-[11px] text-status-danger">
          {err}
        </span>
      ) : null}
    </div>
  );
}
