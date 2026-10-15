/**
 * Manuseksport (mandat 5.2–5.3, REQ-0080–REQ-0088): nummereringsmetode velges hver gang, med forhåndsvisning.
 * Eksporten endrer ingenting i prosjektet (REQ-0085).
 */
import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  L,
  numbersByOccurrence,
  exportNumbering,
  exportNotes,
  exportPaginationInput,
  fitTitlePage,
  formatHeading,
  placeNotes,
  paginate,
  screenplayFountain,
  tm,
  TITLE_PAGE_MAX_LINES,
  type NumberingMethod,
  type ProjectState,
} from "@/core";
import { savedTitlePage } from "@/core/commands/export-settings";
import { screenplayDocx } from "@/engine/export/screenplay-docx";
import { screenplayPdf } from "@/engine/export/screenplay-pdf";
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
  language = "nb",
  onSaveTitlePage,
}: Props) {
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

  function doExport() {
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
        `${state.project.name} – ${production?.name ?? "manus"}${language === "nb" ? "" : ` – ${language}`} – ${date}`,
      );
      // Notatene står i den norske teksten og passer ikke på en oversettelse
      const notes =
        withNotes && language === "nb"
          ? exportNotes(
              state,
              input.map((x) => x.occurrenceId),
            )
          : undefined;
      if (format === "pdf") {
        const pages = paginate(input).pages;
        const texts = new Map(input.flatMap((x) => x.blocks.map((b) => [b.id, b.text] as const)));
        const bytes = screenplayPdf(pages, {
          title: state.project.name,
          titlePage,
          ...(notes ? { notes: placeNotes(pages, texts, notes) } : {}),
        });
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
      <DialogContent className="max-w-[680px] border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>{L("Eksporter manus", "Export script")}</DialogTitle>
          <DialogDescription>
            {L("«", "“")}
            {production?.name}
            {L("»", "”")} – {preview.length}{" "}
            {L(
              "scener. Eksporten endrer ingenting i prosjektet.",
              "scenes. The export does not change anything in the project.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
              {L("Format", "Format")}
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
                  {L(
                    "Ferdige sider, nøyaktig som i manusvisningen",
                    "Finished pages, exactly as in the script view",
                  )}
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
                  {L(
                    "Redigerbar; Word bryter sidene selv",
                    "Editable; Word breaks the pages itself",
                  )}
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
                  {L(
                    "Ren tekst for andre manusprogrammer; de bryter sidene selv",
                    "Plain text for other script programs; they break the pages themselves",
                  )}
                </span>
              </span>
            </label>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
              {L("Scenenummer", "Scene numbering")}
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
                {L("Bevar produksjonsnummerering", "Keep production numbering")}
                <span className="block text-xs text-text-tertiary">
                  {L(
                    "Etablerte numre beholdes; nye scener får 42A, 42B …",
                    "Established numbers are kept; new scenes get 42A, 42B …",
                  )}
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
                {L("Fortløpende", "Continuous")}
                <span className="block text-xs text-text-tertiary">
                  {L(
                    "Alle aktive scener nummereres 1, 2, 3 …",
                    "All active scenes are numbered 1, 2, 3 …",
                  )}
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
                {L("Bevar valgt historisk nummerering", "Keep the chosen historical numbering")}
                <span className="block text-xs text-text-tertiary">
                  {versions.data?.length
                    ? L(
                        "Scener som fantes i versjonen får numrene derfra",
                        "Scenes that existed in the version get their numbers from it",
                      )
                    : L(
                        "Lagre en manusversjon først (Versjoner)",
                        "Save a script version first (Versions)",
                      )}
                </span>
                {method === "historical" && versions.data?.length ? (
                  <select
                    aria-label={L("Versjon", "Version")}
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
            {L("Ta med deaktiverte scener", "Include inactive scenes")} (
            {method === "continuous"
              ? L("tydelig merket, uten nummer", "clearly marked, without a number")
              : L("som «UTGÅR»", "as “OMITTED”")}
            )
          </label>
          {method !== "continuous" ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={fillOriginal}
                onChange={(e) => setFillOriginal(e.target.checked)}
              />
              {L(
                "Gi også scener som var unummerert i originalen et mellomnummer (f.eks. 1A). Nye scener får det alltid.",
                "Also give scenes that were unnumbered in the original an in-between number (e.g. 1A). New scenes always get one.",
              )}
            </label>
          ) : null}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={withNotes && language === "nb"}
              onChange={(e) => setWithNotes(e.target.checked)}
              disabled={noteCount === 0 || language !== "nb"}
            />
            {L("Ta med notater", "Include notes")} ({noteCount}) –{" "}
            {format === "pdf"
              ? L("som PDF-merknader, med navn og tidspunkt", "as PDF comments, with name and time")
              : format === "docx"
                ? L(
                    "som Word-kommentarer, med navn og tidspunkt",
                    "as Word comments, with name and time",
                  )
                : L(
                    "som Fountain-notater [[…]], med navn og dato",
                    "as Fountain notes [[…]], with name and date",
                  )}
            .{" "}
            {L(
              "De gjenopprettes hvis filen importeres igjen.",
              "They are restored if the file is imported again.",
            )}
          </label>
          {format === "pdf" && lockedPages ? (
            <p className="text-text-tertiary">
              {L(
                "Låste sider: sideskiftene følger originalen der teksten er uendret.",
                "Locked pages: the page breaks follow the original where the text is unchanged.",
              )}
            </p>
          ) : null}
        </div>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {L("Tittelside (tom = ingen tittelside)", "Title page (empty = no title page)")}
          <textarea
            value={titleText}
            onChange={(e) => setTitleText(e.target.value)}
            rows={Math.min(8, Math.max(2, titleLines.length))}
            className="rounded-sm border border-border-control bg-surface-3 p-2 text-[13px] text-text-primary"
          />
          <span className="text-text-tertiary">
            {saved !== null
              ? L(
                  "Fylt ut fra den lagrede tittelsiden (fra importen eller forrige eksport). Endre fritt.",
                  "Filled in from the saved title page (from the import or the previous export). Change freely.",
                )
              : L(
                  "Fylt ut med prosjektnavnet. Endre fritt.",
                  "Filled in with the project name. Change freely.",
                )}
          </span>
          {titleFit.truncated ? (
            <span role="alert" className="text-status-uncertain">
              {L(
                "Tittelsiden er lengre enn det som kan lagres for neste gang (om lag 3 kB, høyst",
                "The title page is longer than can be saved for next time (about 3 kB, at most",
              )}{" "}
              {TITLE_PAGE_MAX_LINES}{" "}
              {L(
                "linjer). Hele teksten kommer med i denne filen, men den lagrede kopien blir kortet.",
                "lines). The whole text is included in this file, but the saved copy will be shortened.",
              )}
            </span>
          ) : null}
        </label>

        {method === "historical" && !historical ? (
          <p role={histSnap.isError ? "alert" : "status"} className="text-xs text-text-secondary">
            {histSnap.isError
              ? L(
                  "Kunne ikke hente versjonen. Prøv igjen.",
                  "Could not fetch the version. Try again.",
                )
              : L("Henter versjonen …", "Fetching the version …")}
          </p>
        ) : null}
        <div className={method === "historical" && !historical ? "hidden" : undefined}>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
            {L("Forhåndsvisning av nummerering", "Numbering preview")}{" "}
            {changed
              ? L(`· ${changed} endret`, `· ${changed} changed`)
              : L("· ingen endringer", "· no changes")}
          </p>
          <div className="max-h-52 overflow-y-auto border border-border bg-surface-1">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-2 text-left text-text-tertiary">
                <tr>
                  <th className="w-16 px-2 py-1 font-medium">{L("I dag", "Today")}</th>
                  <th className="w-16 px-2 py-1 font-medium">{L("Eksport", "Export")}</th>
                  <th className="px-2 py-1 font-medium">{L("Overskrift", "Heading")}</th>
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
                        <span className="text-text-tertiary">{L("UTGÅR – ", "OMITTED – ")}</span>
                      ) : null}
                      {!p.active && !p.omitted ? (
                        <span className="text-text-tertiary">
                          {L("Deaktivert – ", "Inactive – ")}
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
            {L("Eksporten feilet", "The export failed")}: {tm(error)}
          </p>
        ) : null}

        {ready ? (
          <div
            role="status"
            className="border border-status-success/40 bg-status-success-bg p-3 text-xs text-text-primary"
          >
            <p>
              {L("Filen er laget:", "The file has been created:")}{" "}
              <a
                href={ready.url}
                download={ready.name}
                target="_blank"
                rel="noopener"
                className="font-medium text-accent-brand underline underline-offset-2"
              >
                {L(`Last ned «${ready.name}»`, `Download “${ready.name}”`)}
              </a>
            </p>
            {isEmbedded() ? (
              <p className="mt-1.5 text-text-secondary">
                {L(
                  "Startet ikke nedlastingen? Forhåndsvisningen i Lovable kan blokkere nedlastinger. Åpne appen i en egen fane (knappen for ny fane øverst i forhåndsvisningen) og eksporter derfra.",
                  "Did the download not start? The Lovable preview can block downloads. Open the app in a separate tab (the new-tab button at the top of the preview) and export from there.",
                )}
              </p>
            ) : null}
          </div>
        ) : null}

        <ExportHistory productionId={productionId} kinds={["script"]} />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {ready ? L("Lukk", "Close") : L("Avbryt", "Cancel")}
          </Button>
          <Button
            onClick={doExport}
            disabled={busy || preview.length === 0 || (method === "historical" && !historical)}
          >
            <Download />
            {L("Eksporter", "Export")}{" "}
            {format === "pdf" ? "PDF" : format === "docx" ? "Word" : "Fountain"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
