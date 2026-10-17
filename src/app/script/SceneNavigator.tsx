/**
 * Scenenavigator (mandat 2, 4.4): alle sceneforekomster i produksjonen i rekkefølge, også deaktiverte.
 * Flytting her er samme handling som i filmtidslinjen (MoveOccurrence, UX P5). Deaktivering er ikke sletting.
 * Rekkefølge og synlighet endres bare når «Endre rekkefølge og synlighet» er slått på (REQ-0532).
 * Scener som er flyttet siden siste lagrede versjon, har egen bakgrunnsfarge (REQ-0533).
 */
import { AlertTriangle, GripVertical, MessageSquare, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import {
  HIT_LABEL,
  STORY_KIND_LABEL,
  SCENE_STATUS_LABEL,
  collation,
  formatHeading,
  keyBetween,
  L,
  localized,
  type HitKind,
  orderedOccurrences,
  type ProjectState,
  type SceneStatus,
  type SceneFilter,
  type SceneOccurrence,
  sceneNumberOf,
} from "@/core";
import { Switch } from "@/components/ui/switch";
import { uncertainVariants } from "./script-helpers";

const ASSET_KIND_SHORT: Record<string, string> = localized({
  animal: ["dyr", "animal"],
  object: ["objekt", "object"],
  location: ["sted", "location"],
  environment: ["miljø", "environment"],
  other: ["annet", "other"],
});

/** Valg i karakterfilteret: fra biblioteket (alle navn) eller et navn i manuset. */
export interface CharacterOption {
  readonly value: string;
  readonly label: string;
  readonly scenes: number;
  readonly names: readonly string[];
  readonly fromLibrary: boolean;
}

interface Props {
  readonly state: ProjectState;
  readonly productionId: string;
  readonly startPages: Readonly<Record<string, number>>;
  readonly selectedOcc: string | null;
  readonly editable: boolean;
  readonly onSelect: (occurrenceId: string) => void;
  readonly onMove: (occurrenceId: string, orderKey: string, label: string) => void;
  readonly onToggleActive: (occurrenceId: string, active: boolean) => void;
  readonly filter: SceneFilter;
  readonly onFilterChange: (f: SceneFilter) => void;
  readonly characters: readonly CharacterOption[];
  /** Forekomster som passer med filteret (null = intet filter). */
  readonly visible: ReadonlySet<string> | null;
  /** Andre medlemmer som står i scenen nå (tilstedeværelse). */
  readonly presence?: ReadonlyMap<string, readonly { userId: string; name: string }[]>;
  /** Redigeringsmodus for rekkefølge og synlighet (REQ-0532). */
  readonly structureEditing: boolean;
  readonly onStructureEditingChange: (on: boolean) => void;
  /** Forekomster flyttet siden siste lagrede versjon (REQ-0533); null = ingen versjon å sammenligne med. */
  readonly moved: ReadonlySet<string> | null;
  /** Navn på versjonen det sammenlignes med, f.eks. «versjon 3». */
  readonly movedBaseline: string | null;
  /** Hva fritekstsøket traff per scene (REQ-0541); null = intet søk. */
  readonly hits: ReadonlyMap<string, readonly HitKind[]> | null;
  /** Antall notater per scene (null = notater skjult). */
  readonly noteCounts: ReadonlyMap<string, number> | null;
  /** Scenen som vises øverst i manuset nå. */
  readonly inView: string | null;
}

export function SceneNavigator({
  state,
  productionId,
  startPages,
  selectedOcc,
  editable,
  onSelect,
  onMove,
  onToggleActive,
  filter,
  onFilterChange,
  characters,
  visible,
  presence,
  structureEditing,
  onStructureEditingChange,
  moved,
  movedBaseline,
  hits,
  noteCounts,
  inView,
}: Props) {
  const allOccs = orderedOccurrences(state, productionId);
  const occs = visible ? allOccs.filter((o) => visible.has(o.id)) : allOccs;
  // Flytting krever hele listen synlig, ellers blir plasseringen uklar
  const canReorder = editable && structureEditing && !visible;
  const canToggle = editable && structureEditing;
  const movedCount = moved ? allOccs.filter((o) => moved.has(o.id)).length : 0;
  // Er valgt scene filtrert bort, må første synlige scene kunne nås med Tab
  const selectedVisible = selectedOcc !== null && occs.some((o) => o.id === selectedOcc);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const uncertain = uncertainVariants(state);
  // Objekter, rekvisitter, dyr og steder i biblioteket (karakterene har eget filter over)
  const filterAssets = Object.values(state.assets)
    .filter((a) => !a.archived && a.kind !== "sound" && a.kind !== "character")
    .sort((a, b) => a.name.localeCompare(b.name, collation()));
  const uncertainSet = new Set(occs.filter((o) => uncertain.has(o.variantId)).map((o) => o.id));

  // Listen følger manuset når du blar (uten å flytte fokus eller endre valget)
  const listRef = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    if (!inView || dragId) return;
    const item = document.getElementById(`nav-${inView}`)?.closest("li");
    const list = listRef.current;
    if (!item || !list) return;
    const r = item.getBoundingClientRect();
    const lr = list.getBoundingClientRect();
    if (r.top < lr.top || r.bottom > lr.bottom)
      list.scrollTo({
        top: list.scrollTop + (r.top - lr.top) - lr.height / 3,
        behavior: "smooth",
      });
  }, [inView, dragId]);

  function moveTo(id: string, index: number) {
    const from = occs.findIndex((o) => o.id === id);
    if (from < 0 || index < 0 || index > occs.length || index === from || index === from + 1)
      return;
    const before = index > 0 ? (occs[index - 1]?.orderKey ?? null) : null;
    const after = occs[index]?.orderKey ?? null;
    const o = occs[from]!;
    onMove(
      id,
      keyBetween(before, after),
      L(
        `Flytt scene ${sceneNumberOf(state, o) ?? ""}`,
        `Move scene ${sceneNumberOf(state, o) ?? ""}`,
      ).trim(),
    );
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    if (dragId !== null && dropIndex !== null) moveTo(dragId, dropIndex);
    setDragId(null);
    setDropIndex(null);
  }

  function onKey(e: KeyboardEvent, o: SceneOccurrence, i: number) {
    if (e.altKey && canReorder && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      moveTo(o.id, e.key === "ArrowUp" ? i - 1 : i + 2);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = occs[i + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) {
        onSelect(next.id);
        document.getElementById(`nav-${next.id}`)?.focus();
      }
    }
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-surface-2 px-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
        <span>{L("Scener", "Scenes")}</span>
        <span className="font-mono tabular-nums normal-case tracking-normal">
          {visible
            ? L(
                `${occs.length} av ${allOccs.length} vises`,
                `${occs.length} of ${allOccs.length} shown`,
              )
            : L(
                `${allOccs.filter((o) => o.active).length} aktive av ${allOccs.length}`,
                `${allOccs.filter((o) => o.active).length} active of ${allOccs.length}`,
              )}
        </span>
      </div>
      {editable ? (
        <div
          className={
            "flex shrink-0 flex-col gap-1 border-b border-border px-3 py-2 " +
            (structureEditing ? "bg-surface-3" : "")
          }
        >
          <label className="flex items-center justify-between gap-2 text-xs text-text-secondary">
            <span>{L("Endre rekkefølge og synlighet", "Change order and visibility")}</span>
            <Switch
              checked={structureEditing}
              onCheckedChange={onStructureEditingChange}
              aria-label={L("Endre rekkefølge og synlighet", "Change order and visibility")}
              className="scale-75"
            />
          </label>
          {structureEditing ? (
            <p className="text-[11px] text-text-tertiary">
              {visible
                ? L(
                    "Fjern filteret for å flytte scener. Synlighet kan endres.",
                    "Remove the filter to move scenes. Visibility can be changed.",
                  )
                : L(
                    "Dra scener for å flytte dem (eller Alt + pil). Bryteren til høyre slår en scene av og på.",
                    "Drag scenes to move them (or Alt + arrow). The switch on the right turns a scene on and off.",
                  )}
            </p>
          ) : null}
        </div>
      ) : null}
      {moved && movedCount > 0 ? (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-1.5 text-[11px] text-text-secondary">
          <span className="size-2.5 rounded-sm bg-status-moved" aria-hidden />
          {movedCount === 1
            ? L("1 scene", "1 scene")
            : L(`${movedCount} scener`, `${movedCount} scenes`)}{" "}
          {L("flyttet siden", "moved since")}{" "}
          {movedBaseline ?? L("siste versjon", "the last version")}
        </div>
      ) : null}
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-border px-2 py-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-text-tertiary"
            aria-hidden
          />
          <input
            type="search"
            aria-label={L("Søk i manus", "Search the script")}
            placeholder={L(
              "Søk i manus (tekst, sted, nummer)",
              "Search the script (text, location, number)",
            )}
            value={filter.text ?? ""}
            onChange={(e) => onFilterChange({ ...filter, text: e.target.value })}
            className="h-7 w-full rounded-sm border border-border-control bg-surface-3 pl-7 pr-2 text-[13px] text-text-primary placeholder:text-text-tertiary"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <select
            aria-label={L("Vis bare scener med karakter", "Show only scenes with a character")}
            value={filter.character ?? ""}
            onChange={(e) => {
              const { character: _c, characterNames: _n, ...rest } = filter;
              const opt = characters.find((c) => c.value === e.target.value);
              onFilterChange(
                opt ? { ...rest, character: opt.value, characterNames: opt.names } : rest,
              );
            }}
            className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
          >
            <option value="">{L("Alle karakterer", "All characters")}</option>
            {characters.some((c) => c.fromLibrary) ? (
              <optgroup label={L("Fra ressursbiblioteket", "From the asset library")}>
                {characters
                  .filter((c) => c.fromLibrary)
                  .map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label} ({c.scenes})
                    </option>
                  ))}
              </optgroup>
            ) : null}
            {characters.some((c) => !c.fromLibrary) ? (
              <optgroup label={L("Navn i manuset", "Names in the script")}>
                {characters
                  .filter((c) => !c.fromLibrary)
                  .map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label} ({c.scenes})
                    </option>
                  ))}
              </optgroup>
            ) : null}
          </select>
          {visible ? (
            <button
              type="button"
              onClick={() => onFilterChange({})}
              className="flex h-7 items-center gap-1 rounded-sm px-1.5 text-xs text-text-secondary hover:bg-surface-3 hover:text-text-primary"
              title={L("Fjern filter", "Remove filter")}
            >
              <X className="size-3.5" aria-hidden />
              {L("Nullstill", "Reset")}
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <select
            aria-label={L("Vis bare scener med ressurs", "Show only scenes with an asset")}
            value={filter.assetId ?? ""}
            onChange={(e) => {
              const { assetId: _a, ...rest } = filter;
              onFilterChange(e.target.value ? { ...rest, assetId: e.target.value } : rest);
            }}
            className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
          >
            <option value="">{L("Alle objekter og steder", "All objects and locations")}</option>
            {filterAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({ASSET_KIND_SHORT[a.kind] ?? a.kind})
              </option>
            ))}
          </select>
          <select
            aria-label={L("Vis bare scener med status", "Show only scenes with a status")}
            value={filter.status ?? ""}
            onChange={(e) => {
              const { status: _s, ...rest } = filter;
              onFilterChange(e.target.value ? { ...rest, status: e.target.value } : rest);
            }}
            className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
          >
            <option value="">{L("Alle statuser", "All statuses")}</option>
            {(Object.keys(SCENE_STATUS_LABEL) as SceneStatus[]).map((st) => (
              <option key={st} value={st}>
                {SCENE_STATUS_LABEL[st]}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={filter.discrepancy === true}
            onChange={(e) => {
              const { discrepancy: _d, ...rest } = filter;
              onFilterChange(e.target.checked ? { ...rest, discrepancy: true } : rest);
            }}
          />
          {L(
            "Bare scener med manusendringer etter 2D-scene eller film",
            "Only scenes with script changes after the 2D scene or film",
          )}
        </label>
        {visible ? (
          <p className="text-[11px] text-text-tertiary">
            {L(
              "Filteret gjelder bare visningen. Filmen er uendret. Flytting er av mens filteret er på.",
              "The filter only applies to the view. The film is unchanged. Moving is off while the filter is on.",
            )}
          </p>
        ) : null}
      </div>
      <ol
        ref={listRef}
        aria-label={
          canReorder
            ? L(
                "Scener i produksjonen. Alt + pil flytter valgt scene.",
                "Scenes in the production. Alt + arrow moves the selected scene.",
              )
            : L("Scener i produksjonen", "Scenes in the production")
        }
        className="min-h-0 flex-1 overflow-y-auto py-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        {occs.map((o, i) => {
          const v = state.variants[o.variantId];
          const merged = state.scenes[o.sceneId]?.mergedIntoSceneId != null;
          const selected = o.id === selectedOcc;
          const isMoved = moved?.has(o.id) ?? false;
          const isInView = o.id === inView && !selected;
          const hit = hits?.get(o.id);
          const notes = noteCounts?.get(o.id) ?? 0;
          return (
            <li
              key={o.id}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                setDropIndex(e.clientY < r.top + r.height / 2 ? i : i + 1);
              }}
              className="relative"
            >
              {dropIndex === i && dragId ? <DropLine /> : null}
              <div
                draggable={canReorder && !merged}
                onDragStart={(e) => {
                  setDragId(o.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", o.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropIndex(null);
                }}
                className={
                  "group grid grid-cols-[14px_1fr_auto] items-center gap-1.5 px-2 py-1.5 text-[13px] " +
                  (selected
                    ? "bg-accent-selection"
                    : isMoved
                      ? "bg-status-moved-bg hover:bg-surface-3"
                      : "hover:bg-surface-3") +
                  (isMoved
                    ? " shadow-[inset_3px_0_0_var(--status-moved)]"
                    : isInView
                      ? " bg-surface-3/60 shadow-[inset_3px_0_0_var(--accent-brand)]"
                      : "") +
                  (o.active ? "" : " opacity-60") +
                  (dragId === o.id ? " opacity-40" : "")
                }
              >
                <GripVertical
                  className={
                    "size-3.5 text-text-tertiary " +
                    (canReorder && !merged
                      ? "cursor-grab opacity-0 group-hover:opacity-100"
                      : "opacity-0")
                  }
                  aria-hidden
                />
                <button
                  type="button"
                  id={`nav-${o.id}`}
                  tabIndex={selected || (!selectedVisible && i === 0) ? 0 : -1}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onSelect(o.id)}
                  onKeyDown={(e) => onKey(e, o, i)}
                  className="grid min-w-0 cursor-pointer grid-cols-[34px_1fr] items-center gap-1.5 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  <span className="tabular truncate text-right font-mono text-xs text-text-secondary">
                    {sceneNumberOf(state, o) ?? "–"}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-text-primary">
                      {v ? formatHeading(v.heading) : "—"}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
                      {o.active ? (
                        <span className="tabular">
                          {L("s.", "p.")} {startPages[o.id] ?? "–"}
                        </span>
                      ) : (
                        <span>
                          {merged ? L("Sammenslått", "Merged") : L("Deaktivert", "Inactive")}
                        </span>
                      )}
                      {uncertainSet.has(o.id) ? (
                        <span className="flex items-center gap-0.5 text-status-uncertain">
                          <AlertTriangle className="size-3" aria-hidden />
                          {L("Usikker", "Uncertain")}
                        </span>
                      ) : null}
                      {isMoved ? (
                        <span className="text-status-moved">{L("Flyttet", "Moved")}</span>
                      ) : null}
                      {state.scenes[o.sceneId] &&
                      state.scenes[o.sceneId]!.storyTime.kind !== "linear" ? (
                        <span className="text-accent-brand">
                          {STORY_KIND_LABEL[state.scenes[o.sceneId]!.storyTime.kind]}
                        </span>
                      ) : null}
                      {notes ? (
                        <span
                          className="flex items-center gap-0.5 text-note"
                          title={L(
                            notes === 1 ? "1 notat" : `${notes} notater`,
                            notes === 1 ? "1 note" : `${notes} notes`,
                          )}
                        >
                          <MessageSquare className="size-3" aria-hidden />
                          {notes}
                        </span>
                      ) : null}
                      {v && v.ownerProductionId !== null ? (
                        <span>{L("Egen versjon", "Own version")}</span>
                      ) : null}
                      {presence?.get(o.id)?.length ? (
                        <span
                          className="text-accent-brand"
                          title={L("Står i scenen nå", "In the scene now")}
                        >
                          ●{" "}
                          {presence
                            .get(o.id)!
                            .map((p) => p.name)
                            .join(", ")}
                        </span>
                      ) : null}
                    </span>
                    {hit?.length ? (
                      <span className="block truncate text-[11px] text-text-secondary">
                        <span className="mark-search-chip mr-1 rounded-[2px] px-1">
                          {L("Treff", "Hit")}
                        </span>
                        {hit.map((h) => HIT_LABEL[h]).join(", ")}
                      </span>
                    ) : null}
                  </span>
                </button>
                {canToggle ? (
                  <Switch
                    checked={o.active}
                    disabled={merged}
                    onCheckedChange={(on) => onToggleActive(o.id, on)}
                    aria-label={
                      o.active
                        ? L(
                            `Deaktiver scene ${sceneNumberOf(state, o) ?? "uten nummer"}`,
                            `Deactivate scene ${sceneNumberOf(state, o) ?? "without number"}`,
                          )
                        : L(
                            `Aktiver scene ${sceneNumberOf(state, o) ?? "uten nummer"}`,
                            `Activate scene ${sceneNumberOf(state, o) ?? "without number"}`,
                          )
                    }
                    className="scale-75"
                  />
                ) : (
                  <span />
                )}
              </div>
            </li>
          );
        })}
        {dropIndex === occs.length && dragId ? (
          <li className="relative h-1" aria-hidden>
            <DropLine />
          </li>
        ) : null}
      </ol>
    </div>
  );
}

function DropLine() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-2 -top-px h-0.5 bg-accent-brand"
    />
  );
}
