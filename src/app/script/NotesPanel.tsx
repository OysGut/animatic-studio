/**
 * Notater i inspektøren (DEC-0031, REQ-0535–0537): lese, skrive, endre og slette notater på tekst
 * og nåler på scenen. Stempelet (hvem og når) står i hjørnet. Sletting krever bekreftelse og kan angres.
 */
import { Check, MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  L,
  formatEdited,
  formatStamp,
  newId,
  resolveRange,
  trialEditResult,
  type Annotation,
  type Command,
  type NewAnnotation,
  type ProjectState,
} from "@/core";
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
      L("Nytt notat", "New note"),
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
        <p className="text-xs text-text-tertiary">{L("Ingen notater.", "No notes.")}</p>
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
              placeholder={L("Skriv notatet …", "Write the note …")}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add();
                if (e.key === "Escape") setAdding(false);
              }}
              className="bg-surface-3 text-[13px]"
            />
            <div className="flex gap-1.5">
              <Button size="sm" onClick={add} disabled={!draft.trim()}>
                {L("Lagre notat", "Save note")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                {L("Avbryt", "Cancel")}
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
          {L("Systemmerknad", "System note")}
        </span>
      ) : null}
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
              ? L("Hele elementet", "The whole element")
              : L(
                  `«${block.text.slice(range.start, range.end)}»`,
                  `“${block.text.slice(range.start, range.end)}”`,
                )
            : null}
          {range && !range.found ? (
            <span className="not-italic text-status-uncertain">
              {L(
                `Teksten er endret – «${note.quote}» finnes ikke lenger`,
                `The text has changed – “${note.quote}” no longer exists`,
              )}
            </span>
          ) : null}
        </p>
      ) : (
        <span className={formatEdited(note) ? "h-5" : "h-2.5"} aria-hidden />
      )}
      {trial ? (
        <div className="flex flex-col gap-0.5 text-[12px]" data-testid="trial-edit-note">
          <span className="text-[11px] font-medium text-note">
            {L("Forsøksvis manusredigering", "Trial script edit")}
          </span>
          <span className="text-text-tertiary">
            {L("Original:", "Original:")}{" "}
            <span className="line-through">{note.quote || block?.text || ""}</span>
          </span>
          <span className="text-text-primary">
            {L("Forslag:", "Suggestion:")} {note.suggestedText}
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
                  L("Endre notat", "Edit note"),
                );
                setErr(e);
                if (!e) setEditing(false);
              }}
            >
              {L("Lagre", "Save")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {L("Avbryt", "Cancel")}
            </Button>
          </div>
        </>
      ) : (
        <p className="whitespace-pre-wrap text-[13px] text-text-primary">{note.text}</p>
      )}
      {editable && !editing ? (
        <div className="flex gap-1">
          {system ? (
            <button
              type="button"
              data-testid="system-note-done"
              className="mr-2 flex items-center gap-1 rounded-sm bg-accent-warm/15 px-1.5 text-[11px] text-text-primary hover:bg-accent-warm/25"
              title={L(
                "Lagre merknaden som ferdig (den forsvinner, og kan angres)",
                "Save the note as done (it disappears, and can be undone)",
              )}
              onClick={() =>
                setErr(
                  run(
                    { type: "SetAnnotationRemoved", annotationId: note.id, removed: true },
                    L("Merknad ferdig", "Note done"),
                  ),
                )
              }
            >
              <Check className="size-3" aria-hidden />
              {L("Ferdig", "Done")}
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
                  ? L(
                      "Teksten i manuset er endret, så forslaget kan ikke settes inn automatisk",
                      "The text in the script has changed, so the suggestion cannot be inserted automatically",
                    )
                  : L("Sett forslaget inn i manuset (spør først)", "Insert the suggestion in the script (asks first)")
              }
              onClick={() => setApplying(true)}
            >
              <Check className="size-3" aria-hidden />
              {L("Bruk forslaget", "Use the suggestion")}
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
            {L("Endre", "Edit")}
          </button>
          <button
            type="button"
            className="ml-2 flex items-center gap-1 text-[11px] text-text-tertiary hover:text-status-danger"
            onClick={() => setConfirm(true)}
          >
            <Trash2 className="size-3" aria-hidden />
            {L("Slett", "Delete")}
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
                {L("Bruke forslaget i manuset?", "Use the suggestion in the script?")}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="flex flex-col gap-1 text-[13px]">
                  <span>
                    {L("Nå:", "Now:")} {block.text}
                  </span>
                  <span className="text-text-primary">
                    {L("Blir:", "Becomes:")} {proposed}
                  </span>
                  <span>
                    {L(
                      "Endringen er en vanlig manusredigering og kan angres med ⌘/Ctrl + Z. Notatet blir stående til du sletter det.",
                      "The change is an ordinary script edit and can be undone with ⌘/Ctrl + Z. The note stays until you delete it.",
                    )}
                  </span>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{L("Avbryt", "Cancel")}</AlertDialogCancel>
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
                      L("Bruk forslaget", "Use the suggestion"),
                    ),
                  );
                }}
              >
                {L("Bruk forslaget", "Use the suggestion")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent className="border-border bg-surface-2">
          <AlertDialogHeader>
            <AlertDialogTitle>{L("Slette notatet?", "Delete the note?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {L("«", "“")}
              {note.text.length > 120 ? `${note.text.slice(0, 120)} …` : note.text}
              {L("»", "”")} – {formatStamp(note)}.{" "}
              {L(
                "Du kan angre slettingen med ⌘/Ctrl + Z.",
                "You can undo the deletion with ⌘/Ctrl + Z.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{L("Avbryt", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-status-danger text-accent-fg hover:bg-status-danger/90"
              onClick={() =>
                setErr(
                  run(
                    { type: "SetAnnotationRemoved", annotationId: note.id, removed: true },
                    L("Slett notat", "Delete note"),
                  ),
                )
              }
            >
              {L("Slett", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
