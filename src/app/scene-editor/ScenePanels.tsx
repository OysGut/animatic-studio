/**
 * Panelene i sceneeditoren side om side (Mars 15.10.2026): en liten knapp øverst i panelområdet til høyre
 * bytter mellom stablet (som før) og side om side. Side om side står hvert panel i sin egen kolonne med
 * egen rulling; rekkefølgen endres ved å dra overskriften eller med ‹ ›. Det som står først, ligger lengst
 * til venstre. Visning og rekkefølge huskes på brukeren (useUiPref, som språk).
 */
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  GripVertical,
  Rows3,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { L } from "@/core";
import { PaneResizer, usePaneSize } from "@/app/shell/pane-size";
import { movePanelAmong, movePanelTo, type PanelId, type PanelMode } from "./panel-layout";
import { panelTitle } from "./use-scene-panels";

/** Datatype for dra-og-slipp av et panel (verdien er panelets ID). */
const PANEL_DRAG_TYPE = "application/x-animatic-panel";

const iconButton =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-3 hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";

/** Knappen som bytter mellom stablet og side om side. */
export function PanelModeButton({
  mode,
  onChange,
}: {
  mode: PanelMode;
  onChange: (mode: PanelMode) => void;
}) {
  const side = mode === "side";
  const label = side
    ? L("Vis panelene over hverandre", "Show the panels stacked")
    : L(
        "Vis panelene side om side for bedre oversikt",
        "Show the panels side by side for a better overview",
      );
  return (
    <button
      type="button"
      className={iconButton + (side ? " !text-accent-brand" : "")}
      aria-label={label}
      title={label}
      aria-pressed={side}
      data-testid="scene-panels-mode"
      onClick={() => onChange(side ? "stacked" : "side")}
    >
      {side ? (
        <Rows3 className="size-3.5" aria-hidden />
      ) : (
        <Columns3 className="size-3.5" aria-hidden />
      )}
    </button>
  );
}

/** Det tynne feltet øverst i panelområdet med knappen (og en kort hjelpetekst side om side). */
export function PanelBar({
  mode,
  onChange,
}: {
  mode: PanelMode;
  onChange: (mode: PanelMode) => void;
}) {
  return (
    <div className="flex h-7 shrink-0 items-center gap-2 border-b border-border bg-surface-1 pl-3 pr-1">
      {mode === "side" ? (
        <span className="min-w-0 flex-1 truncate text-[11px] text-text-tertiary">
          {L(
            "Dra en overskrift, eller bruk ‹ ›, for å endre rekkefølgen",
            "Drag a heading, or use ‹ ›, to change the order",
          )}
        </span>
      ) : (
        <span className="flex-1" />
      )}
      <PanelModeButton mode={mode} onChange={onChange} />
    </div>
  );
}

/**
 * Panelene side om side, i kolonner med lik bredde (justeres i venstre kant). Blir det trangt, ruller
 * panelområdet sidelengs i stedet for at lerretet blir ubrukelig smalt.
 */
