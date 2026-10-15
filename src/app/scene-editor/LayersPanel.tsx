/**
 * Lagliste for 2D-scenen: forreste lag øverst. Valg, synlighet, lås, rekkefølge (knapper og dra-og-slipp),
 * grupper (dra et lag inn på en gruppe for å legge det i gruppen, eller ut ved siden av et lag utenfor) og
 * fjerning av laget fra scenen (ressursen blir i biblioteket). Valgt gruppe: lagene i den lyser opp.
 * Grupper kan lukkes og åpnes med pilen foran navnet, «slik en kan i Photoshop» (Mars 15.10.2026);
 * Alt-klikk på pilen lukker eller åpner alle. Hvilke som er lukket, huskes per bruker og scene.
 */
import { AssetSymbolIcon } from "@/app/library/AssetSymbolIcon";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  Group,
  Lock,
  Trash2,
  Ungroup,
  Unlock,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  LAYER_KIND_LABEL,
  layerVersion,
  layerVersions,
  layersOf,
  newId,
  transformAt,
  applyMatrix,
  groupMatrixAt,
  groupOf,
  regroupFields,
  IDENTITY_TRANSFORM,
  L,
  type Command,
  type Composition,
  type CompositionLayer,
  type ProjectState,
} from "@/core";
import { useImageUrls } from "@/app/library/asset-images";
import { layerFieldsOf as fieldsOf } from "@/core";
import { removeLayer } from "./layer-actions";
import { PaneResizer, usePaneSize } from "@/app/shell/pane-size";
import { useUiPref } from "@/app/account/ui-prefs";
import {
  groupMemberCount,
  groupsToOpenFor,
  isCollapsedGroups,
  selectionAfterCollapse,
  visibleLayerRows,
  withCollapsed,
  type CollapsedGroups,
} from "./layer-groups";

interface Props {
  readonly state: ProjectState;
  readonly composition: Composition;
  readonly editable: boolean;
  readonly selectedLayerId: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly run: (command: Command, label: string, group?: string) => string | null;
  /** Bildet avspillingshodet står på (plassering for en ny gruppe). */
  readonly frame?: number;
  /** Dobbeltklikk på et lag: velg bilde for laget (DEC-0044). */
  readonly onOpenImage?: (layerId: string) => void;
  /** Overskriften vises allerede av panelrammen (side om side): skjul den her (bare for skjermlesere). */
  readonly hideHeading?: boolean;
}

const NO_COLLAPSED: CollapsedGroups = {};

/** Slippsonen: midten av en grupperad legger laget i gruppen, ellers foran eller bak raden. */
function zoneAt(e: React.DragEvent<HTMLElement>, l: CompositionLayer): "before" | "after" | "into" {
  const r = e.currentTarget.getBoundingClientRect();
  const y = (e.clientY - r.top) / r.height;
  if (l.kind === "group" && y > 0.25 && y < 0.75) return "into";
  return y > 0.5 ? "after" : "before";
}

const iconButton =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-3 hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

