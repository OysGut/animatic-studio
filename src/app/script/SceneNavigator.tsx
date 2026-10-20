/**
 * Scenenavigator (mandat 2, 4.4): alle sceneforekomster i produksjonen i rekkefølge, også deaktiverte.
 * Flytting her er samme handling som i filmtidslinjen (MoveOccurrence, UX P5). Deaktivering er ikke sletting.
 * Rekkefølge og synlighet endres bare når «Endre rekkefølge og synlighet» er slått på (REQ-0532).
 * Scener som er flyttet siden siste lagrede versjon, har egen bakgrunnsfarge (REQ-0533).
 */
import { AlertTriangle, GripVertical, MessageSquare, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { HIT_LABEL, STORY_KIND_LABEL, SCENE_STATUS_LABEL, collation, durationForecast, formatDuration, formatHeading, projectDurationAssumptions, keyBetween, type HitKind, orderedOccurrences, type ProjectState, type SceneStatus, type SceneFilter, type SceneOccurrence, sceneNumberOf } from "@/core";
import { Switch } from "@/components/ui/switch";
import { uncertainVariants } from "./script-helpers";
import { t, tLocalized } from "@/core/i18n/keyed";

const ASSET_KIND_SHORT: Record<string, string> = tLocalized({ animal: "app-script-scene-navigator.asset-kind-short.animal.91c86fa488be", object: "app-script-scene-navigator.asset-kind-short.object.e3a47268765c", location: "app-script-scene-navigator.asset-kind-short.location.8ad662addcf0", environment: "app-script-scene-navigator.asset-kind-short.environment.e2306110f3a0", other: "app-script-scene-navigator.asset-kind-short.other.6e0a697580d3" });

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
  // Prognose fra historikk (M6): bare beregnet, aldri lagret og endrer aldri scenelengden
  const forecast = useMemo(
    () => new Map(durationForecast(state, productionId, projectDurationAssumptions(state.project)).scenes.map((x) => [x.occurrenceId, x])),
    [state, productionId],
  );
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
      t("app-script-scene-navigator.move-to.l-flytt-scene-scene-number-of-state-o-move-scene-scene-number-of-state-o-trim.d3f1572c968a", { value1: String(sceneNumberOf(state, o) ?? "") }).trim(),
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
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-surface-2 px-2 text-chrome-label font-medium uppercase tracking-label text-text-tertiary">
        <span>{t("app-script-scene-navigator.scene-navigator.span.1c4a03ef3bf2")}</span>
        <span className="font-mono tabular-nums normal-case tracking-normal">
          {visible
            ? t("app-script-scene-navigator.scene-navigator.span.f1d240f2f06c", { length: String(occs.length), length2: String(allOccs.length) })
            : t("app-script-scene-navigator.scene-navigator.span.6742e74d1217", { length: String(allOccs.filter((o) => o.active).length), length2: String(allOccs.length) })}
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
            <span>{t("app-script-scene-navigator.scene-navigator.span.4f4be6b70233")}</span>
            <Switch
              checked={structureEditing}
              onCheckedChange={onStructureEditingChange}
              aria-label={t("app-script-scene-navigator.scene-navigator.aria-label.4f4be6b70233")}
              className="scale-75"
            />
          </label>
          {structureEditing ? (
            <p className="text-[11px] text-text-tertiary">
              {visible
                ? t("app-script-scene-navigator.scene-navigator.p.a51d7d2ecc5b")
                : t("app-script-scene-navigator.scene-navigator.p.daea89179fad")}
            </p>
          ) : null}
        </div>
      ) : null}
      {moved && movedCount > 0 ? (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-1.5 text-[11px] text-text-secondary">
          <span className="size-2.5 rounded-sm bg-status-moved" aria-hidden />
          {movedCount === 1
            ? t("app-script-scene-navigator.scene-navigator.div.f18fbfaecf34")
            : t("app-script-scene-navigator.scene-navigator.div.cb12f5c0de28", { movedCount: String(movedCount) })}{" "}
          {t("app-script-scene-navigator.scene-navigator.div.3ee8cf607cef")}{" "}
          {movedBaseline ?? t("app-script-scene-navigator.scene-navigator.div.e44f37ce2d3f")}
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
            aria-label={t("app-script-scene-navigator.scene-navigator.aria-label.c2459c6ca950")}
            placeholder={t("app-script-scene-navigator.scene-navigator.placeholder.9607819efbb0")}
            value={filter.text ?? ""}
            onChange={(e) => onFilterChange({ ...filter, text: e.target.value })}
            className="h-7 w-full rounded-sm border border-border-control bg-surface-3 pl-7 pr-2 text-[13px] text-text-primary placeholder:text-text-tertiary"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <select
            aria-label={t("app-script-scene-navigator.scene-navigator.aria-label.7655577f6b82")}
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
            <option value="">{t("app-script-scene-navigator.scene-navigator.option.df2ed6ac2cba")}</option>
            {characters.some((c) => c.fromLibrary) ? (
              <optgroup label={t("app-script-scene-navigator.scene-navigator.label.89cd484d56d0")}>
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
              <optgroup label={t("app-script-scene-navigator.scene-navigator.label.0d7454b78653")}>
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
              title={t("app-script-scene-navigator.scene-navigator.title.6b6011b95d15")}
            >
              <X className="size-3.5" aria-hidden />
              {t("app-script-scene-navigator.scene-navigator.button.95a7e4becdab")}
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <select
            aria-label={t("app-script-scene-navigator.scene-navigator.aria-label.6b4272eb353b")}
            value={filter.assetId ?? ""}
            onChange={(e) => {
              const { assetId: _a, ...rest } = filter;
              onFilterChange(e.target.value ? { ...rest, assetId: e.target.value } : rest);
            }}
            className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
          >
            <option value="">{t("app-script-scene-navigator.scene-navigator.option.f79271649da5")}</option>
            {filterAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({ASSET_KIND_SHORT[a.kind] ?? a.kind})
              </option>
            ))}
          </select>
          <select
            aria-label={t("app-script-scene-navigator.scene-navigator.aria-label.9ebb18e0bf3f")}
            value={filter.status ?? ""}
            onChange={(e) => {
              const { status: _s, ...rest } = filter;
              onFilterChange(e.target.value ? { ...rest, status: e.target.value } : rest);
            }}
            className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
          >
            <option value="">{t("app-script-scene-navigator.scene-navigator.option.8d11f53c0e65")}</option>
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
          {t("app-script-scene-navigator.scene-navigator.label.f1274043f91b")}
        </label>
        {visible ? (
          <p className="text-[11px] text-text-tertiary">
            {t("app-script-scene-navigator.scene-navigator.p.1176f6cf0e8f")}
          </p>
        ) : null}
      </div>
      <ol
        ref={listRef}
        aria-label={
          canReorder
            ? t("app-script-scene-navigator.scene-navigator.aria-label.8bf7f0d66e5b")
            : t("app-script-scene-navigator.scene-navigator.aria-label.7179b1eb3e93")
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
                          {t("app-script-scene-navigator.scene-navigator.span.7620d2fe46d5")} {startPages[o.id] ?? "–"}
                        </span>
                      ) : (
                        <span>
                          {merged ? t("app-script-scene-navigator.scene-navigator.span.beb3736f0d84") : t("app-script-scene-navigator.scene-navigator.span.bba87363b5e2")}
                        </span>
                      )}
                      {o.active && forecast.get(o.id) ? (
                        <span
                          data-testid="nav-forecast"
                          className="tabular"
                          title={
                            forecast.get(o.id)!.actual
                              ? t("app-script-scene-navigator.scene-navigator.title.952c8d5f06f7")
                              : t("app-script-scene-navigator.scene-navigator.title.1f6383ec0ba5")
                          }
                        >
                          {forecast.get(o.id)!.actual
                            ? formatDuration(forecast.get(o.id)!.seconds)
                            : `${formatDuration(forecast.get(o.id)!.lowSeconds)}–${formatDuration(forecast.get(o.id)!.highSeconds)}`}
                        </span>
                      ) : null}
                      {uncertainSet.has(o.id) ? (
                        <span className="flex items-center gap-0.5 rounded-sm bg-status-uncertain-bg px-1 text-status-uncertain">
                          <AlertTriangle className="size-3" aria-hidden />
                          {t("app-script-scene-navigator.scene-navigator.span.2cb6f17a3804")}
                        </span>
                      ) : null}
                      {isMoved ? (
                        <span className="rounded-sm bg-status-moved-bg px-1 text-status-moved">{t("app-script-scene-navigator.scene-navigator.span.e4d59213ee1a")}</span>
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
                          title={t("app-script-scene-navigator.notes", { count: notes })}
                        >
                          <MessageSquare className="size-3" aria-hidden />
                          {notes}
                        </span>
                      ) : null}
                      {v && v.ownerProductionId !== null ? (
                        <span data-testid="nav-variant-badge" className="rounded-sm bg-status-running-bg px-1 text-status-running">{t("app-script-scene-navigator.scene-navigator.span.f5061f26f348")}</span>
                      ) : null}
                      {presence?.get(o.id)?.length ? (
                        <span
                          className="text-accent-brand"
                          title={t("app-script-scene-navigator.scene-navigator.title.a3ff285efe82")}
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
                          {t("app-script-scene-navigator.scene-navigator.span.c5772d68da3f")}
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
                        ? t("app-script-scene-navigator.deactivate-scene", { number: sceneNumberOf(state, o) ?? t("app-script-scene-navigator.scene-without-number") })
                        : t("app-script-scene-navigator.activate-scene", { number: sceneNumberOf(state, o) ?? t("app-script-scene-navigator.scene-without-number") })
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
