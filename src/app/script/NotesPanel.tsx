/**
 * Notater i inspektøren (DEC-0031, REQ-0535–0537): lese, skrive, endre og slette notater på tekst
 * og nåler på scenen. Stempelet (hvem og når) står i hjørnet. Sletting krever bekreftelse og kan angres.
 */
import { MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  formatEdited,
  formatStamp,
  newId,
  resolveRange,
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
      "Nytt notat",
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
        <p className="text-xs text-text-tertiary">Ingen notater.</p>
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
              placeholder="Skriv notatet …"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add();
                if (e.key === "Escape") setAdding(false);
              }}
              className="bg-surface-3 text-[13px]"
            />
            <div className="flex gap-1.5">
              <Button size="sm" onClick={add} disabled={!draft.trim()}>
                Lagre notat
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Avbryt
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
}: {
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
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focused]);
  const block = note.blockId ? state.blocks[note.blockId] : undefined;
  const range = block ? resolveRange(note, block.text) : null;

  return (
    <div
      ref={ref}
      className={
        "relative flex flex-col gap-1 border-l-2 border-note bg-surface-2 py-1.5 pl-2 pr-2 " +
        (focused ? "outline outline-1 outline-note" : "")
      }
    >
      <span className="absolute right-1.5 top-1 text-right text-[10px] leading-tight text-text-tertiary">
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
              ? "Hele elementet"
              : `«${block.text.slice(range.start, range.end)}»`
            : null}
          {range && !range.found ? (
            <span className="not-italic text-status-uncertain">
              Teksten er endret – «{note.quote}» finnes ikke lenger
            </span>
          ) : null}
        </p>
      ) : (
        <span className={formatEdited(note) ? "h-5" : "h-2.5"} aria-hidden />
      )}
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
                  "Endre notat",
                );
                setErr(e);
                if (!e) setEditing(false);
              }}
            >
              Lagre
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Avbryt
            </Button>
          </div>
        </>
      ) : (
        <p className="whitespace-pre-wrap text-[13px] text-text-primary">{note.text}</p>
      )}
      {editable && !editing ? (
        <div className="flex gap-1">
          <button
            type="button"
            className="flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-primary"
            onClick={() => {
              setText(note.text);
              setEditing(true);
            }}
          >
            <Pencil className="size-3" aria-hidden />
            Endre
          </button>
          <button
            type="button"
            className="ml-2 flex items-center gap-1 text-[11px] text-text-tertiary hover:text-status-danger"
            onClick={() => setConfirm(true)}
          >
            <Trash2 className="size-3" aria-hidden />
            Slett
          </button>
        </div>
      ) : null}
      {err ? (
        <p role="alert" className="text-xs text-status-danger">
          {err}
        </p>
      ) : null}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent className="border-border bg-surface-2">
          <AlertDialogHeader>
            <AlertDialogTitle>Slette notatet?</AlertDialogTitle>
            <AlertDialogDescription>
              «{note.text.length > 120 ? `${note.text.slice(0, 120)} …` : note.text}» –{" "}
              {formatStamp(note)}. Du kan angre slettingen med ⌘/Ctrl + Z.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-status-danger text-accent-fg hover:bg-status-danger/90"
              onClick={() =>
                setErr(
                  run(
                    { type: "SetAnnotationRemoved", annotationId: note.id, removed: true },
                    "Slett notat",
                  ),
                )
              }
            >
              Slett
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
