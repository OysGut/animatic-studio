/**
 * Paginert manusvisning (mandat 4.5, UX P4: manuset ser ut som et manus – ingen tekniske metadata på sidene).
 * Sidene tegnes i em-enheter: 1 em = 12 pt Courier, 1 tegn = 0,6 em, US Letter = 51 × 66 em.
 */
import { memo } from "react";
import type { Page, PageLine, ProjectState } from "@/core";

export interface Selection {
  readonly occurrenceId: string | null;
  readonly blockId: string | null;
}

interface Props {
  readonly pages: readonly Page[];
  /** Tilstanden (for usikkerhetsmarkører). Utelates ved visning av en historisk versjon. */
  readonly state?: ProjectState | undefined;
  readonly selection: Selection;
  readonly zoom: number;
  readonly onSelect: (sel: Selection) => void;
  readonly onActivate: (sel: Selection) => void;
}

const BODY_TOP_EM = 6; // 1 tomme
const CHAR_EM = 0.6;

export function ScriptPageView({ pages, state, selection, zoom, onSelect, onActivate }: Props) {
  return (
    <div
      className="mx-auto flex w-max flex-col gap-6 px-6 py-6"
      style={{ fontSize: `${16 * zoom}px` }}
    >
      {pages.map((p) => (
        <PageSheet
          key={p.number}
          page={p}
          state={state}
          selectedBlock={selection.blockId}
          selectedOcc={selection.blockId ? null : selection.occurrenceId}
          onSelect={onSelect}
          onActivate={onActivate}
        />
      ))}
    </div>
  );
}

interface SheetProps {
  readonly page: Page;
  /** Tilstanden (for usikkerhetsmarkører). Utelates ved visning av en historisk versjon. */
  readonly state?: ProjectState | undefined;
  readonly selectedBlock: string | null;
  readonly selectedOcc: string | null;
  readonly onSelect: (sel: Selection) => void;
  readonly onActivate: (sel: Selection) => void;
}

const PageSheet = memo(function PageSheet({
  page,
  state,
  selectedBlock,
  selectedOcc,
  onSelect,
  onActivate,
}: SheetProps) {
  return (
    <section
      aria-label={`Side ${page.number}`}
      className="relative shrink-0 bg-script-paper font-script text-script-ink shadow-[0_1px_0_rgb(255_255_255/0.04),0_8px_24px_rgb(0_0_0/0.45)]"
      style={{
        width: "51em",
        height: "66em",
        lineHeight: "1em",
        contentVisibility: "auto",
        containIntrinsicSize: "auto 51em auto 66em",
      }}
    >
      {page.number > 1 ? (
        <span
          className="absolute select-none"
          style={{ top: `${BODY_TOP_EM - 3}em`, right: "7.47em" }}
          aria-hidden
        >
          {page.number}.
        </span>
      ) : null}
      {page.lines.map((l, i) => (
        <Line
          key={i}
          line={l}
          state={state}
          selected={
            (l.blockId !== null && l.blockId === selectedBlock) ||
            (l.kind === "heading" && l.occurrenceId === selectedOcc)
          }
          onSelect={onSelect}
          onActivate={onActivate}
        />
      ))}
    </section>
  );
});

function Line({
  line,
  state,
  selected,
  onSelect,
  onActivate,
}: {
  line: PageLine;
  state?: ProjectState | undefined;
  selected: boolean;
  onSelect: (sel: Selection) => void;
  onActivate: (sel: Selection) => void;
}) {
  const top = `${BODY_TOP_EM + line.row}em`;
  const sel: Selection = { occurrenceId: line.occurrenceId, blockId: line.blockId };
  const block = line.blockId && state ? state.blocks[line.blockId] : undefined;
  const occ = state?.occurrences[line.occurrenceId];
  const variant = occ ? state?.variants[occ.variantId] : undefined;
  const uncertain =
    line.first && (line.kind === "heading" ? variant?.uncertainty : block?.uncertainty);
  const interactive = line.kind !== "more" && line.kind !== "contd";
  return (
    <>
      {line.kind === "heading" && line.first && line.sceneNumber ? (
        <>
          <span className="absolute select-none" style={{ top, left: "4.5em" }} aria-hidden>
            {line.sceneNumber}
          </span>
          <span className="absolute select-none" style={{ top, left: "43.05em" }} aria-hidden>
            {line.sceneNumber}
          </span>
        </>
      ) : null}
      {uncertain ? (
        <span
          className="absolute flex select-none items-center justify-center"
          style={{ top, left: "2.2em", width: "1em", height: "1em" }}
          title={`Usikker tolkning: ${uncertain}`}
          aria-label="Usikker tolkning"
        >
          <span
            className="flex items-center justify-center rounded-full bg-status-uncertain font-sans font-bold text-accent-fg"
            style={{ width: "0.85em", height: "0.85em", fontSize: "0.75em", lineHeight: 1 }}
          >
            ?
          </span>
        </span>
      ) : null}
      <span
        id={line.kind === "heading" && line.first ? `scene-${line.occurrenceId}` : undefined}
        data-block={line.blockId ?? undefined}
        className={
          "absolute whitespace-pre" +
          (interactive ? " cursor-text" : " select-none") +
          (selected
            ? " bg-accent-selection outline outline-1 outline-accent-brand/40"
            : interactive
              ? " hover:bg-white/[0.04]"
              : "") +
          (uncertain
            ? " decoration-status-uncertain underline decoration-wavy underline-offset-4"
            : "")
        }
        style={{
          top,
          left: `${line.left * CHAR_EM}em`,
          minWidth: line.text ? undefined : "1ch",
          height: "1em",
        }}
        onClick={interactive ? () => onSelect(sel) : undefined}
        onDoubleClick={interactive ? () => onActivate(sel) : undefined}
      >
        {line.text}
      </span>
    </>
  );
}
