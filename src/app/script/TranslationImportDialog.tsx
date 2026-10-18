/**
 * Import av et ferdig oversatt manus (M7 del 2, DEC-0058, REQ-0332–0335). Scenene og linjene kobles til de
 * norske automatisk; brukeren ser koblingene, kan velge en annen norsk scene og godkjenner. Ikke-godkjente
 * koblinger lagres som usikre og kan godkjennes senere i inspektøren. Det norske manuset endres ikke.
 */
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { alignTranslationWithAi } from "@/adapters/ai/translation-align.functions";
import { aiAlignRequest } from "@/core/translation/align-prompt";
import { useMemo, useRef, useState } from "react";
import {
  LANGUAGE_LABEL,
  alignLines,
  alignTranslation,
  blocksOfVariant,
  formatHeading,
  newId,
  L,
  orderedOccurrences,
  translationItems,
  type Command,
  type ParsedScreenplay,
  type ProjectState,
  type SceneLink,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { SCREENPLAY_ACCEPT } from "@/engine/import/browser";
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
  /** Forslag fra den innebygde AI-en (OG2) – må alltid godkjennes av brukeren. */
  readonly ai?: { readonly confidence: "high" | "medium" | "low"; readonly reason: string };
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
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const alignAi = useServerFn(alignTranslationWithAi);
  const occs = useMemo(() => orderedOccurrences(state, productionId), [state, productionId]);
  const langName = LANGUAGE_LABEL[language] ?? language;

  function reset() {
    setParsed(null);
    setRows([]);
    setErr(null);
    setFileName("");
    setAiNote(null);
  }

  /** Den innebygde AI-en foreslår koblinger for usikre eller manglende scener (B-048). */
  async function suggestWithAi(parsedDoc: ParsedScreenplay, links: readonly SceneLink[]) {
    const items = aiAlignRequest(
      links,
      (i) => (parsedDoc.scenes[i]?.elements ?? []).filter((e) => e.kind !== "heading").map((e) => e.text),
      occs.map((o) => o.id),
    );
    if (!items.length) return;
    setAiBusy(true);
    try {
      const r = await alignAi({ data: { projectId: state.project.id, language, items } });
      if (!r.ok) {
        setAiNote(r.message);
        return;
      }
      const byIndex = new Map(r.links.map((l) => [l.index, l]));
      setRows((rs) =>
        rs.map((row) => {
          const ai = byIndex.get(row.link.parsedIndex);
          if (!ai || row.manual || !ai.occurrenceId) return row;
          const o = state.occurrences[ai.occurrenceId];
          const p = parsedDoc.scenes[row.link.parsedIndex];
          if (!o || !p) return row;
          const { lines, unmatched } = alignLines(p, blocksOfVariant(state, o.variantId));
          // Aldri stille godkjenning: AI-forslag krysses ikke av
          return {
            approved: false,
            ai: { confidence: ai.confidence, reason: ai.reason },
            link: { ...row.link, occurrenceId: o.id, certainty: "uncertain", lines, unmatched },
          };
        }),
      );
      setAiNote(
        r.links.length
          ? L(
              `Den innebygde AI-en foreslo koblinger for ${r.links.length} usikre scener. Kontroller og godkjenn dem.`,
              `The built-in AI suggested links for ${r.links.length} uncertain scenes. Check and approve them.`,
            )
          : null,
      );
    } catch {
      setAiNote(L("Den innebygde AI-en svarte ikke. Koblingene bygger på reglene.", "The built-in AI did not respond. The links are based on rules."));
    } finally {
      setAiBusy(false);
    }
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
      void suggestWithAi(r.parsed, links);
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
      setErr(L("Ingen scener er koblet.", "No scenes are linked."));
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
      const e = cmds.run(
        c,
        L(`Importer ${langName.toLowerCase()} manus`, `Import ${langName} script`),
        group,
      );
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
          <DialogTitle>
            {L(`Importer ${langName.toLowerCase()} manus`, `Import ${langName} script`)}
          </DialogTitle>
          <DialogDescription>
            {L(
              "Et ferdig oversatt manus (PDF, Word eller Fountain) kobles til de norske scenene og replikkene. Det norske manuset endres ikke. Kontroller koblingene før du lagrer.",
              "A finished translated script (PDF, Word or Fountain) is linked to the Norwegian scenes and lines. The Norwegian script is not changed. Check the links before you save.",
            )}
          </DialogDescription>
        </DialogHeader>
        {!parsed ? (
          <div className="flex flex-col items-start gap-2">
            <input
              ref={input}
              type="file"
              accept={SCREENPLAY_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void read(f);
                e.target.value = "";
              }}
            />
            <Button onClick={() => input.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <FileUp />}
              {busy
                ? L("Leser manuset …", "Reading the script …")
                : L("Velg fil …", "Choose file …")}
            </Button>
          </div>
        ) : (
          <>
            <p className="text-xs text-text-secondary">
              {fileName}:{" "}
              {L(
                `${rows.length} scener, ${linked.length} koblet, ${lines} linjer får oversettelse. Usikre koblinger er ikke krysset av – de lagres som usikre og kan godkjennes senere.`,
                `${rows.length} scenes, ${linked.length} linked, ${lines} lines get a translation. Uncertain links are not ticked – they are saved as uncertain and can be approved later.`,
              )}
            </p>
            {aiBusy ? (
              <p role="status" data-testid="translation-ai-status" className="flex items-center gap-1 text-xs text-text-secondary">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                {L("Den innebygde AI-en ser på de usikre koblingene …", "The built-in AI is checking the uncertain links …")}
              </p>
            ) : aiNote ? (
              <p role="status" data-testid="translation-ai-status" className="text-xs text-text-secondary">{aiNote}</p>
            ) : null}
            {dupes ? (
              <p className="flex items-center gap-1 text-xs text-status-uncertain">
                <AlertTriangle className="size-3.5" aria-hidden />
                {L(
                  "Samme norske scene er valgt for flere importerte scener. Bare den første brukes.",
                  "The same Norwegian scene is chosen for several imported scenes. Only the first is used.",
                )}
              </p>
            ) : null}
            <ul aria-label={L("Koblinger", "Links")} className="flex flex-col border border-border">
              {rows.map((r, i) => {
                const o = r.link.occurrenceId ? state.occurrences[r.link.occurrenceId] : undefined;
                return (
                  <li
                    key={i}
                    data-testid="translation-link"
                    data-ai={r.ai ? "true" : undefined}
                    className="grid grid-cols-[18px_1fr_auto] items-center gap-2 border-b border-border px-2 py-1 text-xs last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      aria-label={L("Godkjent kobling", "Approved link")}
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
                          ? L(
                              `${r.manual ? "Valgt manuelt" : r.link.certainty === "sure" ? "Sikker" : "Usikker"} · ${r.link.lines.length} linjer${r.link.unmatched ? ` · ${r.link.unmatched} uten par` : ""}`,
                              `${r.manual ? "Chosen manually" : r.link.certainty === "sure" ? "Certain" : "Uncertain"} · ${r.link.lines.length} lines${r.link.unmatched ? ` · ${r.link.unmatched} without a pair` : ""}`,
                            )
                          : L("Ikke koblet", "Not linked")}
                        {o && r.ai && !r.manual
                          ? L(
                              ` · Forslag fra AI (${r.ai.confidence === "high" ? "sikker" : r.ai.confidence === "medium" ? "trolig" : "usikker"})${r.ai.reason ? `: ${r.ai.reason}` : ""}`,
                              ` · AI suggestion (${r.ai.confidence === "high" ? "certain" : r.ai.confidence === "medium" ? "likely" : "uncertain"})${r.ai.reason ? `: ${r.ai.reason}` : ""}`,
                            )
                          : null}
                      </span>
                    </span>
                    <select
                      aria-label={L("Norsk scene", "Norwegian scene")}
                      value={r.link.occurrenceId ?? ""}
                      onChange={(e) => relink(i, e.target.value || null)}
                      className={control}
                    >
                      <option value="">{L("— ikke koble —", "— do not link —")}</option>
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
            {L("Avbryt", "Cancel")}
          </Button>
          {parsed ? (
            <Button onClick={save} disabled={!linked.length}>
              {L(`Lagre ${lines} oversettelser`, `Save ${lines} translations`)}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
