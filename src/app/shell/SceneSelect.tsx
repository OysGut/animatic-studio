/**
 * B-118 (Øystein 22.10): felles, tilgjengelig scenevelger som erstatter vanlige nedtrekkslister for scener.
 * Samme mønster som ScenePicker: knapp + liste med søk, piltaster/Home/End/Enter, Escape lukker, og
 * skjermlesertekst via combobox/listbox/aria-activedescendant. Hvert valg viser SceneMark, så navn med og
 * uten farge/status står på nøyaktig samme venstrejustering.
 */
import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { collation, type ProjectState, type SceneOccurrence } from "@/core";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { t } from "@/core/i18n/keyed";
import { SceneMark } from "./SceneMark";

type Mark = Pick<SceneOccurrence, "id" | "color" | "workStatus">;

export interface SceneSelectOption {
  readonly value: string;
  readonly label: string;
  /** Scenenummer (visning). */
  readonly number?: string | undefined;
  /** Forekomsten som gir farge og status. Mangler den, får valget tom plass med samme bredde. */
  readonly occurrence?: Mark | undefined;
  readonly disabled?: boolean | undefined;
}

/** Forekomsten i hovedfilmen for en scene (scenevalg som lagrer scene-ID, ikke forekomst). */
export function mainOccurrenceOfScene(state: ProjectState, sceneId: string | null | undefined): SceneOccurrence | undefined {
  if (!sceneId) return undefined;
  const main = Object.values(state.productions).find((p) => p.kind === "main");
  const all = Object.values(state.occurrences).filter((o) => o.sceneId === sceneId);
  return all.find((o) => o.productionId === main?.id && o.active) ?? all.find((o) => o.productionId === main?.id) ?? all[0];
}

export function SceneSelect({
  value,
  onChange,
  options,
  emptyLabel,
  ariaLabel,
  id,
  testId,
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly SceneSelectOption[];
  /** Valget for tom verdi («Ingen scene» o.l.). Uten verdi finnes ikke et tomt valg. */
  emptyLabel?: string;
  ariaLabel?: string;
  id?: string;
  testId?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const optionId = (i: number) => `${listId}-o${i}`;

  const all = useMemo<SceneSelectOption[]>(
    () => (emptyLabel !== undefined ? [{ value: "", label: emptyLabel }, ...options] : [...options]),
    [options, emptyLabel],
  );
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(collation());
    if (!q) return all;
    return all.filter((o) =>
      (o.number ?? "").toLocaleLowerCase(collation()).startsWith(q) || o.label.toLocaleLowerCase(collation()).includes(q));
  }, [all, query]);
  const current = all.find((o) => o.value === value);
  const hasNumbers = all.some((o) => o.number);

  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  function pick(o: SceneSelectOption | undefined) {
    if (!o || o.disabled) return;
    onChange(o.value);
    setOpen(false);
    setQuery("");
  }
  function move(from: number, dir: 1 | -1) {
    let i = from;
    for (let n = 0; n < shown.length; n++) {
      i = Math.max(0, Math.min(shown.length - 1, i + dir));
      if (!shown[i]?.disabled) return i;
    }
    return from;
  }

  const row = (o: SceneSelectOption) => (
    <>
      {hasNumbers ? <span className="w-8 shrink-0 font-mono text-[11px] text-text-tertiary">{o.number ?? ""}</span> : null}
      <SceneMark occurrence={o.value ? o.occurrence : undefined} className="min-w-0 flex-1">{o.label}</SceneMark>
    </>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
        else setActive(Math.max(0, all.findIndex((x) => x.value === value)));
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          data-testid={testId}
          data-value={value}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel ? `${ariaLabel}: ${current?.label ?? ""}` : undefined}
          className={
            "flex h-8 min-w-0 items-center gap-2 rounded-sm border border-border-control bg-surface-3 px-2 text-left text-[13px] text-text-primary hover:bg-surface-2 disabled:opacity-50 " +
            (className ?? "")
          }
        >
          {current ? row(current) : <span className="min-w-0 flex-1 truncate text-text-tertiary">{emptyLabel ?? ""}</span>}
          <ChevronDown className="size-3.5 shrink-0 text-text-tertiary" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent uiId="V-131"
        align="start"
        className="w-[380px] max-w-[90vw] border-border bg-surface-2 p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).querySelector("input")?.focus();
        }}
      >
        <div className="flex items-center gap-2 border-b border-border px-2">
          <Search className="size-3.5 text-text-tertiary" aria-hidden />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => move(a, 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => move(a, -1)); }
              else if (e.key === "Home") { e.preventDefault(); setActive(move(-1, 1)); }
              else if (e.key === "End") { e.preventDefault(); setActive(move(shown.length, -1)); }
              else if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); pick(shown[active]); }
            }}
            placeholder={t("app-scene-editor-scene-picker.scene-picker.placeholder.192fc4855574")}
            aria-label={t("app-scene-editor-scene-picker.scene-picker.aria-label.34b0681cbe89")}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={shown[active] ? optionId(active) : undefined}
            data-testid={testId ? `${testId}-search` : undefined}
            className="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </div>
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel ?? t("app-scene-editor-scene-picker.scene-picker.aria-label.644d8fc84d9f")}
          data-testid={testId ? `${testId}-list` : undefined}
          className="max-h-[50vh] overflow-y-auto py-1"
        >
          {shown.map((o, i) => {
            const on = o.value === value;
            return (
              <li
                key={o.value || "__empty"}
                id={optionId(i)}
                role="option"
                aria-selected={on}
                aria-disabled={o.disabled || undefined}
                data-value={o.value}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                className={
                  "flex cursor-pointer items-center gap-2 px-3 py-1 text-[12px] " +
                  (i === active ? "bg-surface-3 text-text-primary" : "text-text-secondary") +
                  (o.disabled ? " cursor-not-allowed opacity-50" : "")
                }
              >
                {row(o)}
                {on ? <Check className="size-3.5 shrink-0 text-accent-brand" aria-hidden /> : null}
              </li>
            );
          })}
        </ul>
        {shown.length === 0 ? (
          <p role="status" className="px-3 py-2 text-xs text-text-tertiary">
            {t("app-scene-editor-scene-picker.scene-picker.p.480303437aa6")}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
