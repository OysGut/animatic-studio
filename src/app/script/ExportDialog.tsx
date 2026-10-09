/**
 * Manuseksport (mandat 5.2–5.3, REQ-0080–REQ-0088): nummereringsmetode velges hver gang, med forhåndsvisning.
 * Eksporten endrer ingenting i prosjektet (REQ-0085).
 */
import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  numbersByOccurrence,
  exportNumbering,
  exportNotes,
  exportPaginationInput,
  formatHeading,
  placeNotes,
  paginate,
  type NumberingMethod,
  type ProjectState,
} from "@/core";
import { screenplayDocx } from "@/engine/export/screenplay-docx";
import { screenplayPdf } from "@/engine/export/screenplay-pdf";
import { isEmbedded, prepareDownload, type ReadyFile } from "@/app/download";
import { useVersionList, useVersionSnapshot } from "@/app/project/use-versions";
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
}

type Format = "pdf" | "docx";

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, "-").trim();
}

export function ExportDialog({ open, onOpenChange, state, productionId, lockedPages }: Props) {
  const [format, setFormat] = useState<Format>("pdf");
  const [method, setMethod] = useState<NumberingMethod>("production");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [fillOriginal, setFillOriginal] = useState(false);
  // Notater i eksporten (REQ-0540): av som standard
  const [withNotes, setWithNotes] = useState(false);
  const noteCount = useMemo(
    () => Object.values(state.annotations).filter((a) => !a.removed).length,
    [state.annotations],
  );
  const fillMissing = fillOriginal ? ("all" as const) : ("new" as const);
  const [titleText, setTitleText] = useState(state.project.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<ReadyFile | null>(null);
  useEffect(() => {
    if (!open) setReady(null);
  }, [open]);
  useEffect(
    () => () => {
      if (ready) URL.revokeObjectURL(ready.url);
    },
    [ready],
  );
  const production = state.productions[productionId];
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
      const titlePage = titleText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const date = new Date().toISOString().slice(0, 10);
      const base = safeName(`${state.project.name} – ${production?.name ?? "manus"} – ${date}`);
      const notes = withNotes
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
          <DialogTitle>Eksporter manus</DialogTitle>
          <DialogDescription>
            «{production?.name}» – {preview.length} scener. Eksporten endrer ingenting i prosjektet.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
              Format
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
                  Ferdige sider, nøyaktig som i manusvisningen
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
                  Redigerbar; Word bryter sidene selv
                </span>
              </span>
            </label>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
              Scenenummer
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
                Bevar produksjonsnummerering
                <span className="block text-xs text-text-tertiary">
                  Etablerte numre beholdes; nye scener får 42A, 42B …
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
                Fortløpende
                <span className="block text-xs text-text-tertiary">
                  Alle aktive scener nummereres 1, 2, 3 …
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
                Bevar valgt historisk nummerering
                <span className="block text-xs text-text-tertiary">
                  {versions.data?.length
                    ? "Scener som fantes i versjonen får numrene derfra"
                    : "Lagre en manusversjon først (Versjoner)"}
                </span>
                {method === "historical" && versions.data?.length ? (
                  <select
                    aria-label="Versjon"
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
            Ta med deaktiverte scener (
            {method === "continuous" ? "tydelig merket, uten nummer" : "som «UTGÅR»"})
          </label>
          {method !== "continuous" ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={fillOriginal}
                onChange={(e) => setFillOriginal(e.target.checked)}
              />
              Gi også scener som var unummerert i originalen et mellomnummer (f.eks. 1A). Nye scener
              får det alltid.
            </label>
          ) : null}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={withNotes}
              onChange={(e) => setWithNotes(e.target.checked)}
              disabled={noteCount === 0}
            />
            Ta med notater ({noteCount}) –{" "}
            {format === "pdf" ? "som PDF-merknader" : "som Word-kommentarer"}, med navn og
            tidspunkt. De gjenopprettes hvis filen importeres igjen.
          </label>
          {format === "pdf" && lockedPages ? (
            <p className="text-text-tertiary">
              Låste sider: sideskiftene følger originalen der teksten er uendret.
            </p>
          ) : null}
        </div>

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Tittelside (tom = ingen tittelside)
          <textarea
            value={titleText}
            onChange={(e) => setTitleText(e.target.value)}
            rows={2}
            className="rounded-sm border border-border-control bg-surface-3 p-2 text-[13px] text-text-primary"
          />
        </label>

        {method === "historical" && !historical ? (
          <p role={histSnap.isError ? "alert" : "status"} className="text-xs text-text-secondary">
            {histSnap.isError ? "Kunne ikke hente versjonen. Prøv igjen." : "Henter versjonen …"}
          </p>
        ) : null}
        <div className={method === "historical" && !historical ? "hidden" : undefined}>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
            Forhåndsvisning av nummerering {changed ? `· ${changed} endret` : "· ingen endringer"}
          </p>
          <div className="max-h-52 overflow-y-auto border border-border bg-surface-1">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-2 text-left text-text-tertiary">
                <tr>
                  <th className="w-16 px-2 py-1 font-medium">I dag</th>
                  <th className="w-16 px-2 py-1 font-medium">Eksport</th>
                  <th className="px-2 py-1 font-medium">Overskrift</th>
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
                      {p.omitted ? <span className="text-text-tertiary">UTGÅR – </span> : null}
                      {!p.active && !p.omitted ? (
                        <span className="text-text-tertiary">Deaktivert – </span>
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
            Eksporten feilet: {error}
          </p>
        ) : null}

        {ready ? (
          <div
            role="status"
            className="border border-status-success/40 bg-status-success-bg p-3 text-xs text-text-primary"
          >
            <p>
              Filen er laget:{" "}
              <a
                href={ready.url}
                download={ready.name}
                target="_blank"
                rel="noopener"
                className="font-medium text-accent-brand underline underline-offset-2"
              >
                Last ned «{ready.name}»
              </a>
            </p>
            {isEmbedded() ? (
              <p className="mt-1.5 text-text-secondary">
                Startet ikke nedlastingen? Forhåndsvisningen i Lovable kan blokkere nedlastinger.
                Åpne appen i en egen fane (knappen for ny fane øverst i forhåndsvisningen) og
                eksporter derfra.
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {ready ? "Lukk" : "Avbryt"}
          </Button>
          <Button
            onClick={doExport}
            disabled={busy || preview.length === 0 || (method === "historical" && !historical)}
          >
            <Download />
            Eksporter {format === "pdf" ? "PDF" : "Word"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
