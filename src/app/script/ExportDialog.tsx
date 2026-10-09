/**
 * Manuseksport (mandat 5.2–5.3, REQ-0080–REQ-0088): nummereringsmetode velges hver gang, med forhåndsvisning.
 * Eksporten endrer ingenting i prosjektet (REQ-0085).
 */
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import {
  exportNumbering,
  exportPaginationInput,
  formatHeading,
  paginate,
  type NumberingMethod,
  type ProjectState,
} from "@/core";
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

function download(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as unknown as ArrayBuffer], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, "-").trim();
}

export function ExportDialog({ open, onOpenChange, state, productionId, lockedPages }: Props) {
  const [format, setFormat] = useState<Format>("pdf");
  const [method, setMethod] = useState<NumberingMethod>("production");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [fillOriginal, setFillOriginal] = useState(false);
  const fillMissing = fillOriginal ? ("all" as const) : ("new" as const);
  const [titleText, setTitleText] = useState(state.project.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const production = state.productions[productionId];
  const opts = { method, includeInactive, fillMissing };
  const preview = useMemo(
    () => exportNumbering(state, productionId, opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, productionId, method, includeInactive, fillOriginal],
  );
  const changed = preview.filter((p) => p.exportNumber !== p.productionNumber).length;

  async function doExport() {
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
      if (format === "pdf") {
        const { screenplayPdf } = await import("@/engine/export/screenplay-pdf");
        const bytes = screenplayPdf(paginate(input).pages, {
          title: state.project.name,
          titlePage,
        });
        download(bytes, `${base}.pdf`, "application/pdf");
      } else {
        const { screenplayDocx } = await import("@/engine/export/screenplay-docx");
        const bytes = screenplayDocx(input, { title: state.project.name, titlePage });
        download(
          bytes,
          `${base}.docx`,
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );
      }
      onOpenChange(false);
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
            <label className={radio + " opacity-60"}>
              <input type="radio" name="num" disabled className="mt-1" />
              <span>
                Bevar valgt historisk nummerering
                <span className="block text-xs text-text-tertiary">
                  Kommer når manusversjoner er på plass
                </span>
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
            {method === "production" ? "som «UTGÅR»" : "tydelig merket, uten nummer"})
          </label>
          {method === "production" ? (
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

        <div>
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

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={() => void doExport()} disabled={busy || preview.length === 0}>
            <Download />
            Eksporter {format === "pdf" ? "PDF" : "Word"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
