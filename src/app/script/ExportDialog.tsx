import { isSourceLanguage, sourceLanguageOf, SOURCE_TEXT_KEY } from "@/core/dialogue/languages";
/**
 * Manuseksport (mandat 5.2–5.3, REQ-0080–REQ-0088): nummereringsmetode velges hver gang, med forhåndsvisning.
 * Eksporten endrer ingenting i prosjektet (REQ-0085).
 */
import { ResizableDialogContent } from "@/app/shared/ResizableDialogContent";
import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { numbersByOccurrence, exportNumbering, exportNotes, exportPaginationInput, fitTitlePage, formatHeading, placeNotes, paginate, screenplayFountain, tm, TITLE_PAGE_MAX_LINES, exportLanguageDecision, languageLabel, scriptExportFontCheck, scriptExportTexts, docxLanguageTag, type ExportFallbackChoice, type NumberingMethod, type ProjectState, type TranslationStatus } from "@/core";
import { ScriptLanguageSelect } from "./ScriptLanguageSelect";
import { savedTitlePage } from "@/core/commands/export-settings";
import { screenplayDocx } from "@/engine/export/screenplay-docx";
import { screenplayPdf, screenplayPdfUnicode } from "@/engine/export/screenplay-pdf";
import { loadNotoFonts } from "@/engine/export/pdf-fonts";
import { isEmbedded, prepareDownload, type ReadyFile } from "@/app/download";
import { useVersionList, useVersionSnapshot } from "@/app/project/use-versions";
import { ExportHistory } from "@/app/projects/ExportHistory";
import { useRecordExport } from "@/app/projects/use-history-records";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/core/i18n/keyed";

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly state: ProjectState;
  readonly productionId: string;
  readonly lockedPages: boolean;
  /** Språket som eksporteres (DEC-0058). Annet enn «nb»: notater tas ikke med, og språket står i filnavnet. */
  readonly language?: string;
  /**
   * Lagrer tittelsiden for produksjonen (KI-20) når brukeren har endret den og eksporterer. Utelatt =
   * endringen gjelder bare denne eksporten.
   */
  readonly onSaveTitlePage?: (lines: readonly string[]) => void;
  /** ML3: den norske kildetilstanden (for språkvalget). Utelatt = `state`. */
  readonly sourceState?: ProjectState;
  /** ML3: oversettelsesstatus for valgt språk; ufullstendig krever eksplisitt valg (norsk reserve eller stopp). */
  readonly languageStatus?: TranslationStatus | null;
  /** ML3: bytt språkversjon fra eksporten. */
  readonly onLanguageChange?: (language: string) => void;
}

type Format = "pdf" | "docx" | "fountain";

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, "-").trim();
}

