/**
 * «Oppdater med AI» ved avvik (valg B, mandat 21.3–21.5, REQ-0308–0310, DEC-0070): når manuset er endret
 * etter en AI-video, foreslås nye videoer bare for segmentene endringen berører. Synes endringen ikke i
 * bildet, sies det (godkjenn i stedet). Prisen vises og må bekreftes; de nye videoene blir nye forsøk ved
 * siden av de gamle, som kan sammenlignes og velges etterpå. Samme leverandør og modell som sist når den
 * fortsatt er koblet til.
 */
import { Loader2 } from "lucide-react";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  adaptPromptForModel,
  aiUpdatePlan,
  costBreakdown,
  effortChoice,
  estimateCostUsd,
  filmClips,
  formatUsd,
  L,
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
import { CostLines } from "@/app/ai/CostLines";
import { Button } from "@/components/ui/button";
import { t as tk } from "@/core/i18n/keyed";

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
  // Beskrivelsen kan endres før sending (prinsipp 11, REQ-0489, DEC-0075); per segment
  const [edited, setEdited] = useState<Record<string, string>>({});
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
  // Endringene huskes per lagret segment (ID), så en ny inndeling ikke flytter teksten til feil segment
  const editKey = (i: number) => work.stored[i]?.id ?? `i${i}`;
  const promptFor = (i: number) => edited[editKey(i)] ?? work.prompts[i] ?? "";

  async function run() {
    if (!chosen) return;
    setConfirm(false);
    setBusy(true);
    setMsg(null);
    const errors: string[] = [];
    let started = 0;
    for (const i of plan.segments) {
      if (adaptPromptForModel(promptFor(i), chosen.model).blocked) {
        errors.push(
          tk("app-assembly-ai-update-section.run.errors-push.b6d049c6fdbb", { value1: String(i + 1) }),
        );
        continue;
      }
      try {
        const r = await startVideoGeneration({
          data: {
            projectId,
            occurrenceId,
            segmentId: work.stored[i]?.id ?? null,
            prompt: adaptPromptForModel(promptFor(i), chosen.model).text,
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
    // Neste oppdatering starter fra forslaget igjen (manuset kan være endret)
    setEdited({});
    void qc.invalidateQueries({ queryKey: aiJobsKey(projectId) });
    setMsg(
      errors.length
        ? { kind: "error", text: errors.join(" · ") }
        : {
            kind: "ok",
            text: L(
              `${started} nye ${started === 1 ? "video er" : "videoer er"} lagt i kø med høy prioritet. De gamle beholdes; sammenlign og velg i «Generer scene», og sett sammen scenen på nytt.`,
              `${started} new ${started === 1 ? "video is" : "videos are"} queued with high priority. The old ones are kept; compare and choose in “Generate scene”, and assemble the scene again.`,
            ),
          },
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-sm border border-border bg-surface-1 p-2 text-xs">
      <p className="font-medium text-text-primary">
        {tk("app-assembly-ai-update-section.ai-update-section.p.2ca282bbc9af")}
      </p>
      <p className="text-text-secondary">{plan.reason}</p>
      {plan.localOnly || plan.segments.length === 0 ? null : !chosen ? (
        <p className="text-text-tertiary">
          {tk("app-assembly-ai-update-section.ai-update-section.p.6f400fcd28e3")}
        </p>
      ) : confirm ? (
        <div
          role="alertdialog"
          aria-label={tk("app-assembly-ai-update-section.ai-update-section.aria-label.cff5fd241cb5")}
          className="flex flex-col gap-1.5"
        >
          <p className="text-text-primary">
            {plan.segments.length}{" "}
            {plan.segments.length === 1
              ? tk("app-assembly-ai-update-section.ai-update-section.p.dfa7da92a486")
              : tk("app-assembly-ai-update-section.ai-update-section.p.7a28a05bef70")}{" "}
            {tk("app-assembly-ai-update-section.ai-update-section.p.20a41ec48ba1")} {chosen.provider.name} – {chosen.model.label}
            {same ? tk("app-assembly-ai-update-section.ai-update-section.p.7ff7db948778") : ""}.{" "}
            {tk("app-assembly-ai-update-section.ai-update-section.p.01b1591be1e6", { value1: String(formatUsd(cost)) })}
          </p>
          <CostLines
            lines={costBreakdown(chosen.provider, chosen.model, {
              targets: plan.segments.length,
              targetsLabel: tk("app-assembly-ai-update-section.targets-label.targets-label.b1b0690eaf2a"),
              seconds: plan.segments.map(seconds),
              total: `ca. ${formatUsd(cost)}`,
            })}
          />
          {plan.segments.map((i) => (
            <div key={i} className="flex flex-col gap-0.5 text-[11px] text-text-tertiary">
              <span className="flex items-center gap-2">
                <label htmlFor={`ai-update-${occurrenceId}-${i}`}>
                  {tk("app-assembly-ai-update-section.ai-update-section.label.497b477bfd08", { value1: String(i + 1) })}
                </label>
                {edited[editKey(i)] !== undefined ? (
                  <button
                    type="button"
                    className="text-text-secondary underline"
                    onClick={() =>
                      setEdited((e) => {
                        const { [editKey(i)]: _drop, ...rest } = e;
                        return rest;
                      })
                    }
                  >
                    {tk("app-assembly-ai-update-section.ai-update-section.button.508577509caa")}
                  </button>
                ) : null}
              </span>
              <textarea
                id={`ai-update-${occurrenceId}-${i}`}
                value={promptFor(i)}
                onChange={(e) => setEdited((x) => ({ ...x, [editKey(i)]: e.target.value }))}
                rows={4}
                className="w-full resize-y rounded-sm border border-border-control bg-surface-3 p-1.5 font-mono text-[11px] text-text-primary"
              />
            </div>
          ))}
          <SentPrompts
            items={plan.segments.map((i) => ({
              label: `Segment ${i + 1}`,
              ...adaptPromptForModel(promptFor(i), chosen.model),
            }))}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => void run()}
              disabled={busy || plan.segments.some((i) => !promptFor(i).trim())}
            >
              <AiGlyph /> {tk("app-assembly-ai-update-section.ai-update-section.button.0eae5369083a")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setConfirm(false);
                setEdited({});
              }}
            >
              {tk("app-assembly-ai-update-section.ai-update-section.button.14e6b6f0ad02")}
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
          {busy ? <Loader2 className="animate-spin" /> : <AiGlyph />}
          {tk("app-assembly-ai-update-section.ai-update-section.button.0213b3c41bdb")} ({plan.segments.length}{" "}
          {plan.segments.length === 1 ? "segment" : tk("app-assembly-ai-update-section.ai-update-section.button.a7c27d70b9d1")}, ~{formatUsd(cost)})
          …
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
