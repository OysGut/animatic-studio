import { useEffect, useMemo, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectState } from "@/core/model";
import type { FilmClip } from "@/core/assembly/film";
import type { ExportImageSource } from "@/core/storyboard/playback";
import { PRINT_FIELDS, PRINT_PAPERS, panelPrintRows, printTable, type PrintField, type PrintOptions, type PrintPaper } from "@/core/storyboard/print";
import { t } from "@/core/i18n/keyed";
import { getUiLanguage } from "@/core/i18n";
import { resolveSettings } from "@/core/settings/resolve";
import { useMyAccount } from "@/app/account/use-account";
import { signedUrls } from "@/app/library/asset-images";
import { prepareDownload, type ReadyFile } from "@/app/download";

export function printLabels(): Record<string, string> {
  return { panel: t("sb6.panel"), scene: t("sb6.scene"), shot: t("sb6.shot"), duration: t("sb6.duration"), dialogue: t("sb6.dialogue"), action: t("sb6.action"), camera: t("sb6.camera"), movement: t("sb6.movement"), sound: t("sb6.sound"), notes: t("sb6.notes"), status: t("sb6.status"), durationFrames: t("sb6.frames"), timecode: t("sb6.timecode"), sketch: t("sb8.canvas"), note: t("sb6.note"), arrow: t("sb6.arrow"), camera_mark: t("sb6.camera-mark") };
}
export function StoryboardPrintExport({ state, clips, imageSource, language, disabled }: {
  state: ProjectState; clips: readonly FilmClip[]; imageSource: ExportImageSource; language: string; disabled: boolean;
}) {
  const account = useMyAccount();
  const [paper, setPaper] = useState<PrintPaper>("A4");
  const paperTouched = useRef(false);
  useEffect(() => { if (!paperTouched.current) setPaper(resolveSettings({ country: account.data?.country ?? null }).paper.value); }, [account.data?.country]);
  const [landscape, setLandscape] = useState(false);
  const [perPage, setPerPage] = useState<3 | 6 | 9>(6);
  const [fields, setFields] = useState<readonly PrintField[]>(PRINT_FIELDS);
  const [layers, setLayers] = useState<PrintOptions["layers"]>({ sketch: true, note: true, arrow: true, camera_mark: true });
  const [version, setVersion] = useState("1");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [ready, setReady] = useState<ReadyFile | null>(null);
  const [error, setError] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const uiLanguage = getUiLanguage();
  const rows = useMemo(() => panelPrintRows(state, clips, (area, status) => `${t(`sb2.area.${area}`)}: ${t(`sb2.status.${status.replaceAll("_", "-")}`)}`), [state, clips, uiLanguage]);
  const labels = printLabels();
  useEffect(() => () => { if (ready) URL.revokeObjectURL(ready.url); }, [ready]);
  useEffect(() => () => abort.current?.abort(), []);
  async function start(kind: "print" | "pitch" | "csv" | "xlsx") {
    const ctrl = new AbortController(); abort.current = ctrl; setReady(null); setError(false); setProgress({ done: 0, total: rows.length });
    try {
      const { storyboardPdf, storyboardXlsx, storyboardCsv } = await import("@/engine/export/storyboard-print");
      const report = (done: number, total: number) => setProgress({ done, total });
      const table = printTable(rows, fields, labels);
      let blob: Blob;
      if (kind === "csv") blob = await storyboardCsv(table, ctrl.signal, report);
      else if (kind === "xlsx") blob = await storyboardXlsx(table, ctrl.signal, report);
      else blob = await storyboardPdf({ state, clips, source: imageSource, rows,
        options: { paper, landscape, perPage: kind === "pitch" ? 1 : perPage, fields: kind === "pitch" ? ["panel", "dialogue", "action"] : fields, layers },
        labels, language, version, date: new Intl.DateTimeFormat(getUiLanguage()).format(new Date()),
        signal: ctrl.signal, urls: paths => signedUrls([...paths], 3600), progress: report });
      if (!ctrl.signal.aborted) setReady(prepareDownload([new Uint8Array(await blob.arrayBuffer())], `${state.project.name.replace(/[\\/:*?"<>|]/g, "-")}-storyboard-${kind}.${kind === "print" || kind === "pitch" ? "pdf" : kind}`, blob.type));
    } catch { if (!ctrl.signal.aborted) setError(true); }
    finally { abort.current = null; setProgress(null); }
  }
  const off = disabled || !!progress;
  const control = "h-8 max-w-full rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary";
  return <section data-testid="sb6-export" className="flex min-w-0 flex-col gap-3">
    <h3 className="text-sm font-semibold text-text-primary">{t("sb6.title")}</h3>
    <fieldset disabled={off} className="flex min-w-0 flex-wrap gap-3">
      <label className="flex flex-col gap-1 text-xs">{t("sb6.paper")}<select data-testid="sb6-paper" className={control} value={paper} onChange={e => { paperTouched.current = true; setPaper(e.target.value as PrintPaper); }}>{Object.keys(PRINT_PAPERS).map(p => <option key={p}>{p}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs">{t("sb6.orientation")}<select data-testid="sb6-orientation" className={control} value={landscape ? "landscape" : "portrait"} onChange={e => setLandscape(e.target.value === "landscape")}><option value="portrait">{t("sb6.portrait")}</option><option value="landscape">{t("sb6.landscape")}</option></select></label>
      <label className="flex flex-col gap-1 text-xs">{t("sb6.per-page")}<select data-testid="sb6-per-page" className={control} value={perPage} onChange={e => setPerPage(Number(e.target.value) as 3 | 6 | 9)}>{[3, 6, 9].map(n => <option key={n}>{n}</option>)}</select></label>
      <label className="flex min-w-0 flex-col gap-1 text-xs">{t("sb6.version")}<input data-testid="sb6-version" className={control + " w-24"} value={version} maxLength={80} onChange={e => setVersion(e.target.value)} /></label>
    </fieldset>
    <fieldset disabled={off} className="flex flex-wrap gap-x-4 gap-y-2"><legend className="mb-2 text-xs font-medium">{t("sb6.fields")}</legend>{PRINT_FIELDS.map(field => <label key={field} className="flex items-center gap-2 text-xs"><input type="checkbox" data-testid={`sb6-field-${field}`} checked={fields.includes(field)} onChange={e => setFields(e.target.checked ? PRINT_FIELDS.filter(f => fields.includes(f) || f === field) : fields.filter(f => f !== field))} />{labels[field]}</label>)}</fieldset>
    <fieldset disabled={off} className="flex flex-wrap gap-x-4 gap-y-2"><legend className="mb-2 text-xs font-medium">{t("sb6.layers")}</legend>{(Object.keys(layers) as (keyof typeof layers)[]).map(kind => <label key={kind} className="flex items-center gap-2 text-xs"><input type="checkbox" data-testid={`sb6-layer-${kind}`} checked={layers[kind]} onChange={e => setLayers({ ...layers, [kind]: e.target.checked })} />{labels[kind]}</label>)}</fieldset>
    <div className="grid grid-cols-1 gap-3 @min-[560px]:grid-cols-3">{(["print", "pitch", "shotlist"] as const).map(kind => <div key={kind} data-testid={`sb6-card-${kind}`} className="flex min-w-0 flex-col gap-3 rounded-sm border border-border bg-surface-1 p-3"><h4 className="text-sm font-semibold">{kind === "print" ? t("sb6.print") : kind === "pitch" ? t("sb6.pitch") : t("sb6.shotlist")}</h4><div className="mt-auto flex flex-wrap gap-2">{(kind === "shotlist" ? ["csv", "xlsx"] as const : [kind]).map(format => <Button key={format} size="sm" variant="outline" data-testid={`sb6-export-${format}`} disabled={off || !rows.length} onClick={() => void start(format as "print" | "pitch" | "csv" | "xlsx")}><Download />{format === "csv" ? "CSV" : format === "xlsx" ? "XLSX" : "PDF"}</Button>)}</div></div>)}</div>
    {progress ? <div className="flex items-center gap-2"><progress max={progress.total} value={progress.done} className="min-w-0 flex-1" /><span role="status" className="text-xs">{progress.done} / {progress.total}</span><Button size="icon" variant="ghost" aria-label={t("ptg1.cancel")} onClick={() => abort.current?.abort()}><X /></Button></div> : null}
    {ready ? <a data-testid="sb6-download" href={ready.url} download={ready.name} className="break-all text-xs text-text-primary">{ready.name}</a> : null}
    {error ? <p role="alert" className="text-xs text-status-danger">{t("ptg1.export-failed")}</p> : null}
  </section>;
}