export function ExportDialog({
  open,
  onOpenChange,
  state,
  productionId,
  lockedPages,
  language = SOURCE_TEXT_KEY,
  onSaveTitlePage,
  sourceState,
  languageStatus = null,
  onLanguageChange,
}: Props) {
  // ML3: ufullstendig oversettelse eksporteres bare etter et eksplisitt valg (norsk reserve eller stopp)
  const [fallbackChoice, setFallbackChoice] = useState<ExportFallbackChoice | undefined>(undefined);
  useEffect(() => setFallbackChoice(undefined), [language, open]);
  const decision = isSourceLanguage(sourceState ?? state, language) || !languageStatus ? ({ kind: "complete" } as const) : exportLanguageDecision(languageStatus, fallbackChoice);
  const languageBlocked = decision.kind === "needs-choice" || decision.kind === "stopped";
  const [format, setFormat] = useState<Format>("pdf");
  // Nummereringen huskes fra forrige eksport av prosjektet i denne nettleseren (KI-176, REQ-0482,
  // Mars 15.10.2026: «Husk forrige valg»). Første gang: produksjonsnummerering.
  const methodKey = `animatic:export-numbering:${state.project.id}`; // i18n-ignore: nøkkel i nettleserens lager
  const [method, setMethodState] = useState<NumberingMethod>(() => {
    try {
      const v = window.localStorage.getItem(methodKey);
      return v === "production" || v === "continuous" || v === "historical" ? v : "production";
    } catch {
      return "production";
    }
  });
  const setMethod = (m: NumberingMethod) => {
    setMethodState(m);
    try {
      window.localStorage.setItem(methodKey, m);
    } catch {
      /* privat vindu: gjelder bare denne gangen */
    }
  };
  const [includeInactive, setIncludeInactive] = useState(false);
  const [fillOriginal, setFillOriginal] = useState(false);
  // Notater i eksporten (REQ-0540): av som standard
  const [withNotes, setWithNotes] = useState(false);
  const noteCount = useMemo(
    () => Object.values(state.annotations).filter((a) => !a.removed).length,
    [state.annotations],
  );
  const fillMissing = fillOriginal ? ("all" as const) : ("new" as const);
  // Tittelsiden (KI-20): den lagrede (fra importen eller forrige eksport), ellers prosjektnavnet
  const saved = savedTitlePage(state, productionId);
  const [titleText, setTitleText] = useState(() => (saved ? saved.join("\n") : state.project.name));
  const titleLines = useMemo(
    () =>
      titleText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    [titleText],
  );
  const titleFit = useMemo(() => fitTitlePage(titleLines), [titleLines]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<ReadyFile | null>(null);
  useEffect(() => {
    if (!open) setReady(null);
  }, [open]);
  // Hver gang dialogen åpnes: den lagrede tittelsiden (kan ha kommet fra en import i mellomtiden)
  const savedKey = saved ? saved.join("\n") : null;
  useEffect(() => {
    if (open && savedKey !== null) setTitleText(savedKey);
  }, [open, savedKey]);
  useEffect(
    () => () => {
      if (ready) URL.revokeObjectURL(ready.url);
    },
    [ready],
  );
  const production = state.productions[productionId];
  // Eksportloggen (REQ-0037, migrasjon 0028): registreres når filen er laget
  const recordExport = useRecordExport(state.project.id);
  // Historisk nummerering (REQ-0083): nummer fra en valgt manusversjon
  const versions = useVersionList(productionId, open);
  const [historicalId, setHistoricalId] = useState<string | null>(null);
  // Bare en versjon fra denne produksjonen kan brukes (valget nullstilles ellers)
  const histId =
    (historicalId && versions.data?.some((v) => v.id === historicalId) ? historicalId : null) ??
    versions.data?.[0]?.id ??
    null;
  const histSnap = useVersionSnapshot(method === "historical" ? histId : null);
  const historical = useMemo(
    () => (histSnap.data ? numbersByOccurrence(histSnap.data) : undefined),
    [histSnap.data],
  );
  const opts = {
    method,
    includeInactive,
    fillMissing,
    ...(method === "historical" && historical ? { historical } : {}),
  };
  const preview = useMemo(
    () => exportNumbering(state, productionId, opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, productionId, method, includeInactive, fillOriginal, historical],
  );
  const changed = preview.filter((p) => p.exportNumber !== p.productionNumber).length;

  // ML4: fontkontroll før filen lages. PDF stoppes hvis tegn ville blitt «?»; Word får en advarsel.
  const fontCheck = useMemo(
    () =>
      open
        ? scriptExportFontCheck(scriptExportTexts(exportPaginationInput(state, productionId, opts), titleLines), format)
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, state, productionId, method, includeInactive, fillOriginal, historical, titleLines, format],
  );
  const fontBlocked = !!fontCheck?.blocking;

  async function doExport() {
    if (languageBlocked || fontBlocked) return;
    setBusy(true);
    setError(null);
    try {
      const input = exportPaginationInput(state, productionId, {
        ...opts,
        lockedPages: format === "pdf" && lockedPages,
      });
      // Hele teksten brukes i filen; bare den lagrede kopien kortes til lagringsgrensen
      const titlePage = titleLines;
      if (
        onSaveTitlePage &&
        (saved === null
          ? titleText !== state.project.name
          : saved.length !== titleFit.lines.length || saved.some((l, i) => l !== titleFit.lines[i]))
      )
        onSaveTitlePage(titleFit.lines);
      const date = new Date().toISOString().slice(0, 10);
      const base = safeName(
        `${state.project.name} – ${production?.name ?? "manus"}${isSourceLanguage(sourceState ?? state, language) ? "" : ` – ${language}`} – ${date}`,
      );
      // Notatene står i den norske teksten og passer ikke på en oversettelse
      const notes =
        withNotes && isSourceLanguage(sourceState ?? state, language)
          ? exportNotes(
              state,
              input.map((x) => x.occurrenceId),
            )
          : undefined;
      if (format === "pdf") {
        const pages = paginate(input).pages;
        const texts = new Map(input.flatMap((x) => x.blocks.map((b) => [b.id, b.text] as const)));
        const placed = notes ? { notes: placeNotes(pages, texts, notes) } : {};
        const bytes = fontCheck?.embedded?.length
          ? await screenplayPdfUnicode(pages, {
              title: state.project.name,
              titlePage,
              language: isSourceLanguage(sourceState ?? state, language) ? sourceLanguageOf(sourceState ?? state) : language,
              fonts: await loadNotoFonts(fontCheck.embedded),
              ...placed,
            })
          : screenplayPdf(pages, { title: state.project.name, titlePage, ...placed });
        setReady(prepareDownload(bytes, `${base}.pdf`, "application/pdf"));
      } else if (format === "fountain") {
        const text = screenplayFountain(input, { titlePage, ...(notes ? { notes } : {}) });
        setReady(
          prepareDownload(
            new TextEncoder().encode(text),
            `${base}.fountain`,
            "text/plain;charset=utf-8",
          ),
        );
      } else {
        const bytes = screenplayDocx(input, {
          title: state.project.name,
          language: docxLanguageTag(language),
          titlePage,
          ...(notes ? { notes } : {}),
        });
        setReady(
          prepareDownload(
            bytes,
            `${base}.docx`,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ),
        );
      }
      recordExport({
        productionId,
        kind: "script",
        fileName: `${base}.${format}`,
        settings: {
          format,
          numbering: method,
          includeInactive,
          fillOriginal,
          language,
          ...(decision.kind === "fallback" ? { languageFallback: sourceLanguageOf(sourceState ?? state) } : {}),
          withNotes: !!notes,
          lockedPages: format === "pdf" && lockedPages,
        },
        occurrenceIds: input.map((x) => x.occurrenceId),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const radio = "flex items-start gap-2 text-[13px] text-text-primary";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ResizableDialogContent uiId="V-115" sizeKey="script-export" className="max-w-[680px] border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>{t("app-script-export-dialog.export-dialog.dialog-title.4798ad21711e")}</DialogTitle>
          <DialogDescription>
            {t("app-script-export-dialog.export-dialog.dialog-description.b5e5a710b2bc")}
            {production?.name}
            {t("app-script-export-dialog.export-dialog.dialog-description.7c1fa74ceb76")} – {preview.length}{" "}
            {t("app-script-export-dialog.export-dialog.dialog-description.b0505a9dcdb9")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-chrome-label font-medium uppercase tracking-[0.04em] text-text-tertiary">
              {t("app-script-export-dialog.export-dialog.legend.6fe6a7497744")}
            </legend>
            <label className={radio}>
              <input
                type="radio"
                name="fmt"
                checked={format === "pdf"}
                onChange={() => setFormat("pdf")}
                className="mt-1"
              />
              <span>
                PDF
                <span className="block text-xs text-text-tertiary">
                  {t("app-script-export-dialog.export-dialog.span.8697abcfdce9")}
                </span>
              </span>
            </label>
            <label className={radio}>
              <input
                type="radio"
                name="fmt"
                checked={format === "docx"}
                onChange={() => setFormat("docx")}
                className="mt-1"
              />
              <span>
                Word (.docx)
                <span className="block text-xs text-text-tertiary">
                  {t("app-script-export-dialog.export-dialog.span.140fdb55fa92")}
                </span>
              </span>
            </label>
            <label className={radio}>
              <input
                type="radio"
                name="fmt"
                checked={format === "fountain"}
                onChange={() => setFormat("fountain")}
                className="mt-1"
              />
              <span>
                Fountain (.fountain)
                <span className="block text-xs text-text-tertiary">
                  {t("app-script-export-dialog.export-dialog.span.ce980cf51696")}
                </span>
              </span>
            </label>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-chrome-label font-medium uppercase tracking-[0.04em] text-text-tertiary">
              {t("app-script-export-dialog.export-dialog.legend.7de83198fb7f")}
            </legend>
            <label className={radio}>
              <input
                type="radio"
                name="num"
                checked={method === "production"}
                onChange={() => setMethod("production")}
                className="mt-1"
              />
              <span>
                {t("app-script-export-dialog.export-dialog.span.0570cbae45fd")}
                <span className="block text-xs text-text-tertiary">
                  {t("app-script-export-dialog.export-dialog.span.793f4e040a25")}
                </span>
              </span>
            </label>
            <label className={radio}>
              <input
                type="radio"
                name="num"
                checked={method === "continuous"}
                onChange={() => setMethod("continuous")}
                className="mt-1"
              />
              <span>
                {t("app-script-export-dialog.export-dialog.span.fb0bccb39106")}
                <span className="block text-xs text-text-tertiary">
                  {t("app-script-export-dialog.export-dialog.span.364dad201af9")}
                </span>
              </span>
            </label>
            <label className={radio + (versions.data?.length ? "" : " opacity-60")}>
              <input
                type="radio"
                name="num"
                disabled={!versions.data?.length}
                checked={method === "historical"}
                onChange={() => setMethod("historical")}
                className="mt-1"
              />
              <span>
                {t("app-script-export-dialog.export-dialog.span.9c2f221ce712")}
                <span className="block text-xs text-text-tertiary">
                  {versions.data?.length
                    ? t("app-script-export-dialog.export-dialog.span.7fde2e97a8b3")
                    : t("app-script-export-dialog.export-dialog.span.02b21f503acd")}
                </span>
                {method === "historical" && versions.data?.length ? (
                  <select
                    aria-label={t("app-script-export-dialog.export-dialog.aria-label.c83247845f9a")}
                    value={histId ?? ""}
                    onChange={(e) => setHistoricalId(e.target.value)}
                    className="mt-1 h-7 max-w-[280px] rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                  >
                    {versions.data.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.number} – {v.name}
                      </option>
                    ))}
                  </select>
                ) : null}
              </span>
            </label>
          </fieldset>
        </div>

        <div className="flex flex-col gap-1.5 text-xs text-text-secondary">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            {t("app-script-export-dialog.export-dialog.label.031e7654d236")} (
            {method === "continuous"
              ? t("app-script-export-dialog.export-dialog.label.162e1c74eb0b")
              : t("app-script-export-dialog.export-dialog.label.196f6fde7370")}
            )
          </label>
          {method !== "continuous" ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={fillOriginal}
                onChange={(e) => setFillOriginal(e.target.checked)}
              />
              {t("app-script-export-dialog.export-dialog.label.91aad564b1d0")}
            </label>
          ) : null}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={withNotes && isSourceLanguage(sourceState ?? state, language)}
              onChange={(e) => setWithNotes(e.target.checked)}
              disabled={noteCount === 0 || !isSourceLanguage(sourceState ?? state, language)}
            />
            {t("app-script-export-dialog.export-dialog.label.3913a86903d2")} ({noteCount}) –{" "}
            {format === "pdf"
              ? t("app-script-export-dialog.export-dialog.label.d213245924c2")
              : format === "docx"
                ? t("app-script-export-dialog.export-dialog.label.94e82acca1d7")
                : t("app-script-export-dialog.export-dialog.label.5d194335bf45")}
            .{" "}
            {t("app-script-export-dialog.export-dialog.label.2a13ae5f5af3")}
          </label>
          {onLanguageChange ? (
            <label className="flex items-center gap-2">
              {t("ml3-language-versions.export.language")}
              <ScriptLanguageSelect
                state={sourceState ?? state}
                value={language}
                onChange={onLanguageChange}
                label={t("ml3-language-versions.export.language")}
                testId="export-language-select"
              />
            </label>
          ) : null}
          {fontCheck && fontCheck.font && fontCheck.unsupportedCount > 0 ? (
            <p
              role={fontCheck.blocking ? "alert" : "status"}
              data-testid={fontCheck.blocking ? "export-font-blocked" : "export-font-warning"}
              className={"rounded-sm border p-2 " + (fontCheck.blocking ? "border-status-danger text-status-danger" : "border-status-uncertain text-text-secondary")}
            >
              {fontCheck.blocking
                ? t("ml4-export-fonts.pdf-blocked", {
                    font: fontCheck.font,
                    count: String(fontCheck.unsupportedCount),
                    chars: fontCheck.unsupported.join(" "),
                  })
                : t("ml4-export-fonts.docx-warning", {
                    font: fontCheck.font,
                    count: String(fontCheck.unsupportedCount),
                    chars: fontCheck.unsupported.join(" "),
                  })}
            </p>
          ) : fontCheck?.font && !isSourceLanguage(sourceState ?? state, language) ? (
            <p data-testid="export-font-ok" className="text-text-tertiary">
              {t("ml4-export-fonts.ok", { font: fontCheck.font })}
            </p>
          ) : null}
          {decision.kind !== "complete" ? (
            <fieldset data-testid="export-language-incomplete" className="space-y-1 rounded-sm border border-status-uncertain p-2">
              <legend className="px-1 text-text-primary">
                {t("ml3-language-versions.export.incomplete", {
                  language: languageLabel(language),
                  missing: String(languageStatus?.missingIds.size ?? 0),
                  uncertain: String(languageStatus?.uncertain ?? 0),
                  review: String(languageStatus?.review ?? 0),
                })}
              </legend>
              <label className="flex items-center gap-2">
                <input type="radio" name="export-language-fallback" data-testid="export-language-fallback" checked={fallbackChoice === "fallback"} onChange={() => setFallbackChoice("fallback")} />
                {t("ml3-language-versions.export.fallback")}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="export-language-fallback" data-testid="export-language-stop" checked={fallbackChoice === "stop"} onChange={() => setFallbackChoice("stop")} />
                {t("ml3-language-versions.export.stop")}
              </label>
              {decision.kind === "needs-choice" ? <p className="text-text-tertiary">{t("ml3-language-versions.export.choose")}</p> : null}
              {decision.kind === "stopped" ? <p role="status" data-testid="export-language-stopped" className="text-status-danger">{t("ml3-language-versions.export.stopped")}</p> : null}
            </fieldset>
          ) : null}
          {format === "pdf" && lockedPages ? (
            <p className="text-text-tertiary">
              {t("app-script-export-dialog.export-dialog.p.d7e1637f700f")}
            </p>
          ) : null}
        </div>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t("app-script-export-dialog.export-dialog.label.382e46a98e2e")}
          <textarea
            value={titleText}
            onChange={(e) => setTitleText(e.target.value)}
            rows={Math.min(8, Math.max(2, titleLines.length))}
            className="rounded-sm border border-border-control bg-surface-3 p-2 text-[13px] text-text-primary"
          />
          <span className="text-text-tertiary">
            {saved !== null
              ? t("app-script-export-dialog.export-dialog.span.a8e053496f38")
              : t("app-script-export-dialog.export-dialog.span.33e12df0c58b")}
          </span>
          {titleFit.truncated ? (
            <span role="alert" className="text-status-uncertain">
              {t("app-script-export-dialog.export-dialog.span.8d1f1240995d")}{" "}
              {TITLE_PAGE_MAX_LINES}{" "}
              {t("app-script-export-dialog.export-dialog.span.b1d66d194a22")}
            </span>
          ) : null}
        </label>

        {method === "historical" && !historical ? (
          <p role={histSnap.isError ? "alert" : "status"} className="text-xs text-text-secondary">
            {histSnap.isError
              ? t("app-script-export-dialog.export-dialog.p.6fad06d2fe3f")
              : t("app-script-export-dialog.export-dialog.p.5b17c918b07b")}
          </p>
        ) : null}
        <div className={method === "historical" && !historical ? "hidden" : undefined}>
          <p className="mb-1 text-chrome-label font-medium uppercase tracking-[0.04em] text-text-tertiary">
            {t("app-script-export-dialog.export-dialog.p.ba09db7f5f2c")}{" "}
            {changed
              ? t("app-script-export-dialog.export-dialog.p.d77bf1eca951", { changed: String(changed) })
              : t("app-script-export-dialog.export-dialog.p.56edf081c585")}
          </p>
          <div className="max-h-52 overflow-y-auto border border-border bg-surface-1">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-2 text-left text-text-tertiary">
                <tr>
                  <th className="w-16 px-2 py-1 font-medium">{t("app-script-export-dialog.export-dialog.th.94e6ca13971b")}</th>
                  <th className="w-16 px-2 py-1 font-medium">{t("app-script-export-dialog.export-dialog.th.0f5266910982")}</th>
                  <th className="px-2 py-1 font-medium">{t("app-script-export-dialog.export-dialog.th.47d07aa8f817")}</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p) => (
                  <tr key={p.occurrenceId} className="border-t border-border">
                    <td className="tabular px-2 py-0.5 font-mono text-text-tertiary">
                      {p.productionNumber ?? "–"}
                    </td>
                    <td
                      className={
                        "tabular px-2 py-0.5 font-mono " +
                        (p.exportNumber !== p.productionNumber
                          ? "text-accent-brand"
                          : "text-text-primary")
                      }
                    >
                      {p.exportNumber ?? "–"}
                    </td>
                    <td className="truncate px-2 py-0.5 text-text-primary">
                      {p.omitted ? (
                        <span className="text-text-tertiary">{t("app-script-export-dialog.export-dialog.span.2e7f5a46f438")}</span>
                      ) : null}
                      {!p.active && !p.omitted ? (
                        <span className="text-text-tertiary">
                          {t("app-script-export-dialog.export-dialog.span.89e54cf8123b")}
                        </span>
                      ) : null}
                      {formatHeading(p.heading)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-xs text-status-danger">
            {t("app-script-export-dialog.export-dialog.p.892810a87a9e")}: {tm(error)}
          </p>
        ) : null}

        {ready ? (
          <div
            role="status"
            className="border border-status-success/40 bg-status-success-bg p-3 text-xs text-text-primary"
          >
            <p>
              {t("app-script-export-dialog.export-dialog.p.5bca912aefc4")}{" "}
              <a
                href={ready.url}
                download={ready.name}
                target="_blank"
                rel="noopener"
                className="font-medium text-accent-brand underline underline-offset-2"
              >
                {t("app-script-export-dialog.export-dialog.a.1ebd510d96a7", { name: String(ready.name) })}
              </a>
            </p>
            {isEmbedded() ? (
              <p className="mt-1.5 text-text-secondary">
                {t("r6-brand.download-blocked")}
              </p>
            ) : null}
          </div>
        ) : null}

        <ExportHistory productionId={productionId} kinds={["script"]} />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {ready ? t("app-script-export-dialog.export-dialog.button.eac96f6141a2") : t("app-script-export-dialog.export-dialog.button.1cf11cc3cf13")}
          </Button>
          <Button
            onClick={doExport}
            data-testid="script-export-run"
            disabled={busy || languageBlocked || fontBlocked || preview.length === 0 || (method === "historical" && !historical)}
          >
            <Download />
            {t("app-script-export-dialog.export-dialog.button.f614693c69c2")}{" "}
            {format === "pdf" ? "PDF" : format === "docx" ? "Word" : "Fountain"}
          </Button>
        </DialogFooter>
      </ResizableDialogContent>
    </Dialog>
  );
}