export function SidePanels({
  order,
  panels,
  onOrder,
  onMode,
  collapsed = NO_COLLAPSED,
  onToggle,
}: {
  order: readonly PanelId[];
  /** Innholdet i hvert panel; null = vises ikke nå (f.eks. ingen 2D-scene ennå). */
  panels: Readonly<Record<PanelId, ReactNode | null>>;
  onOrder: (order: PanelId[]) => void;
  onMode: (mode: PanelMode) => void;
  /** Lukkede paneler (DEC-0089): smal stripe med navnet. */
  collapsed?: ReadonlySet<string>;
  onToggle?: (id: PanelId) => void;
}) {
  const [colWidth, setColWidth] = usePaneSize("scene-editor-panel-column", 280, 220, 480, {
    viewportShare: 0.3,
  });
  const shown = order.filter((id) => panels[id] != null);
  const [dragId, setDragId] = useState<PanelId | null>(null);
  const [drop, setDrop] = useState<{ id: PanelId; side: "before" | "after" } | null>(null);

  function sideAt(e: React.DragEvent<HTMLElement>): "before" | "after" {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientX - r.left < r.width / 2 ? "before" : "after";
  }
  const isPanelDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(PANEL_DRAG_TYPE);

  return (
    <aside
      aria-label={L("Paneler side om side", "Panels side by side")}
      data-testid="scene-panels-side"
      style={{
        width:
          shown.filter((id) => !collapsed.has(id)).length * colWidth +
          shown.filter((id) => collapsed.has(id)).length * STRIP_PX +
          1,
      }}
      className="relative flex min-w-[240px] shrink flex-col border-l border-border bg-surface-1"
    >
      <PaneResizer
        edge="left"
        size={colWidth}
        onSize={setColWidth}
        min={220}
        max={480}
        label={L("Bredde på hvert panel", "Width of each panel")}
      />
      <PanelBar mode="side" onChange={onMode} />
      <div className="flex min-h-0 flex-1 overflow-x-auto">
        {shown.map((id, i) => {
          const title = panelTitle(id);
          const target = drop?.id === id && dragId !== null && dragId !== id ? drop : null;
          if (collapsed.has(id))
            return (
              <section
                key={id}
                aria-label={title}
                data-panel={id}
                data-collapsed
                style={{ width: STRIP_PX }}
                className={
                  "flex min-h-0 shrink-0 flex-col items-center bg-surface-2 " +
                  (i > 0 ? "border-l border-border" : "")
                }
              >
                <button
                  type="button"
                  onClick={() => onToggle?.(id)}
                  className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 py-2 text-text-secondary hover:bg-surface-3 hover:text-text-primary"
                  aria-label={L(`Åpne «${title}»`, `Expand “${title}”`)}
                  title={L(`Åpne «${title}»`, `Expand “${title}”`)}
                  aria-expanded={false}
                  data-panel-toggle={id}
                >
                  <ChevronRight className="size-3.5 shrink-0" aria-hidden />
                  <span className="text-xs font-medium uppercase tracking-[0.04em] [writing-mode:vertical-rl]">
                    {title}
                  </span>
                </button>
              </section>
            );
          return (
            <section
              key={id}
              aria-label={title}
              data-panel={id}
              style={{ width: colWidth }}
              className={
                "relative flex min-h-0 shrink-0 flex-col bg-surface-1 " +
                (i > 0 ? "border-l border-border " : "") +
                (dragId === id ? "opacity-50" : "")
              }
              onDragOver={(e) => {
                if (!dragId || !isPanelDrag(e)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const side = sideAt(e);
                setDrop((d) => (d && d.id === id && d.side === side ? d : { id, side }));
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                  setDrop((d) => (d?.id === id ? null : d));
              }}
              onDrop={(e) => {
                if (!dragId || !isPanelDrag(e)) return;
                e.preventDefault();
                onOrder(movePanelTo(order, dragId, id, sideAt(e)));
                setDragId(null);
                setDrop(null);
              }}
            >
              {target ? (
                <span
                  aria-hidden
                  className={
                    "pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-accent-brand " +
                    (target.side === "before" ? "left-0" : "right-0")
                  }
                />
              ) : null}
              <header
                draggable
                onDragStart={(e) => {
                  setDragId(id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData(PANEL_DRAG_TYPE, id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDrop(null);
                }}
                title={L(
                  "Dra overskriften for å flytte panelet",
                  "Drag the heading to move the panel",
                )}
                data-panel-heading={id}
                className="flex h-8 shrink-0 cursor-grab items-center gap-1 border-b border-border bg-surface-2 pl-1 pr-1 active:cursor-grabbing"
              >
                <GripVertical className="size-3.5 shrink-0 text-text-tertiary" aria-hidden />
                {onToggle ? <CollapseButton title={title} id={id} onToggle={onToggle} /> : null}
                <h2 className="min-w-0 flex-1 truncate text-xs font-medium uppercase tracking-[0.04em] text-text-secondary">
                  {title}
                </h2>
                <button
                  type="button"
                  className={iconButton}
                  disabled={i === 0}
                  onClick={() => onOrder(movePanelAmong(order, shown, id, -1))}
                  aria-label={L(`Flytt «${title}» til venstre`, `Move “${title}” left`)}
                  title={L("Flytt til venstre", "Move left")}
                >
                  <ChevronLeft className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  className={iconButton}
                  disabled={i === shown.length - 1}
                  onClick={() => onOrder(movePanelAmong(order, shown, id, 1))}
                  aria-label={L(`Flytt «${title}» til høyre`, `Move “${title}” right`)}
                  title={L("Flytt til høyre", "Move right")}
                >
                  <ChevronRight className="size-3.5" aria-hidden />
                </button>
              </header>
              {/* Panelets egen overskrift er med i rammen over: skjules her (leses fortsatt opp) */}
              <div
                data-panel-body
                className="flex min-h-0 flex-1 flex-col overflow-y-auto [&>section:first-child>h2:first-child]:sr-only [&>section:first-child]:border-t-0"
              >
                {panels[id]}
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}

const NO_COLLAPSED: ReadonlySet<string> = new Set();
/** Bredden på et lukket panel side om side (px). */
const STRIP_PX = 32;

/** Pilen som lukker et åpent panel. */
function CollapseButton({
  title,
  id,
  onToggle,
}: {
  title: string;
  id: PanelId;
  onToggle: (id: PanelId) => void;
}) {
  return (
    <button
      type="button"
      className={iconButton}
      onClick={() => onToggle(id)}
      aria-label={L(`Lukk «${title}»`, `Collapse “${title}”`)}
      title={L("Lukk panelet", "Collapse the panel")}
      aria-expanded
      data-panel-toggle={id}
    >
      <ChevronDown className="size-3.5" aria-hidden />
    </button>
  );
}

/**
 * Panelene over hverandre i én kolonne (stablet visning, DEC-0089): hvert panel har en overskrift med pil som
 * lukker og åpner det, og ˄ ˅ som flytter det i kolonnen. Et lukket panel er bare overskriften.
 */
export function StackedPanels({
  ids,
  order,
  panels,
  collapsed,
  onToggle,
  onOrder,
}: {
  /** Panelene i denne kolonnen, i brukerens rekkefølge. */
  ids: readonly PanelId[];
  order: readonly PanelId[];
  panels: Readonly<Record<PanelId, ReactNode | null>>;
  collapsed: ReadonlySet<string>;
  onToggle: (id: PanelId) => void;
  onOrder: (order: PanelId[]) => void;
}) {
  const shown = ids.filter((id) => panels[id] != null);
  return (
    <>
      {shown.map((id, i) => {
        const title = panelTitle(id);
        const closed = collapsed.has(id);
        return (
          <div
            key={id}
            data-panel={id}
            data-collapsed={closed ? true : undefined}
            className={"flex shrink-0 flex-col " + (i > 0 ? "border-t border-border" : "")}
          >
            <header className="flex h-7 shrink-0 items-center gap-1 bg-surface-2 pl-1 pr-1">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1 rounded-sm px-1 py-0.5 text-left text-text-secondary hover:text-text-primary"
                onClick={() => onToggle(id)}
                aria-expanded={!closed}
                aria-label={
                  closed
                    ? L(`Åpne «${title}»`, `Expand “${title}”`)
                    : L(`Lukk «${title}»`, `Collapse “${title}”`)
                }
                title={
                  closed
                    ? L("Åpne panelet", "Expand the panel")
                    : L("Lukk panelet", "Collapse the panel")
                }
                data-panel-toggle={id}
              >
                {closed ? (
                  <ChevronRight className="size-3.5 shrink-0" aria-hidden />
                ) : (
                  <ChevronDown className="size-3.5 shrink-0" aria-hidden />
                )}
                <h2 className="min-w-0 truncate text-xs font-medium uppercase tracking-[0.04em]">
                  {title}
                </h2>
              </button>
              <button
                type="button"
                className={iconButton}
                disabled={i === 0}
                onClick={() => onOrder(movePanelAmong(order, shown, id, -1))}
                aria-label={L(`Flytt «${title}» opp`, `Move “${title}” up`)}
                title={L("Flytt opp", "Move up")}
              >
                <ArrowUp className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                className={iconButton}
                disabled={i === shown.length - 1}
                onClick={() => onOrder(movePanelAmong(order, shown, id, 1))}
                aria-label={L(`Flytt «${title}» ned`, `Move “${title}” down`)}
                title={L("Flytt ned", "Move down")}
              >
                <ArrowDown className="size-3.5" aria-hidden />
              </button>
            </header>
            {closed ? null : (
              <div
                data-panel-body
                className="flex flex-col [&>section:first-child>h2:first-child]:sr-only [&>section:first-child]:border-t-0"
              >
                {panels[id]}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
