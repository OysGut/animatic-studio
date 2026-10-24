/**
 * Manuset for scenen i sceneeditoren (DEC-0089, Mars 16.10.2026: «I sceneeditoren mangler en jo en boks som
 * også skal være mulig å flytte rundt der en kan lese manuset for den aktuelle scenen og den skal også være
 * mulig å ta opp i en popup og endre slik en ønsker»). Lesevisning av scenen i manusform; det som spilles av,
 * er markert. «Rediger manus …» (eller dobbeltklikk på en linje) åpner redigeringen i et eget vindu.
 */
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { FileText, MessageSquare } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { NotesPanel } from "@/app/script/NotesPanel";
import { DriftBadge } from "@/app/dialogue/DriftBadge";
import { Button } from "@/components/ui/button";
import { annotationsOfVariant, blockAtCompositionFrame, blockSpans, blocksOfVariant, dialogueOwnerOf, scriptSeekTarget, SCRIPT_CLICK_DELAY_MS, type ScriptSeek, formatHeading, sceneNumberOf, wordRange, type BlockKind, type FilmClip, type Command, type NewAnnotation, type ProjectState } from "@/core";
import { useLanguage } from "@/app/i18n/language";
import { t as tk } from "@/core/i18n/keyed";

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
  highlightBlockIds,
  hideEditButton = false,
  run,
  authorName = "",
  onSeek,
  onOpenDialogue,
  projectId,
}: {
  /** DV7: prosjektet (for avvikslenken). */
  projectId?: string | undefined;
  /** DV1: enkeltklikk flytter avspillingshodet hit (bildet i 2D-scenen). */
  onSeek?: ((compFrame: number) => void) | undefined;
  /** DV1: dobbeltklikk på en replikk åpner opptaks- og dialogvinduet med replikken valgt. */
  onOpenDialogue?: ((blockId: string) => void) | undefined;
  /** Skjul «Rediger manus …» (Asset Studio: manuset endres der bare som forsøksvise redigeringer). */
  hideEditButton?: boolean;
  /** Replikkene som markeres (Asset Studio, C1: karakterens replikker). */
  highlightBlockIds?: ReadonlySet<string> | undefined;
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
  run?: (command: Command, label: string) => string | null;
  authorName?: string;
}) {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const [noteTarget, setNoteTarget] = useState<Omit<NewAnnotation, "annotationId" | "text" | "authorName"> | null>(null);
  const [seek, setSeek] = useState<ScriptSeek | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (clickTimer.current) clearTimeout(clickTimer.current); }, []);
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
  /** Tegnplassen klikket traff i blokkens tekst (for ordkoblingen), eller undefined. */
  const caretOffset = (blockId: string, x: number, y: number): number | undefined => {
    // Tegnet under musepekeren (ikke markeringen – et vanlig klikk på ikke-redigerbar tekst gir ingen markør)
    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    let node: Node | null = null;
    let offset = 0;
    const pos = doc.caretPositionFromPoint?.(x, y);
    if (pos) {
      node = pos.offsetNode;
      offset = pos.offset;
    } else {
      const r = doc.caretRangeFromPoint?.(x, y);
      if (r) {
        node = r.startContainer;
        offset = r.startOffset;
      }
    }
    if (!node) return undefined;
    const host = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    const el = host?.closest<HTMLElement>("[data-script-text]");
    if (!el || el.dataset["scriptText"] !== blockId) return undefined;
    const before = document.createRange();
    before.selectNodeContents(el);
    before.setEnd(node, offset);
    return before.toString().length;
  };
  const singleClick = (blockId: string, x: number, y: number) => {
    if (!onSeek) return;
    const sel = window.getSelection();
    // Markering av tekst (notat på ord) er ikke navigasjon
    if (sel && !sel.isCollapsed) return;
    const offset = caretOffset(blockId, x, y);
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      const target = scriptSeekTarget(state, clip, blockId, offset);
      setSeek(target);
      if (target.compFrame !== null) onSeek(target.compFrame);
    }, SCRIPT_CLICK_DELAY_MS);
  };
  const doubleClick = (blockId: string) => {
    // Avlys enkeltklikket: dobbeltklikk utfører bare dobbeltklikkets handling (§7)
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    const owner = dialogueOwnerOf(state, variant.id, blockId);
    if (onOpenDialogue && state.blocks[owner]?.kind === "dialogue") onOpenDialogue(owner);
    else onOpenEditor(blockId);
  };
  const SEEK_LABEL: Record<ScriptSeek["quality"], string> = {
    exact: tk("app-scene-editor-scene-script-panel.exact.exact.cce8a64495c6"),
    estimated: tk("app-scene-editor-scene-script-panel.estimated.estimated.336cd8482a62"),
    missing: tk("app-scene-editor-scene-script-panel.missing.missing.f39b8ad14823"),
  };
  const number = sceneNumberOf(state, occ);
  const open = editable
    ? tk("app-scene-editor-scene-script-panel.open.memo.181eee19efab")
    : tk("app-scene-editor-scene-script-panel.open.memo.72a8e5baf403");
  return (
    <section aria-label={tk("app-scene-editor-scene-script-panel.scene-script-panel.aria-label.c920515d4016")} className="flex min-h-0 flex-col">
      <PanelHeader as="h2" title={tk("app-scene-editor-scene-script-panel.scene-script-panel.title.c920515d4016")} />
      <div className={"flex items-center gap-2 px-2 pb-1 pt-1" + (hideEditButton ? " hidden" : "")}>
        <button
          type="button"
          onClick={() => onOpenEditor(null)}
          data-testid="scene-script-edit"
          className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-dashed border-border-control px-2 py-1 text-xs text-text-secondary hover:border-accent-brand hover:text-text-primary"
          title={tk("app-scene-editor-scene-script-panel.scene-script-panel.title.6d79c6b3dcae")}
        >
          <FileText className="size-3.5" aria-hidden />
          {open}
        </button>
      </div>
      <div
        ref={listRef}
        data-testid="scene-script"
        onMouseUp={() => {
          if (!editable || !run || hideEditButton) return;
          const selection = window.getSelection();
          if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return;
          const range = selection.getRangeAt(0);
          const element = range.startContainer.parentElement?.closest<HTMLElement>("[data-script-text]");
          if (!element || !element.contains(range.endContainer)) return;
          const blockId = element.dataset["scriptText"];
          const block = blockId ? state.blocks[blockId] : undefined;
          if (!block) return;
          const before = document.createRange();
          before.selectNodeContents(element);
          before.setEnd(range.startContainer, range.startOffset);
          const start = before.toString().length;
          const end = start + range.toString().length;
          // KI-226: et utvalg inni et ord utvides til hele ordet, så notatet følger ordet
          const wr = wordRange(block.text, start, end);
          if (wr.end > wr.start && wr.end <= block.text.length)
            setNoteTarget({ blockId: block.id, variantId: null, start: wr.start, end: wr.end, quote: block.text.slice(wr.start, wr.end) });
        }}
        className="px-3 pb-3 font-script text-[12px] leading-[1.35] text-text-primary"
      >
        <p className="font-bold uppercase" data-script-heading>
          {number ? `${number}  ` : ""}
          {formatHeading(variant.heading)}
        </p>
        {blocks.length === 0 ? (
          <p className="mt-2 font-sans text-xs text-text-tertiary">
            {tk("app-scene-editor-scene-script-panel.scene-script-panel.p.86e4e609c93c")}
          </p>
        ) : null}
        {blocks.map((b, i) => {
          const isActive = b.id === active;
          const marked = highlightBlockIds?.has(b.id) ?? false;
          const notes = notesByBlock.get(b.id) ?? 0;
          return (
            <p
              key={b.id}
              data-script-block={b.id}
              data-active={isActive ? true : undefined}
              data-highlight={marked ? true : undefined}
              data-selected={seek?.blockId === b.id ? true : undefined}
              data-seek-quality={seek?.blockId === b.id ? seek.quality : undefined}
              onClick={(e) => {
                // Bare første klikk navigerer; klikk nummer to tilhører dobbeltklikket (§7)
                if (e.detail > 1) return;
                singleClick(b.id, e.clientX, e.clientY);
              }}
              onDoubleClick={() => doubleClick(b.id)}
              // N10: replikker kan nås og åpnes med tastaturet (Enter = dobbeltklikk); dialogen gir fokus tilbake hit
              tabIndex={onOpenDialogue && b.kind === "dialogue" ? 0 : undefined}
              onKeyDown={
                onOpenDialogue && b.kind === "dialogue"
                  ? (e) => {
                      if (e.key !== "Enter" || e.target !== e.currentTarget) return;
                      e.preventDefault();
                      doubleClick(b.id);
                    }
                  : undefined
              }
              title={
                onOpenDialogue && (b.kind === "dialogue" || b.kind === "character")
                  ? tk("app-scene-editor-scene-script-panel.scene-script-panel.title.b4d8bc9bdb42")
                  : tk("app-scene-editor-scene-script-panel.scene-script-panel.title.5401d3d2e97c")
              }
              className={
                "relative cursor-default whitespace-pre-wrap rounded-sm focus-visible:outline-2 focus-visible:outline-focus-ring " +
                KIND_CLASS[b.kind] +
                " " +
                gapBefore(b.kind, i > 0 ? blocks[i - 1]!.kind : "heading") +
                (isActive ? " bg-accent-selection outline outline-1 outline-accent-brand/60" : "") +
                (marked && !isActive ? " bg-surface-3 font-semibold" : "") +
                (seek?.blockId === b.id && !isActive ? " outline outline-1 outline-dashed outline-accent-brand/50" : "")
              }
            >
              {b.kind === "parenthetical" && !b.text.startsWith("(") ? "(" : null}
              <span data-script-text={b.id}>{b.text}</span>
              {b.kind === "parenthetical" && !b.text.startsWith("(") ? ")" : null}
              {b.kind === "dialogue" && projectId ? <span className="ml-1 font-sans"><DriftBadge state={state} projectId={projectId} occurrenceId={occurrenceId} blockId={b.id} run={run} editable={editable} onGo={onSeek ? () => { const t = scriptSeekTarget(state, clip, b.id); setSeek(t); if (t.compFrame !== null) onSeek(t.compFrame); } : undefined} /></span> : null}
              {notes ? (
                <span
                  className="absolute -right-2.5 top-0 text-note"
                  role="img"
                  aria-label={tk("app-scene-editor-scene-script-panel.scene-script-panel.aria-label.f8c627eda4f7", { notes: String(notes) })}
                >
                  <MessageSquare className="size-2.5" aria-hidden />
                </span>
              ) : null}
            </p>
          );
        })}
      </div>
      {seek ? (
        <p
          role="status"
          aria-live="polite"
          data-testid="script-seek-status"
          data-quality={seek.quality}
          data-source={seek.source}
          className={
            "border-t border-border px-3 py-1 text-[11px] " +
            (seek.quality === "exact" ? "text-text-secondary" : seek.quality === "estimated" ? "text-accent-warm" : "text-destructive")
          }
        >
          {SEEK_LABEL[seek.quality]}
        </p>
      ) : null}
      {noteTarget && run ? (
        <div className="border-t border-border px-3 py-2" data-testid="scene-word-note">
          <NotesPanel state={state} notes={[]} editable={editable} run={run} authorName={authorName}
            newTarget={noteTarget} newLabel={tk("app-scene-editor-scene-script-panel.scene-script-panel.new-label.52c69bb174ef")} />
          <Button size="sm" variant="ghost" onClick={() => setNoteTarget(null)}>{tk("app-scene-editor-scene-script-panel.scene-script-panel.button.f40600c92751")}</Button>
        </div>
      ) : null}
    </section>
  );
});
