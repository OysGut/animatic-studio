/**
 * «Endre scenevarighet» (SV1, B-041): brukeren velger metode hver gang hele scenen endrer lengde – også fyll
 * ved forlengelse i start eller slutt. Rapporten vises i klartekst, med før/etter-stripe og forhåndsspill fra
 * en midlertidig tilstand (ingen lagring). «Bruk» kjører én samlet kommando (RetimeScene).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  L,
  applyCommand,
  framesToSeconds,
  localized,
  newId,
  planRetime,
  renderFrame,
  retimeMethodNeedsFill,
  secondsToFrames,
  MAX_DURATION_SECONDS,
  MIN_DURATION_SECONDS,
  RETIME_METHODS,
  type Command,
  type Composition,
  type PaddingFill,
  type ProjectState,
  type RetimeMethod,
  type RetimePlan,
  type RetimeReport,
} from "@/core";
import { ImageCache, drawFrame } from "@/engine/compositor/canvas";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { loadVersionBuffers, saveComposition } from "@/app/audio/composition-actions";
import { RetimeStrip } from "./RetimeStrip";

type RunAndWait = (
  command: Command,
  label: string,
  group?: string,
) => Promise<{ error: string | null; commandId: string | null }>;

const METHOD_LABEL: Record<RetimeMethod, string> = localized({
  start: ["Start", "Start"],
  end: ["Slutt", "End"],
  pauses: ["Fordel på pausene", "Spread over the pauses"],
  stretch_all: ["Strekk alt, også ordmellomrom", "Stretch everything, including word gaps"],
  stretch_visual: ["Strekk alt unntatt lydfilene", "Stretch everything except the audio files"],
});

const METHOD_HELP: Record<RetimeMethod, string> = localized({
  start: [
    "Tid legges til eller fjernes i starten. Alt innhold forskyves.",
    "Time is added or removed at the start. All content is shifted.",
  ],
  end: [
    "Tid legges til eller fjernes i slutten. Ingenting forskyves.",
    "Time is added or removed at the end. Nothing is shifted.",
  ],
  pauses: [
    "Tiden fordeles på mellomrommene mellom tale, effekter og låste tidsrom. Talelyd, musikk og video strekkes ikke.",
    "The time is spread over the gaps between speech, effects and locked ranges. Speech, music and video are not stretched.",
  ],
  stretch_all: [
    "All visuell timing skaleres. Lydklippene følger med, og mellomrommene mellom ordene strekkes. Ordene endrer ikke hastighet.",
    "All visual timing is scaled. Audio clips follow, and the gaps between words are stretched. The words do not change speed.",
  ],
  stretch_visual: [
    "All visuell timing skaleres. Lydklippene står urørt.",
    "All visual timing is scaled. The audio clips stay untouched.",
  ],
});

const FILL_LABEL: Record<PaddingFill, string> = localized({
  freeze: ["Frys bildet", "Freeze frame"],
  background: ["Bare bakgrunnen", "Background only"],
  black: ["Svart", "Black"],
});

/** Rapporten i klartekst. */
function reportLines(r: RetimeReport, fps: number): string[] {
  const s = (f: number) => (Math.round((f / fps) * 100) / 100).toString();
  const out = [
    L(
      `Fra ${s(r.beforeFrames)} s til ${s(r.afterFrames)} s.`,
      `From ${s(r.beforeFrames)} s to ${s(r.afterFrames)} s.`,
    ),
  ];
  const n = (x: readonly unknown[]) => x.length;
  if (n(r.moved)) out.push(L(`${n(r.moved)} ting flyttes.`, `${n(r.moved)} items are moved.`));
  if (n(r.scaled)) out.push(L(`${n(r.scaled)} ting skaleres.`, `${n(r.scaled)} items are scaled.`));
  if (n(r.trimmed))
    out.push(
      L(
        `${n(r.trimmed)} ting trimmes eller fjernes.`,
        `${n(r.trimmed)} items are trimmed or removed.`,
      ),
    );
  if (n(r.gapsBefore))
    out.push(
      L(
        `Mellomrom før: ${r.gapsBefore.map((g) => s(g.endFrame - g.startFrame)).join(" / ")} s. Etter: ${r.gapsAfter.map((g) => s(g.endFrame - g.startFrame)).join(" / ")} s.`,
        `Gaps before: ${r.gapsBefore.map((g) => s(g.endFrame - g.startFrame)).join(" / ")} s. After: ${r.gapsAfter.map((g) => s(g.endFrame - g.startFrame)).join(" / ")} s.`,
      ),
    );
  if (n(r.collisions))
    out.push(
      L(
        `${n(r.collisions)} punkter havnet på samme bilde og ble skjøvet ett bilde. Ingen er slettet.`,
        `${n(r.collisions)} points landed on the same frame and were pushed one frame. None are deleted.`,
      ),
    );
  if (n(r.audioNotFitting))
    out.push(
      L(
        `${n(r.audioNotFitting)} lydklipp kunne ikke tilpasses helt: ${r.audioNotFitting.map((a) => a.detail || a.id).join(", ")}.`,
        `${n(r.audioNotFitting)} audio clips could not be fully adjusted: ${r.audioNotFitting.map((a) => a.detail || a.id).join(", ")}.`,
      ),
    );
  if (n(r.remix))
    out.push(
      L(
        `${n(r.remix)} dialogopptak lagres som nye versjoner med endrede ordmellomrom.`,
        `${n(r.remix)} dialogue recordings are saved as new versions with changed word gaps.`,
      ),
    );
  const manual = new Set(r.manual.map((m) => m.detail ?? ""));
  for (const m of manual) if (m) out.push(m);
  return out;
}

