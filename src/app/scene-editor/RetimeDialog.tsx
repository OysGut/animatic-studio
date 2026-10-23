/**
 * «Endre scenevarighet» (SV1, B-041): brukeren velger metode hver gang hele scenen endrer lengde – også fyll
 * ved forlengelse i start eller slutt. Rapporten vises i klartekst, med før/etter-stripe og forhåndsspill fra
 * en midlertidig tilstand (ingen lagring). «Bruk» kjører én samlet kommando (RetimeScene).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { applyCommand, alignmentInComposition, framesToSeconds, newId, planRetime, renderFrame, retimeMethodNeedsFill, secondsToFrames, MAX_DURATION_SECONDS, MIN_DURATION_SECONDS, RETIME_METHODS, type Command, type Composition, type FilmAudioItem, type PaddingFill, type ProjectState, type RetimeMethod, type RetimePlan, type RetimeReport } from "@/core";
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
import { useAudioPlayback } from "@/app/audio/use-audio-playback";
import { renderComposition } from "@/engine/audio/composition";
import { t as tk, tLocalized } from "@/core/i18n/keyed";

type RunAndWait = (
  command: Command,
  label: string,
  group?: string,
) => Promise<{ error: string | null; commandId: string | null }>;

const METHOD_LABEL: Record<RetimeMethod, string> = tLocalized({ start: "app-scene-editor-retime-dialog.method-label.start.6294cf7bb3d4", end: "app-scene-editor-retime-dialog.method-label.end.f234fd267472", pauses: "app-scene-editor-retime-dialog.method-label.pauses.59e2a2b08976", stretch_all: "app-scene-editor-retime-dialog.method-label.stretch-all.ac05de4ce8aa", stretch_visual: "app-scene-editor-retime-dialog.method-label.stretch-visual.10c04de0044f" });

const METHOD_HELP: Record<RetimeMethod, string> = tLocalized({ start: "app-scene-editor-retime-dialog.method-help.start.aac4b4080834", end: "app-scene-editor-retime-dialog.method-help.end.16c696814ba9", pauses: "app-scene-editor-retime-dialog.method-help.pauses.e82e9e042cf9", stretch_all: "app-scene-editor-retime-dialog.method-help.stretch-all.ec0f0751a311", stretch_visual: "app-scene-editor-retime-dialog.method-help.stretch-visual.df00ada1a62f" });

const FILL_LABEL: Record<PaddingFill, string> = tLocalized({ freeze: "app-scene-editor-retime-dialog.fill-label.freeze.cd03027a5452", background: "app-scene-editor-retime-dialog.fill-label.background.9eb64c2bca1b", black: "app-scene-editor-retime-dialog.fill-label.black.bfaab61c8fda" });

/** Rapporten i klartekst. */
function reportLines(r: RetimeReport, fps: number): string[] {
  const s = (f: number) => (Math.round((f / fps) * 100) / 100).toString();
  const out = [
    tk("app-scene-editor-retime-dialog.out.message.1802ef9353c8", { value1: String(s(r.beforeFrames)), value2: String(s(r.afterFrames)) }),
  ];
  const n = (x: readonly unknown[]) => x.length;
  if (n(r.moved)) out.push(tk("app-scene-editor-retime-dialog.report-lines.out-push.f439fb251de1", { value1: String(n(r.moved)) }));
  if (n(r.scaled)) out.push(tk("app-scene-editor-retime-dialog.report-lines.out-push.12b8139e6057", { value1: String(n(r.scaled)) }));
  if (n(r.trimmed))
    out.push(
      tk("app-scene-editor-retime-dialog.report-lines.out-push.e83f6a915e6e", { value1: String(n(r.trimmed)) }),
    );
  if (n(r.gapsBefore))
    out.push(
      tk("app-scene-editor-retime-dialog.report-lines.out-push.1bfb828c3104", { value1: String(r.gapsBefore.map((g) => s(g.endFrame - g.startFrame)).join(" / ")), value2: String(r.gapsAfter.map((g) => s(g.endFrame - g.startFrame)).join(" / ")) }),
    );
  if (n(r.collisions))
    out.push(
      tk("app-scene-editor-retime-dialog.report-lines.out-push.291eb933e534", { value1: String(n(r.collisions)) }),
    );
  if (n(r.audioNotFitting))
    out.push(
      tk("app-scene-editor-retime-dialog.report-lines.out-push.b700d6dda40e", { value1: String(n(r.audioNotFitting)), value2: String(r.audioNotFitting.map((a) => a.detail || a.id).join(", ")) }),
    );
  if (n(r.remix))
    out.push(
      tk("app-scene-editor-retime-dialog.report-lines.out-push.eb6408610e2f", { value1: String(n(r.remix)) }),
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
  audioOf,
  audioUrls,
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
  /** Lyden i scenen for en tilstand: klippene i filmtid og scenens start (s). */
  audioOf?: ((s: ProjectState) => { items: readonly FilmAudioItem[]; startSec: number }) | undefined;
  audioUrls?: Readonly<Record<string, string>> | null | undefined;
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
  const [prepared, setPrepared] = useState<{ plan: RetimePlan; buffers: ReadonlyMap<string, AudioBuffer>; sources: ReadonlyMap<string, AudioBuffer> } | null>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);

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

  useEffect(() => {
    let alive = true;
    setPrepared(null);
    setPrepareError(null);
    if (!plan?.ok || !plan.report.remix.length) return;
    void (async () => {
      const ids = [...new Set(plan.report.remix.flatMap((r) => r.composition.segments.map((s) => s.versionId)))];
      const sources = await loadVersionBuffers(ids.map((id) => state.assetVersions[id]).filter((v) => v !== undefined));
      if (ids.some((id) => !sources.has(id))) throw new Error(tk("app-scene-editor-retime-dialog.retime-dialog.async-const-ids-new-set-plan-report-remix-flat-map-r-r-composition-segments-map-s-s-version-id-const-sources-await-load-version-buffers-ids-map-id-state-asset-versions-id-filter-v-v-undefined-if-ids-some-id-sources-has-id-throw-new-error-l-lyden-kunne-ikke-lastes-til-forh-ndslytting-the-audio-could-not-be-loaded-for-preview-const-buffers-new-map-string-audio-buffer-for-const-remix-of-plan-report-remix-const-buffer-await-render-composition-remix-composition-id-sources-get-id-sample-rate-48000-channels-1-buffers-set-remix-clip-id-buffer-if-alive-set-prepared-plan-buffers-sources.6c9c62575a41"));
      const buffers = new Map<string, AudioBuffer>();
      for (const remix of plan.report.remix) {
        const buffer = await renderComposition(remix.composition, (id) => sources.get(id), { sampleRate: 48000, channels: 1 });
        buffers.set(remix.clipId, buffer);
      }
      if (alive) setPrepared({ plan, buffers, sources });
    })().catch((error: unknown) => { if (alive) setPrepareError(error instanceof Error ? error.message : tk("app-scene-editor-retime-dialog.retime-dialog.set-prepare-error.9d27afa9549e")); });
    return () => { alive = false; };
  }, [plan, state]);
  const ready = !plan?.ok || !plan.report.remix.length || prepared?.plan === plan;

  async function apply() {
    if (!plan?.ok || target === null || !method || !ready) return;
    setError(null);
    let p: RetimePlan = plan;
    const group = newId<"command">();
    try {
      if (p.report.remix.length) {
        setBusy(
          tk("app-scene-editor-retime-dialog.apply.set-busy.5a4ec12bb2fd"),
        );
        const remixed: Record<string, { versionId: string; lengthMs: number }> = {};
        for (const r of p.report.remix) {
          const current = prepared;
          if (!current || current.plan !== plan) throw new Error(tk("app-scene-editor-retime-dialog.apply.message.f1f0b76bd22c"));
          const base = state.assetVersions[r.baseVersionId];
          const saved = await saveComposition(
            { runAndWait },
            state,
            state.project.id,
            r.assetId,
            { variantId: r.variantId },
            r.composition,
            current.sources,
            tk("app-scene-editor-retime-dialog.saved.save-composition.8a4ec52847b6"),
            { group, prepared: current.buffers.get(r.clipId), ...(base?.alignment ? { alignment: alignmentInComposition(r.composition, base.alignment,
              base.composition ? { kind: "composition", composition: base.composition } : { kind: "version", versionId: base.id }) } : {}) },
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
      setBusy(tk("app-scene-editor-retime-dialog.apply.set-busy.645cd7e778e2"));
      const res = await runAndWait(
        p.ok ? p.command : plan.command,
        tk("app-scene-editor-retime-dialog.res.run-and-wait.099e8158fe6a"),
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
      <DialogContent uiId="V-095"
        data-testid="retime-dialog"
        className="max-h-[92vh] max-w-[760px] overflow-y-auto border-border bg-surface-2"
      >
        <DialogHeader>
          <DialogTitle>{tk("app-scene-editor-retime-dialog.retime-dialog.dialog-title.ebd387b42566")}</DialogTitle>
          <DialogDescription>
            {tk("app-scene-editor-retime-dialog.retime-dialog.dialog-description.ba3e4b629ee7")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
          <label className="flex items-center gap-2">
            {tk("app-scene-editor-retime-dialog.retime-dialog.label.fe7ec354e693")}
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
              {d < 0 ? tk("app-scene-editor-retime-dialog.retime-dialog.button.74c3bcaf9203") : tk("app-scene-editor-retime-dialog.retime-dialog.button.2b9ddc090718")}
            </Button>
          ))}
          <span className="text-text-tertiary" data-testid="retime-delta">
            {tk("app-scene-editor-retime-dialog.retime-dialog.span.e61f63912962")} {Math.round(framesToSeconds(currentFrames, fps) * 100) / 100} s
            {delta !== 0
              ? ` (${delta > 0 ? "+" : "−"}${Math.round(framesToSeconds(Math.abs(delta), fps) * 100) / 100} s)`
              : ""}
          </span>
        </div>

        <fieldset className="space-y-1.5" data-testid="retime-methods">
          <legend className="mb-1 text-sm font-medium text-text-primary">
            {tk("app-scene-editor-retime-dialog.retime-dialog.legend.0d940979c5e4")}
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
              {tk("app-scene-editor-retime-dialog.retime-dialog.legend.9026108d943d")}
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
              {tk("app-scene-editor-retime-dialog.retime-dialog.label.068d986088e6")}
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
              ? tk("app-scene-editor-retime-dialog.retime-dialog.p.b11dc2b2874e")
              : tk("app-scene-editor-retime-dialog.retime-dialog.p.5150c32877cd")}
          </p>
        )}

        {prepareError ? <p role="alert" className="text-xs text-status-danger" data-testid="retime-audio-error">{prepareError}</p> : null}
        {!ready && !prepareError ? <p role="status" className="text-xs text-text-secondary">{tk("app-scene-editor-retime-dialog.retime-dialog.p.dc28ca06615a")}</p> : null}
        {previewState && ready ? (
          <PreviewPlayer
            state={previewState}
            compositionId={composition.id}
            frames={plan?.report.afterFrames ?? 1}
            fps={fpsN}
            imageUrls={imageUrls}
            audioOf={audioOf}
            audioUrls={audioUrls ?? null}
            previewBuffers={prepared?.plan === plan ? prepared.buffers : undefined}
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
                {tk("app-scene-editor-retime-dialog.retime-dialog.button.f814a475bca3")}
              </Button>
            ) : null}
          </div>
        ) : null}
        {busy ? <p className="text-xs text-text-tertiary">{busy}</p> : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={!!busy} data-testid="retime-cancel">
            {tk("app-scene-editor-retime-dialog.retime-dialog.button.368c51667f60")}
          </Button>
          <Button
            onClick={() => void apply()}
            disabled={!plan?.ok || !!busy || !!error || !ready}
            data-testid="retime-apply"
          >
            {tk("app-scene-editor-retime-dialog.retime-dialog.button.88f1fa541c29")}
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
  audioOf,
  audioUrls,
  previewBuffers,
}: {
  state: ProjectState;
  compositionId: string;
  frames: number;
  fps: number;
  imageUrls: Readonly<Record<string, string>>;
  audioOf?: ((s: ProjectState) => { items: readonly FilmAudioItem[]; startSec: number }) | undefined;
  audioUrls: Readonly<Record<string, string>> | null;
  previewBuffers?: ReadonlyMap<string, AudioBuffer> | undefined;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tick, setTick] = useState(0);
  // Lyden fra den midlertidige tilstanden, så forskjellen mellom metodene høres
  const sound = useMemo(() => {
    const sound = audioOf?.(state) ?? { items: [], startSec: 0 };
    return { ...sound, items: sound.items.map((item) => {
      const buffer = previewBuffers?.get(item.clip.id);
      return buffer ? { ...item, sourceIn: 0, length: buffer.duration, fullLength: buffer.duration, speed: 1 } : item;
    }) };
  }, [audioOf, state, previewBuffers]);
  useAudioPlayback({
    items: sound.items,
    urls: audioOf ? audioUrls : null,
    playing,
    time: sound.startSec + frame / fps,
    previewBuffers,
  });
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
        aria-label={tk("app-scene-editor-retime-dialog.preview-player.aria-label.1c569a9882f0")}
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
          {playing ? tk("app-scene-editor-retime-dialog.preview-player.button.dffb69ea9ec8") : tk("app-scene-editor-retime-dialog.preview-player.button.b9bdf95ba745")}
        </Button>
        <p className="font-mono text-xs text-text-tertiary">
          {(frame / fps).toFixed(2)} / {(frames / fps).toFixed(2)} s
        </p>
      </div>
    </div>
  );
}
