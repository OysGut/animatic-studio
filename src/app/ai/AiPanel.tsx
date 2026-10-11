/**
 * AI-budsjett og AI-jobber på prosjektoversikten (DEC-0053):
 * - Budsjett (REQ-0282/0284/0528): eieren setter høyeste antall genereringer per måned og en anslått pris
 *   per bilde. Serveren stopper genereringer når rammen er nådd.
 * - Forbruk (REQ-0283): denne måneden, anslått kostnad (alltid merket som anslag, REQ-0281).
 * - Jobber (REQ-0292/0294/0296/0297/0299/0303): alle genereringer med status, feilmelding, resultat og
 *   «Prøv igjen». Fullførte resultater ligger i biblioteket og blir aldri slettet av en ny generering.
 */
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Clock, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  JOB_STATE_LABEL,
  aiUsage,
  formatCredits,
  jobState,
  newId,
  variantsOf,
  type GenerationJob,
  type JobState,
  type ProjectState,
} from "@/core";
import { useCommands, type Commands } from "@/app/project/use-commands";
import { useProfiles } from "@/app/project/use-project";
import { GenerateImagePanel } from "@/app/library/GenerateImagePanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAiJobs } from "./use-ai-jobs";

const ctl =
  "h-8 w-32 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary disabled:opacity-50";

const STATE_ICON: Record<JobState, typeof Clock> = {
  running: Loader2,
  done: CheckCircle2,
  failed: AlertTriangle,
  lost: AlertTriangle,
  stale: Clock,
};
const STATE_CLASS: Record<JobState, string> = {
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
  const shown = list.filter((j) => filter === "all" || jobState(j, now) !== "done");
  const visible = showAll ? shown : shown.slice(0, 20);

  return (
    <section aria-labelledby="ai-title" className="mt-10">
      <h2 id="ai-title" className="mb-2 text-base font-semibold text-text-primary">
        AI-budsjett og jobber
      </h2>
      <Budget state={state} cmds={cmds} isOwner={isOwner} />
      <p className="mt-2 text-[13px] text-text-secondary">
        Denne måneden: <span className="tabular font-medium text-text-primary">{usage.used}</span>{" "}
        {usage.limit !== null ? (
          <>
            av <span className="tabular">{usage.limit}</span> genereringer ({usage.remaining} igjen)
          </>
        ) : (
          "genereringer (ingen egen ramme – de faste grensene gjelder: 30 per person i timen, 200 per prosjekt i døgnet)"
        )}
        {usage.estimatedCost !== null
          ? ` · anslått ${formatCredits(usage.estimatedCost)}${usage.partlyUnknown ? " (noen uten anslag)" : ""}`
          : ""}
        .
      </p>

      <div className="mt-4 flex items-center gap-2">
        <h3 className="text-[13px] font-medium text-text-primary">Jobber</h3>
        <div role="group" aria-label="Vis jobber" className="ml-2 flex items-center gap-0.5">
          {(
            [
              ["all", "Alle"],
              ["problems", "Ikke ferdige"],
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
          Jobbene kunne ikke hentes: {(jobs.error as Error).message}
        </p>
      ) : shown.length === 0 ? (
        <p className="mt-2 text-xs text-text-tertiary">
          {list.length === 0 ? "Ingen AI-genereringer ennå." : "Ingen jobber som ikke er ferdige."}
        </p>
      ) : (
        <ul className="mt-2 border border-border bg-surface-1" aria-label="AI-jobber">
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
                    {new Date(j.createdAt).toLocaleString("nb-NO", {
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
                    {j.kind === "video" ? "Video" : "Bilde"}
                    {asset ? ` av «${asset.name}»` : ""}
                    <span className="text-text-tertiary">
                      {" "}
                      · {j.model}
                      {j.estimatedCost !== null ? ` · ~${formatCredits(j.estimatedCost)}` : ""}
                    </span>
                  </p>
                  <details className="text-xs text-text-tertiary">
                    <summary className="cursor-pointer truncate">{j.prompt.split("\n")[0]}</summary>
                    <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-text-secondary">
                      {j.prompt}
                    </pre>
                  </details>
                  {(st === "failed" || st === "lost") && j.error ? (
                    <p className="mt-0.5 line-clamp-3 text-xs text-status-danger">{j.error}</p>
                  ) : null}
                  {st === "stale" ? (
                    <p className="mt-0.5 text-xs text-status-uncertain">
                      Jobben svarte ikke ferdig (siden ble kanskje lukket). Ingen ny versjon ble
                      lagret; prøv igjen om du trenger bildet.
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  {asset ? (
                    <Button size="sm" variant="ghost" asChild>
                      <Link
                        to="/prosjekt/$projectId/bibliotek"
                        params={{ projectId }}
                        search={{ asset: asset.id }}
                      >
                        Vis
                      </Link>
                    </Button>
                  ) : null}
                  {editable && asset && j.kind === "image" ? (
                    <Button size="sm" variant="secondary" onClick={() => setRetry(j)}>
                      <RotateCcw />
                      Prøv igjen
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
          Vis alle ({shown.length})
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
      setErr("Antallet må være et helt tall mellom 0 og 100 000 (tomt = ingen egen ramme).");
      return;
    }
    if (pr !== null && (!Number.isFinite(pr) || pr < 0 || pr > 100000)) {
      setErr("Prisen må være et tall (tomt = ukjent).");
      return;
    }
    setErr(
      cmds.run({ type: "SetAiBudget", monthLimit: lim, pricePerImage: pr }, "Endre AI-budsjett"),
    );
  }

  return (
    <div className="border border-border bg-surface-1 px-4 py-3">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Høyst antall AI-genereringer per måned
          <input
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            disabled={!isOwner}
            inputMode="numeric"
            placeholder="Ingen egen ramme"
            aria-label="Høyst antall AI-genereringer per måned"
            className={ctl}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Anslått pris per bilde (kreditter)
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={!isOwner}
            inputMode="decimal"
            placeholder="Ukjent"
            aria-label="Anslått pris per bilde i kreditter"
            className={ctl}
          />
        </label>
        {isOwner ? (
          <Button size="sm" disabled={!changed} onClick={save}>
            Lagre
          </Button>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-text-tertiary">
        {isOwner
          ? "Når rammen er nådd, stopper serveren nye genereringer til neste måned. Prisen er ditt eget anslag (Lovable viser forbruket i arbeidsområdet) og brukes bare til å vise anslått kostnad."
          : "Bare eieren kan endre budsjettet."}
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
  const asset = job?.assetId ? state.assets[job.assetId] : undefined;
  const variant = asset ? (variantsOf(state, asset.id).find((v) => !v.archived) ?? null) : null;
  return (
    <Dialog open={!!job && !!asset} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[640px] border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>
            <Sparkles className="mr-1 inline size-4" aria-hidden />
            Prøv igjen{asset ? `: «${asset.name}»` : ""}
          </DialogTitle>
          <DialogDescription>
            Samme beskrivelse som sist. Det nye bildet lagres som en ny versjon; ingenting
            eksisterende endres.
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
                  `Ny variant for «${asset.name}»`,
                );
                if (r.error) return r.error;
              }
              const r = await cmds.runAndWait(
                {
                  type: "AddAssetVersion",
                  versionId: img.versionId as never,
                  variantId: variantId as never,
                  media: img.media,
                  note: `Generert med AI (${img.model}), nytt forsøk`,
                },
                `AI-bilde av «${asset.name}»`,
              );
              return r.error;
            }}
          />
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Lukk
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