export function RetimeDialog({
  open,
  onClose,
  state,
  occurrenceId,
  composition,
  currentFrames,
  initialFrames,
  runAndWait,
  imageUrls,
}: {
  open: boolean;
  onClose: () => void;
  state: ProjectState;
  occurrenceId: string;
  composition: Composition;
  currentFrames: number;
  initialFrames: number;
  runAndWait: RunAndWait;
  imageUrls: Readonly<Record<string, string>>;
}) {
  const fps = state.project.fps;
  const fpsN = fps.num / fps.den;
  const [seconds, setSeconds] = useState(String(framesToSeconds(initialFrames, fps)));
  const [method, setMethod] = useState<RetimeMethod | null>(null);
  const [fill, setFill] = useState<PaddingFill | null>(null);
  const [keepAmbience, setKeepAmbience] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; conflict: boolean } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!open) return;
    setSeconds(String(Math.round(framesToSeconds(initialFrames, fps) * 100) / 100));
    setMethod(null);
    setFill(null);
    setKeepAmbience(true);
    setError(null);
    setBusy(null);
  }, [open, initialFrames, fps]);

  const target = useMemo(() => {
    const v = Number(seconds.trim().replace(",", "."));
    if (!Number.isFinite(v)) return null;
    return secondsToFrames(Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, v)), fps);
  }, [seconds, fps]);
  const delta = target === null ? 0 : target - currentFrames;
  const needsFill = method !== null && retimeMethodNeedsFill(method, delta);

  const plan: RetimePlan | null = useMemo(() => {
    if (!open || target === null || !method) return null;
    if (needsFill && !fill) return null;
    return planRetime(state, occurrenceId, {
      targetFrames: target,
      method,
      keepAmbience,
      ...(fill ? { fill } : {}),
    });
    // nonce: «Beregn på nytt»
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, state, occurrenceId, target, method, fill, keepAmbience, needsFill, nonce]);

  // Midlertidig tilstand for forhåndsspill (ingen lagring)
  const previewState = useMemo(() => {
    if (!plan?.ok) return null;
    const r = applyCommand(state, {
      id: "preview" as never,
      actor: "preview" as never,
      at: new Date().toISOString(),
      command: plan.command,
    });
    return r.ok ? r.state : null;
  }, [plan, state]);

  async function apply() {
    if (!plan?.ok || target === null || !method) return;
    setError(null);
    let p: RetimePlan = plan;
    const group = newId<"command">();
    try {
      if (p.report.remix.length) {
        setBusy(
          L("Lagrer dialogopptak med nye ordmellomrom …", "Saving dialogue with new word gaps …"),
        );
        const remixed: Record<string, { versionId: string; lengthMs: number }> = {};
        for (const r of p.report.remix) {
          const ids = [...new Set(r.composition.segments.map((x) => x.versionId))];
          const versions = ids.map((id) => state.assetVersions[id]).filter((v) => v !== undefined);
          const buffers = await loadVersionBuffers(versions);
          const saved = await saveComposition(
            { runAndWait },
            state,
            state.project.id,
            r.assetId,
            { variantId: r.variantId },
            r.composition,
            buffers,
            L(
              "Ordmellomrom endret med scenevarigheten",
              "Word gaps changed with the scene duration",
            ),
          );
          const len = r.composition.segments.reduce((m, x) => Math.max(m, x.atMs + x.lengthMs), 0);
          remixed[r.clipId] = { versionId: saved.versionId, lengthMs: saved.durationMs ?? len };
        }
        p = planRetime(state, occurrenceId, {
          targetFrames: target,
          method,
          keepAmbience,
          remixed,
          ...(fill ? { fill } : {}),
        });
        if (!p.ok) throw new Error(p.reason);
      }
      setBusy(L("Lagrer …", "Saving …"));
      const res = await runAndWait(
        p.ok ? p.command : plan.command,
        L("Endre scenevarighet", "Change scene duration"),
        group,
      );
      if (res.error) {
        setError({ text: res.error, conflict: true });
        setBusy(null);
        return;
      }
      setBusy(null);
      onClose();
    } catch (e) {
      setBusy(null);
      setError({ text: e instanceof Error ? e.message : String(e), conflict: false });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent
        data-testid="retime-dialog"
        className="max-h-[92vh] max-w-[760px] overflow-y-auto border-border bg-surface-2"
      >
        <DialogHeader>
          <DialogTitle>{L("Endre scenevarighet", "Change scene duration")}</DialogTitle>
          <DialogDescription>
            {L(
              "Velg hvordan scenen skal få ny lengde. Ingenting endres før du trykker Bruk.",
              "Choose how the scene gets its new length. Nothing changes until you press Apply.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
          <label className="flex items-center gap-2">
            {L("Ny varighet (s)", "New duration (s)")}
            <input
              data-testid="retime-seconds"
              type="number"
              inputMode="decimal"
              step={0.5}
              min={MIN_DURATION_SECONDS}
              max={MAX_DURATION_SECONDS}
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
              className="h-7 w-24 rounded-sm border border-border-control bg-surface-3 px-1.5 font-mono text-text-primary"
            />
          </label>
          {[-1, 1].map((d) => (
            <Button
              key={d}
              size="sm"
              variant="secondary"
              data-testid={d < 0 ? "retime-minus" : "retime-plus"}
              onClick={() => {
                const v = Number(seconds.replace(",", ".")) || 0;
                setSeconds(String(Math.max(MIN_DURATION_SECONDS, Math.round((v + d) * 100) / 100)));
              }}
            >
              {d < 0 ? L("− 1 s", "− 1 s") : L("+ 1 s", "+ 1 s")}
            </Button>
          ))}
          <span className="text-text-tertiary" data-testid="retime-delta">
            {L("Nå", "Now")} {Math.round(framesToSeconds(currentFrames, fps) * 100) / 100} s
            {delta !== 0
              ? ` (${delta > 0 ? "+" : "−"}${Math.round(framesToSeconds(Math.abs(delta), fps) * 100) / 100} s)`
              : ""}
          </span>
        </div>

        <fieldset className="space-y-1.5" data-testid="retime-methods">
          <legend className="mb-1 text-sm font-medium text-text-primary">
            {L("Metode", "Method")}
          </legend>
          {RETIME_METHODS.map((m) => (
            <label
              key={m}
              className="flex cursor-pointer items-start gap-2 rounded-sm border border-border bg-surface-1 px-2 py-1.5 text-sm"
            >
              <input
                type="radio"
                name="retime-method"
                data-testid={`retime-method-${m}`}
                checked={method === m}
                onChange={() => setMethod(m)}
                className="mt-1 accent-[var(--accent-brand)]"
              />
              <span>
                <span className="text-text-primary">{METHOD_LABEL[m]}</span>
                <span className="block text-xs text-text-tertiary">{METHOD_HELP[m]}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {needsFill ? (
          <fieldset className="space-y-1" data-testid="retime-fill">
            <legend className="mb-1 text-sm font-medium text-text-primary">
              {L("Hva viser den nye tiden?", "What does the new time show?")}
            </legend>
            <div className="flex flex-wrap gap-3 text-sm text-text-secondary">
              {(["freeze", "background", "black"] as const).map((f) => (
                <label key={f} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="retime-fill"
                    data-testid={`retime-fill-${f}`}
                    checked={fill === f}
                    onChange={() => setFill(f)}
                    className="accent-[var(--accent-brand)]"
                  />
                  {FILL_LABEL[f]}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-sm text-text-secondary">
              <input
                type="checkbox"
                data-testid="retime-keep-ambience"
                checked={keepAmbience}
                onChange={(e) => setKeepAmbience(e.target.checked)}
                className="accent-[var(--accent-brand)]"
              />
              {L(
                "La atmosfære og musikk som spiller, fortsette",
                "Let ambience and music that is playing continue",
              )}
            </label>
          </fieldset>
        ) : null}

        {plan ? (
          <div className="space-y-2" data-testid="retime-report">
            <RetimeStrip
              report={plan.report}
              locked={composition.timing?.lockedRanges ?? []}
              fps={fpsN}
            />
            {!plan.ok ? (
              <p role="alert" data-testid="retime-reason" className="text-sm text-status-danger">
                {plan.reason}
              </p>
            ) : null}
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-text-secondary">
              {reportLines(plan.report, fpsN).map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-text-tertiary" data-testid="retime-choose">
            {method
              ? L("Velg hva den nye tiden skal vise.", "Choose what the new time shows.")
              : L("Velg en metode.", "Choose a method.")}
          </p>
        )}

        {previewState ? (
          <PreviewPlayer
            state={previewState}
            compositionId={composition.id}
            frames={plan?.report.afterFrames ?? 1}
            fps={fpsN}
            imageUrls={imageUrls}
          />
        ) : null}

        {error ? (
          <div
            role="alert"
            data-testid="retime-error"
            className="flex items-center gap-2 text-sm text-status-danger"
          >
            <span className="flex-1">{error.text}</span>
            {error.conflict ? (
              <Button
                size="sm"
                variant="secondary"
                data-testid="retime-recalculate"
                onClick={() => {
                  setError(null);
                  setNonce((n) => n + 1);
                }}
              >
                {L("Beregn på nytt", "Recalculate")}
              </Button>
            ) : null}
          </div>
        ) : null}
        {busy ? <p className="text-xs text-text-tertiary">{busy}</p> : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={!!busy} data-testid="retime-cancel">
            {L("Avbryt", "Cancel")}
          </Button>
          <Button
            onClick={() => void apply()}
            disabled={!plan?.ok || !!busy || !!error}
            data-testid="retime-apply"
          >
            {L("Bruk", "Apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Forhåndsspill av resultatet fra den midlertidige tilstanden (bildet slik det blir i filmen). */
function PreviewPlayer({
  state,
  compositionId,
  frames,
  fps,
  imageUrls,
}: {
  state: ProjectState;
  compositionId: string;
  frames: number;
  fps: number;
  imageUrls: Readonly<Record<string, string>>;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tick, setTick] = useState(0);
  const cache = useMemo(() => new ImageCache(() => setTick((t) => t + 1)), []);
  const consumer = useRef({});
  useEffect(() => {
    cache.ensure(imageUrls, consumer.current);
    const c = consumer.current;
    return () => cache.release(c);
  }, [cache, imageUrls]);

  useEffect(() => {
    if (!playing) return;
    const start = performance.now() - (frame / fps) * 1000;
    let id = 0;
    const step = (t: number) => {
      const f = Math.floor(((t - start) / 1000) * fps);
      if (f >= frames) {
        setFrame(frames - 1);
        setPlaying(false);
        return;
      }
      setFrame(f);
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, fps, frames]);

  const comp = state.compositions[compositionId];
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !comp) return;
    const w = 384;
    const h = Math.round((w * comp.height) / comp.width);
    c.width = w;
    c.height = h;
    const k = w / comp.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    drawFrame(ctx, renderFrame(state, compositionId, frame, { view: "camera" }), {
      view: [k, 0, 0, k, 0, 0],
      images: cache.images,
      placeholders: false,
    });
  }, [state, compositionId, frame, comp, cache, tick]);

  return (
    <div className="flex items-center gap-3" data-testid="retime-preview">
      <canvas
        ref={ref}
        role="img"
        aria-label={L("Forhåndsspill av ny varighet", "Preview of the new duration")}
        className="w-48 rounded-sm bg-bg-app"
      />
      <div className="space-y-1">
        <Button
          size="sm"
          variant="secondary"
          data-testid="retime-preview-play"
          onClick={() => {
            if (!playing && frame >= frames - 1) setFrame(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? L("Stopp", "Stop") : L("Forhåndsspill", "Preview")}
        </Button>
        <p className="font-mono text-xs text-text-tertiary">
          {(frame / fps).toFixed(2)} / {(frames / fps).toFixed(2)} s
        </p>
      </div>
    </div>
  );
}
