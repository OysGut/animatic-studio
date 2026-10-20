/**
 * Video for flere scener på én gang (DEC-0070, REQ-0290 massegenerering, REQ-0300 prioritet, REQ-0279
 * kostnad før start). Velg scener, modell, format, startbilde og prioritet; samlet anslått kostnad vises og
 * må bekreftes. Segmentene legges i køen og sendes høyst tre om gangen per nøkkel – også når fanen lukkes,
 * hvis bakgrunnskøen er satt opp. Inndelinger som ikke er lagret, lagres først (kan angres som ett steg).
 * Ferdige videoer legges inn som nye versjoner; 2D-scenene endres aldri.
 */
import { ListOrdered, Loader2 } from "lucide-react";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  adaptPromptForModel,
  chainStartPath,
  costBreakdown,
  estimateCostUsd,
  filmClips,
  formatHeading,
  formatUsd,
  keysEvenly,
  L, profileChoice, qualityProfileSnapshot,
  newId,
  PRIORITY_LABEL,
  type ProjectState,
  providersFor,
  sceneVideoWork,
  type SceneVideoWork,
  tm,
  videoDurationFor,
  videoStartImages,
} from "@/core";
import { startVideoGeneration } from "@/adapters/ai/video.functions";
import type { Commands } from "@/app/project/use-commands";
import { aiJobsKey, useAiJobs } from "@/app/ai/use-ai-jobs";
import { QualityProfilePicker, QualityProfileBudget, useQualityProfile } from "@/app/ai/QualityProfilePicker";
import { useProjectProviders } from "@/app/ai/use-project-providers";
import { EffortPicker } from "@/app/ai/EffortPicker";
import { SentPrompts } from "@/app/ai/SentPrompts";
import { CostLines } from "@/app/ai/CostLines";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ctl =
  "h-7 min-w-0 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary disabled:opacity-50";