/** Memoisert: tegnes ikke om for hvert bilde under avspilling. */
export const LayersPanel = memo(function LayersPanel({
  state,
  composition,
  editable,
  selectedLayerId,
  onSelect,
  run,
  onOpenImage,
  frame = 0,
  hideHeading = false,
}: Props) {
  // Bakerst først (som i modellen); listen vises med forreste lag øverst
  const back = useMemo(() => layersOf(state, composition.id), [state, composition.id]);
  const front = useMemo(() => [...back].reverse(), [back]);
  const paths = useMemo(() => {
    const out: string[] = [];
    for (const l of back) {
      for (const v of layerVersions(state, l)) out.push(v.mediaPath);
    }
    return out;
  }, [state, back]);
  const urls = useImageUrls(paths).data;
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  /** Hvor laget slippes: foran eller bak raden, eller inn i gruppen (midten av en grupperad). */
  const [drop, setDrop] = useState<{ id: string; zone: "before" | "after" | "into" } | null>(null);
  // Brukeren bestemmer selv hvor mange lag som vises (skillelinjen under listen kan dras)
  const [listHeight, setListHeight] = usePaneSize("scene-layers-list", 280, 80, 900);
  const selected = selectedLayerId ? state.layers[selectedLayerId] : undefined;
  const selectedGroup = selected?.kind === "group" ? selected.id : null;

  // Lukkede grupper i denne scenen (visningsvalg for brukeren – endrer ikke scenen)
  const [allCollapsed, setAllCollapsed] = useUiPref(
    "sceneEditor.collapsedGroups",
    NO_COLLAPSED,
    isCollapsedGroups,
  );
  const groupIds = useMemo(
    () => back.filter((l) => l.kind === "group").map((l): string => l.id),
    [back],
  );
  const collapsed = useMemo(() => {
    const saved = allCollapsed[composition.id] ?? [];
    return new Set(saved.filter((id) => groupIds.includes(id)));
  }, [allCollapsed, composition.id, groupIds]);
  const rows = useMemo(() => visibleLayerRows(front, collapsed), [front, collapsed]);

  function setCollapsed(next: ReadonlySet<string>) {
    setAllCollapsed(
      withCollapsed(
        allCollapsed,
        composition.id,
        groupIds.filter((id) => next.has(id)),
      ),
    );
    // Et valgt lag som nå er skjult: gruppen det ligger i blir valgt, så valget ikke forsvinner usynlig
    const sel = selectionAfterCollapse(back, next, selectedLayerId);
    if (sel !== selectedLayerId) onSelect(sel);
  }

  /** Pilen foran gruppen. Alt-klikk (Option): lukk eller åpne alle gruppene i scenen. */
  function toggleGroup(id: string, all: boolean) {
    const open = !collapsed.has(id);
    if (all) return setCollapsed(new Set(open ? groupIds : []));
    const next = new Set(collapsed);
    if (open) next.add(id);
    else next.delete(id);
    setCollapsed(next);
  }

  // Et lag som velges et annet sted (f.eks. på lerretet) og ligger i en lukket gruppe: åpne gruppen
  const lastSelected = useRef(selectedLayerId);
  useEffect(() => {
    if (lastSelected.current === selectedLayerId) return;
    lastSelected.current = selectedLayerId;
    if (!selectedLayerId) return;
    const open = groupsToOpenFor(back, collapsed, selectedLayerId);
    if (!open.length) return;
    setAllCollapsed(
      withCollapsed(
        allCollapsed,
        composition.id,
        [...collapsed].filter((id) => !open.includes(id)),
      ),
    );
  }, [selectedLayerId, back, collapsed, allCollapsed, composition.id, setAllCollapsed]);

  function exec(command: Command, label: string) {
    setError(run(command, label));
  }

  function toggle(l: CompositionLayer, key: "visible" | "locked") {
    const f = fieldsOf(l);
    const next = { ...f, [key]: !f[key] };
    exec(
      { type: "UpdateLayers", layers: [{ layerId: l.id, fields: next }] },
      key === "visible"
        ? l.visible
          ? L("Skjul lag", "Hide layer")
          : L("Vis lag", "Show layer")
        : l.locked
          ? L("Lås opp lag", "Unlock layer")
          : L("Lås lag", "Lock layer"),
    );
  }

  /**
   * Ny gruppe (DEC-0052, REQ-0174). Er et lag valgt, legges det i gruppen, og gruppens ankerpunkt blir
   * lagets midtpunkt; ellers midt i scenen. Begge stegene angres samlet.
   */
  function newGroup() {
    const sel = selectedLayerId ? state.layers[selectedLayerId] : undefined;
    const member = sel && sel.kind !== "group" && !sel.removed ? sel : undefined;
    // Ankerpunktet i scenens koordinater (laget kan ligge i en annen gruppe fra før)
    const at = member
      ? (() => {
          const t = transformAt(member, frame);
          const g = groupOf(state, member);
          return g ? applyMatrix(groupMatrixAt(g, frame), t.x, t.y) : t;
        })()
      : { x: composition.width / 2, y: composition.height / 2 };
    const anchor = { x: Math.round(at.x), y: Math.round(at.y) };
    const n = back.filter((l) => l.kind === "group").length + 1;
    const layerId = newId<"composition_layer">();
    const undoGroup = newId();
    const err = run(
      {
        type: "AddLayers",
        layers: [
          {
            layerId,
            compositionId: composition.id,
            fields: {
              kind: "group",
              name: L(`Gruppe ${n}`, `Group ${n}`),
              assetId: null,
              assetVariantId: null,
              versionId: null,
              fill: null,
              width: 1,
              height: 1,
              parallax: 1,
              transform: { ...IDENTITY_TRANSFORM, ...anchor },
              keyframes: [],
              visible: true,
              locked: false,
              groupId: null,
              swaps: [],
              path: null,
              anchor,
            },
          },
        ],
      },
      L("Ny gruppe", "New group"),
      undoGroup,
    );
    if (err) return setError(err);
    if (member)
      exec2(
        {
          type: "UpdateLayers",
          // Den nye gruppen står i ro (nøytral), så laget regnes bare ut av en eventuell gammel gruppe
          layers: [{ layerId: member.id, fields: regroupFields(state, member, layerId, frame) }],
        },
        L("Ny gruppe", "New group"),
        undoGroup,
      );
    onSelect(layerId);
  }

  function exec2(command: Command, label: string, group: string) {
    setError(run(command, label, group));
  }

  function moveBefore(layerId: string, beforeLayerId: string | null, label: string) {
    exec(
      { type: "MoveLayer", layerId: layerId as never, beforeLayerId: beforeLayerId as never },
      label,
    );
  }

  function forward(l: CompositionLayer) {
    const i = back.findIndex((x) => x.id === l.id);
    if (i < 0 || i >= back.length - 1) return;
    moveBefore(l.id, back[i + 2]?.id ?? null, L("Flytt lag fram", "Move layer forward"));
  }

  function backward(l: CompositionLayer) {
    const i = back.findIndex((x) => x.id === l.id);
    const target = back[i - 1];
    if (i <= 0 || !target) return;
    moveBefore(l.id, target.id, L("Flytt lag bak", "Move layer back"));
  }

  /** Rekkefølgen etter slipp foran (inFront: over målet i listen) eller bak målraden, eller null: uendret. */
  function orderTarget(
    draggedId: string,
    targetId: string,
    inFront: boolean,
  ): string | null | undefined {
    const i = back.findIndex((x) => x.id === draggedId);
    const j = back.findIndex((x) => x.id === targetId);
    if (i < 0 || j < 0) return undefined;
    let before: string | null;
    if (inFront) {
      let k = j + 1;
      if (back[k]?.id === draggedId) k++;
      before = back[k]?.id ?? null;
    } else {
      before = targetId;
    }
    const currentNext = back[i + 1]?.id ?? null;
    return before === currentNext ? undefined : before;
  }

  /**
   * Slipp et lag. På midten av en grupperad: laget legges i gruppen (rett under gruppen i listen). Foran
   * eller bak en rad: laget flyttes dit og får samme gruppe som raden – slippes det ved et lag utenfor
   * gruppen, tas det ut av gruppen. Begge stegene angres samlet.
   */
  function dropOn(
    draggedId: string,
    targetId: string,
    zone: "before" | "after" | "into",
    forceGroup?: string | null,
  ) {
    if (draggedId === targetId) return;
    const dragged = state.layers[draggedId];
    const target = state.layers[targetId];
    if (!dragged || !target) return;
    const key = newId();
    if (zone === "into") {
      if (target.kind !== "group" || dragged.kind === "group") return;
      if (dragged.groupId !== target.id) {
        const err = run(
          {
            type: "UpdateLayers",
            layers: [
              { layerId: dragged.id, fields: regroupFields(state, dragged, target.id, frame) },
            ],
          },
          L(
            `Legg «${dragged.name}» i «${target.name}»`,
            `Put “${dragged.name}” in “${target.name}”`,
          ),
          key,
        );
        if (err) return setError(err);
      }
      const before = orderTarget(draggedId, targetId, false);
      if (before !== undefined)
        setError(
          run(
            { type: "MoveLayer", layerId: draggedId as never, beforeLayerId: before as never },
            L(
              `Legg «${dragged.name}» i «${target.name}»`,
              `Put “${dragged.name}” in “${target.name}”`,
            ),
            key,
          ),
        );
      return;
    }
    // Gruppen laget havner i: målradens gruppe (en gruppe kan ikke ligge i en gruppe)
    const nextGroup =
      dragged.kind === "group"
        ? null
        : forceGroup !== undefined
          ? forceGroup
          : target.kind === "group"
            ? null
            : target.groupId;
    const label =
      nextGroup !== dragged.groupId
        ? nextGroup
          ? L(`Legg «${dragged.name}» i gruppe`, `Put “${dragged.name}” in a group`)
          : L(`Ta «${dragged.name}» ut av gruppen`, `Take “${dragged.name}” out of the group`)
        : L("Flytt lag", "Move layer");
    if (nextGroup !== dragged.groupId && dragged.kind !== "group") {
      const err = run(
        {
          type: "UpdateLayers",
          layers: [
            { layerId: dragged.id, fields: regroupFields(state, dragged, nextGroup, frame) },
          ],
        },
        label,
        key,
      );
      if (err) return setError(err);
    }
    const before = orderTarget(draggedId, targetId, zone === "before");
    if (before !== undefined)
      setError(
        run(
          { type: "MoveLayer", layerId: draggedId as never, beforeLayerId: before as never },
          label,
          key,
        ),
      );
  }

  /**
   * Slipp ved en rad i listen slik den vises. Bak en lukket gruppe betyr bak hele gruppen (også de skjulte
   * lagene i den), ikke mellom gruppen og lagene dens.
   */
  function dropAtRow(draggedId: string, l: CompositionLayer, zone: "before" | "after" | "into") {
    if (zone === "after" && l.kind === "group" && collapsed.has(l.id)) {
      const i = rows.findIndex((r) => r.layer.id === l.id);
      const next = rows[i + 1]?.layer;
      if (next) return dropOn(draggedId, next.id, "before");
      // Gruppen står nederst: legg laget bakerst, i samme gruppe som den lukkede gruppen
      const last = front[front.length - 1];
      if (last && last.id !== l.id)
        return dropOn(draggedId, last.id, "after", l.groupId ? l.groupId : null);
    }
    dropOn(draggedId, l.id, zone);
  }

  function leaveGroup(l: CompositionLayer) {
    exec(
      {
        type: "UpdateLayers",
        layers: [{ layerId: l.id, fields: regroupFields(state, l, null, frame) }],
      },
      L(`Ta «${l.name}» ut av gruppen`, `Take “${l.name}” out of the group`),
    );
  }

  return (
    <section aria-label={L("Lag", "Layers")} className="flex flex-col py-1">
      <div className="flex items-center px-3 pb-1 pt-2">
        <h2
          className={
            hideHeading
              ? "sr-only"
              : "text-xs font-medium uppercase tracking-[0.04em] text-text-tertiary"
          }
        >
          {L("Lag", "Layers")} ({back.length})
        </h2>
        {editable && back.length > 0 ? (
          <button
            type="button"
            onClick={newGroup}
            className="ml-auto inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            title={L(
              "Lag i en gruppe flyttes, roteres og skaleres sammen. Valgt lag legges i gruppen.",
              "Layers in a group are moved, rotated and scaled together. The selected layer is put in the group.",
            )}
          >
            <Group className="size-3.5" aria-hidden />
            {L("Ny gruppe", "New group")}
          </button>
        ) : null}
      </div>
      {back.length === 0 ? (
        <p className="px-3 pb-2 text-xs text-text-tertiary">
          {L("Ingen lag ennå. Bruk «Legg til lag».", "No layers yet. Use “Add layer”.")}
        </p>
      ) : (
        <div className="relative">
          <ul
            className="flex flex-col overflow-y-auto"
            style={{ maxHeight: listHeight }}
            aria-label={L("Lagene, forreste øverst", "Layers, front first")}
          >
            {rows.map(({ layer: l, depth }) => {
              const idx = front.indexOf(l);
              const on = l.id === selectedLayerId;
              const version = layerVersion(state, l);
              const url = version ? urls?.[version.mediaPath] : undefined;
              const isFront = idx === 0;
              const isBack = idx === front.length - 1;
              const dropping = drop?.id === l.id && dragId !== null && dragId !== l.id;
              const group = l.groupId ? state.layers[l.groupId] : undefined;
              const inGroup = !!group && group.kind === "group" && !group.removed;
              const members = l.kind === "group" ? groupMemberCount(back, l.id) : 0;
              const shut = l.kind === "group" && collapsed.has(l.id);
              // Lag i valgt gruppe lyser opp
              const lit = !!selectedGroup && l.groupId === selectedGroup;
              return (
                <li
                  key={l.id}
                  draggable={editable}
                  onDragStart={(e) => {
                    setDragId(l.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", l.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDrop(null);
                  }}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    const zone = zoneAt(e, l);
                    setDrop((d) =>
                      d && d.id === l.id && d.zone === zone ? d : { id: l.id, zone },
                    );
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragId) dropAtRow(dragId, l, zoneAt(e, l));
                    setDragId(null);
                    setDrop(null);
                  }}
                  // Innrykk etter hvor dypt laget ligger i grupper
                  style={{ paddingLeft: 4 + depth * 16 }}
                  data-layer-row={l.id}
                  className={
                    "group relative flex items-center gap-1 pr-2 " +
                    (on
                      ? "bg-accent-selection"
                      : lit
                        ? "bg-accent-selection/40 hover:bg-surface-3"
                        : "hover:bg-surface-3") +
                    (dragId === l.id ? " opacity-50" : "")
                  }
                >
                  {lit ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-accent-brand"
                    />
                  ) : null}
                  {dropping && drop.zone === "into" ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-sm ring-2 ring-inset ring-accent-brand"
                    />
                  ) : dropping ? (
                    <span
                      aria-hidden
                      className={
                        "pointer-events-none absolute inset-x-0 h-0.5 bg-accent-brand " +
                        (drop.zone === "after" ? "bottom-0" : "top-0")
                      }
                    />
                  ) : null}
                  {l.kind === "group" ? (
                    <button
                      type="button"
                      className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-3 hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      aria-expanded={!shut}
                      aria-label={
                        shut
                          ? L(`Åpne gruppen «${l.name}»`, `Expand the group “${l.name}”`)
                          : L(`Lukk gruppen «${l.name}»`, `Collapse the group “${l.name}”`)
                      }
                      title={
                        shut
                          ? L(
                              "Åpne gruppen (Alt-klikk: åpne alle)",
                              "Expand the group (Alt-click: expand all)",
                            )
                          : L(
                              "Lukk gruppen (Alt-klikk: lukk alle)",
                              "Collapse the group (Alt-click: collapse all)",
                            )
                      }
                      data-testid="layer-group-toggle"
                      onClick={(e) => toggleGroup(l.id, e.altKey)}
                    >
                      {shut ? (
                        <ChevronRight className="size-3.5" aria-hidden />
                      ) : (
                        <ChevronDown className="size-3.5" aria-hidden />
                      )}
                    </button>
                  ) : (
                    <span aria-hidden className="w-5 shrink-0" />
                  )}
                  <button
                    type="button"
                    onClick={() => onSelect(l.id)}
                    onDoubleClick={() => onOpenImage?.(l.id)}
                    title={L(
                      "Dobbeltklikk for å velge et annet bilde",
                      "Double-click to choose another image",
                    )}
                    aria-pressed={on}
                    className={
                      "flex min-w-0 flex-1 items-center gap-2 py-1 pl-0.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    }
                  >
                    <span
                      aria-hidden
                      className="h-5 w-8 shrink-0 overflow-hidden rounded-sm border border-border bg-surface-3"
                      style={l.fill && l.assetId === null ? { backgroundColor: l.fill } : undefined}
                    >
                      {url ? (
                        <img src={url} alt="" className="size-full object-cover" />
                      ) : l.kind === "group" ? (
                        <Group className="m-auto mt-0.5 size-3.5 text-text-tertiary" />
                      ) : l.assetId ? (
                        <AssetSymbolIcon
                          state={state}
                          assetId={l.assetId}
                          className="m-auto size-4"
                        />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={
                          "block truncate text-[13px] " +
                          (l.visible ? "text-text-primary" : "text-text-tertiary")
                        }
                      >
                        {l.name || L("Uten navn", "Without name")}
                      </span>
                      <span className="block truncate text-[11px] text-text-tertiary">
                        {LAYER_KIND_LABEL[l.kind]}
                        {l.kind === "group" ? L(` · ${members} lag`, ` · ${members} layers`) : ""}
                        {inGroup ? L(` · i «${group.name}»`, ` · in “${group.name}”`) : ""}
                      </span>
                    </span>
                  </button>
                  {editable ? (
                    <span
                      className={
                        "items-center " +
                        (on ? "flex" : "hidden group-focus-within:flex group-hover:flex")
                      }
                    >
                      <button
                        type="button"
                        className={iconButton}
                        onClick={() => forward(l)}
                        disabled={isFront}
                        aria-label={L("Flytt lag fram", "Move layer forward")}
                        title={L("Fram", "Forward")}
                      >
                        <ChevronUp className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className={iconButton}
                        onClick={() => backward(l)}
                        disabled={isBack}
                        aria-label={L("Flytt lag bak", "Move layer back")}
                        title={L("Bak", "Back")}
                      >
                        <ChevronDown className="size-3.5" />
                      </button>
                      {inGroup ? (
                        <button
                          type="button"
                          className={iconButton}
                          onClick={() => leaveGroup(l)}
                          aria-label={L(
                            `Ta «${l.name}» ut av gruppen`,
                            `Take “${l.name}” out of the group`,
                          )}
                          title={L("Ta ut av gruppen", "Take out of the group")}
                        >
                          <Ungroup className="size-3.5" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={iconButton}
                        onClick={() => {
                          setError(
                            removeLayer(
                              run,
                              state,
                              l,
                              frame,
                              L(
                                `Fjern «${l.name}» fra scenen`,
                                `Remove “${l.name}” from the scene`,
                              ),
                            ),
                          );
                          if (on) onSelect(null);
                        }}
                        aria-label={L(
                          `Fjern «${l.name}» fra scenen`,
                          `Remove “${l.name}” from the scene`,
                        )}
                        title={L(
                          "Fjern laget fra scenen (bildet blir i biblioteket, kan angres)",
                          "Remove the layer from the scene (the image stays in the library, can be undone)",
                        )}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  ) : null}
                  {editable ? (
                    <button
                      type="button"
                      className={iconButton}
                      onClick={() => toggle(l, "visible")}
                      aria-label={
                        l.visible ? L("Skjul lag", "Hide layer") : L("Vis lag", "Show layer")
                      }
                      title={l.visible ? L("Skjul lag", "Hide layer") : L("Vis lag", "Show layer")}
                    >
                      {l.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    </button>
                  ) : l.visible ? null : (
                    <EyeOff
                      className="size-3.5 text-text-tertiary"
                      aria-label={L("Skjult", "Hidden")}
                    />
                  )}
                  {editable ? (
                    <button
                      type="button"
                      className={
                        iconButton +
                        (l.locked
                          ? " !text-accent-brand"
                          : on
                            ? ""
                            : " !text-text-tertiary hover:!text-text-primary")
                      }
                      onClick={() => toggle(l, "locked")}
                      aria-label={
                        l.locked ? L("Lås opp lag", "Unlock layer") : L("Lås lag", "Lock layer")
                      }
                      title={
                        l.locked ? L("Lås opp lag", "Unlock layer") : L("Lås lag", "Lock layer")
                      }
                    >
                      {l.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                    </button>
                  ) : l.locked ? (
                    <Lock
                      className="size-3.5 text-text-tertiary"
                      aria-label={L("Låst", "Locked")}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
          <PaneResizer
            edge="bottom"
            size={listHeight}
            onSize={setListHeight}
            min={80}
            max={900}
            label={L("Høyde på laglisten", "Height of the layer list")}
          />
        </div>
      )}
      {error ? (
        <p role="alert" className="px-3 pt-1 text-xs text-status-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
});
