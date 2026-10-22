/**
 * Rigg runde 5 (B-087 §2–§3, §13–§14): utskriftsjobb med batch og kopier. Felles innstillinger gjelder hele
 * jobben (A14); hver kopi får egen frame/tid, merknad, opp-pil og QR-kode. Ingen deduplisering (A1–A3).
 * «Lag PDF» lagrer jobben (angres som ett steg), lager kopiene (pepret kode i databasen) og én PDF.
 * En lagret jobb kan åpnes igjen og skrives ut på nytt med de samme kodene.
 */
import { useMemo, useState } from "react";

import type { Command, CompositionLayer, ProjectState } from "@/core";
import { newId } from "@/core";
import { layerVersion } from "@/core/composition/render";
import { planPrint, type PrintInput, type PrintItem } from "@/core/print/pdf";
import {
  DEFAULT_JOB_SETTINGS, frameRange, frameRangeTimes, frameTimeLabel, jobPrintItems, jobTotals, planCopies,
  printJobError, thisFrameTimes, validDuplexOffset, copyLookupPath,
  type CopyResolved, type PrintJobElement, type PrintJobSettings, type QrCorner, type QrPlacement,
} from "@/core/print/job";
import { t } from "@/core/i18n/keyed";
import { useUiPref } from "@/app/account/ui-prefs";
import { Button } from "@/components/ui/button";
import { issuePrintCopies } from "@/adapters/browser/print-copies";
import { renderDuplexTestSheet, renderPdf, type CopyQr } from "@/engine/export/rig-pdf";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const validSettings = (v: unknown): v is Partial<PrintJobSettings> => isObj(v);
type Offsets = Record<string, { x: number; y: number }>;
const validOffsets = (v: unknown): v is Offsets =>
  isObj(v) && Object.values(v).every((o) => isObj(o) && validDuplexOffset(o as { x: number; y: number }));

/** Kopiene viser alle felles felt; scenefilteret fra runde 4 gjelder ikke i en jobb. */
const sceneFree = (i: PrintItem): PrintItem => ({ ...i, fields: (i.fields ?? []).map(({ sceneId: _s, ...f }) => f) });

function cornerLabel(c: QrCorner): string {
  switch (c) {
    case "top-left": return t("print-job.corner-top-left");
    case "top-right": return t("print-job.corner-top-right");
    case "bottom-left": return t("print-job.corner-bottom-left");
    case "bottom-right": return t("print-job.corner-bottom-right");
    case "center": return t("print-job.corner-center");
  }
}
function errorLabel(key: string): string {
  switch (key) {
    case "print-job.empty": return t("print-job.empty");
    case "print-job.too-many": return t("print-job.too-many");
    case "print-job.copies": return t("print-job.copies");
    case "print-job.frame": return t("print-job.frame");
    case "print-job.note": return t("print-job.note");
    case "print-job.stroke": return t("print-job.stroke");
    case "print-job.scale": return t("print-job.scale");
    default: return t("print-job.invalid");
  }
}

async function qrModules(text: string): Promise<CopyQr["modules"]> {
  const m = await import("qrcode");
  const q = m.create(text, { errorCorrectionLevel: "M" });
  const size = q.modules.size;
  return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => !!q.modules.get(y, x)));
}

