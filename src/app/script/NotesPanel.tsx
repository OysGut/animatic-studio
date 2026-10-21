/**
 * Notater i inspektøren (DEC-0031, REQ-0535–0537): lese, skrive, endre og slette notater på tekst
 * og nåler på scenen. Stempelet (hvem og når) står i hjørnet. Sletting krever bekreftelse og kan angres.
 */
import { Check, MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatEdited, formatStamp, newId, resolveRange, trialEditResult, type Annotation, type Command, type NewAnnotation, type ProjectState } from "@/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/core/i18n/keyed";

interface Props {
  readonly state: ProjectState;
  readonly notes: readonly Annotation[];
  readonly editable: boolean;
  readonly run: (command: Command, label: string) => string | null;
  /** Notatet som skal fremheves (klikket i margen). */
  readonly focusId?: string | null;
  readonly authorName: string;
  /** Hva et nytt notat herfra festes til (hele blokken eller nål på scenen). */
  readonly newTarget: Omit<NewAnnotation, "annotationId" | "text" | "authorName"> | null;
  readonly newLabel: string;
  readonly showQuotes?: boolean;
  /**
   * Produksjonen manuset redigeres i: med den viser en forsøksvis manusredigering (AS3) «Bruk forslaget»,
   * som går gjennom vanlig manusredigering (EditBlockText) etter bekreftelse.
   */
  readonly productionId?: string;
}

