/**
 * Paginert manusvisning (mandat 4.5, UX P4: manuset ser ut som et manus – ingen tekniske metadata på sidene).
 * Sidene tegnes i em-enheter: 1 em = 12 pt Courier, 1 tegn = 0,6 em, US Letter = 51 × 66 em.
 */
import { MessageSquare } from "lucide-react";
import { memo, useMemo, type ReactNode } from "react";
import {
  L,
  flowLines,
  lineKey,
  type LineDecor,
  type Page,
  type PageLine,
  type ProjectState,
  tm,
} from "@/core";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

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
  /** Søketreff og notater per linje (nøkkel «side:indeks»), REQ-0538/REQ-0541. */
  readonly decor?: ReadonlyMap<string, LineDecor> | undefined;
  /** Klikk på et notatsymbol i margen. */
  readonly onNoteClick?: ((annotationIds: readonly string[], sel: Selection) => void) | undefined;
  /** Blokker som er endret etter at materiale ble laget (DEC-0054). */
  readonly changed?: ReadonlySet<string> | undefined;
  /** Språkvisning (DEC-0058): linjer uten oversettelse, usikre og som må gjennomgås. */
  readonly language?: LanguageMarks | undefined;
  /**
   * Lesevisning uten ark (DEC-0080, «Vis kun valgt scene»): teksten står rett på siden, toppjustert, uten
   * sideskift. `light` = sort tekst på hvit bakgrunn.
   */
  readonly flow?: { readonly light: boolean } | undefined;
}

export interface LanguageMarks {
  readonly missing: ReadonlySet<string>;
  readonly uncertain: ReadonlySet<string>;
  readonly review: ReadonlySet<string>;
}

const BODY_TOP_EM = 6; // 1 tomme
const CHAR_EM = 0.6;

export function ScriptPageView({
  pages,
  state,
  selection,
  zoom,
  onSelect,
  onActivate,
  decor,
  onNoteClick,
  changed,
  language,
  flow,
}: Props) {
  if (flow)
    return (
      <FlowSheet
        pages={pages}
        state={state}
        selection={selection}
        zoom={zoom}
        onSelect={onSelect}
        onActivate={onActivate}
        decor={decor}
        onNoteClick={onNoteClick}
        changed={changed}
        language={language}
        light={flow.light}
      />
    );
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
          decor={decor}
          onNoteClick={onNoteClick}
          changed={changed}
          language={language}
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
  readonly decor?: ReadonlyMap<string, LineDecor> | undefined;
  readonly onNoteClick?: ((annotationIds: readonly string[], sel: Selection) => void) | undefined;
  readonly changed?: ReadonlySet<string> | undefined;
  readonly language?: LanguageMarks | undefined;
}

