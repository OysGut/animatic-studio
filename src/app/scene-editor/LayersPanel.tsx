/**
 * Lagliste for 2D-scenen: forreste lag øverst. Valg, synlighet, lås, rekkefølge (knapper og dra-og-slipp),
 * grupper (dra et lag inn på en gruppe for å legge det i gruppen, eller ut ved siden av et lag utenfor) og
 * fjerning av laget fra scenen (ressursen blir i biblioteket). Valgt gruppe: lagene i den lyser opp.
 * Grupper kan lukkes og åpnes med pilen foran navnet, «slik en kan i Photoshop» (Mars 15.10.2026);
 * Alt-klikk på pilen lukker eller åpner alle. Hvilke som er lukket, huskes per bruker og scene.
 */
import { AssetSymbolIcon } from "@/app/library/AssetSymbolIcon";
import { AlphaExportDialog } from "@/app/assembly/AlphaExportDialog";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
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
import { LAYER_KIND_LABEL, layerVersion, layerVersions, layersOf, newId, transformAt, applyMatrix, groupMatrixAt, groupOf, regroupFields, IDENTITY_TRANSFORM, type Command, type Composition, type CompositionLayer, type ProjectState } from "@/core";
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
import { useLanguage } from "@/app/i18n/language";
import { t as tk } from "@/core/i18n/keyed";

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
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
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
  const [alphaOpen, setAlphaOpen] = useState(false);
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
          ? tk("app-scene-editor-layers-panel.toggle.exec.7c2086edac23")
          : tk("app-scene-editor-layers-panel.toggle.exec.69e012184db0")
        : l.locked
          ? tk("app-scene-editor-layers-panel.toggle.exec.24fc9c23cc98")
          : tk("app-scene-editor-layers-panel.toggle.exec.0510ed8b106a"),
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
              name: tk("app-scene-editor-layers-panel.name.name.289cdc165924", { n: String(n) }),
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
      tk("app-scene-editor-layers-panel.err.run.23fc3a4989f9"),
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
        tk("app-scene-editor-layers-panel.new-group.exec2.c116b4c93352"),
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
    moveBefore(l.id, back[i + 2]?.id ?? null, tk("app-scene-editor-layers-panel.forward.move-before.99b29c53eb48"));
  }

  function backward(l: CompositionLayer) {
    const i = back.findIndex((x) => x.id === l.id);
    const target = back[i - 1];
    if (i <= 0 || !target) return;
    moveBefore(l.id, target.id, tk("app-scene-editor-layers-panel.backward.move-before.1578a153d0d6"));
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
          tk("app-scene-editor-layers-panel.err.run.6bc065c6c485", { name: String(dragged.name), name2: String(target.name) }),
          key,
        );
        if (err) return setError(err);
      }
      const before = orderTarget(draggedId, targetId, false);
      if (before !== undefined)
        setError(
          run(
            { type: "MoveLayer", layerId: draggedId as never, beforeLayerId: before as never },
            tk("app-scene-editor-layers-panel.drop-on.run.199aa53d4ad3", { name: String(dragged.name), name2: String(target.name) }),
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
          ? tk("app-scene-editor-layers-panel.label.memo.b931eadf62ef", { name: String(dragged.name) })
          : tk("app-scene-editor-layers-panel.label.memo.96be501e2dd5", { name: String(dragged.name) })
        : tk("app-scene-editor-layers-panel.label.memo.17acbb91ef13");
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
      tk("app-scene-editor-layers-panel.leave-group.exec.68e9421339ac", { name: String(l.name) }),
    );
  }

  return (
    <section aria-label={tk("app-scene-editor-layers-panel.layers-panel.aria-label.697f7c407fae")} className="flex flex-col py-1">
      <div className="group flex h-8 shrink-0 items-center gap-1.5 border-b border-border bg-surface-2 px-2">
        <h2
          className={
            hideHeading
              ? "sr-only"
              : "text-[11px] font-medium uppercase tracking-wider text-text-tertiary"
          }
        >
          {tk("app-scene-editor-layers-panel.layers-panel.h2.697f7c407fae")} ({back.length})
        </h2>
        {editable && back.length > 0 ? (
          <button
            type="button"
            onClick={newGroup}
            className="ml-auto inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 opacity-60 group-hover:opacity-100 focus-visible:opacity-100 text-[11px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            title={tk("app-scene-editor-layers-panel.layers-panel.title.5db177ece09b")}
          >
            <Group className="size-3.5" aria-hidden />
            {tk("app-scene-editor-layers-panel.layers-panel.button.5722e9257c30")}
          </button>
        ) : null}
      </div>
      <Button variant="ghost" size="sm" className="justify-start text-xs" data-testid="alpha-export-open" disabled={!back.length}
        onClick={() => setAlphaOpen(true)}>
        <Download className="size-3.5" />{tk("app-scene-editor-layers-panel.layers-panel.button.0eca56bd7036")}
      </Button>
      {alphaOpen ? <AlphaExportDialog state={state} composition={composition} open={alphaOpen} onOpenChange={setAlphaOpen}
        {...(selectedLayerId ? { initialLayerIds: [selectedLayerId] } : {})} /> : null}
      {back.length === 0 ? (
        <p className="px-3 pb-2 text-xs text-text-tertiary">
          {tk("app-scene-editor-layers-panel.layers-panel.p.fe2f3b84eaf8")}
        </p>
      ) : (
        <div className="relative">
          <ul
            className="flex flex-col overflow-y-auto"
            style={{ maxHeight: listHeight }}
            aria-label={tk("app-scene-editor-layers-panel.layers-panel.aria-label.835dbfad7903")}
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
                          ? tk("app-scene-editor-layers-panel.layers-panel.aria-label.ae1170cba8dd", { name: String(l.name) })
                          : tk("app-scene-editor-layers-panel.layers-panel.aria-label.245bee7d36a3", { name: String(l.name) })
                      }
                      title={
                        shut
                          ? tk("app-scene-editor-layers-panel.layers-panel.title.a1dd0d5373ba")
                          : tk("app-scene-editor-layers-panel.layers-panel.title.4dcce50c5cf4")
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
                    title={tk("app-scene-editor-layers-panel.layers-panel.title.486b28947c3e")}
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
                        {l.name || tk("app-scene-editor-layers-panel.layers-panel.span.d03940b16399")}
                      </span>
                      <span className="block truncate text-[11px] text-text-tertiary">
                        {LAYER_KIND_LABEL[l.kind]}
                        {l.kind === "group" ? tk("app-scene-editor-layers-panel.layers-panel.span.eb5e76617e9d", { members: String(members) }) : ""}
                        {inGroup ? tk("app-scene-editor-layers-panel.layers-panel.span.cf7fa6b462f3", { name: String(group.name) }) : ""}
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
                        aria-label={tk("app-scene-editor-layers-panel.layers-panel.aria-label.5276a2f49f00")}
                        title={tk("app-scene-editor-layers-panel.layers-panel.title.e73011c56feb")}
                      >
                        <ChevronUp className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className={iconButton}
                        onClick={() => backward(l)}
                        disabled={isBack}
                        aria-label={tk("app-scene-editor-layers-panel.layers-panel.aria-label.4ee512ba28e5")}
                        title={tk("app-scene-editor-layers-panel.layers-panel.title.5315475e3596")}
                      >
                        <ChevronDown className="size-3.5" />
                      </button>
                      {inGroup ? (
                        <button
                          type="button"
                          className={iconButton}
                          onClick={() => leaveGroup(l)}
                          aria-label={tk("app-scene-editor-layers-panel.layers-panel.aria-label.94acff154dc6", { name: String(l.name) })}
                          title={tk("app-scene-editor-layers-panel.layers-panel.title.27367b0ba529")}
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
                              tk("app-scene-editor-layers-panel.layers-panel.remove-layer.0df8ba730439", { name: String(l.name) }),
                            ),
                          );
                          if (on) onSelect(null);
                        }}
                        aria-label={tk("app-scene-editor-layers-panel.layers-panel.aria-label.0df8ba730439", { name: String(l.name) })}
                        title={tk("app-scene-editor-layers-panel.layers-panel.title.ef4f6a732b66")}
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
                        l.visible ? tk("app-scene-editor-layers-panel.layers-panel.aria-label.1580c74b392f") : tk("app-scene-editor-layers-panel.layers-panel.aria-label.c6cbd6ad8f01")
                      }
                      title={l.visible ? tk("app-scene-editor-layers-panel.layers-panel.title.1580c74b392f") : tk("app-scene-editor-layers-panel.layers-panel.title.c6cbd6ad8f01")}
                    >
                      {l.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    </button>
                  ) : l.visible ? null : (
                    <EyeOff
                      className="size-3.5 text-text-tertiary"
                      aria-label={tk("app-scene-editor-layers-panel.layers-panel.aria-label.beabbcc1219a")}
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
                        l.locked ? tk("app-scene-editor-layers-panel.layers-panel.aria-label.fbadc2253a2e") : tk("app-scene-editor-layers-panel.layers-panel.aria-label.2589ae554009")
                      }
                      title={
                        l.locked ? tk("app-scene-editor-layers-panel.layers-panel.title.fbadc2253a2e") : tk("app-scene-editor-layers-panel.layers-panel.title.2589ae554009")
                      }
                    >
                      {l.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                    </button>
                  ) : l.locked ? (
                    <Lock
                      className="size-3.5 text-text-tertiary"
                      aria-label={tk("app-scene-editor-layers-panel.layers-panel.aria-label.2ba728f52562")}
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
            label={tk("app-scene-editor-layers-panel.layers-panel.label.01e4f93b9cc0")}
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
