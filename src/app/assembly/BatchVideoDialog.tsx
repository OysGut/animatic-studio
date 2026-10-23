/**
 * Video for flere scener på én gang (DEC-0070, REQ-0290 massegenerering, REQ-0300 prioritet, REQ-0279
 * kostnad før start). Velg scener, modell, format, startbilde og prioritet; samlet anslått kostnad vises og
 * må bekreftes. Segmentene legges i køen og sendes høyst tre om gangen per nøkkel – også når fanen lukkes,
 * hvis bakgrunnskøen er satt opp. Inndelinger som ikke er lagret, lagres først (kan angres som ett steg).
 * Ferdige videoer legges inn som nye versjoner; 2D-scenene endres aldri.
 */
import { UiId } from "@/app/shared/UiId";
import { ResizableDialogContent } from "@/app/shared/ResizableDialogContent";
import { ListOrdered, Loader2 } from "lucide-react";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { adaptPromptForModel, chainStartPath, costBreakdown, estimateCostUsd, filmClips, formatHeading, formatUsd, keysEvenly, profileChoice, qualityProfileSnapshot, newId, PRIORITY_LABEL, type ProjectState, providersFor, sceneVideoWork, type SceneVideoWork, tm, videoDurationFor, videoStartImages } from "@/core";
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
import { t as tk } from "@/core/i18n/keyed";

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
          tk("app-assembly-batch-video-dialog.r.cmds-run-and-wait.5254a8ba8e3d"),
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
            tk("app-assembly-batch-video-dialog.run.errors-push.a9070233703f", { value1: String(w.clip.productionNumber ?? ""), value2: String(i + 1) }),
          );
          continue;
        }
        setBusy(tk("app-assembly-batch-video-dialog.run.set-busy.5dffdc2066fa", { n: String(n), totalSegments: String(totalSegments) }));
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
            text: tk("app-assembly-batch-video-dialog.text.text.f599dd171c64", { queued: String(queued), value2: String(errors
                .slice(0, 6)
                .map((x) => tm(x))
                .join(" · ")), value3: String(errors.length > 6 ? ` (+${errors.length - 6})` : "") }),
          }
        : {
            kind: "ok",
            text: tk("app-assembly-batch-video-dialog.videos-queued-at", { count: queued, provider: chosen.provider.name }),
          },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <ResizableDialogContent uiId="V-038" sizeKey="batch-video" className="max-h-[90vh] max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <ListOrdered className="size-4" aria-hidden />{" "}
            {tk("app-assembly-batch-video-dialog.batch-video-dialog.dialog-title.a96fd66050f7")}
          </DialogTitle>
          <DialogDescription>
            {tk("app-assembly-batch-video-dialog.batch-video-dialog.dialog-description.d1ee0ff0fb3e")}
          </DialogDescription>
        </DialogHeader>
        <QualityProfilePicker state={state} value={quality.choice} disabled={!!busy} onChange={v => { quality.setChoice(v); setPick(""); setConfirm(false); }} /><QualityProfileBudget error={quality.budgetError} />
        {/* Bare innholdet ruller; tittel og knapper står fast (UX-gjennomgang DEC-0076) */}
        <div className="-mx-1 flex min-h-0 flex-col gap-3 overflow-y-auto px-1">
          {available.isLoading ? (
            <p className="text-xs text-text-tertiary">
              {tk("app-assembly-batch-video-dialog.batch-video-dialog.p.2a6234ba65d9")}
            </p>
          ) : !chosen ? (
            <p className="text-[13px] text-text-secondary">
              {tk("app-assembly-batch-video-dialog.batch-video-dialog.p.a1231b16463c")}
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
                  aria-label={tk("app-assembly-batch-video-dialog.batch-video-dialog.aria-label.accd87b7d2b8")}
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
                  aria-label={tk("app-assembly-batch-video-dialog.batch-video-dialog.aria-label.8a47f40d54ef")}
                  value={aspect}
                  onChange={(e) => setAspect(e.target.value as "16:9" | "9:16")}
                  className={ctl}
                  disabled={!!busy}
                >
                  <option value="16:9">{tk("app-assembly-batch-video-dialog.batch-video-dialog.option.9ab391d39417")}</option>
                  <option value="9:16">{tk("app-assembly-batch-video-dialog.batch-video-dialog.option.e2ab79e82dcf")}</option>
                </select>
                <label className="flex items-center gap-1">
                  {tk("app-assembly-batch-video-dialog.batch-video-dialog.label.1eeab9303c99")}
                  <select
                    aria-label={tk("app-assembly-batch-video-dialog.batch-video-dialog.aria-label.e10f8f84041a")}
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
                  {tk("app-assembly-batch-video-dialog.batch-video-dialog.label.284377e12e64")}
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
                  {tk("app-assembly-batch-video-dialog.batch-video-dialog.label.b2f517832e70")}
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
                  {tk("app-assembly-batch-video-dialog.batch-video-dialog.button.2cbfa29f8086")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!!busy}
                  onClick={() => setSelected(new Set())}
                >
                  {tk("app-assembly-batch-video-dialog.batch-video-dialog.button.4abb785ea991")}
                </Button>
              </div>
              <ul
                aria-label={tk("app-assembly-batch-video-dialog.batch-video-dialog.aria-label.f5ae2186cca8")}
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
                        {w.plan.length === 1 ? tk("app-assembly-batch-video-dialog.batch-video-dialog.span.808a703cfc27") : tk("app-assembly-batch-video-dialog.batch-video-dialog.span.7540abeec993")}
                        {w.stored.length ? "" : tk("app-assembly-batch-video-dialog.batch-video-dialog.span.7d5e8b30ca7e")} ·{" "}
                        {w.withVideo.length} {tk("app-assembly-batch-video-dialog.batch-video-dialog.span.e340a042dffd")}
                      </span>
                      <span className="tabular w-20 text-right text-text-secondary">
                        {b
                          ? tk("app-assembly-batch-video-dialog.batch-video-dialog.span.df980ea038fd")
                          : t.length
                            ? `~${formatUsd(costFor(w))}`
                            : tk("app-assembly-batch-video-dialog.batch-video-dialog.span.9963b3be2ef9")}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {confirm ? (
                <div
                  ref={(el) => el?.scrollIntoView?.({ block: "nearest" })}
                  role="alertdialog"
                  aria-label={tk("app-assembly-batch-video-dialog.batch-video-dialog.aria-label.9b5ada7637b0")}
                  className="relative flex flex-col gap-2 rounded-sm border border-accent-warm/60 bg-surface-2 p-2"
                ><UiId id="V-145" />
                  <p className="text-xs text-text-primary">
                    {totalSegments}{" "}
                    {totalSegments === 1 ? tk("app-assembly-batch-video-dialog.batch-video-dialog.p.808a703cfc27") : tk("app-assembly-batch-video-dialog.batch-video-dialog.p.7540abeec993")} i{" "}
                    {runnable.length}{" "}
                    {runnable.length === 1 ? tk("app-assembly-batch-video-dialog.batch-video-dialog.p.a89258cb0a00") : tk("app-assembly-batch-video-dialog.batch-video-dialog.p.0f157d644f37")}{" "}
                    {tk("app-assembly-batch-video-dialog.batch-video-dialog.p.a7a32ef81137")} {chosen.provider.name} – {chosen.model.label}.{" "}
                    {tk("app-assembly-batch-video-dialog.batch-video-dialog.p.2290afecd18f", { value1: String(formatUsd(totalCost)) })}
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
                        label: tk("app-assembly-batch-video-dialog.label.label.1a19052c9b7f", { value1: String(w.clip.productionNumber ?? ""), value2: String(i + 1) }),
                        ...adaptPromptForModel(w.prompts[i] ?? "", chosen.model),
                      })),
                    )}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void run()} disabled={!!busy}>
                      <AiGlyph /> {tk("app-assembly-batch-video-dialog.batch-video-dialog.button.e0c175903fc9")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                      {tk("app-assembly-batch-video-dialog.batch-video-dialog.button.7c4c558f629a")}
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
            {tk("app-assembly-batch-video-dialog.batch-video-dialog.button.a94a68947d70")}
          </Button>
          {chosen ? (
            <Button
              variant="secondary"
              disabled={!!busy || totalSegments === 0 || confirm}
              onClick={() => setConfirm(true)}
            >
              <AiGlyph />
              {tk("app-assembly-batch-video-dialog.batch-video-dialog.button.dbc345d7cb22")} ({totalSegments}{" "}
              {totalSegments === 1 ? tk("app-assembly-batch-video-dialog.batch-video-dialog.button.808a703cfc27") : tk("app-assembly-batch-video-dialog.batch-video-dialog.button.7540abeec993")}, ~
              {formatUsd(totalCost)}) …
            </Button>
          ) : null}
        </DialogFooter>
      </ResizableDialogContent>
    </Dialog>
  );
}