export function PrintJobSection({
  state, layer, frame, baseItem, input, loadImage, onSave, editable, sceneLabel,
}: {
  state: ProjectState;
  layer: CompositionLayer;
  frame: number;
  /** Figuren fra runde 4 (kontur, størrelse, modus, felles felt). */
  baseItem: PrintItem;
  /** Papir, marger, kalibrering og språk fra utskriftspanelet. */
  input: Omit<PrintInput, "items">;
  loadImage: () => Promise<PrintItem["image"]>;
  onSave: (c: Command, label: string) => string | null;
  editable: boolean;
  sceneLabel: string;
}) {
  const [saved, setSaved] = useUiPref<Partial<PrintJobSettings>>("rigPrintJob", {}, validSettings);
  const settings: PrintJobSettings = { ...DEFAULT_JOB_SETTINGS, ...saved, mode: baseItem.mode, strokeWidthMm: baseItem.strokeWidthMm ?? 0.1, fields: baseItem.fields ?? [],
    // Papir, retning og marger kommer fra utskriftspanelet og lagres på jobben (§13).
    ...(input.paper ? { paper: input.paper } : {}), ...(input.orientation ? { orientation: input.orientation } : {}),
    margins: { ...DEFAULT_JOB_SETTINGS.margins, ...input.margins } };
  const set = (patch: Partial<PrintJobSettings>) => setSaved({ ...saved, ...patch });
  const [offsets, setOffsets] = useUiPref<Offsets>("rigDuplexOffsets", {}, validOffsets);
  const [printer, setPrinter] = useState(() => Object.keys(offsets)[0] ?? "");
  const offset = offsets[printer] ?? { x: 0, y: 0 };
  const comp = state.compositions[layer.compositionId];
  const variant = comp && state.variants[comp.variantId];
  const sceneId = variant?.sceneId ?? "";
  const fps = state.project.fps.num / state.project.fps.den;

  const jobs = Object.values(state.printJobs ?? {}).filter((j) => !j.removed && Object.values(state.printJobElements ?? {}).some((e) => e.jobId === j.id && !e.removed && e.layerId === layer.id));
  const [jobId, setJobId] = useState<string | null>(null);
  const [name, setName] = useState(layer.name);
  const [elements, setElements] = useState<PrintJobElement[]>([]);
  const [n, setN] = useState(1);
  const [from, setFrom] = useState(frame);
  const [to, setTo] = useState(frame);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const base = { layerId: layer.id, versionId: "", sceneId, maskId: null, note: "", upArrow: baseItem.upArrow ?? true };
  // Hver frame peker til bildet laget faktisk viser der (bildeskift gir ulike kildeversjoner).
  const add = (els: PrintJobElement[]) => setElements([...elements, ...els.map((e) => ({ ...e, versionId: layerVersion(state, layer, e.frame)?.id ?? "" }))]);
  const open = (id: string) => {
    const job = state.printJobs?.[id];
    if (!job) return;
    setJobId(id);
    setName(job.name);
    setSaved({ ...saved, ...job.settings });
    setElements(Object.values(state.printJobElements ?? {}).filter((e) => e.jobId === id && !e.removed).sort((a, b) => a.position - b.position));
  };

  const resolve = (els: readonly PrintJobElement[], copies = planCopies(els, [], () => newId())): CopyResolved[] =>
    copies.map((copy) => {
      const element = els.find((e) => e.id === copy.elementId)!;
      return {
        copy, element,
        frameLabel: t("print-job.frame-label", { frame: element.frame, time: frameTimeLabel(element.frame, fps) }),
        idLabel: sceneLabel,
        item: { sceneId, size: baseItem.size, contour: baseItem.contour, ...(baseItem.image ? { image: baseItem.image } : {}), ...(baseItem.cutHoles !== undefined ? { cutHoles: baseItem.cutHoles } : {}), ...(baseItem.rotationDeg !== undefined ? { rotationDeg: baseItem.rotationDeg } : {}) },
      };
    });
  const preview = useMemo(() => {
    if (!elements.length) return null;
    try {
      const items = jobPrintItems(settings, resolve(elements)).map(sceneFree);
      return planPrint({ ...input, items });
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(elements), JSON.stringify(settings), JSON.stringify(input)]);
  const totals = jobTotals(elements, preview ? preview.sheets.length + (settings.qr === "back" && settings.duplex ? preview.sheets.filter((s) => s.kind === "figures").length : 0) : 0);
  const error = elements.length ? printJobError(settings, elements) : null;

  const create = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const id = jobId ?? newId();
      const failure = onSave({ type: "SavePrintJob", job: { id, name: name.trim() || layer.name, settings }, elements }, t("print-job.save-label"));
      if (failure) throw new Error(failure);
      setJobId(id);
      // Jobben lagres i bakgrunnen: vent til den finnes før kopiene lages
      let codes = null;
      for (let i = 0; i < 30 && !codes; i++) {
        codes = await issuePrintCopies(state.project.id, id).catch((e: Error) => {
          if (i === 29) throw e;
          return null;
        });
        if (!codes) await new Promise((r) => setTimeout(r, 500));
      }
      if (!codes) throw new Error();
      const image = baseItem.mode === "contour" ? undefined : await loadImage();
      const copies = codes.map((c) => ({ id: c.copyId, elementId: c.elementId, copyNumber: c.copyNumber }));
      const resolved = resolve(elements, copies).map((r) => ({ ...r, item: { ...r.item, ...(image ? { image } : {}) } }));
      const items = jobPrintItems(settings, resolved).map(sceneFree);
      const qr = new Map<string, CopyQr>();
      for (const c of codes) qr.set(c.copyId, { modules: await qrModules(`${window.location.origin}${copyLookupPath(c.key)}`), shortCode: c.shortCode });
      renderPdf(planPrint({ ...input, items }), { settings, qr, offset }).save(`${(name || layer.name).replace(/[^\p{L}\p{N}_-]/gu, "_")}-${codes.length}.pdf`);
      setMessage(t("print-job.done", { count: codes.length }));
    } catch {
      setMessage(t("print-job.failed"));
    } finally {
      setBusy(false);
    }
  };

  const num = (v: string, min: number) => Math.max(min, Math.floor(Number(v) || min));
  const cls = "block border border-border bg-surface-3 p-1";
  return (
    <section data-testid="print-job" className="mt-3 border-t border-border pt-3">
      <h4 className="mb-2 font-semibold text-text-primary">{t("print-job.title")}</h4>
      {jobs.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2" data-testid="print-job-saved">
          {jobs.map((j) => (
            <Button key={j.id} size="sm" variant="outline" data-testid={`print-job-open-${j.id}`} onClick={() => open(j.id)}>
              {t("print-job.reopen", { name: j.name })}
            </Button>
          ))}
        </div>
      )}
      <label className="mb-2 block">
        {t("print-job.name")}
        <input data-testid="print-job-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className={cls} />
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <label>
          {t("print-job.copies")}
          <input data-testid="print-job-n" type="number" min={1} max={200} value={n} onChange={(e) => setN(num(e.target.value, 1))} className={`${cls} w-20`} />
        </label>
        <Button size="sm" data-testid="print-job-add-frame" onClick={() => add(thisFrameTimes(base, frame, n, () => newId()))}>
          {t("print-job.add-frame", { frame, count: n })}
        </Button>
        <label>
          {t("print-job.from")}
          <input data-testid="print-job-from" type="number" min={0} value={from} onChange={(e) => setFrom(num(e.target.value, 0))} className={`${cls} w-20`} />
        </label>
        <label>
          {t("print-job.to")}
          <input data-testid="print-job-to" type="number" min={0} value={to} onChange={(e) => setTo(num(e.target.value, 0))} className={`${cls} w-20`} />
        </label>
        <Button size="sm" data-testid="print-job-add-range" onClick={() => add(frameRange(base, from, to, () => newId()))}>
          {t("print-job.add-range")}
        </Button>
        <Button size="sm" data-testid="print-job-add-range-n" onClick={() => add(frameRangeTimes(base, from, to, n, () => newId()))}>
          {t("print-job.add-range-n", { count: n })}
        </Button>
      </div>
      {elements.length > 0 && (
        <ul data-testid="print-job-elements" className="my-2 max-h-48 overflow-auto">
          {elements.map((e, i) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 py-0.5">
              <span>{t("print-job.element", { frame: e.frame })}</span>
              <input aria-label={t("print-job.copies")} type="number" min={1} max={200} value={e.copies} onChange={(ev) => setElements(elements.map((x, k) => (k === i ? { ...x, copies: num(ev.target.value, 1) } : x)))} className="w-16 border border-border bg-surface-3 p-0.5" />
              <input aria-label={t("print-job.note")} placeholder={t("print-job.note")} value={e.note} maxLength={500} onChange={(ev) => setElements(elements.map((x, k) => (k === i ? { ...x, note: ev.target.value } : x)))} className="w-40 border border-border bg-surface-3 p-0.5" />
              <label><input type="checkbox" checked={e.upArrow} onChange={(ev) => setElements(elements.map((x, k) => (k === i ? { ...x, upArrow: ev.target.checked } : x)))} /> {t("app-print.arrow")}</label>
              <Button size="sm" variant="ghost" aria-label={t("print-job.remove")} onClick={() => setElements(elements.filter((_, k) => k !== i))}>×</Button>
            </li>
          ))}
        </ul>
      )}
      <fieldset className="my-2 flex flex-wrap gap-3">
        <legend>{t("print-job.shared")}</legend>
        <label>
          {t("print-job.qr")}
          <select data-testid="print-job-qr" value={settings.qr} onChange={(e) => set({ qr: e.target.value as QrPlacement, ...(e.target.value === "back" ? { duplex: true } : {}) })} className={cls}>
            <option value="outside">{t("print-job.qr-outside")}</option>
            <option value="figure">{t("print-job.qr-figure")}</option>
            <option value="back">{t("print-job.qr-back")}</option>
          </select>
        </label>
        {settings.qr === "figure" && (
          <label>
            {t("print-job.qr-corner")}
            <select data-testid="print-job-qr-corner" value={settings.qrCorner} onChange={(e) => set({ qrCorner: e.target.value as QrCorner })} className={cls}>
              {(["top-left", "top-right", "bottom-left", "bottom-right", "center"] as const).map((c) => (
                <option key={c} value={c}>{cornerLabel(c)}</option>
              ))}
            </select>
          </label>
        )}
        <label><input data-testid="print-job-copy-number" type="checkbox" checked={settings.copyNumber} onChange={(e) => set({ copyNumber: e.target.checked })} /> {t("print-job.copy-number")}</label>
        <label><input data-testid="print-job-id-text" type="checkbox" checked={settings.idText} onChange={(e) => set({ idText: e.target.checked })} /> {t("print-job.id-text")}</label>
        <label><input data-testid="print-job-duplex" type="checkbox" checked={settings.duplex} onChange={(e) => set({ duplex: e.target.checked })} /> {t("print-job.duplex")}</label>
      </fieldset>
      {settings.qr === "figure" && <p role="note" data-testid="print-job-qr-visible" className="text-status-warning">{t("print-job.qr-visible")}</p>}
      {settings.duplex && (
        <fieldset data-testid="print-job-duplex-settings" className="my-2 flex flex-wrap items-end gap-3">
          <legend>{t("print-job.duplex")}</legend>
          <label>
            {t("print-job.flip")}
            <select data-testid="print-job-flip" value={settings.flip} onChange={(e) => set({ flip: e.target.value as "long" | "short" })} className={cls}>
              <option value="long">{t("print-job.flip-long")}</option>
              <option value="short">{t("print-job.flip-short")}</option>
            </select>
          </label>
          <label>
            {t("print-job.printer")}
            <input data-testid="print-job-printer" value={printer} maxLength={80} onChange={(e) => setPrinter(e.target.value)} className={cls} />
          </label>
          {(["x", "y"] as const).map((k) => (
            <label key={k}>
              {k === "x" ? t("print-job.offset-x") : t("print-job.offset-y")}
              <input data-testid={`print-job-offset-${k}`} type="number" step={0.1} min={-20} max={20} value={offset[k]} onChange={(e) => { const v = Number(e.target.value); const next = { ...offset, [k]: v }; if (validDuplexOffset(next)) setOffsets({ ...offsets, [printer]: next }); }} className={`${cls} w-20`} />
            </label>
          ))}
          <Button size="sm" variant="outline" data-testid="print-job-test-sheet" onClick={() => { const p = preview ?? planPrint({ ...input, items: [{ ...baseItem, fields: [] }] }); renderDuplexTestSheet(p, settings.flip, input.language).save("duplex-test.pdf"); }}>
            {t("print-job.test-sheet")}
          </Button>
        </fieldset>
      )}
      <p data-testid="print-job-totals" role="status">{t("print-job.totals", { elements: totals.elements, copies: totals.copies, sheets: totals.sheets })}</p>
      {preview && (
        <div data-testid="print-job-preview" className="my-2 flex flex-wrap gap-2">
          {preview.sheets.slice(0, 3).map((sheet, i) => (
            <svg key={i} viewBox={`0 0 ${preview.width} ${preview.height}`} className="h-40 border border-border bg-surface-1" aria-label={t("print-job.sheet", { number: i + 1 })}>
              <rect {...preview.content} className="fill-none stroke-text-tertiary" strokeDasharray="2 2" strokeWidth={0.5} />
              {sheet.placements.map((p, j) => (
                <g key={j} data-testid="print-job-preview-figure">
                  <rect {...p.rect} className="fill-surface-3 stroke-text-primary" strokeWidth={0.5} />
                  {settings.qr !== "back" && <rect x={settings.qr === "outside" ? p.rect.x : p.rect.x + p.rect.width - 14} y={settings.qr === "outside" ? p.info.rect.y + p.info.lines.length * 4 : p.rect.y + p.rect.height - 14} width={12} height={12} className="fill-text-primary" />}
                </g>
              ))}
            </svg>
          ))}
        </div>
      )}
      {error && <p role="alert">{errorLabel(error)}</p>}
      {message && <p role="status" data-testid="print-job-message">{message}</p>}
      <Button data-testid="print-job-create" data-missing-version={elements.some((e) => !e.versionId) || undefined} data-readonly={!editable || undefined} disabled={!editable || busy || !elements.length || !!error || elements.some((e) => !e.versionId)} onClick={() => void create()}>
        {busy ? t("app-print.busy") : jobId ? t("print-job.reprint") : t("print-job.create")}
      </Button>
    </section>
  );
}
