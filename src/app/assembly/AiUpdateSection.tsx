/**
 * «Oppdater med AI» ved avvik (valg B, mandat 21.3–21.5, REQ-0308–0310, DEC-0070): når manuset er endret
 * etter en AI-video, foreslås nye videoer bare for segmentene endringen berører. Synes endringen ikke i
 * bildet, sies det (godkjenn i stedet). Prisen vises og må bekreftes; de nye videoene blir nye forsøk ved
 * siden av de gamle, som kan sammenlignes og velges etterpå. Samme leverandør og modell som sist når den
 * fortsatt er koblet til.
 */
import { Loader2, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  adaptPromptForModel,
  aiUpdatePlan,
  effortChoice,
  estimateCostUsd,
  filmClips,
  formatUsd,
  providerInfo,
  providerModel,
  sceneVideoWork,
  videoDurationFor,
  videoStartImages,
  type ProjectState,
  type ScriptChange,
} from "@/core";
import { startVideoGeneration } from "@/adapters/ai/video.functions";
import { aiJobsKey, useAiJobs } from "@/app/ai/use-ai-jobs";
import { useProjectProviders } from "@/app/ai/use-project-providers";
import { SentPrompts } from "@/app/ai/SentPrompts";
import { Button } from "@/components/ui/button";

export function AiUpdateSection({
  state,
  occurrenceId,
  changes,
  takeIds,
}: {
  state: ProjectState;
  occurrenceId: string;
  changes: readonly ScriptChange[];
  /** AI-videoene som avviker fra manuset. */
  takeIds: readonly string[];
}) {
  const projectId = state.project.id;
  const qc = useQueryClient();
  const o = state.occurrences[occurrenceId];
  const productionId = o?.productionId ?? "";
  const clip = useMemo(
    () => filmClips(state, productionId).find((c) => c.occurrenceId === occurrenceId) ?? null,
    [state, productionId, occurrenceId],
  );
  const available = useProjectProviders(projectId);
  const jobs = useAiJobs(projectId);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  if (!clip) return null;
  const plan = aiUpdatePlan(state, productionId, clip, changes, takeIds);
  const work = sceneVideoWork(state, productionId, clip);
  const connected = new Set(available.data?.providers ?? []);
  // Samme modell som laget den gamle videoen, ellers et balansert valg
  const lastJob = (jobs.data?.jobs ?? []).find((j) =>
    takeIds.some((id) => state.takes[id]?.mediaRef === j.resultPath),
  );
  const same =
    lastJob && connected.has(lastJob.provider)
      ? (() => {
          const m = providerModel(lastJob.provider, lastJob.model);
          const p = providerInfo(lastJob.provider);
          return m && p && m.capability === "video" ? { provider: p, model: m } : null;
        })()
      : null;
  const chosen = same ?? effortChoice("video", "balanced", connected);
  const seconds = (i: number) => {
    const seg = work.plan[i];
    return seg && chosen
      ? videoDurationFor((seg.endMs - seg.startMs) / 1000, chosen.model.durations ?? [])
      : 0;
  };
  const cost = chosen
    ? plan.segments.reduce(
        (t, i) =>
          t + (estimateCostUsd(chosen.provider.id, chosen.model.id, { seconds: seconds(i) }) ?? 0),
        0,
      )
    : 0;
  const start = videoStartImages(state, productionId, occurrenceId)[0] ?? null;

  async function run() {
    if (!chosen) return;
    setConfirm(false);
    setBusy(true);
    setMsg(null);
    const errors: string[] = [];
    let started = 0;
    for (const i of plan.segments) {
      if (adaptPromptForModel(work.prompts[i] ?? "", chosen.model).blocked) {
        errors.push(`Segment ${i + 1}: replikkene er for lange for modellen – del segmentet`);
        continue;
      }
      try {
        const r = await startVideoGeneration({
          data: {
            projectId,
            occurrenceId,
            segmentId: work.stored[i]?.id ?? null,
            prompt: adaptPromptForModel(work.prompts[i] ?? "", chosen.model).text,
            provider: chosen.provider.id,
            model: chosen.model.id,
            seconds: seconds(i),
            aspect: state.project.frameWidth >= state.project.frameHeight ? "16:9" : "9:16",
            startImagePath: start ? start.mediaPath : null,
            approved: true,
            queue: true,
            priority: 1,
          },
        });
        if (r.ok) started++;
        else errors.push(`Segment ${i + 1}: ${r.message}`);
      } catch (e) {
        errors.push(`Segment ${i + 1}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
    void qc.invalidateQueries({ queryKey: aiJobsKey(projectId) });
    setMsg(
      errors.length
        ? { kind: "error", text: errors.join(" · ") }
        : {
            kind: "ok",
            text: `${started} nye ${started === 1 ? "video er" : "videoer er"} lagt i kø med høy prioritet. De gamle beholdes; sammenlign og velg i «Generer scene», og sett sammen scenen på nytt.`,
          },
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-sm border border-border bg-surface-1 p-2 text-xs">
      <p className="font-medium text-text-primary">Oppdater AI-videoen</p>
      <p className="text-text-secondary">{plan.reason}</p>
      {plan.localOnly || plan.segments.length === 0 ? null : !chosen ? (
        <p className="text-text-tertiary">
          Ingen videoleverandør er koblet til (AI-leverandører på prosjektlisten).
        </p>
      ) : confirm ? (
        <div role="alertdialog" aria-label="Bekreft ny video" className="flex flex-col gap-1.5">
          <p className="text-text-primary">
            {plan.segments.length} {plan.segments.length === 1 ? "ny video" : "nye videoer"} med{" "}
            {chosen.provider.name} – {chosen.model.label}
            {same ? " (samme som sist)" : ""}. Belastes prosjektets eier, anslått {formatUsd(cost)}{" "}
            (et anslag). De gamle videoene beholdes.
          </p>
          <SentPrompts
            items={plan.segments.map((i) => ({
              label: `Segment ${i + 1}`,
              ...adaptPromptForModel(work.prompts[i] ?? "", chosen.model),
            }))}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void run()} disabled={busy}>
              <Sparkles /> Ja, lag nye videoer
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              Avbryt
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          disabled={busy}
          onClick={() => setConfirm(true)}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Oppdater med AI ({plan.segments.length}{" "}
          {plan.segments.length === 1 ? "segment" : "segmenter"}, ~{formatUsd(cost)}) …
        </Button>
      )}
      {msg ? (
        <p
          role={msg.kind === "error" ? "alert" : "status"}
          className={msg.kind === "error" ? "text-status-danger" : "text-status-success"}
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
