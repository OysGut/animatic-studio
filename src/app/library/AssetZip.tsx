/**
 * Last ned prosjektets ressurser som zip (DEC-0046): per kategori (karakterer, objekter, lyd, importert
 * film …) eller alt samlet. Brukes før sletting av et prosjekt, for ressursene i et slettet prosjekt og fra
 * ressursbiblioteket.
 */
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ZIP_CATEGORY_LABEL, collation, locale, tm, zipEntries, zipSafeName, zipSummary, type ProjectState, type ZipCategory } from "@/core";
import { fetchProjectState } from "@/adapters/browser/project-data";
import { openZipSink, writeZip, type ZipProgress } from "@/engine/export/zip";
import { signedUrls } from "./asset-images";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t as tk } from "@/core/i18n/keyed";

/** Største zip-fil (formatet uten ZIP64 tåler 4 GB). */
export const ZIP_MAX_BYTES = 3.8 * 1024 * 1024 * 1024;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  if (n < 1024 * 1024 * 1024)
    return `${(n / 1024 / 1024).toLocaleString(locale(), { maximumFractionDigits: 1 })} MB`;
  return `${(n / 1024 / 1024 / 1024).toLocaleString(locale(), { maximumFractionDigits: 2 })} GB`;
}

export function asciiFileName(s: string): string {
  return (
    s
      // i18n-ignore: tegnbytte i filnavn, ikke tekst for brukeren
      .replace(/[æÆ]/g, (c) => (c === "æ" ? "ae" : "Ae"))
      // i18n-ignore
      .replace(/[øØ]/g, (c) => (c === "ø" ? "o" : "O"))
      // i18n-ignore
      .replace(/[åÅ]/g, (c) => (c === "å" ? "a" : "A"))
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7e]+/g, "-")
  );
}

/** Prosjektets innhold for zip-filen (hentes når prosjektet ikke allerede er lastet). */
export function useZipState(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["zip-state", projectId],
    enabled,
    staleTime: 30_000,
    queryFn: () => fetchProjectState(projectId),
  });
}