const PageSheet = memo(function PageSheet({
  page,
  state,
  selectedBlock,
  selectedOcc,
  onSelect,
  onActivate,
  decor,
  onNoteClick,
  changed,
  language,
}: SheetProps) {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  return (
    <section
      aria-label={t("app-script-script-page-view.page-sheet.aria-label.3ca941d4c1f5", { number: String(page.number) })}
      data-page={page.number}
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
          lineId={lineKey(page.number, i)}
          decor={decor?.get(lineKey(page.number, i))}
          onNoteClick={onNoteClick}
          line={l}
          changed={!!l.blockId && l.first && !!changed?.has(l.blockId)}
          lang={
            !language || !l.blockId
              ? null
              : language.missing.has(l.blockId)
                ? "missing"
                : language.review.has(l.blockId)
                  ? "review"
                  : language.uncertain.has(l.blockId)
                    ? "uncertain"
                    : null
          }
          langFirst={l.first}
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

/** Linjeteksten delt opp etter markeringer (søketreff og notater). */
function markedText(text: string, decor: LineDecor | undefined): ReactNode {
  if (!decor?.marks.length || !text) return text;
  const cuts = [
    ...new Set([
      0,
      text.length,
      ...decor.marks.flatMap((m) => [
        Math.max(0, Math.min(text.length, m.from)),
        Math.max(0, Math.min(text.length, m.to)),
      ]),
    ]),
  ].sort((a, b) => a - b);
  const out: ReactNode[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i]!;
    const b = cuts[i + 1]!;
    const seg = text.slice(a, b);
    const over = decor.marks.filter((m) => m.from <= a && m.to >= b);
    const search = over.some((m) => m.kind === "search");
    const note = over.some((m) => m.kind === "note");
    if (!search && !note) out.push(seg);
    else
      out.push(
        <mark
          key={a}
          className={
            "text-inherit " +
            (search ? "mark-search " : "bg-transparent ") +
            (note ? "mark-note" : "")
          }
        >
          {seg}
        </mark>,
      );
  }
  return out;
}

function Line({
  line,
  topEm = BODY_TOP_EM,
  lineId,
  decor,
  onNoteClick,
  state,
  selected,
  onSelect,
  onActivate,
  changed,
  lang,
  langFirst,
}: {
  changed?: boolean;
  lang?: "missing" | "review" | "uncertain" | null;
  langFirst?: boolean;
  line: PageLine;
  /** Avstand fra toppen til første linje (em). Arket: 1 tomme; lesevisningen: litt luft. */
  topEm?: number;
  lineId: string;
  decor?: LineDecor | undefined;
  onNoteClick?: ((annotationIds: readonly string[], sel: Selection) => void) | undefined;
  state?: ProjectState | undefined;
  selected: boolean;
  onSelect: (sel: Selection) => void;
  onActivate: (sel: Selection) => void;
}) {
  const top = `${topEm + line.row}em`;
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
          title={L(`Usikker tolkning: ${uncertain}`, `Uncertain interpretation: ${tm(uncertain)}`)}
          aria-label={t("app-script-script-page-view.line.aria-label.387f4bf73f1a")}
        >
          <span
            className="flex items-center justify-center rounded-full bg-status-uncertain font-sans font-bold text-accent-fg"
            style={{ width: "0.85em", height: "0.85em", fontSize: "0.75em", lineHeight: 1 }}
          >
            ?
          </span>
        </span>
      ) : null}
      {changed ? (
        <span
          className="absolute select-none rounded-sm bg-status-danger"
          style={{ top, left: "3.4em", width: "0.25em", height: "1em" }}
          title={t("app-script-script-page-view.line.title.203abf286a8a")}
          aria-label={t("app-script-script-page-view.line.aria-label.80023fd8c0e5")}
        />
      ) : null}
      {lang && lang !== "missing" && langFirst ? (
        <span
          className={
            "absolute select-none rounded-sm " +
            (lang === "review" ? "bg-status-moved" : "bg-status-uncertain")
          }
          style={{ top, left: "2.9em", width: "0.25em", height: "1em" }}
          title={
            lang === "review"
              ? t("app-script-script-page-view.line.title.a542e5888d4b")
              : t("app-script-script-page-view.line.title.bf72fcfbadbc")
          }
          aria-label={
            lang === "review"
              ? t("app-script-script-page-view.line.aria-label.13b008121044")
              : t("app-script-script-page-view.line.aria-label.a16a75e4aaf5")
          }
        />
      ) : null}
      {decor?.notesHere.length ? (
        <button
          type="button"
          className="absolute flex select-none items-center gap-[0.1em] font-sans text-note hover:brightness-125"
          style={{ top, left: "46.4em", height: "1em", fontSize: "1em" }}
          title={
            decor.notesHere.length === 1
              ? t("app-script-script-page-view.line.title.dc102e51c07d")
              : t("app-script-script-page-view.line.title.2563837d80d2", { length: String(decor.notesHere.length) })
          }
          aria-label={
            decor.notesHere.length === 1
              ? t("app-script-script-page-view.line.aria-label.cbcb7ee33c65")
              : t("app-script-script-page-view.line.aria-label.8d4e39b3c803", { length: String(decor.notesHere.length) })
          }
          onClick={() => onNoteClick?.(decor.notesHere, sel)}
        >
          <MessageSquare style={{ width: "0.85em", height: "0.85em" }} aria-hidden />
          {decor.notesHere.length > 1 ? (
            <span style={{ fontSize: "0.65em" }}>{decor.notesHere.length}</span>
          ) : null}
        </button>
      ) : null}
      <span
        id={line.kind === "heading" && line.first ? `scene-${line.occurrenceId}` : undefined}
        data-block={line.blockId ?? undefined}
        data-line={lineId}
        data-occ={line.occurrenceId}
        className={
          "absolute whitespace-pre" +
          (interactive ? " cursor-text" : " select-none") +
          (selected
            ? " bg-accent-selection outline outline-1 outline-accent-brand/40"
            : interactive
              ? " hover:bg-on-media/[0.04]"
              : "") +
          (uncertain
            ? " decoration-status-uncertain underline decoration-wavy underline-offset-4"
            : "") +
          // Ikke oversatt ennå: norsk tekst vises dempet
          (lang === "missing" ? " italic opacity-45" : "")
        }
        title={
          lang === "missing"
            ? t("app-script-script-page-view.line.title.528ac11afc9d")
            : undefined
        }
        style={{
          top,
          left: `${line.left * CHAR_EM}em`,
          minWidth: line.text ? undefined : "1ch",
          height: "1em",
          // Valgt scene vises øverst i visningen, med litt luft over
          scrollMarginTop: "2.5em",
        }}
        onClick={
          interactive
            ? () => {
                // Markering av tekst (for nytt notat) skal ikke gi nytt valg
                const selText = window.getSelection()?.toString() ?? "";
                if (!selText) onSelect(sel);
              }
            : undefined
        }
        onDoubleClick={interactive ? () => onActivate(sel) : undefined}
      >
        {markedText(line.text, decor)}
      </span>
    </>
  );
}