export function BatchVideoDialog({
  open,
  onOpenChange,
  state,
  productionId,
  cmds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  productionId: string;
  cmds: Commands;
}) {
  const projectId = state.project.id;
  const qc = useQueryClient();
  const available = useProjectProviders(projectId, open);
  const options = providersFor("video", new Set(available.data?.providers ?? []));
  const flat = options.flatMap((o) => o.models.map((m) => ({ provider: o.provider, model: m })));
  const [pick, setPick] = useState("");
  const quality = useQualityProfile(state);
  const recommended = profileChoice("video", quality.profile, new Set(available.data?.providers ?? []));
  const chosen = flat.find((x) => `${x.provider.id}|${x.model.id}` === pick) ?? (recommended ? flat.find(m => m.model.id === recommended.model.id && m.provider.id === recommended.provider.id) : null) ?? flat[0] ?? null;
  const [aspect, setAspect] = useState<"16:9" | "9:16">(
    state.project.frameWidth >= state.project.frameHeight ? "16:9" : "9:16",
  );
  const [priority, setPriority] = useState<1 | 2 | 3>(2);
  const [skipDone, setSkipDone] = useState(true);
  // Sammenheng (DEC-0071): hvert segment starter fra siste bilde i segmentet før
  const [chain, setChain] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const jobs = useAiJobs(projectId, open);
  const needsStart = !!chosen?.model.requiresImage;

  const works: SceneVideoWork[] = useMemo(
    () =>
      open
        ? filmClips(state, productionId)
            .filter((c) => c.durationFrames > 0)
            .map((c) => sceneVideoWork(state, productionId, c))
        : [],
    [open, state, productionId],
  );
  const busySegments = useMemo(
    () =>
      new Set(
        (jobs.data?.jobs ?? [])
          .filter((j) => j.kind === "video" && (j.status === "queued" || j.status === "running"))
          .map((j) => j.segmentId ?? ""),
      ),
    [jobs.data],
  );

  const seconds = (w: SceneVideoWork, i: number) => {
    const seg = w.plan[i];
    if (!seg || !chosen) return 0;
    return videoDurationFor((seg.endMs - seg.startMs) / 1000, chosen.model.durations ?? []);
  };
  /** Segmentene (indekser) som skal lages for scenen. */
  const todo = (w: SceneVideoWork) =>
    w.plan
      .map((_, i) => i)
      .filter((i) => !(skipDone && w.withVideo.includes(i)))
      .filter((i) => !(w.stored[i] && busySegments.has(w.stored[i]!.id)));
  const startFor = (w: SceneVideoWork) =>
    videoStartImages(state, productionId, w.clip.occurrenceId)[0] ?? null;
  const costFor = (w: SceneVideoWork) =>
    chosen
      ? todo(w).reduce(
          (t, i) =>
            t +
            (estimateCostUsd(chosen.provider.id, chosen.model.id, { seconds: seconds(w, i) }) ?? 0),
          0,
        )
      : 0;
  const picked = works.filter((w) => selected.has(w.clip.occurrenceId));
  const blocked = (w: SceneVideoWork) => needsStart && !startFor(w);
  const runnable = picked.filter((w) => !blocked(w) && todo(w).length > 0);
  const totalSegments = runnable.reduce((t, w) => t + todo(w).length, 0);
  const totalCost = runnable.reduce((t, w) => t + costFor(w), 0);

  function toggle(id: string) {
    setConfirm(false);
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run() {
    if (!chosen) return;
    setConfirm(false);
    setMsg(null);
    const errors: string[] = [];
    let queued = 0;
    const group = newId();
    let n = 0;
    for (const w of runnable) {
      let ids = w.stored.map((g) => g.id as string);
      // Inndelingen lagres først (forslaget), så hvert segment får en fast ID
      if (!w.stored.length) {
        const keys = keysEvenly(Math.max(1, w.plan.length));
        const segments = w.plan.map((p, i) => ({
          segmentId: newId<"production_segment">(),
          orderKey: keys[i]!,
          startBlockId: null,
          endBlockId: null,
          startMs: p.startMs,
          endMs: p.endMs,
        }));
        const r = await cmds.runAndWait(
          {
            type: "ReplaceSegments",
            occurrenceId: w.clip.occurrenceId as never,
            reason: "model_limit",
            removeSegmentIds: [],
            segments,
          },
          L("Inndeling for generering (flere scener)", "Division for generation (several scenes)"),
          group,
        );
        if (r.error) {
          errors.push(`Scene ${w.clip.productionNumber ?? ""}: ${r.error}`);
          continue;
        }
        ids = segments.map((g) => g.segmentId);
      }
      const start = startFor(w);
      const list = todo(w);
      for (const i of list) {
        // Ved sammenheng: venter på segmentet før i køen, eller bruker siste bilde fra en video det har
        const after = chain && i > 0 && list.includes(i - 1) ? (ids[i - 1] ?? null) : null;
        const fromPrev =
          chain && i > 0 && !after ? chainStartPath(state, w.clip.occurrenceId, ids, i) : null;
        n++;
        if (adaptPromptForModel(w.prompts[i] ?? "", chosen.model).blocked) {
          errors.push(
            L(
              `Scene ${w.clip.productionNumber ?? ""}, segment ${i + 1}: replikkene er for lange for modellen`,
              `Scene ${w.clip.productionNumber ?? ""}, segment ${i + 1}: the dialogue is too long for the model`,
            ),
          );
          continue;
        }
        setBusy(L(`Legger i kø … ${n} av ${totalSegments}`, `Queueing … ${n} of ${totalSegments}`));
        try {
          if (quality.budgetError) throw new Error(quality.budgetError);
          const r = await startVideoGeneration({
            data: {
              projectId,
              occurrenceId: w.clip.occurrenceId,
              segmentId: ids[i] ?? null,
              prompt: adaptPromptForModel(w.prompts[i] ?? "", chosen.model).text,
              provider: chosen.provider.id,
              model: chosen.model.id,
              seconds: seconds(w, i),
              aspect,
              startImagePath: after ? null : (fromPrev ?? (start ? start.mediaPath : null)),
              approved: true, qualityProfile: quality.profile ? qualityProfileSnapshot(quality.profile) : null,
              queue: true,
              priority,
              chainAfter: after,
            },
          });
          if (r.ok) queued++;
          else
            errors.push(`Scene ${w.clip.productionNumber ?? ""}, segment ${i + 1}: ${r.message}`);
        } catch (e) {
          errors.push(
            `Scene ${w.clip.productionNumber ?? ""}, segment ${i + 1}: ${(e as Error).message}`,
          );
        }
        // Stopper ved første avvisning fra taket/budsjettet: resten ville også blitt avvist
        if (errors.length && /taket|budsjett|Køen er full/i.test(errors[errors.length - 1]!)) break;
      }
      if (errors.length && /taket|budsjett|Køen er full/i.test(errors[errors.length - 1]!)) break;
    }
    setBusy(null);
    void qc.invalidateQueries({ queryKey: aiJobsKey(projectId) });
    setMsg(
      errors.length
        ? {
            kind: "error",
            text: L(
              `${queued} lagt i kø. Ikke lagt i kø: ${errors
                .slice(0, 6)
                .map((x) => tm(x))
                .join(" · ")}${errors.length > 6 ? ` (+${errors.length - 6})` : ""}`,
              `${queued} queued. Not queued: ${errors
                .slice(0, 6)
                .map((x) => tm(x))
                .join(" · ")}${errors.length > 6 ? ` (+${errors.length - 6})` : ""}`,
            ),
          }
        : {
            kind: "ok",
            text: L(
              `${queued} ${queued === 1 ? "video er" : "videoer er"} lagt i kø hos ${chosen.provider.name}. De sendes høyst tre om gangen og legges inn som nye versjoner når de er ferdige. Følg med under AI-jobber på prosjektoversikten.`,
              `${queued} ${queued === 1 ? "video is" : "videos are"} queued at ${chosen.provider.name}. They are sent three at a time at most and added as new versions when they are finished. Follow them under AI jobs on the project overview.`,
            ),
          },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <ListOrdered className="size-4" aria-hidden />{" "}
            {L("Video for flere scener", "Video for several scenes")}
          </DialogTitle>
          <DialogDescription>
            {L(
              "Velg scenene. Hvert segment lages med beskrivelsen fra «Generer scene» (din egen eller den automatiske) og legges i køen. 2D-scenene endres aldri; ferdige videoer blir nye versjoner.",
              "Choose the scenes. Each segment is made with the description from “Generate scene” (your own or the automatic one) and added to the queue. The 2D scenes are never changed; finished videos become new versions.",
            )}
          </DialogDescription>
        </DialogHeader>
        <QualityProfilePicker state={state} value={quality.choice} disabled={!!busy} onChange={v => { quality.setChoice(v); setPick(""); setConfirm(false); }} /><QualityProfileBudget error={quality.budgetError} />
        {/* Bare innholdet ruller; tittel og knapper står fast (UX-gjennomgang DEC-0076) */}
        <div className="-mx-1 flex min-h-0 flex-col gap-3 overflow-y-auto px-1">
          {available.isLoading ? (
            <p className="text-xs text-text-tertiary">
              {L("Henter leverandører …", "Fetching providers …")}
            </p>
          ) : !chosen ? (
            <p className="text-[13px] text-text-secondary">
              {L(
                "Ingen videoleverandør er koblet til. Prosjektets eier kan koble til en under «AI-leverandører» på prosjektlisten.",
                "No video provider is connected. The project's owner can connect one under “AI providers” on the project list.",
              )}
            </p>
          ) : (
            <>
              <EffortPicker
                capability="video"
                connected={new Set(available.data?.providers ?? [])}
                chosen={chosen}
                disabled={!!busy}
                onChoose={(c) => {
                  setPick(`${c.provider.id}|${c.model.id}`);
                }}
              />
              <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                <select
                  aria-label={L("Videomodell", "Video model")}
                  value={`${chosen.provider.id}|${chosen.model.id}`}
                  onChange={(e) => {
                    setPick(e.target.value);
                    setConfirm(false);
                  }}
                  className={ctl}
                  disabled={!!busy}
                >
                  {flat.map((x) => (
                    <option
                      key={`${x.provider.id}|${x.model.id}`}
                      value={`${x.provider.id}|${x.model.id}`}
                    >
                      {x.provider.name} – {x.model.label} (~{formatUsd(x.model.priceUsd)}/s)
                    </option>
                  ))}
                </select>
                <select
                  aria-label={L("Format", "Format")}
                  value={aspect}
                  onChange={(e) => setAspect(e.target.value as "16:9" | "9:16")}
                  className={ctl}
                  disabled={!!busy}
                >
                  <option value="16:9">{L("16:9 liggende", "16:9 landscape")}</option>
                  <option value="9:16">{L("9:16 stående", "9:16 portrait")}</option>
                </select>
                <label className="flex items-center gap-1">
                  {L("Prioritet", "Priority")}
                  <select
                    aria-label={L("Prioritet i køen", "Priority in the queue")}
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value) as 1 | 2 | 3)}
                    className={ctl}
                    disabled={!!busy}
                  >
                    {([1, 2, 3] as const).map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={chain}
                    onChange={(e) => setChain(e.target.checked)}
                    disabled={!!busy}
                  />
                  {L("Sammenheng mellom segmentene", "Continuity between the segments")}
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={skipDone}
                    onChange={(e) => {
                      setSkipDone(e.target.checked);
                      setConfirm(false);
                    }}
                    disabled={!!busy}
                  />
                  {L("Hopp over segmenter som har video", "Skip segments that already have video")}
                </label>
              </div>
              <div className="flex gap-2 text-xs">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!!busy}
                  onClick={() =>
                    setSelected(
                      new Set(
                        works
                          .filter((w) => w.withVideo.length === 0 && !blocked(w))
                          .map((w) => w.clip.occurrenceId),
                      ),
                    )
                  }
                >
                  {L("Velg alle uten video", "Select all without video")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!!busy}
                  onClick={() => setSelected(new Set())}
                >
                  {L("Fjern valg", "Clear selection")}
                </Button>
              </div>
              <ul
                aria-label={L("Scener", "Scenes")}
                className="max-h-[45vh] overflow-y-auto border border-border bg-surface-1"
              >
                {works.map((w) => {
                  const t = todo(w);
                  const b = blocked(w);
                  return (
                    <li
                      key={w.clip.occurrenceId}
                      className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        aria-label={`Scene ${w.clip.productionNumber ?? ""}`}
                        checked={selected.has(w.clip.occurrenceId)}
                        disabled={!!busy || b}
                        onChange={() => toggle(w.clip.occurrenceId)}
                      />
                      <span className="tabular w-10 font-mono text-text-tertiary">
                        {w.clip.productionNumber ?? "–"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-text-primary">
                        {formatHeading(w.clip.heading)}
                      </span>
                      <span className="w-40 text-text-secondary">
                        {w.plan.length}{" "}
                        {w.plan.length === 1 ? L("segment", "segment") : L("segmenter", "segments")}
                        {w.stored.length ? "" : L(" (forslag)", " (proposal)")} ·{" "}
                        {w.withVideo.length} {L("med video", "with video")}
                      </span>
                      <span className="tabular w-20 text-right text-text-secondary">
                        {b
                          ? L("mangler startbilde", "missing start image")
                          : t.length
                            ? `~${formatUsd(costFor(w))}`
                            : L("ferdig", "done")}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {confirm ? (
                <div
                  ref={(el) => el?.scrollIntoView?.({ block: "nearest" })}
                  role="alertdialog"
                  aria-label={L("Bekreft videogenerering", "Confirm video generation")}
                  className="flex flex-col gap-2 rounded-sm border border-accent-warm/60 bg-surface-2 p-2"
                >
                  <p className="text-xs text-text-primary">
                    {totalSegments}{" "}
                    {totalSegments === 1 ? L("segment", "segment") : L("segmenter", "segments")} i{" "}
                    {runnable.length}{" "}
                    {runnable.length === 1 ? L("scene", "scene") : L("scener", "scenes")}{" "}
                    {L("med", "with")} {chosen.provider.name} – {chosen.model.label}.{" "}
                    {L(
                      `Belastes leverandørkontoen til prosjektets eier, anslått ${formatUsd(totalCost)} (et anslag; prisen regnes inn i taket med en gang). Jobber som venter i køen kan avbrytes uten kostnad. Vil du legge dem i kø nå?`,
                      `Charged to the provider account of the project's owner, estimated at ${formatUsd(totalCost)} (an estimate; the price counts towards the limit straight away). Jobs waiting in the queue can be cancelled at no cost. Do you want to queue them now?`,
                    )}
                  </p>
                  <CostLines
                    lines={costBreakdown(chosen.provider, chosen.model, {
                      targets: totalSegments,
                      targetsLabel: "segmenter",
                      seconds: runnable.flatMap((w) => todo(w).map((i) => seconds(w, i))),
                      total: `ca. ${formatUsd(totalCost)}`,
                    })}
                  />
                  <SentPrompts
                    items={runnable.flatMap((w) =>
                      todo(w).map((i) => ({
                        label: L(
                          `Scene ${w.clip.productionNumber ?? ""}, segment ${i + 1}`,
                          `Scene ${w.clip.productionNumber ?? ""}, segment ${i + 1}`,
                        ),
                        ...adaptPromptForModel(w.prompts[i] ?? "", chosen.model),
                      })),
                    )}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void run()} disabled={!!busy}>
                      <AiGlyph /> {L("Ja, legg i kø", "Yes, queue them")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                      {L("Avbryt", "Cancel")}
                    </Button>
                  </div>
                </div>
              ) : null}
              {busy ? (
                <p role="status" className="flex items-center gap-1 text-xs text-text-secondary">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden /> {busy}
                </p>
              ) : null}
              {msg ? (
                <p
                  role={msg.kind === "error" ? "alert" : "status"}
                  className={
                    "text-xs " +
                    (msg.kind === "error" ? "text-status-danger" : "text-status-success")
                  }
                >
                  {msg.text}
                </p>
              ) : null}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={!!busy}>
            {L("Lukk", "Close")}
          </Button>
          {chosen ? (
            <Button
              variant="secondary"
              disabled={!!busy || totalSegments === 0 || confirm}
              onClick={() => setConfirm(true)}
            >
              <AiGlyph />
              {L("Lag video", "Make video")} ({totalSegments}{" "}
              {totalSegments === 1 ? L("segment", "segment") : L("segmenter", "segments")}, ~
              {formatUsd(totalCost)}) …
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
