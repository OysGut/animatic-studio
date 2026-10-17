/**
 * Manuset for scenen i sceneeditoren (DEC-0089, Mars 16.10.2026: «I sceneeditoren mangler en jo en boks som
 * også skal være mulig å flytte rundt der en kan lese manuset for den aktuelle scenen og den skal også være
 * mulig å ta opp i en popup og endre slik en ønsker»). Lesevisning av scenen i manusform; det som spilles av,
 * er markert. «Rediger manus …» (eller dobbeltklikk på en linje) åpner redigeringen i et eget vindu.
 */
import { FileText, MessageSquare } from "lucide-react";
import { memo, useEffect, useMemo, useRef } from "react";
import {
  L,
  annotationsOfVariant,
  blockAtCompositionFrame,
  blockSpans,
  blocksOfVariant,
  formatHeading,
  sceneNumberOf,
  type BlockKind,
  type FilmClip,
  type ProjectState,
} from "@/core";

/** Innrykk og stil per elementtype, omtrent som på manusarket. */
const KIND_CLASS: Record<BlockKind, string> = {
  heading: "font-bold uppercase",
  action: "",
  character: "pl-[38%] uppercase",
  parenthetical: "pl-[30%] pr-[20%]",
  dialogue: "pl-[18%] pr-[12%]",
  transition: "text-right uppercase",
  shot: "uppercase",
  note: "italic text-text-tertiary",
};

/** Luft over blokken (karakternavnet står tett over replikken). */
function gapBefore(kind: BlockKind, prev: BlockKind | null): string {
  if (prev === null) return "";
  if (kind === "dialogue" || kind === "parenthetical") return "";
  return "mt-[1em]";
}

export const SceneScriptPanel = memo(function SceneScriptPanel({
  state,
  occurrenceId,
  clip,
  frame,
  playing,
  editable,
  onOpenEditor,
}: {
  state: ProjectState;
  occurrenceId: string;
  /** Scenens klipp i filmen (for å finne det som spilles av), eller null om scenen ikke er med i filmen. */
  clip: FilmClip | null;
  /** Bildet i 2D-scenen som vises nå. */
  frame: number;
  playing: boolean;
  editable: boolean;
  /** Åpne redigeringen (med en linje valgt, eller scenen). */
  onOpenEditor: (blockId: string | null) => void;
}) {
  const occ = state.occurrences[occurrenceId];
  const variant = occ ? state.variants[occ.variantId] : undefined;
  const blocks = useMemo(
    () => (variant ? blocksOfVariant(state, variant.id).filter((b) => b.kind !== "heading") : []),
    [state, variant],
  );
  const notesByBlock = useMemo(() => {
    const m = new Map<string, number>();
    if (!variant) return m;
    for (const a of annotationsOfVariant(state, variant.id))
      if (a.blockId) m.set(a.blockId, (m.get(a.blockId) ?? 0) + 1);
    return m;
  }, [state, variant]);
  const spans = useMemo(() => (clip ? blockSpans(state, clip) : []), [state, clip]);
  const active = useMemo(
    () => (clip ? blockAtCompositionFrame(state, clip, frame, spans) : null),
    [state, clip, frame, spans],
  );
  // Under avspilling følger visningen med
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!playing || !active) return;
    listRef.current
      ?.querySelector(`[data-script-block="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, playing]);
  if (!occ || !variant) return null;
  const number = sceneNumberOf(state, occ);
  const open = editable
    ? L("Rediger manus …", "Edit script …")
    : L("Vis manuset …", "View the script …");
  return (
    <section aria-label={L("Manus", "Script")} className="flex min-h-0 flex-col">
      <h2 className="flex h-8 shrink-0 items-center border-b border-border bg-surface-2 px-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
        {L("Manus", "Script")}
      </h2>
      <div className="flex items-center gap-2 px-2 pb-1 pt-1">
        <button
          type="button"
          onClick={() => onOpenEditor(null)}
          data-testid="scene-script-edit"
          className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-dashed border-border-control px-2 py-1 text-xs text-text-secondary hover:border-accent-brand hover:text-text-primary"
          title={L(
            "Åpne manuset for scenen i et eget vindu med alle redigeringsmulighetene. Dobbeltklikk på en linje for å gå rett til den.",
            "Open the script for the scene in a separate window with all the editing options. Double-click a line to go straight to it.",
          )}
        >
          <FileText className="size-3.5" aria-hidden />
          {open}
        </button>
      </div>
      <div
        ref={listRef}
        data-testid="scene-script"
        className="px-3 pb-3 font-script text-[12px] leading-[1.35] text-text-primary"
      >
        <p className="font-bold uppercase" data-script-heading>
          {number ? `${number}  ` : ""}
          {formatHeading(variant.heading)}
        </p>
        {blocks.length === 0 ? (
          <p className="mt-2 font-sans text-xs text-text-tertiary">
            {L("Scenen har ingen tekst ennå.", "The scene has no text yet.")}
          </p>
        ) : null}
        {blocks.map((b, i) => {
          const isActive = b.id === active;
          const notes = notesByBlock.get(b.id) ?? 0;
          return (
            <p
              key={b.id}
              data-script-block={b.id}
              data-active={isActive ? true : undefined}
              onDoubleClick={() => onOpenEditor(b.id)}
              title={L("Dobbeltklikk for å redigere", "Double-click to edit")}
              className={
                "relative cursor-default whitespace-pre-wrap rounded-sm " +
                KIND_CLASS[b.kind] +
                " " +
                gapBefore(b.kind, i > 0 ? blocks[i - 1]!.kind : "heading") +
                (isActive ? " bg-accent-selection outline outline-1 outline-accent-brand/60" : "")
              }
            >
              {b.kind === "parenthetical" && !b.text.startsWith("(") ? `(${b.text})` : b.text}
              {notes ? (
                <span
                  className="absolute -right-2.5 top-0 text-note"
                  aria-label={L(`${notes} notater`, `${notes} notes`)}
                >
                  <MessageSquare className="size-2.5" aria-hidden />
                </span>
              ) : null}
            </p>
          );
        })}
      </div>
    </section>
  );
});