function langOf(language: LanguageMarks | undefined, blockId: string | null) {
  if (!language || !blockId) return null;
  if (language.missing.has(blockId)) return "missing" as const;
  if (language.review.has(blockId)) return "review" as const;
  if (language.uncertain.has(blockId)) return "uncertain" as const;
  return null;
}

/** Topp i lesevisningen (em): litt luft over første linje. */
const FLOW_TOP_EM = 2;

/**
 * Lesevisningen (DEC-0080): samme linjer og innrykk som på arket, men uten ark og sideskift. Står rett på
 * siden, toppjustert; er scenen lang, rulles det som vanlig.
 */
function FlowSheet({
  pages,
  state,
  selection,
  zoom,
  onSelect,
  onActivate,
  decor,
  onNoteClick,
  changed,
  language,
  light,
}: Omit<Props, "flow"> & { readonly light: boolean }) {
  const flow = useMemo(() => flowLines(pages), [pages]);
  const selectedBlock = selection.blockId;
  const selectedOcc = selection.blockId ? null : selection.occurrenceId;
  return (
    <div className="px-6 py-4" style={{ fontSize: `${16 * zoom}px` }}>
      <section
        aria-label={t("app-script-script-page-view.flow-sheet.aria-label.aa89dad7a83b")}
        data-flow
        className={"relative mx-auto font-script " + (light ? "text-on-paper" : "text-text-primary")}
        style={{
          width: "51em",
          height: `${FLOW_TOP_EM + flow.rows + 2}em`,
          lineHeight: "1em",
        }}
      >
        {flow.lines.map((l) => {
          const key = lineKey(l.page, l.index);
          return (
            <Line
              key={key}
              lineId={key}
              topEm={FLOW_TOP_EM}
              decor={decor?.get(key)}
              onNoteClick={onNoteClick}
              line={l}
              changed={!!l.blockId && l.first && !!changed?.has(l.blockId)}
              lang={langOf(language, l.blockId)}
              langFirst={l.first}
              state={state}
              selected={
                (l.blockId !== null && l.blockId === selectedBlock) ||
                (l.kind === "heading" && l.occurrenceId === selectedOcc)
              }
              onSelect={onSelect}
              onActivate={onActivate}
            />
          );
        })}
      </section>
    </div>
  );
}