export function NotesPanel({
  state,
  notes,
  editable,
  run,
  focusId,
  authorName,
  newTarget,
  newLabel,
  showQuotes = true,
  productionId,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function add() {
    if (!newTarget || !draft.trim()) return;
    const e = run(
      {
        type: "AddAnnotations",
        annotations: [
          { ...newTarget, annotationId: newId<"annotation">(), text: draft, authorName },
        ],
      },
      t("app-script-notes-panel.e.run.c4d1f019e650"),
    );
    setErr(e);
    if (!e) {
      setDraft("");
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {notes.length === 0 && !adding ? (
        <p className="text-xs text-text-tertiary">{t("app-script-notes-panel.notes-panel.p.5ea42d80dea6")}</p>
      ) : null}
      {notes.map((n) => (
        <NoteCard
          key={n.id}
          state={state}
          note={n}
          editable={editable}
          run={run}
          focused={n.id === focusId}
          showQuote={showQuotes}
          authorName={authorName}
          productionId={productionId}
        />
      ))}
      {editable && newTarget ? (
        adding ? (
          <div className="flex flex-col gap-1.5 border border-note/40 bg-note-bg p-2">
            <Textarea
              autoFocus
              value={draft}
              maxLength={10000}
              rows={3}
              placeholder={t("app-script-notes-panel.notes-panel.placeholder.3fb2af2fb906")}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add();
                if (e.key === "Escape") setAdding(false);
              }}
              className="bg-surface-3 text-[13px]"
            />
            <div className="flex gap-1.5">
              <Button size="sm" onClick={add} disabled={!draft.trim()}>
                {t("app-script-notes-panel.notes-panel.button.81f9dc4b1fe8")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                {t("app-script-notes-panel.notes-panel.button.c41d1797f20e")}
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="self-start" onClick={() => setAdding(true)}>
            <MessageSquarePlus />
            {newLabel}
          </Button>
        )
      ) : null}
      {err ? (
        <p role="alert" className="text-xs text-status-danger">
          {err}
        </p>
      ) : null}
    </div>
  );
}

function NoteCard({
  state,
  note,
  editable,
  run,
  focused,
  showQuote,
  authorName,
  productionId,
}: {
  productionId?: string | undefined;
  authorName: string;
  state: ProjectState;
  note: Annotation;
  editable: boolean;
  run: (command: Command, label: string) => string | null;
  focused: boolean;
  showQuote: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  const [confirm, setConfirm] = useState(false);
  const [applying, setApplying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focused]);
  const block = note.blockId ? state.blocks[note.blockId] : undefined;
  const range = block ? resolveRange(note, block.text) : null;
  // Merknad fra programmet (DEC-0088): varm farge, merket «Systemmerknad», «Ferdig» lukker den
  const system = note.source === "system";
  // Forsøksvis manusredigering (AS3, C3): original og forslag; «Bruk forslaget» via vanlig manusredigering
  const trial = note.kind === "trial_edit";
  const proposed = block ? trialEditResult(note, block.text) : null;

  return (
    <div
      ref={ref}
      data-note-resolved={note.resolved === true}
      className={
        "relative flex flex-col gap-1 border-l-2 bg-surface-2 py-1.5 pl-2 pr-2 " +
        (system ? "border-accent-warm " : "border-note ") +
        (focused
          ? system
            ? "outline outline-1 outline-accent-warm"
            : "outline outline-1 outline-note"
          : "")
      }
    >
      {system ? (
        <span
          className="absolute left-2 top-1 text-[11px] font-medium text-accent-warm"
          data-testid="system-note"
        >
          {t("app-script-notes-panel.note-card.span.984b9307fcef")}
        </span>
      ) : null}
      {note.resolved ? <span className="text-xs text-status-success">{t("app-script-notes-panel.note-card.span.ec8d8f232d0a")}</span> : null}
      <span className="absolute right-1.5 top-1 text-right text-[11px] leading-tight text-text-tertiary">
        {formatStamp(note)}
        {formatEdited(note) ? <span className="block">{formatEdited(note)}</span> : null}
      </span>
      {showQuote && block ? (
        <p
          className={
            "truncate text-[11px] italic text-text-tertiary " +
            (formatEdited(note) ? "mt-5" : "mt-2.5")
          }
        >
          {range?.found
            ? note.quote === ""
              ? t("app-script-notes-panel.note-card.p.208d536e8791")
              : t("app-script-notes-panel.note-card.p.7200848544ae", { value1: String(block.text.slice(range.start, range.end)) })
            : null}
          {range && !range.found ? (
            <span className="not-italic text-status-uncertain">
              {t("app-script-notes-panel.note-card.span.2a88fa005f7d", { quote: String(note.quote) })}
            </span>
          ) : null}
        </p>
      ) : (
        <span className={formatEdited(note) ? "h-5" : "h-2.5"} aria-hidden />
      )}
      {trial ? (
        <div className="flex flex-col gap-0.5 text-[12px]" data-testid="trial-edit-note">
          <span className="text-[11px] font-medium text-note">
            {t("app-script-notes-panel.note-card.span.18e99a9cfc19")}
          </span>
          <span className="text-text-tertiary">
            {t("app-script-notes-panel.note-card.span.6ce84227139e")}{" "}
            <span className="line-through">{note.quote || block?.text || ""}</span>
          </span>
          <span className="text-text-primary">
            {t("app-script-notes-panel.note-card.span.105234e4f594")} {note.suggestedText}
          </span>
        </div>
      ) : null}
      {editing ? (
        <>
          <Textarea
            autoFocus
            value={text}
            maxLength={10000}
            rows={3}
            onChange={(e) => setText(e.target.value)}
            className="bg-surface-3 text-[13px]"
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              disabled={!text.trim()}
              onClick={() => {
                const e = run(
                  { type: "EditAnnotation", annotationId: note.id, text, editedByName: authorName },
                  t("app-script-notes-panel.e.run.6fea84673ef0"),
                );
                setErr(e);
                if (!e) setEditing(false);
              }}
            >
              {t("app-script-notes-panel.note-card.button.0b3bbe0059f1")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t("app-script-notes-panel.note-card.button.30f24e17e633")}
            </Button>
          </div>
        </>
      ) : (
        <p className="whitespace-pre-wrap text-[13px] text-text-primary">{note.text}</p>
      )}
      {editable && !editing ? (
        <div className="flex gap-1">
          {!system ? (
            <Button size="sm" variant="ghost" data-testid="note-resolve" onClick={() => setErr(run(
              { type: "SetAnnotationResolved", annotationId: note.id, resolved: !note.resolved },
              note.resolved ? t("app-script-notes-panel.note-card.run.caaf2883248f") : t("app-script-notes-panel.note-card.run.7800971e9387"),
            ))}>
              <Check className="size-3" aria-hidden />
              {note.resolved ? t("app-script-notes-panel.note-card.button.275d48310970") : t("app-script-notes-panel.note-card.button.bfb57b0e5c02")}
            </Button>
          ) : null}
          {system ? (
            <button
              type="button"
              data-testid="system-note-done"
              className="mr-2 flex items-center gap-1 rounded-sm bg-accent-warm/15 px-1.5 text-[11px] text-text-primary hover:bg-accent-warm/25"
              title={t("app-script-notes-panel.note-card.title.b85a4e84a652")}
              onClick={() =>
                setErr(
                  run(
                    { type: "SetAnnotationRemoved", annotationId: note.id, removed: true },
                    t("app-script-notes-panel.note-card.run.9d60a9c3eabc"),
                  ),
                )
              }
            >
              <Check className="size-3" aria-hidden />
              {t("app-script-notes-panel.note-card.button.36c18caddaa0")}
            </button>
          ) : null}
          {trial && productionId ? (
            <button
              type="button"
              data-testid="trial-edit-apply"
              disabled={proposed === null}
              className="mr-2 flex items-center gap-1 rounded-sm bg-note/15 px-1.5 text-[11px] text-text-primary hover:bg-note/25 disabled:opacity-50"
              title={
                proposed === null
                  ? t("app-script-notes-panel.note-card.title.a7b8a8485d2b")
                  : t("app-script-notes-panel.note-card.title.bb8a2e9e1ab8")
              }
              onClick={() => setApplying(true)}
            >
              <Check className="size-3" aria-hidden />
              {t("app-script-notes-panel.note-card.button.7ca2df9c7794")}
            </button>
          ) : null}
          <button
            type="button"
            className="flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-primary"
            onClick={() => {
              setText(note.text);
              setEditing(true);
            }}
          >
            <Pencil className="size-3" aria-hidden />
            {t("app-script-notes-panel.note-card.button.5e705445b458")}
          </button>
          <button
            type="button"
            className="ml-2 flex items-center gap-1 text-[11px] text-text-tertiary hover:text-status-danger"
            onClick={() => setConfirm(true)}
          >
            <Trash2 className="size-3" aria-hidden />
            {t("app-script-notes-panel.note-card.button.b891c4285a33")}
          </button>
        </div>
      ) : null}
      {err ? (
        <p role="alert" className="text-xs text-status-danger">
          {err}
        </p>
      ) : null}
      {trial && productionId && block ? (
        <AlertDialog open={applying} onOpenChange={setApplying}>
          <AlertDialogContent className="border-border bg-surface-2">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("app-script-notes-panel.note-card.alert-dialog-title.4e056f906029")}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="flex flex-col gap-1 text-[13px]">
                  <span>
                    {t("app-script-notes-panel.note-card.span.afe154a4b854")} {block.text}
                  </span>
                  <span className="text-text-primary">
                    {t("app-script-notes-panel.note-card.span.91d8807553d6")} {proposed}
                  </span>
                  <span>
                    {t("app-script-notes-panel.note-card.span.b9f6aaa4a166")}
                  </span>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("app-script-notes-panel.note-card.alert-dialog-cancel.30f24e17e633")}</AlertDialogCancel>
              <AlertDialogAction
                data-testid="trial-edit-confirm"
                onClick={() => {
                  if (proposed === null) return;
                  setErr(
                    run(
                      {
                        type: "EditBlockText",
                        productionId: productionId as never,
                        blockId: block.id,
                        text: proposed,
                      },
                      t("app-script-notes-panel.note-card.run.7ca2df9c7794"),
                    ),
                  );
                }}
              >
                {t("app-script-notes-panel.note-card.alert-dialog-action.7ca2df9c7794")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent className="border-border bg-surface-2">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("app-script-notes-panel.note-card.alert-dialog-title.ebbb81ea0efe")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("app-script-notes-panel.note-card.alert-dialog-description.1bb671203195")}
              {note.text.length > 120 ? `${note.text.slice(0, 120)} …` : note.text}
              {t("app-script-notes-panel.note-card.alert-dialog-description.49250bc79bc9")} – {formatStamp(note)}.{" "}
              {t("app-script-notes-panel.note-card.alert-dialog-description.3c0e06882b2c")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("app-script-notes-panel.note-card.alert-dialog-cancel.30f24e17e633.2")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-status-danger text-accent-fg hover:bg-status-danger/90"
              onClick={() =>
                setErr(
                  run(
                    { type: "SetAnnotationRemoved", annotationId: note.id, removed: true },
                    t("app-script-notes-panel.note-card.run.db937f500520"),
                  ),
                )
              }
            >
              {t("app-script-notes-panel.note-card.alert-dialog-action.b891c4285a33")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
