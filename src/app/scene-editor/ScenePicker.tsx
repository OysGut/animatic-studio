/**
 * Scenevelger i verktøylinjen (DEC-0040): viser valgt scene og åpner en liste med søk (nummer, sted,
 * tid) når man vil bla. Pilene går til forrige/neste scene. Gir mer plass til selve scenen.
 */
import { Check, ChevronDown, ChevronLeft, ChevronRight, Layers, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatHeading, type ProjectState, type SceneOccurrence } from "@/core";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function ScenePicker({
  state,
  occurrences,
  occurrenceId,
  hasComposition,
  onPick,
}: {
  state: ProjectState;
  occurrences: readonly SceneOccurrence[];
  occurrenceId: string | null;
  hasComposition: ReadonlySet<string>;
  onPick: (occurrenceId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);
  const listId = useId();
  const optionId = (id: string) => `${listId}-${id}`;

  const rows = useMemo(
    () =>
      occurrences.map((o) => {
        const v = state.variants[o.variantId];
        const heading = v ? formatHeading(v.heading) : "?";
        return {
          o,
          heading,
          number: o.productionNumber ?? "–",
          has: v ? hasComposition.has(v.id) : false,
        };
      }),
    [occurrences, state.variants, hasComposition],
  );
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("nb");
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.number.toLocaleLowerCase("nb") === q ||
        r.number.toLocaleLowerCase("nb").startsWith(q) ||
        r.heading.toLocaleLowerCase("nb").includes(q),
    );
  }, [rows, query]);

  const index = rows.findIndex((r) => r.o.id === occurrenceId);
  const current = rows[index];

  // Hold valgt rad synlig ved piltaster (ikke ved hver tegning, så musen ikke gir hopp)
  const activeId = shown[active]?.o.id;
  useEffect(() => {
    if (!open || !activeId) return;
    document.getElementById(optionId(activeId))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeId]);

  function pick(id: string) {
    onPick(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <button
        type="button"
        className="rounded-sm p-1 text-text-secondary hover:bg-surface-3 hover:text-text-primary disabled:opacity-40"
        onClick={() => rows[index - 1] && onPick(rows[index - 1]!.o.id)}
        disabled={index <= 0}
        aria-label="Forrige scene"
        title="Forrige scene"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          // Escape eller klikk utenfor nullstiller søket, så listen ikke åpnes med et gammelt filter
          if (!o) setQuery("");
          if (o) setActive(Math.max(0, index));
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-7 min-w-0 max-w-[420px] items-center gap-2 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary hover:bg-surface-2"
            aria-label={
              current ? `Velg scene. Valgt: ${current.number} ${current.heading}` : "Velg scene"
            }
            title="Velg scene (søk på nummer, sted eller tid)"
            disabled={rows.length === 0}
          >
            <span className="font-mono text-[11px] text-text-tertiary">
              {current?.number ?? "–"}
            </span>
            <span className="min-w-0 truncate">
              {current?.heading ?? (rows.length === 0 ? "Ingen scener" : "Velg en scene")}
            </span>
            {current && !current.o.active ? (
              <span className="shrink-0 rounded-sm bg-surface-1 px-1 text-[10px] uppercase text-text-tertiary">
                Deaktivert
              </span>
            ) : null}
            <ChevronDown className="size-3.5 shrink-0 text-text-tertiary" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[440px] border-border bg-surface-2 p-0"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).querySelector("input")?.focus();
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-2">
            <Search className="size-3.5 text-text-tertiary" aria-hidden />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.max(0, Math.min(shown.length - 1, a + 1)));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(0, a - 1));
                } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  const r = shown[active];
                  if (r) pick(r.o.id);
                }
              }}
              placeholder="Søk på nummer, sted eller tid …"
              aria-label="Søk etter scene"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeId ? optionId(activeId) : undefined}
              className="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-tertiary"
            />
            <span className="text-[11px] text-text-tertiary">
              {shown.length} av {rows.length}
            </span>
          </div>
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Scener"
            className="max-h-[60vh] overflow-y-auto py-1"
          >
            {shown.map((r, i) => {
              const on = r.o.id === occurrenceId;
              return (
                <li
                  key={r.o.id}
                  id={optionId(r.o.id)}
                  role="option"
                  aria-selected={on}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(r.o.id)}
                  className={
                    "flex cursor-pointer items-baseline gap-2 px-3 py-1 text-[12px] " +
                    (i === active ? "bg-surface-3 text-text-primary" : "text-text-secondary") +
                    (r.o.active ? "" : " opacity-50")
                  }
                >
                  <span className="w-8 shrink-0 font-mono text-[11px] text-text-tertiary">
                    {r.number}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {r.heading}
                    {r.o.active ? null : <span className="sr-only"> (deaktivert)</span>}
                  </span>
                  {r.has ? (
                    <Layers
                      className="size-3 shrink-0 text-accent-brand"
                      aria-label="Har 2D-scene"
                    />
                  ) : null}
                  {on ? (
                    <Check className="size-3.5 shrink-0 text-accent-brand" aria-hidden />
                  ) : null}
                </li>
              );
            })}
          </ul>
          {shown.length === 0 ? (
            <p role="status" className="px-3 py-2 text-xs text-text-tertiary">
              Ingen scener passer.
            </p>
          ) : null}
        </PopoverContent>
      </Popover>
      <button
        type="button"
        className="rounded-sm p-1 text-text-secondary hover:bg-surface-3 hover:text-text-primary disabled:opacity-40"
        onClick={() => rows[index + 1] && onPick(rows[index + 1]!.o.id)}
        disabled={index < 0 || index >= rows.length - 1}
        aria-label="Neste scene"
        title="Neste scene"
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </div>
  );
}