export function AssetZipPanel({
  state,
  projectName,
  compact = false,
}: {
  state: ProjectState;
  projectName: string;
  /** Uten overskrift (inne i et annet vindu). */
  compact?: boolean;
}) {
  const entries = useMemo(() => zipEntries(state), [state]);
  const summary = useMemo(() => zipSummary(entries), [entries]);
  const [off, setOff] = useState<ReadonlySet<ZipCategory>>(new Set());
  const [progress, setProgress] = useState<ZipProgress | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [link, setLink] = useState<{ url: string; name: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const chosen = entries.filter((e) => !off.has(e.category));
  const bytes = chosen.reduce((t, e) => t + e.byteSize, 0);
  const busy = progress !== null;
  // Zip uten ZIP64 tåler høyst 4 GB; hold god margin
  const tooBig = bytes > ZIP_MAX_BYTES;
  useEffect(
    () => () => {
      if (link) URL.revokeObjectURL(link.url);
    },
    [link],
  );

  async function download(all: boolean) {
    const list = all ? entries : chosen;
    if (list.length === 0) return;
    if (list.reduce((t, e) => t + e.byteSize, 0) > ZIP_MAX_BYTES) {
      setMessage({
        kind: "error",
        text: tk("app-library-asset-zip.text.text.255bc44c3218", { value1: String(formatBytes(ZIP_MAX_BYTES)) }),
      });
      return;
    }
    const cats =
      all || off.size === 0
        ? tk("app-library-asset-zip.cats.message.8e38c648ff24")
        : summary
            .filter((x) => !off.has(x.category))
            .map((x) => ZIP_CATEGORY_LABEL[x.category].toLocaleLowerCase(collation()))
            .join(", ");
    const date = new Date().toISOString().slice(0, 10);
    // Filnavnet på zip-filen holdes til ASCII (enkelte nettlesere avviser andre tegn ved nedlasting);
    // filene inne i zip-filen beholder æ, ø og å
    const name = asciiFileName(
      `${zipSafeName(projectName, "prosjekt")} - ${zipSafeName(cats)} - ${date}.zip`,
    );
    setMessage(null);
    setLink(null);
    // Lagringsvinduet må åpnes rett fra klikket
    const sink = await openZipSink(name);
    if (!sink) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setProgress({ files: 0, totalFiles: list.length, bytes: 0, totalBytes: 0 });
    try {
      const urls = await signedUrls(list.map((e) => e.mediaPath));
      const { missing } = await writeZip(sink, list, urls, {
        signal: ctrl.signal,
        onProgress: (p) => {
          if (abort.current === ctrl) setProgress(p);
        },
      });
      setLink(sink.link?.() ?? null);
      setMessage({
        kind: missing.length ? "error" : "ok",
        text: missing.length
          ? tk("app-library-asset-zip.zip-missing", { count: missing.length })
          : tk("app-library-asset-zip.zip-made", { name, count: list.length }),
      });
    } catch (e) {
      setMessage({
        kind: "error",
        text:
          (e as DOMException).name === "AbortError"
            ? tk("app-library-asset-zip.text.text.03358cde7e13")
            : tk("app-library-asset-zip.text.text.abaef2ceff1e", { message: String((e as Error).message) }),
      });
    } finally {
      if (abort.current === ctrl) abort.current = null;
      setProgress(null);
    }
  }

  return (
    <section
      aria-label={tk("app-library-asset-zip.asset-zip-panel.aria-label.89a5418ee6c1")}
      className="flex flex-col gap-2"
    >
      {compact ? null : (
        <h3 className="text-chrome-label font-medium uppercase tracking-[0.04em] text-text-tertiary">
          {tk("app-library-asset-zip.asset-zip-panel.h3.f912a09ad9f6")}
        </h3>
      )}
      {summary.length === 0 ? (
        <p className="text-xs text-text-tertiary">
          {tk("app-library-asset-zip.asset-zip-panel.p.41efa5af3f76")}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-0.5">
            {summary.map((x) => (
              <li key={x.category}>
                <label className="flex items-center gap-2 rounded-sm px-1 py-0.5 text-xs text-text-primary hover:bg-surface-3">
                  <input
                    type="checkbox"
                    checked={!off.has(x.category)}
                    disabled={busy}
                    onChange={(e) =>
                      setOff((o) => {
                        const n = new Set(o);
                        if (e.target.checked) n.delete(x.category);
                        else n.add(x.category);
                        return n;
                      })
                    }
                    className="size-3.5 accent-[var(--accent-brand)]"
                  />
                  <span className="flex-1">{ZIP_CATEGORY_LABEL[x.category]}</span>
                  <span className="tabular text-text-tertiary">
                    {x.files} {x.files === 1 ? tk("app-library-asset-zip.asset-zip-panel.span.c676a008823f") : tk("app-library-asset-zip.asset-zip-panel.span.2d183e292f07")} ·{" "}
                    {formatBytes(x.bytes)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || chosen.length === 0 || tooBig}
              onClick={() => void download(false)}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Download />}
              {tk("app-library-asset-zip.asset-zip-panel.button.bbc765963d84")} ({formatBytes(bytes)})
            </Button>
            {tooBig ? (
              <span className="text-[11px] text-status-danger">
                {tk("app-library-asset-zip.asset-zip-panel.span.2e1414afd07d", { value1: String(formatBytes(ZIP_MAX_BYTES)) })}
              </span>
            ) : null}
            {off.size > 0 ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void download(true)}>
                {tk("app-library-asset-zip.asset-zip-panel.button.c11fd28608b5")}
              </Button>
            ) : null}
            {busy ? (
              <Button size="sm" variant="ghost" onClick={() => abort.current?.abort()}>
                {tk("app-library-asset-zip.asset-zip-panel.button.f44bab868f90")}
              </Button>
            ) : null}
          </div>
          {progress ? (
            <div className="flex flex-col gap-1" aria-live="polite">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full bg-accent-brand transition-[width]"
                  style={{
                    width: `${Math.round(
                      (progress.totalBytes > 0
                        ? progress.bytes / progress.totalBytes
                        : progress.files / Math.max(1, progress.totalFiles)) * 100,
                    )}%`,
                  }}
                />
              </div>
              <span className="text-[11px] text-text-tertiary">
                {progress.files} {tk("app-library-asset-zip.asset-zip-panel.span.293ad35aaf6a")} {progress.totalFiles} {tk("app-library-asset-zip.asset-zip-panel.span.2d183e292f07.2")}
                {progress.totalBytes > 0
                  ? tk("app-library-asset-zip.asset-zip-panel.span.199cb15f5c71", { value1: String(formatBytes(progress.bytes)), value2: String(formatBytes(progress.totalBytes)) })
                  : ""}
              </span>
            </div>
          ) : null}
        </>
      )}
      {message ? (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={
            "text-xs " + (message.kind === "error" ? "text-status-danger" : "text-status-success")
          }
        >
          {message.text}
          {link ? (
            <>
              {" "}
              <a href={link.url} download={link.name} className="underline underline-offset-2">
                {tk("app-library-asset-zip.asset-zip-panel.a.c3affb8018ae")}
              </a>{" "}
              {tk("app-library-asset-zip.asset-zip-panel.p.439f46679cfa")}
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}

/** Eget vindu for zip-nedlasting (prosjektlisten og biblioteket). Henter prosjektet om nødvendig. */
export function AssetZipDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  state,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  state?: ProjectState;
}) {
  const loaded = useZipState(projectId, open && !state);
  const s = state ?? loaded.data;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>
            {tk("app-library-asset-zip.asset-zip-dialog.dialog-title.37082a1f4d35", { projectName: String(projectName) })}
          </DialogTitle>
          <DialogDescription>
            {tk("app-library-asset-zip.asset-zip-dialog.dialog-description.313624f899ae")}
          </DialogDescription>
        </DialogHeader>
        {s ? (
          <AssetZipPanel state={s} projectName={projectName} compact />
        ) : loaded.isError ? (
          <p role="alert" className="text-xs text-status-danger">
            {tk("app-library-asset-zip.asset-zip-dialog.p.aec9d14a93a7")}:{" "}
            {tm((loaded.error as Error).message)}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-xs text-text-tertiary">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />{" "}
            {tk("app-library-asset-zip.asset-zip-dialog.p.c8281b2bb1c3")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
