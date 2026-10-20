import { useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import { L, qualityProfileSnapshot, layersOf, layerVersions, sceneNumberOf, type Composition, type ProjectState } from "@/core";
import { alphaExportError, alphaFileBase, alphaRange, DEFAULT_ALPHA_SETTINGS, isAlphaSettings,
  type AlphaExportSettings } from "@/core/layer-alpha";
import { exportAlphaLayers, openAlphaSink, supportsVp9Alpha } from "@/engine/export/alpha";
import { loadImages } from "@/engine/export/animatic";
import { signedUrls } from "@/app/library/asset-images";
import { exportQueue } from "./export-queue";
import { QualityProfilePicker, useQualityProfile } from "@/app/ai/QualityProfilePicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const control = "h-7 rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary";
export function AlphaExportDialog({ state, composition, initialLayerIds, open, onOpenChange }: {
  state: ProjectState; composition: Composition; initialLayerIds?: readonly string[];
  open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const quality = useQualityProfile(state);
  const appliedProfile = useRef<string | null>(null);
  const taskId = useRef<string | null>(null);
  const storageKey = `animatic:alpha-export:${state.project.id}`;
  const layers = useMemo(() => layersOf(state, composition.id), [state, composition.id]);
  const [options, setOptions] = useState<AlphaExportSettings>(DEFAULT_ALPHA_SETTINGS);
  const [support, setSupport] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<{ url: string; name: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const busy = progress !== null;
  useEffect(() => {
    if (!open) return;
    appliedProfile.current = null;
    let saved = DEFAULT_ALPHA_SETTINGS;
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (isAlphaSettings(raw)) saved = raw;
    } catch { /* Private browsing keeps the current draft only. */ }
    const ids = initialLayerIds?.length ? initialLayerIds : saved.layerIds.filter(id => layers.some(l => l.id === id));
    const preset = quality.profile?.spec.export;
    setOptions({ ...saved, ...(preset?.alpha ? { alpha:preset.alpha } : {}), ...(preset?.format === "png-seq" ? {format:"png-seq"} : preset?.format === "webm" ? {format:"webm-vp9"} : {}), layerIds: ids.length ? ids : layers.map(l => l.id),
      outFrame: Math.min(composition.durationFrames, Math.max(1, saved.outFrame)) });
    setError(null); setProgress(null); setReady(null);
    let active = true;
    setSupport(null);
    void supportsVp9Alpha(composition.width, composition.height).then(v => { if (active) setSupport(v); });
    return () => { active = false; };
    // Opening seeds a draft; preference updates must not reset an edited selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    const key = quality.profile ? JSON.stringify(quality.profile) : null;
    if (!open || key === appliedProfile.current) return;
    appliedProfile.current = key;
    const preset = quality.profile?.spec.export;
    if (preset) setOptions(o => ({ ...o, ...(preset.alpha ? { alpha: preset.alpha } : {}),
      ...(preset.format === "png-seq" ? { format: "png-seq" } : preset.format === "webm" ? { format: "webm-vp9" } : {}) }));
  }, [quality.profile, open]);
  useEffect(() => () => { if (ready) URL.revokeObjectURL(ready.url); }, [ready]);
  const validation = alphaExportError(state, composition, options);
  const range = alphaRange(composition, options);
  const occurrence = Object.values(state.occurrences).find(o => o.variantId === composition.variantId && o.active);
  const number = occurrence ? sceneNumberOf(state, occurrence) : null;
  const scene = number ? L(`Scene ${number} ${composition.name}`, `Scene ${number} ${composition.name}`) : composition.name;
  const patch = (p: Partial<AlphaExportSettings>) => setOptions(o => ({ ...o, ...p }));
  async function cancellable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) throw new DOMException(L("Avbrutt", "Cancelled"), "AbortError");
    let stop: (() => void) | undefined;
    try {
      return await Promise.race([promise, new Promise<never>((_, reject) => {
        stop = () => reject(new DOMException(L("Avbrutt", "Cancelled"), "AbortError"));
        signal.addEventListener("abort", stop, { once: true });
      })]);
    } finally { if (stop) signal.removeEventListener("abort", stop); }
  }

  async function run() {
    if (validation || busy) return;
    const snapshot = quality.profile ? qualityProfileSnapshot(quality.profile) : null;
    const ctrl = new AbortController(); abort.current = ctrl;
    setError(null); setReady(null); setProgress({ done: 0, total: range.end - range.start });
    taskId.current = exportQueue.enqueue(scene, async (signal, report) => {
    signal.addEventListener("abort", () => ctrl.abort(), { once: true });
    if (signal.aborted) ctrl.abort();
    let sink: Awaited<ReturnType<typeof openAlphaSink>> | null = null;
    try {
      try { localStorage.setItem(storageKey, JSON.stringify(options)); } catch { /* Session only. */ }
      const base = alphaFileBase(scene, layers.filter(l => options.layerIds.includes(l.id)).map(l => l.name), range.start, range.end);
      const png = options.format === "png-seq";
      sink = await openAlphaSink(`${base}.${png ? "zip" : "webm"}`, png ? "application/zip" : "video/webm");
      // Rig parts can refer to other versions; include those media in the usual image loader.
      const paths = [...new Set([...layers.flatMap(l => layerVersions(state, l).map(v => v.mediaPath)),
        ...Object.values(state.animationRigVersions).flatMap(v => Object.values(v.spec.parts ?? {}).flatMap(p => {
          const image = p.versionId ? state.assetVersions[p.versionId] : undefined;
          return image ? [image.mediaPath] : [];
        }))])];
      const urls = paths.length ? await cancellable(signedUrls(paths, 4 * 60 * 60), ctrl.signal) : {};
      const { images, failed } = await cancellable(loadImages(urls), ctrl.signal);
      if (failed.length) throw new Error(L("Noen bilder kunne ikke lastes. Prøv igjen før eksport.", "Some images could not be loaded. Retry before exporting."));
      await exportAlphaLayers({ state, composition, settings: options, images, sink, fileBase: base,
        signal: ctrl.signal, onProgress: (done, total) => { setProgress({ done, total }); report(done, total); } });
      setReady(sink.link?.() ?? null);
    } catch (e) {
      await sink?.abort().catch(() => undefined);
      setError((e as Error).name === "AbortError" ? L("Eksporten er avbrutt. Ingen fil er lagret.", "Export cancelled. No file was saved.") : (e as Error).message);
      throw e;
    } finally { setProgress(null); abort.current = null; }
    }, snapshot);
  }
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-xl border-border bg-surface-2" data-testid="alpha-export-dialog">
      <DialogHeader>
        <DialogTitle>{L("Eksporter lag med gjennomsiktighet", "Export layers with transparency")}</DialogTitle>
        <DialogDescription>{scene}</DialogDescription>
      </DialogHeader>
      <QualityProfilePicker state={state} value={quality.choice} disabled={busy} onChange={v => { quality.setChoice(v); const id = v === "active" ? state.project.activeQualityProfileId : v; const preset = id && v !== "none" ? state.qualityProfiles[id]?.spec.export : null; if (preset) patch({ ...(preset.alpha ? {alpha:preset.alpha} : {}), ...(preset.format === "png-seq" ? {format:"png-seq"} : preset.format === "webm" ? {format:"webm-vp9"} : {}) }); }} />
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4 text-xs text-text-secondary">
        <div className="flex flex-col gap-2">
          <span>{L("Lag", "Layers")}</span>
          <div className="max-h-48 overflow-y-auto border border-border p-2">
            {layers.map(l => <label key={l.id} className="flex items-center gap-2 py-1">
              <input type="checkbox" data-testid={`alpha-layer-${l.id}`} checked={options.layerIds.includes(l.id)}
                onChange={e => patch({ layerIds: e.target.checked ? [...options.layerIds, l.id] : options.layerIds.filter(id => id !== l.id) })} />
              <span className="break-words">{l.name}</span>
            </label>)}
          </div>
        </div>
        <label className="flex items-center justify-between gap-3">{L("Tidsrom", "Range")}
          <select className={control} data-testid="alpha-range" value={options.range} onChange={e => patch({ range: e.target.value as AlphaExportSettings["range"] })}>
            <option value="scene">{L("Hele scenen", "Whole scene")}</option>
            <option value="in-out">{L("Inn/ut", "In/out")}</option>
          </select>
        </label>
        {options.range === "in-out" ? <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">{L("Inn (bilde)", "In (frame)")}<input className={control} data-testid="alpha-in" type="number" min={0} max={composition.durationFrames - 1} value={options.inFrame} onChange={e => patch({ inFrame: Number(e.target.value) })} /></label>
          <label className="flex flex-col gap-1">{L("Ut (første bilde utenfor)", "Out (first excluded frame)")}<input className={control} data-testid="alpha-out" type="number" min={1} max={composition.durationFrames} value={options.outFrame} onChange={e => patch({ outFrame: Number(e.target.value) })} /></label>
        </div> : null}
        <label className="flex items-center gap-2"><input type="checkbox" data-testid="alpha-effects" checked={options.effects} onChange={e => patch({ effects: e.target.checked })} />{L("Med effekter", "Include effects")}</label>
        <label className="flex items-center justify-between gap-3">{L("Format", "Format")}
          <select className={control} data-testid="alpha-format" value={options.format} onChange={e => patch({ format: e.target.value as AlphaExportSettings["format"] })}>
            <option value="png-seq">{L("PNG-sekvens i ZIP", "PNG sequence in ZIP")}</option>
            <option value="webm-vp9" disabled={support !== true}>{L("WebM VP9 med alfa", "WebM VP9 with alpha")}</option>
          </select>
        </label>
        {support !== true ? <p role="status" data-testid="alpha-webm-unavailable">{support === null ? L("Kontrollerer WebM-alfastøtte …", "Checking WebM alpha support …") : L("WebM VP9 med alfa støttes ikke i denne nettleseren. Velg PNG-sekvens.", "WebM VP9 with alpha is not supported in this browser. Choose a PNG sequence.")}</p> : null}
        <label className="flex items-center justify-between gap-3">{L("Alfa", "Alpha")}
          <select className={control} data-testid="alpha-mode" value={options.alpha} onChange={e => patch({ alpha: e.target.value as AlphaExportSettings["alpha"] })}>
            <option value="straight">{L("Rett (standard for PNG)", "Straight (PNG default)")}</option>
            <option value="premultiplied">{L("Premultiplisert", "Premultiplied")}</option>
          </select>
        </label>
        <p>{L("Rett alfa beholder fargene i kanten. Premultiplisert alfa ganger fargene med gjennomsiktigheten; velg samme tolkning i programmet som leser filen.", "Straight alpha preserves edge colours. Premultiplied alpha multiplies colours by opacity; use the matching interpretation in the program reading the file.")}</p>
      </fieldset>
      {validation ? <p role="alert" className="text-xs text-status-danger">{validation}</p> : null}
      {error ? <p role="alert" data-testid="alpha-error" className="text-xs text-status-danger">{error}</p> : null}
      {progress ? <div role="status" data-testid="alpha-progress" className="text-xs text-text-primary">
        {L(`Eksporterer ${progress.done} av ${progress.total} bilder`, `Exporting ${progress.done} of ${progress.total} frames`)}
        <progress className="mt-2 w-full" value={progress.done} max={progress.total} />
      </div> : null}
      {ready && quality.profile ? <p data-testid="alpha-quality-profile" className="text-xs text-text-secondary">{L(`Laget med profil ${quality.profile.name}`, `Made with profile ${quality.profile.name}`)}</p> : null}
      {ready ? <a data-testid="alpha-download" className="text-xs text-accent-brand underline" href={ready.url} download={ready.name}>{L("Last ned", "Download")}</a> : null}
      <DialogFooter>
        <Button variant="ghost" data-testid="alpha-cancel" onClick={() => busy && taskId.current ? exportQueue.cancel(taskId.current) : onOpenChange(false)}>{busy ? L("Avbryt", "Cancel") : L("Lukk", "Close")}</Button>
        <Button data-testid="alpha-start" disabled={busy || !!validation || (options.format === "webm-vp9" && support !== true)} onClick={() => void run()}><Download />{L("Eksporter", "Export")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}