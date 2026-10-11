/**
 * Import av et ferdig oversatt manus (M7 del 2, DEC-0058, REQ-0332–0335). Scenene og linjene kobles til de
 * norske automatisk; brukeren ser koblingene, kan velge en annen norsk scene og godkjenner. Ikke-godkjente
 * koblinger lagres som usikre og kan godkjennes senere i inspektøren. Det norske manuset endres ikke.
 */
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  LANGUAGE_LABEL,
  alignLines,
  alignTranslation,
  blocksOfVariant,
  formatHeading,
  newId,
  orderedOccurrences,
  translationItems,
  type Command,
  type ParsedScreenplay,
  type ProjectState,
  type SceneLink,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Row {
  readonly link: SceneLink;
  readonly approved: boolean;
  /** Den norske scenen er valgt av brukeren. */
  readonly manual?: boolean;
}

const control =
  "h-7 max-w-[260px] rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary";

export function TranslationImportDialog({
  state,
  cmds,
  productionId,
  language,
  open,
  onOpenChange,
}: {
  state: ProjectState;
  cmds: Commands;
  productionId: string;
  language: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedScreenplay | null>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const occs = useMemo(() => orderedOccurrences(state, productionId), [state, productionId]);
  const langName = LANGUAGE_LABEL[language] ?? language;

  function reset() {
    setParsed(null);
    setRows([]);
    setErr(null);
    setFileName("");
  }

  async function read(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const { readScreenplayFile } = await import("@/engine/import/browser");
      const r = await readScreenplayFile(file);
      const links = alignTranslation(state, productionId, r.parsed);
      setParsed(r.parsed);
      setFileName(file.name);
      setRows(
        links.map((link) => ({ link, approved: link.certainty === "sure" && !!link.occurrenceId })),
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function relink(i: number, occurrenceId: string | null) {
    if (!parsed) return;
    setRows((rs) =>
      rs.map((r, k) => {
        if (k !== i) return r;
        const o = occurrenceId ? state.occurrences[occurrenceId] : undefined;
        const p = parsed.scenes[r.link.parsedIndex]!;
        const { lines, unmatched } = o
          ? alignLines(p, blocksOfVariant(state, o.variantId))
          : { lines: [], unmatched: p.elements.length };
        return {
          approved: !!o,
          manual: true,
          link: { ...r.link, occurrenceId: o?.id ?? null, lines, unmatched },
        };
      }),
    );
  }

  function save() {
    if (!parsed) return;
    const items = translationItems(state, language, rows, parsed);
    if (!items.length) {
      setErr("Ingen scener er koblet.");
      return;
    }
    const fields = (x: (typeof items)[number]) => ({
      blockId: x.blockId as never,
      variantId: x.variantId as never,
      language,
      text: x.text,
      basedOnRev: x.basedOnRev,
      status: x.status,
    });
    const commands: Command[] = [];
    const add = items.filter((x) => !x.existingId);
    const upd = items.filter((x) => x.existingId);
    for (let i = 0; i < add.length; i += 500)
      commands.push({
        type: "AddTranslations",
        items: add.slice(i, i + 500).map((x) => ({
          translationId: newId<"translation">(),
          fields: fields(x),
        })),
      });
    for (let i = 0; i < upd.length; i += 500)
      commands.push({
        type: "UpdateTranslations",
        items: upd.slice(i, i + 500).map((x) => ({
          translationId: x.existingId as never,
          fields: fields(x),
        })),
      });
    const group = newId();
    for (const c of commands) {
      const e = cmds.run(c, `Importer ${langName.toLowerCase()} manus`, group);
      if (e) {
        setErr(e);
        return;
      }
    }
    reset();
    onOpenChange(false);
  }

  const linked = rows.filter((r) => r.link.occurrenceId);
  // Samme norske scene valgt for flere importerte scener: bare den første brukes
  const dupes = linked.length - new Set(linked.map((r) => r.link.occurrenceId)).size;
  // Linjene som faktisk lagres (godkjente oversettelser beholdes, samme scene bare én gang)
  const lines = useMemo(
    () =>
      parsed ? translationItems(state, language, rows, parsed).filter((x) => x.blockId).length : 0,
    [parsed, state, language, rows],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-[820px] overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>Importer {langName.toLowerCase()} manus</DialogTitle>
          <DialogDescription>
            Et ferdig oversatt manus (PDF eller Word) kobles til de norske scenene og replikkene.
            Det norske manuset endres ikke. Kontroller koblingene før du lagrer.
          </DialogDescription>
        </DialogHeader>
        {!parsed ? (
          <div className="flex flex-col items-start gap-2">
            <input
              ref={input}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void read(f);
                e.target.value = "";
              }}
            />
            <Button onClick={() => input.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <FileUp />}
              {busy ? "Leser manuset …" : "Velg fil …"}
            </Button>
          </div>
        ) : (
          <>
            <p className="text-xs text-text-secondary">
              {fileName}: {rows.length} scener, {linked.length} koblet, {lines} linjer får
              oversettelse. Usikre koblinger er ikke krysset av – de lagres som usikre og kan
              godkjennes senere.
            </p>
            {dupes ? (
              <p className="flex items-center gap-1 text-xs text-status-uncertain">
                <AlertTriangle className="size-3.5" aria-hidden />
                Samme norske scene er valgt for flere importerte scener. Bare den første brukes.
              </p>
            ) : null}
            <ul aria-label="Koblinger" className="flex flex-col border border-border">
              {rows.map((r, i) => {
                const o = r.link.occurrenceId ? state.occurrences[r.link.occurrenceId] : undefined;
                return (
                  <li
                    key={i}
                    className="grid grid-cols-[18px_1fr_auto] items-center gap-2 border-b border-border px-2 py-1 text-xs last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      aria-label="Godkjent kobling"
                      disabled={!o}
                      checked={r.approved && !!o}
                      onChange={() =>
                        setRows((rs) =>
                          rs.map((x, k) => (k === i ? { ...x, approved: !x.approved } : x)),
                        )
                      }
                      className="size-3.5 accent-[var(--accent-brand)]"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-text-primary">
                        {r.link.parsedNumber ? `${r.link.parsedNumber}. ` : ""}
                        {r.link.parsedHeading}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-text-tertiary">
                        {o ? (
                          r.link.certainty === "sure" ? (
                            <CheckCircle2 className="size-3 text-status-success" aria-hidden />
                          ) : (
                            <AlertTriangle className="size-3 text-status-uncertain" aria-hidden />
                          )
                        ) : null}
                        {o
                          ? `${r.manual ? "Valgt manuelt" : r.link.certainty === "sure" ? "Sikker" : "Usikker"} · ${r.link.lines.length} linjer${r.link.unmatched ? ` · ${r.link.unmatched} uten par` : ""}`
                          : "Ikke koblet"}
                      </span>
                    </span>
                    <select
                      aria-label="Norsk scene"
                      value={r.link.occurrenceId ?? ""}
                      onChange={(e) => relink(i, e.target.value || null)}
                      className={control}
                    >
                      <option value="">— ikke koble —</option>
                      {occs.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.productionNumber ? `${x.productionNumber}. ` : ""}
                          {formatHeading(state.variants[x.variantId]!.heading)}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {err ? (
          <p role="alert" className="text-xs text-status-danger">
            {err}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Avbryt
          </Button>
          {parsed ? (
            <Button onClick={save} disabled={!linked.length}>
              Lagre {lines} oversettelser
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
