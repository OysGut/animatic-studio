/**
 * Eksport av animatic (M4 del 1, mandat 14.2, 29.1 og 29.6, DEC-0043): hele filmen, valgt scene eller et
 * utvalg av scener, som video laget i nettleseren – uten AI og uten betalte tjenester (REQ-0213/0416).
 * Før eksporten vises en kontroll (REQ-0422); man kan eksportere selv om noe mangler (REQ-0423).
 * Eksporten endrer ingenting i prosjektet.
 */
import { AlertTriangle, CheckCircle2, Download, Info } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  filmRange,
  formatHeading,
  formatTimecode,
  framesToSeconds,
  layerVersion,
  layersOf,
  orderedOccurrences,
  type FilmClip,
  type FilmRange,
  type ProjectState,
} from "@/core";
import { ExportError, canExportVideo, exportAnimatic, loadImages } from "@/engine/export/animatic";
import { isEmbedded, prepareDownload, type ReadyFile } from "@/app/download";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatSeconds } from "./FilmTimeline";

type Scope = "film" | "selected" | "range";
type Size = "full" | "half";

interface Check {
  readonly level: "ok" | "info" | "warn";
  readonly text: string;
}

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, "-").trim();
}

export function ExportAnimaticDialog({
  open,
  onOpenChange,
  state,
  productionId,
  clips,
  selectedId,
  urls,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  productionId: string;
  clips: readonly FilmClip[];
  selectedId: string | null;
  /** Mediesti → signert lenke for bildene i filmen (null mens de hentes). */
  urls: Readonly<Record<string, string>> | null;
}) {
  const [scope, setScope] = useState<Scope>("film");
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [size, setSize] = useState<Size>("full");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<(ReadyFile & { bytes: number }) | null>(null);
  const abort = useRef<AbortController | null>(null);

  // Standardvalg hver gang dialogen åpnes
  useEffect(() => {
    if (!open) return;
    setReady(null);
    setError(null);
    setProgress(null);
    const first = clips[0]?.occurrenceId ?? "";
    const last = clips[clips.length - 1]?.occurrenceId ?? "";
    setFromId(selectedId ?? first);
    setToId(last);
    if (scope === "selected" && !selectedId) setScope("film");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(
    () => () => {
      if (ready) URL.revokeObjectURL(ready.url);
    },
    [ready],
  );
  // Lukkes dialogen under eksport: avbryt
  useEffect(() => {
    if (!open) abort.current?.abort();
  }, [open]);

  const range: FilmRange =
    scope === "film"
      ? { kind: "film" }
      : scope === "selected"
        ? { kind: "scenes", fromOccurrenceId: selectedId ?? "", toOccurrenceId: selectedId ?? "" }
        : { kind: "scenes", fromOccurrenceId: fromId, toOccurrenceId: toId };
  const sel = useMemo(() => filmRange(clips, range), [clips, scope, fromId, toId, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fps = state.project.fps;
  const fullW = state.project.frameWidth;
  const fullH = state.project.frameHeight;
  const outW = size === "full" ? fullW : Math.round(fullW / 2);
  const outH = size === "full" ? fullH : Math.round(fullH / 2);

  // Eksportkontroll (mandat 29.6): sceneorden, skjulte scener, materiale og manglende filer
  const { checks, paths } = useMemo(() => {
    const out: Check[] = [];
    const n = sel.clips.length;
    out.push({
      level: n > 0 ? "ok" : "warn",
      text:
        n > 0
          ? `${n} ${n === 1 ? "scene" : "scener"} i manusets rekkefølge, ${formatSeconds(
              framesToSeconds(sel.endFrame - sel.startFrame, fps),
            )}.`
          : "Utvalget har ingen scener.",
    });
    if (scope === "film") {
      const inactive = orderedOccurrences(state, productionId).filter((o) => !o.active).length;
      if (inactive > 0)
        out.push({
          level: "info",
          text: `${inactive} ${inactive === 1 ? "deaktivert scene er" : "deaktiverte scener er"} ikke med.`,
        });
    }
    const placeholders = sel.clips.filter((c) => c.source === "placeholder");
    if (placeholders.length > 0)
      out.push({
        level: "warn",
        text: `${placeholders.length} ${
          placeholders.length === 1 ? "scene" : "scener"
        } uten 2D-scene vises som tittelkort (${placeholders
          .slice(0, 4)
          .map((c) => c.productionNumber ?? formatHeading(c.heading))
          .join(", ")}${placeholders.length > 4 ? " …" : ""}).`,
      });
    const estimated = sel.clips.filter((c) => c.durationKind === "estimate").length;
    if (estimated > 0)
      out.push({
        level: "info",
        text: `${estimated} ${estimated === 1 ? "scene har" : "scener har"} lengde beregnet fra manuset.`,
      });
    const need = new Set<string>();
    let missingVersions = 0;
    for (const c of sel.clips) {
      if (!c.compositionId) continue;
      for (const l of layersOf(state, c.compositionId)) {
        if (!l.visible) continue;
        const v = layerVersion(state, l);
        if (v) need.add(v.mediaPath);
        else if (l.assetId !== null) missingVersions++;
      }
    }
    if (missingVersions > 0)
      out.push({
        level: "warn",
        text: `${missingVersions} ${
          missingVersions === 1 ? "lag mangler" : "lag mangler"
        } bilde i biblioteket og blir usynlige.`,
      });
    return { checks: out, paths: [...need] };
  }, [sel, scope, state, productionId, fps]);

  const warnings = checks.some((c) => c.level === "warn");
  const busy = progress !== null && ready === null && error === null;
  const supported = canExportVideo();

  async function run() {
    setError(null);
    setReady(null);
    const ctrl = new AbortController();
    abort.current = ctrl;
    setProgress({ done: 0, total: sel.endFrame - sel.startFrame });
    try {
      const subset: Record<string, string> = {};
      const missingUrl: string[] = [];
      for (const p of paths) {
        const u = urls?.[p];
        if (u) subset[p] = u;
        else missingUrl.push(p);
      }
      const { images, failed } = await loadImages(subset);
      if (ctrl.signal.aborted) throw new DOMException("Avbrutt", "AbortError");
      const file = await exportAnimatic({
        state,
        clips,
        startFrame: sel.startFrame,
        endFrame: sel.endFrame,
        width: outW,
        height: outH,
        fps,
        images,
        signal: ctrl.signal,
        onProgress: (done, total) => {
          if (abort.current === ctrl) setProgress({ done, total });
        },
      });
      // Dialogen ble lukket (eller en ny eksport startet) mens denne pågikk
      if (abort.current !== ctrl || ctrl.signal.aborted) return;
      const date = new Date().toISOString().slice(0, 10);
      const what =
        scope === "film"
          ? "animatic"
          : sel.clips.length === 1
            ? `scene ${sel.clips[0]!.productionNumber ?? ""}`.trim()
            : `scener ${sel.clips[0]!.productionNumber ?? ""}–${sel.clips[sel.clips.length - 1]!.productionNumber ?? ""}`;
      const name = safeName(
        `${state.project.name} – ${what} – ${date}.${file.extension.replace(/^\./, "")}`,
      );
      const f = prepareDownload(file.bytes, name, file.mimeType);
      setReady({ ...f, bytes: file.bytes.byteLength });
      const lost = failed.length + missingUrl.length;
      if (lost > 0)
        setError(
          `Ferdig, men ${lost} ${lost === 1 ? "bilde" : "bilder"} kunne ikke lastes og mangler i videoen.`,
        );
    } catch (e) {
      if (abort.current !== ctrl) return;
      if ((e as Error).name === "AbortError") setProgress(null);
      else
        setError(
          e instanceof ExportError
            ? e.message
            : `Eksporten stoppet: ${(e as Error).message || "ukjent feil"}`,
        );
    } finally {
      if (abort.current === ctrl) abort.current = null;
    }
  }

  const radio = "flex items-start gap-2 text-[13px] text-text-primary";
  const legend = "mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary";
  const select =
    "h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary";
  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px] border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>Eksporter animatic</DialogTitle>
          <DialogDescription>
            Videoen lages her i nettleseren fra 2D-scenene – uten AI og uten kostnader. Eksporten
            endrer ingenting i prosjektet.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-5">
          <fieldset className="flex flex-col gap-2" disabled={busy}>
            <legend className={legend}>Hva</legend>
            <label className={radio}>
              <input
                type="radio"
                name="scope"
                checked={scope === "film"}
                onChange={() => setScope("film")}
                className="mt-1"
              />
              <span>
                Hele filmen
                <span className="block text-xs text-text-tertiary">Alle aktive scener</span>
              </span>
            </label>
            <label className={radio + (selectedId ? "" : " opacity-50")}>
              <input
                type="radio"
                name="scope"
                disabled={!selectedId}
                checked={scope === "selected"}
                onChange={() => setScope("selected")}
                className="mt-1"
              />
              <span>
                Valgt scene
                <span className="block text-xs text-text-tertiary">
                  {selectedId
                    ? (() => {
                        const c = clips.find((x) => x.occurrenceId === selectedId);
                        return c
                          ? `${c.productionNumber ?? ""} ${formatHeading(c.heading)}`.trim()
                          : "–";
                      })()
                    : "Velg en scene i tidslinjen først"}
                </span>
              </span>
            </label>
            <label className={radio}>
              <input
                type="radio"
                name="scope"
                checked={scope === "range"}
                onChange={() => setScope("range")}
                className="mt-1"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                Fra scene til scene
                <span className="flex flex-col gap-1 text-xs text-text-tertiary">
                  <select
                    aria-label="Første scene"
                    value={fromId}
                    onChange={(e) => {
                      setFromId(e.target.value);
                      setScope("range");
                    }}
                    className={select}
                  >
                    {clips.map((c) => (
                      <option key={c.occurrenceId} value={c.occurrenceId}>
                        {c.productionNumber ?? "–"} {formatHeading(c.heading)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Siste scene"
                    value={toId}
                    onChange={(e) => {
                      setToId(e.target.value);
                      setScope("range");
                    }}
                    className={select}
                  >
                    {clips.map((c) => (
                      <option key={c.occurrenceId} value={c.occurrenceId}>
                        {c.productionNumber ?? "–"} {formatHeading(c.heading)}
                      </option>
                    ))}
                  </select>
                </span>
              </span>
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-2" disabled={busy}>
            <legend className={legend}>Størrelse</legend>
            <label className={radio}>
              <input
                type="radio"
                name="size"
                checked={size === "full"}
                onChange={() => setSize("full")}
                className="mt-1"
              />
              <span>
                Full størrelse
                <span className="block text-xs text-text-tertiary">
                  {fullW} × {fullH} px
                </span>
              </span>
            </label>
            <label className={radio}>
              <input
                type="radio"
                name="size"
                checked={size === "half"}
                onChange={() => setSize("half")}
                className="mt-1"
              />
              <span>
                Halv størrelse
                <span className="block text-xs text-text-tertiary">
                  {Math.round(fullW / 2)} × {Math.round(fullH / 2)} px – raskere og mindre fil
                </span>
              </span>
            </label>
            <p className="pt-1 text-xs text-text-tertiary">
              MP4 (H.264) der nettleseren kan, ellers WebM. Uten lyd i denne utgaven.
            </p>
          </fieldset>
        </div>

        <section aria-label="Kontroll før eksport" className="flex flex-col gap-1.5">
          <h3 className={legend}>Kontroll før eksport</h3>
          <ul className="flex flex-col gap-1">
            {checks.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                {c.level === "ok" ? (
                  <CheckCircle2
                    className="mt-px size-3.5 shrink-0 text-status-success"
                    aria-label="OK"
                  />
                ) : c.level === "warn" ? (
                  <AlertTriangle
                    className="mt-px size-3.5 shrink-0 text-status-discrepancy"
                    aria-label="Merk"
                  />
                ) : (
                  <Info className="mt-px size-3.5 shrink-0 text-text-tertiary" aria-label="Info" />
                )}
                {c.text}
              </li>
            ))}
          </ul>
        </section>

        {!supported ? (
          <p role="alert" className="text-xs text-status-danger">
            Denne nettleseren kan ikke lage video. Bruk en nyere utgave av Chrome, Edge, Safari
            eller Firefox.
          </p>
        ) : null}

        {progress && !ready ? (
          <div className="flex flex-col gap-1" aria-live="polite">
            <div
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Fremdrift"
              className="h-1.5 overflow-hidden rounded-full bg-surface-3"
            >
              <div
                className="h-full bg-accent-brand transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-text-tertiary">
              Bilde {progress.done} av {progress.total} ({formatTimecode(progress.done, fps)}) –{" "}
              {pct} %
            </p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-xs text-status-danger">
            {error}
          </p>
        ) : null}

        {ready ? (
          <p
            className="flex flex-wrap items-center gap-2 text-xs text-text-secondary"
            role="status"
          >
            Ferdig: {ready.name} (
            {(ready.bytes / 1024 / 1024).toLocaleString("nb-NO", {
              maximumFractionDigits: 1,
            })}{" "}
            MB).
            <a
              href={ready.url}
              download={ready.name}
              className="inline-flex items-center gap-1 text-accent-brand hover:underline"
            >
              <Download className="size-3.5" aria-hidden />
              Last ned
            </a>
            {isEmbedded() ? (
              <span className="text-text-tertiary">
                Hvis nedlastingen ikke starter: åpne programmet i en egen fane.
              </span>
            ) : null}
          </p>
        ) : null}

        <DialogFooter>
          {busy ? (
            <Button variant="ghost" onClick={() => abort.current?.abort()}>
              Avbryt
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Lukk
            </Button>
          )}
          <Button
            onClick={() => void run()}
            disabled={
              busy || !supported || sel.clips.length === 0 || (urls === null && paths.length > 0)
            }
          >
            <Download />
            {warnings ? "Eksporter likevel" : "Eksporter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
