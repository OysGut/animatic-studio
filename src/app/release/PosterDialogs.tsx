/**
 * Ny plakat (førsteutkast fra prosjektet, REQ-0396) og eksport til trykk-PDF eller PNG (REQ-0397,
 * REQ-0403/0404, DEC-0061).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { POSTER_FORMATS, POSTER_KIND_LABEL, newId, paletteLabel, posterAnalysis, posterDraft, posterFileName, renderPoster, type Poster, type PosterKind, type ProjectState, locale } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { signedUrls } from "@/app/library/asset-images";
import { prepareDownload, type ReadyFile } from "@/app/download";
import { deflateZlib, posterPdf } from "@/engine/export/poster-pdf";
import {
  bitmapToPdfImage,
  fetchBitmap,
  posterPng,
  posterPngSize,
} from "@/engine/export/poster-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRecordExport } from "@/app/projects/use-history-records";
import { t } from "@/core/i18n/keyed";

const control =
  "h-8 w-full rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";

export function NewPosterDialog({
  state,
  cmds,
  productionId,
  open,
  onOpenChange,
  onCreated,
}: {
  state: ProjectState;
  cmds: Commands;
  productionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (posterId: string) => void;
}) {
  const analysis = useMemo(
    () => (open ? posterAnalysis(state, productionId) : null),
    [state, productionId, open],
  );
  const [kind, setKind] = useState<PosterKind | null>(null);
  const [format, setFormat] = useState(POSTER_FORMATS[0]!.id);
  const [language, setLanguage] = useState<"nb" | "en">("nb");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const k = kind ?? analysis?.suggestedKind ?? "pitch";
  const prod = state.productions[productionId];
  const defaultName = `${POSTER_KIND_LABEL[k]}${prod && prod.kind !== "main" ? ` – ${prod.name}` : ""}`;

  function create() {
    const f = POSTER_FORMATS.find((x) => x.id === format) ?? POSTER_FORMATS[0]!;
    const posterId = newId<"poster">();
    const err = cmds.run(
      {
        type: "CreatePoster",
        posterId,
        fields: {
          productionId: productionId as never,
          name: name.trim() || defaultName,
          kind: k,
          language,
          widthMm: f.w,
          heightMm: f.h,
          document: posterDraft(state, productionId, k, f.w, f.h),
        },
      },
      t("app-release-poster-dialogs.err.cmds-run.854b54ad554a", { value1: String(name.trim() || defaultName) }),
    );
    setError(err);
    if (!err) {
      onCreated(posterId);
      onOpenChange(false);
      setName("");
      setKind(null);
    }
  }

  const list = (xs: readonly { asset: { name: string } }[], n: number) =>
    xs.length
      ? xs
          .slice(0, n)
          .map((x) => x.asset.name)
          .join(", ")
      : t("app-release-poster-dialogs.list.message.54d5737c370a");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("app-release-poster-dialogs.new-poster-dialog.dialog-title.9d53a39ea2a0")}</DialogTitle>
          <DialogDescription>
            {t("app-release-poster-dialogs.new-poster-dialog.dialog-description.0f1a2beae55f")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs text-text-secondary">Type</legend>
            {(["pitch", "character_map"] as const).map((x) => (
              <label key={x} className="flex items-start gap-2 text-[13px] text-text-primary">
                <input
                  type="radio"
                  name="poster-kind"
                  checked={k === x}
                  onChange={() => setKind(x)}
                  className="mt-0.5 accent-[var(--accent-brand)]"
                />
                <span>
                  {POSTER_KIND_LABEL[x]}
                  {analysis?.suggestedKind === x ? (
                    <span className="ml-1.5 text-xs text-text-tertiary">
                      {t("app-release-poster-dialogs.new-poster-dialog.span.b79f0cb51c15")}
                    </span>
                  ) : null}
                  <span className="block text-xs text-text-tertiary">
                    {x === "pitch"
                      ? t("app-release-poster-dialogs.new-poster-dialog.span.41417602bbc2")
                      : t("app-release-poster-dialogs.new-poster-dialog.span.c360f7ae2d07")}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              Format
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className={control}
              >
                {POSTER_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("app-release-poster-dialogs.new-poster-dialog.label.3825c170d033")}
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as "nb" | "en")}
                className={control}
              >
                <option value="nb">{t("app-release-poster-dialogs.new-poster-dialog.option.e3870b997183")}</option>
                <option value="en">{t("app-release-poster-dialogs.new-poster-dialog.option.39e4c15e4b70")}</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("app-release-poster-dialogs.new-poster-dialog.label.5b853b6b614f")}
            <Input
              value={name}
              placeholder={defaultName}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {analysis ? (
            <div className="rounded-sm border border-border bg-surface-2 px-3 py-2 text-xs text-text-secondary">
              <p>
                <span className="text-text-primary">{t("app-release-poster-dialogs.new-poster-dialog.span.dea24df4403b")}</span>{" "}
                {list(analysis.characters, k === "pitch" ? 3 : 8)}
              </p>
              <p>
                <span className="text-text-primary">{t("app-release-poster-dialogs.new-poster-dialog.span.4d3c5a9e8971")}</span>{" "}
                {list(analysis.places, k === "pitch" ? 1 : 4)}
              </p>
              <p>
                <span className="text-text-primary">{t("app-release-poster-dialogs.new-poster-dialog.span.7222ba2e02df")}</span>{" "}
                {list(analysis.objects, k === "pitch" ? 3 : 6)}
              </p>
              <p>
                <span className="text-text-primary">{t("app-release-poster-dialogs.new-poster-dialog.span.c20f21fdfbd7")}</span>{" "}
                {analysis.relations} {t("app-release-poster-dialogs.new-poster-dialog.p.cfe54518e65d")} ·{" "}
                <span className="text-text-primary">{t("app-release-poster-dialogs.new-poster-dialog.span.d2e90544f05b")}</span>{" "}
                {paletteLabel(analysis.palette.name)}
              </p>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-status-danger">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("app-release-poster-dialogs.new-poster-dialog.button.a26d83ce7762")}
            </Button>
            <Button type="submit">{t("app-release-poster-dialogs.new-poster-dialog.button.c77fa45d07da")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Megabyte, avrundet for visning. */
function formatMb(bytes: number): string {
  const mb = bytes / 1e6;
  return `${mb < 10 ? mb.toLocaleString(locale(), { maximumFractionDigits: 1 }) : Math.round(mb)} MB`;
}

export function ExportPosterDialog({
  state,
  poster,
  open,
  onOpenChange,
}: {
  state: ProjectState;
  poster: Poster;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [kind, setKind] = useState<"pdf" | "png">("pdf");
  const [lang, setLang] = useState<"nb" | "en">(poster.language);
  const [bleed, setBleed] = useState(true);
  const [marks, setMarks] = useState(true);
  const [ppi, setPpi] = useState(150);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<ReadyFile | null>(null);
  // Eksportloggen (REQ-0037, DEC-0078)
  const recordExport = useRecordExport(state.project.id);
  const [missing, setMissing] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const pngSize = posterPngSize(poster.widthMm, poster.heightMm, ppi);

  // Lukkes dialogen midt i eksporten, stoppes arbeidet og ingenting lastes ned (KI-177)
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  async function run() {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setError(null);
    setReady(null);
    try {
      const ops = renderPoster(state, poster, lang);
      const paths = [...new Set(ops.flatMap((o) => (o.op === "image" ? [o.mediaPath] : [])))];
      const urls = paths.length ? await signedUrls(paths, 60 * 60) : {};
      const p = { ...poster, language: lang };
      let missing = 0;
      if (kind === "pdf") {
        const bytes = await posterPdf(
          ops,
          {
            widthMm: poster.widthMm,
            heightMm: poster.heightMm,
            bleedMm: bleed ? 3 : 0,
            cropMarks: marks,
            title: poster.name,
          },
          async (path, w, h) => {
            if (ac.signal.aborted)
              throw new DOMException(
                t("app-release-poster-dialogs.bytes.poster-pdf.ab0614cc12b1"),
                "AbortError",
              );
            const url = urls[path];
            if (!url) {
              missing++;
              return null;
            }
            try {
              const bmp = await fetchBitmap(url, w, h);
              const img = bitmapToPdfImage(bmp);
              bmp.close();
              return img;
            } catch {
              missing++;
              return null;
            }
          },
          deflateZlib,
        );
        if (ac.signal.aborted) return;
        setReady(prepareDownload(bytes, posterFileName(p, "pdf"), "application/pdf"));
        recordExport({
          productionId: poster.productionId,
          kind: "poster",
          fileName: posterFileName(p, "pdf"),
          settings: { format: "pdf", language: lang, bleed, cropMarks: marks },
          occurrenceIds: [],
        });
        setMissing(missing);
      } else {
        setProgress(0);
        const png = await posterPng(
          ops,
          poster.widthMm,
          poster.heightMm,
          ppi,
          urls,
          setProgress,
          ac.signal,
        );
        if (ac.signal.aborted) return;
        setReady(prepareDownload(png.parts, posterFileName(p, "png"), "image/png"));
        recordExport({
          productionId: poster.productionId,
          kind: "poster",
          fileName: posterFileName(p, "png"),
          settings: { format: "png", language: lang, ppi },
          occurrenceIds: [],
        });
        setMissing(png.missing);
      }
    } catch (e) {
      if (ac.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          abortRef.current?.abort();
          setReady(null);
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("app-release-poster-dialogs.export-poster-dialog.dialog-title.968827f73267", { name: String(poster.name) })}</DialogTitle>
          <DialogDescription>
            {(poster.widthMm / 10).toLocaleString(locale())} ×{" "}
            {(poster.heightMm / 10).toLocaleString(locale())}{" "}
            {t("app-release-poster-dialogs.export-poster-dialog.dialog-description.1b0e895891ca")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <fieldset className="flex gap-4">
            <legend className="sr-only">{t("app-release-poster-dialogs.export-poster-dialog.legend.2eeae0ebdfaa")}</legend>
            {(["pdf", "png"] as const).map((x) => (
              <label key={x} className="flex items-center gap-1.5 text-[13px] text-text-primary">
                <input
                  type="radio"
                  name="poster-export"
                  checked={kind === x}
                  onChange={() => setKind(x)}
                  className="accent-[var(--accent-brand)]"
                />
                {x === "pdf" ? t("app-release-poster-dialogs.export-poster-dialog.label.a2d909d73b10") : t("app-release-poster-dialogs.export-poster-dialog.label.b4ed18ed47fc")}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("app-release-poster-dialogs.export-poster-dialog.label.de5a73993ed1")}
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as "nb" | "en")}
              className={control}
            >
              <option value="nb">{t("app-release-poster-dialogs.export-poster-dialog.option.2ba2c82ca3fa")}</option>
              <option value="en">{t("app-release-poster-dialogs.export-poster-dialog.option.7d645d203fe3")}</option>
            </select>
          </label>
          {kind === "pdf" ? (
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-[13px] text-text-primary">
                <input
                  type="checkbox"
                  checked={bleed}
                  onChange={(e) => setBleed(e.target.checked)}
                  className="size-3.5 accent-[var(--accent-brand)]"
                />
                {t("app-release-poster-dialogs.export-poster-dialog.label.02bdaada2bb8")}
              </label>
              <label className="flex items-center gap-2 text-[13px] text-text-primary">
                <input
                  type="checkbox"
                  checked={marks}
                  onChange={(e) => setMarks(e.target.checked)}
                  className="size-3.5 accent-[var(--accent-brand)]"
                />
                {t("app-release-poster-dialogs.export-poster-dialog.label.0dc9f528e4c4")}
              </label>
            </div>
          ) : (
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("app-release-poster-dialogs.export-poster-dialog.label.b2a6cf629d85")}
              <select
                value={ppi}
                onChange={(e) => setPpi(Number(e.target.value))}
                className={control}
              >
                <option value={72}>{t("app-release-poster-dialogs.export-poster-dialog.option.bc56fd419d66")}</option>
                <option value={150}>150 ppi</option>
                <option value={300}>300 ppi</option>
              </select>
              <span className="text-[11px] text-text-tertiary">
                {pngSize.width.toLocaleString(locale())} × {pngSize.height.toLocaleString(locale())}{" "}
                {t("app-release-poster-dialogs.export-poster-dialog.span.6acc2d264f0a")} (
                {pngSize.megapixels.toLocaleString(locale(), { maximumFractionDigits: 1 })} Mpx).{" "}
                {t("app-release-poster-dialogs.export-poster-dialog.span.d4f526186b2b")} {formatMb(pngSize.minBytes)}–
                {formatMb(pngSize.maxBytes)},{" "}
                {t("app-release-poster-dialogs.export-poster-dialog.span.bc60e4dca3c0")}
                {ppi >= 300
                  ? t("app-release-poster-dialogs.export-poster-dialog.span.96d1db5d8c27")
                  : ""}
              </span>
            </label>
          )}
          {error ? (
            <p role="alert" className="text-xs text-status-danger">
              {error}
            </p>
          ) : null}
          {ready ? (
            <p className="text-xs text-text-secondary" role="status">
              {t("app-release-poster-dialogs.export-poster-dialog.p.1a307e989ca7")}{" "}
              {missing > 0
                ? missing === 1
                  ? t("app-release-poster-dialogs.export-poster-dialog.p.90625a001f58")
                  : t("app-release-poster-dialogs.export-poster-dialog.p.8aa4010b61dc", { missing: String(missing) })
                : ""}
              <a href={ready.url} download={ready.name} className="text-accent-brand underline">
                {t("app-release-poster-dialogs.export-poster-dialog.a.d48121094d6e")} {ready.name}
              </a>
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("app-release-poster-dialogs.export-poster-dialog.button.fbc82f428e1d")}
          </Button>
          <Button onClick={run} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Download />}
            {busy
              ? progress !== null
                ? t("app-release-poster-dialogs.export-poster-dialog.button.4a2e4248d5cf", { value1: String(Math.round(progress * 100)) })
                : t("app-release-poster-dialogs.export-poster-dialog.button.cb0da405af37")
              : t("app-release-poster-dialogs.export-poster-dialog.button.3fb29831834f")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
