import { StoryboardReview } from "./StoryboardReview";
import { BoordsSendButton } from "./BoordsSend";
import { SbproButton } from "./SbproSend";
/**
 * SB-2: storyboardgalleriet. Hele filmen i fortellerrekkefølge per produksjon (samme ordnede forekomster
 * som manus og montering), panelene gruppert per scene. Alle endringer er SB-1-kommandoer via runCommand,
 * så alt kan angres og ingenting slettes. Scenerekkefølgen endres med den eksisterende MoveOccurrence.
 */
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, Clapperboard, Copy, Eye, EyeOff, FileText, GripVertical, Minus, Play, Plus, Power, Redo2, RotateCcw, Undo2, MoveRight } from "lucide-react";
import {
  PRODUCTION_AREAS,
  PRODUCTION_STATUSES,
  anchorRefs,
  blocksOfVariant,
  buildGallery,
  flatPanels,
  gridStep,
  layerVersion,
  layersOf,
  newId,
  occurrenceKeyAt,
  panelKeyAfter,
  panelKeyAt,
  panelLines,
  planDuplicatePanel,
  planStoryboardSeed,
  productionStatusOf,
  seedCommand,
  storyboardPanelsOf,
  type GalleryPanel,
  type GalleryScene,
  type ProductionArea,
  type ProductionStatusValue,
  type ProjectState,
} from "@/core";
import { t as tk, tLocalized } from "@/core/i18n/keyed";
import { useLanguage } from "@/app/i18n/language";
import { canEdit, useMembers, useProjectState } from "@/app/project/use-project";
import { useCommands, type Commands } from "@/app/project/use-commands";
import { useActiveProduction } from "@/app/project/use-production";
import { useUiPref } from "@/app/account/ui-prefs";
import { useImageUrls } from "@/app/library/asset-images";
import { Thumbnail } from "@/app/shared/Thumbnail";
import { SceneSelect } from "@/app/shell/SceneSelect";
import { currentPosition, rememberPosition } from "@/app/shell/current-scene";
import { panelPosition } from "@/core/storyboard/position";
import { continuityBlockingIssues } from "@/core/storyboard/blocking";
import { suggestPanelTimings, panelTiming } from "@/core/storyboard/playback";
import { filmClips } from "@/core";
import { GalleryPlayback, ScrubPreview } from "./GalleryPlayback";
import { StoryboardFilm } from "./StoryboardFilm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DEFAULT_GALLERY_PREFS,
  GALLERY_SHOW_KEYS,
  MAX_SIZE,
  MIN_SIZE,
  columnsFor,
  isGalleryPrefs,
  virtualRows,
  visibleRows,
  zoomStep,
  type GalleryPrefs,
  type GalleryShowKey,
} from "./gallery-prefs";

const AREA_KEY = tLocalized<ProductionArea>({
  script: "sb2.area.script",
  storyboard: "sb2.area.storyboard",
  animation: "sb2.area.animation",
  sound: "sb2.area.sound",
  film: "sb2.area.film",
});
const AREA_SHORT_KEY = tLocalized<ProductionArea>({
  script: "sb2.area-short.script",
  storyboard: "sb2.area-short.storyboard",
  animation: "sb2.area-short.animation",
  sound: "sb2.area-short.sound",
  film: "sb2.area-short.film",
});
const STATUS_KEY = tLocalized<ProductionStatusValue>({
  not_started: "sb2.status.not-started",
  in_progress: "sb2.status.in-progress",
  review: "sb2.status.review",
  changes_requested: "sb2.status.changes-requested",
  done: "sb2.status.done",
});
const STATUS_CLASS: Record<ProductionStatusValue, string> = {
  not_started: "bg-status-neutral-bg text-status-neutral",
  in_progress: "bg-status-running-bg text-status-running",
  review: "bg-status-uncertain-bg text-status-uncertain",
  changes_requested: "bg-status-danger-bg text-status-danger",
  done: "bg-status-success-bg text-status-success",
};
const SHOW_KEY = tLocalized<GalleryShowKey>({
  name: "sb2.show.name",
  number: "sb2.show.number",
  dialogue: "sb2.show.dialogue",
  script: "sb2.show.script",
  notes: "sb2.show.notes",
  timing: "sb2.show.timing",
  status: "sb2.show.status",
});

const HEADER_H = 44;
const GAP = 12;
const ctl = "h-8 rounded border border-border-control bg-surface-1 px-2 text-[13px] text-text-primary";

export function StoryboardWorkspace({
  projectId,
  userId,
  initialPanelId = null,
  initialOccurrenceId = null,
}: {
  projectId: string;
  userId: string;
  initialPanelId?: string | null;
  initialOccurrenceId?: string | null;
}) {
  useLanguage();
  const query = useProjectState(projectId);
  const members = useMembers(projectId);
  const role = members.data?.find((m) => m.user_id === userId)?.role;
  const editable = canEdit(role);
  const cmds = useCommands(projectId, userId, editable, undefined, true, true);
  if (query.isLoading) return <p className="p-6 text-[13px] text-text-tertiary">{tk("sb2.loading")}</p>;
  if (query.isError || !query.data)
    return (
      <div role="alert" className="p-6 text-[13px] text-status-danger">
        {tk("sb2.load-error")}
      </div>
    );
  return (
    <Gallery
      projectId={projectId}
      state={query.data}
      editable={editable}
      cmds={cmds}
      initialPanelId={initialPanelId}
      initialOccurrenceId={initialOccurrenceId}
    />
  );
}

function fmtSeconds(frames: number, fps: number): string {
  if (!(frames > 0) || !(fps > 0)) return "–";
  return `${(frames / fps).toFixed(1)} s`;
}

export function Gallery({
  projectId,
  state,
  editable,
  cmds,
  initialPanelId,
  initialOccurrenceId,
}: {
  projectId: string;
  state: ProjectState;
  editable: boolean;
  cmds: Commands;
  initialPanelId: string | null;
  initialOccurrenceId: string | null;
}) {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useUiPref<GalleryPrefs>("storyboard-gallery", DEFAULT_GALLERY_PREFS, isGalleryPrefs);
  const set = (p: Partial<GalleryPrefs>) => setPrefs({ ...prefs, ...p });
  const [savedPosition, setSavedPosition] = useState<ReturnType<typeof currentPosition>>(null);
  useEffect(() => { setSavedPosition(currentPosition(projectId)); }, [projectId]);
  const [productionId, setProductionId] = useActiveProduction(projectId, state, initialOccurrenceId ?? savedPosition?.occurrenceId);
  const continuityFlags = useMemo(()=>new Set(continuityBlockingIssues(state,productionId).map(i=>i.panelId)),[state,productionId]);
  const filter = prefs.filterArea && prefs.filterStatus ? { area: prefs.filterArea, status: prefs.filterStatus } : null;
  const gallery = useMemo(
    () => buildGallery(state, productionId, { showHidden: prefs.showHidden, filter }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, productionId, prefs.showHidden, prefs.filterArea, prefs.filterStatus],
  );
  const flat = useMemo(() => flatPanels(gallery), [gallery]);
  const [selected, setSelected] = useState<string | null>(initialPanelId ?? savedPosition?.panelId ?? null);
  useEffect(() => { if (!initialPanelId && savedPosition?.panelId) setSelected(savedPosition.panelId); }, [initialPanelId, savedPosition]);
  const [playingOccurrence, setPlayingOccurrence] = useState<string | null>(null);
  const selectPanel = useCallback((id: string) => {
    setSelected(id);
    const panel = state.compositions[id];
    if (!panel?.occurrenceId) return;
    const saved = currentPosition(projectId);
    const p = panelPosition(state, panel.occurrenceId, id, null, saved?.panelId === id ? saved.timeMs ?? 0 : 0);
    if (p) rememberPosition(projectId, p);
  }, [projectId, state]);
  const followPanel = useCallback((id: string) => { focusPending.current = true; setSelected(id); }, []);
  const [error, setError] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [filmOpen, setFilmOpen] = useState(false);
  const fps = state.project.fps.num / state.project.fps.den;
  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";

  // Første åpning: foreslå ett tomt panel per scene (brukeren bekrefter)
  const seedPlan = useMemo(() => planStoryboardSeed(state, productionId), [state, productionId]);
  const hasPanels = useMemo(
    () => Object.values(state.compositions).some((c) => !c.removed && c.kind === "storyboard" && c.occurrenceId && state.occurrences[c.occurrenceId]?.productionId === productionId),
    [state, productionId],
  );
  const [seedDismissed, setSeedDismissed] = useState(false);
  const seedOpen = editable && !hasPanels && seedPlan.length > 0 && !seedDismissed;

  const run = useCallback(
    (c: Parameters<Commands["run"]>[0], label: string, group?: string) => {
      const e = cmds.run(c, label, group);
      setError(e);
      return e;
    },
    [cmds],
  );

  const sel = selected ? flat.find((p) => p.panel.id === selected) ?? null : null;
  const selScene = sel ? gallery.find((g) => g.occurrence.id === sel.panel.occurrenceId) ?? null : null;

  const open = useCallback(
    (p: GalleryPanel) => {
      if (!p.panel.occurrenceId) return;
      const saved = currentPosition(projectId);
      const position = panelPosition(state, p.panel.occurrenceId, p.panel.id, null, saved?.panelId === p.panel.id ? saved.timeMs ?? 0 : 0);
      if (position) rememberPosition(projectId, position);
      void navigate({ to: "/prosjekt/$projectId/scene", params: { projectId }, search: { scene: p.panel.occurrenceId, panel: p.panel.id } as never });
    },
    [navigate, projectId],
  );
  const jumpToScript = () => {
    const occ = sel?.panel.occurrenceId ?? gallery[0]?.occurrence.id;
    if (!occ) return;
    const blokk = sel?.panel.storyboard?.dialogueIds[0] ?? sel?.blockIds[0];
    void navigate({ to: "/prosjekt/$projectId/manus", params: { projectId }, search: { scene: occ, ...(blokk ? { blokk } : {}) } });
  };

  // ---------- Kommandoer ----------
  const addPanel = (scene: GalleryScene, after: string | null) => {
    const panelId = newId<"composition">();
    if (!run({ type: "AddStoryboardPanel", panelId, occurrenceId: scene.occurrence.id, variantId: scene.occurrence.variantId, orderKey: panelKeyAfter(state, scene.occurrence.id, after) }, tk("sb2.undo.add")))
      setSelected(panelId);
  };
  const duplicate = (p: GalleryPanel) => {
    const plan = planDuplicatePanel(state, p.panel.id);
    const g = newId();
    for (const c of plan) if (run(c, tk("sb2.undo.duplicate"), g)) return;
    const first = plan[0];
    if (first?.type === "AddStoryboardPanel") setSelected(first.panelId);
  };
  const toggleHidden = (p: GalleryPanel) =>
    run({ type: "UpdateStoryboardPanel", panelId: p.panel.id, hidden: !p.panel.hidden }, p.panel.hidden ? tk("sb2.undo.show") : tk("sb2.undo.hide"));
  const toggleActive = (p: GalleryPanel) =>
    run({ type: "UpdateStoryboardPanel", panelId: p.panel.id, active: p.panel.active === false }, p.panel.active === false ? tk("sb2.undo.activate") : tk("sb2.undo.deactivate"));
  const movePanel = (p: GalleryPanel, toIndex: number) => {
    const key = panelKeyAt(state, p.panel.id, toIndex);
    if (key) run({ type: "MoveStoryboardPanel", panelId: p.panel.id, orderKey: key }, tk("sb2.undo.move"));
  };
  const moveScene = (occurrenceId: string, toIndex: number) => {
    const key = occurrenceKeyAt(state, occurrenceId, toIndex);
    if (!key) return;
    if (!run({ type: "MoveOccurrence", occurrenceId: occurrenceId as never, orderKey: key }, tk("sb2.undo.move-scene"))) setNotice(tk("sb2.scene-order-changed"));
  };
  const setStatus = (area: ProductionArea, status: ProductionStatusValue, target: { occurrenceId: string } | { compositionId: string }) => {
    const existing = productionStatusOf(state, area, target as never);
    run(
      { type: "SetProductionStatus", statusId: existing?.id ?? newId(), eventId: newId(), area, status, ...target } as never,
      tk("sb2.undo.status"),
    );
  };

  // ---------- Layout og virtualisering ----------
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1024);
  const [viewH, setViewH] = useState(800);
  const [scrollTop, setScrollTop] = useState(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth > 0) setWidth(el.clientWidth - 32);
      if (el.clientHeight > 0) setViewH(el.clientHeight);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const textView = prefs.view === "text";
  const cardW = textView ? Math.max(width, 200) : prefs.size;
  const columns = textView ? 1 : columnsFor(width, prefs.size, GAP);
  const imageH = textView ? 0 : Math.round((prefs.size * state.project.frameHeight) / Math.max(1, state.project.frameWidth));
  const textLines = (prefs.show.name || prefs.show.number || prefs.show.timing ? 1 : 0) + (prefs.show.dialogue ? 2 : 0) + (prefs.show.script ? 2 : 0) + (prefs.show.status ? 1 : 0) + (prefs.show.notes ? 1 : 0);
  const rowH = imageH + 16 + textLines * 18 + GAP;
  const rows = useMemo(() => virtualRows(gallery.map((g) => g.panels.length), columns, HEADER_H, rowH), [gallery, columns, rowH]);
  const totalH = rows.length ? rows[rows.length - 1]!.top + rows[rows.length - 1]!.height : 0;
  const shown = visibleRows(rows, scrollTop, viewH);

  // Fokus følger valget; utenfor vinduet rulles raden inn først
  const focusPending = useRef(false);
  useEffect(() => {
    if (!selected) return;
    const idx = flat.findIndex((p) => p.panel.id === selected);
    if (idx < 0) return;
    const p = flat[idx]!;
    const si = gallery.findIndex((g) => g.occurrence.id === p.panel.occurrenceId);
    const pi = gallery[si]?.panels.indexOf(p) ?? 0;
    const row = rows.find((r) => r.kind === "panels" && r.sceneIndex === si && pi >= r.from && pi < r.to);
    const el = scrollRef.current;
    if (row && el && (row.top < el.scrollTop || row.top + row.height > el.scrollTop + el.clientHeight)) {
      el.scrollTop = Math.max(0, row.top - HEADER_H);
      setScrollTop(el.scrollTop);
    }
    if (focusPending.current) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-panel-id="${selected}"]`)?.focus();
      });
      focusPending.current = false;
    }
  }, [selected, flat, gallery, rows]);

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!sel) {
      if (flat[0] && e.key.startsWith("Arrow")) {
        e.preventDefault();
        focusPending.current = true;
        setSelected(flat[0].panel.id);
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      open(sel);
      return;
    }
    if (e.altKey && editable && selScene && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const pi = selScene.panels.indexOf(sel);
      const forward = (e.key === "ArrowRight") !== rtl;
      movePanel(sel, Math.max(0, pi + (forward ? 1 : -1)));
      focusPending.current = true;
      return;
    }
    const idx = flat.indexOf(sel);
    const next = gridStep(idx, flat.length, columns, e.key, rtl);
    if (next !== idx && next >= 0) {
      e.preventDefault();
      focusPending.current = true;
      setSelected(flat[next]!.panel.id);
    }
  };

  // ---------- Dra og slipp ----------
  const drag = useRef<{ kind: "panel" | "scene"; id: string } | null>(null);
  const onDragStart = (kind: "panel" | "scene", id: string) => (e: DragEvent) => {
    drag.current = { kind, id };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };
  const onDropPanel = (target: GalleryPanel, scene: GalleryScene) => (e: DragEvent) => {
    e.preventDefault();
    const d = drag.current;
    drag.current = null;
    if (!d || d.kind !== "panel" || d.id === target.panel.id || !editable) return;
    const src = flat.find((p) => p.panel.id === d.id);
    if (!src) return;
    if (src.panel.occurrenceId !== target.panel.occurrenceId) {
      setSelected(src.panel.id);
      setMoveTarget(scene.occurrence.id);
      setMoveOpen(true);
      return;
    }
    const list = storyboardPanelsOf(state, scene.occurrence.id).filter((p) => p.id !== src.panel.id);
    movePanel(src, list.findIndex((p) => p.id === target.panel.id));
  };
  const onDropScene = (scene: GalleryScene) => (e: DragEvent) => {
    e.preventDefault();
    const d = drag.current;
    drag.current = null;
    if (!d || d.kind !== "scene" || d.id === scene.occurrence.id || !editable) return;
    const order = gallery.map((g) => g.occurrence.id);
    moveScene(d.id, Math.max(0, order.indexOf(scene.occurrence.id)));
  };
  const [moveTarget, setMoveTarget] = useState<string>("");

  // Bilder: bare panelene i de synlige radene henter lenker
  const visiblePanels = useMemo(
    () => shown.flatMap((r) => (r.kind === "panels" ? gallery[r.sceneIndex]!.panels.slice(r.from, r.to) : [])),
    [shown, gallery],
  );
  const thumbPath = useCallback(
    (p: GalleryPanel): string | null => {
      for (const l of [...layersOf(state, p.panel.id)].reverse()) {
        const v = layerVersion(state, l);
        if (v?.mediaPath) return v.mediaPath;
      }
      return null;
    },
    [state],
  );
  const urls = useImageUrls(textView ? [] : visiblePanels.map(thumbPath).filter((x): x is string => !!x)).data;

  const productions = Object.values(state.productions).filter((p) => !(p as { removed?: boolean }).removed);
  const timingClips = useMemo(() => filmClips(state, productionId), [state, productionId]);
  const timingSuggestions = useMemo(() => sel?.panel.occurrenceId ? suggestPanelTimings(state, timingClips, sel.panel.occurrenceId) : [], [state, timingClips, sel?.panel.occurrenceId]);
  const acceptTiming = (wholeScene: boolean) => {
    const group = newId();
    for (const suggestion of timingSuggestions.filter(s => wholeScene || s.panelId === selected)) {
      const panel = state.compositions[suggestion.panelId];
      if (!panel || productionStatusOf(state, "storyboard", { compositionId: panel.id })?.status === "done") continue;
      if (run({ type: "UpdateStoryboardPanel", panelId: panel.id, durationFrames: suggestion.frames }, tk("sb4.accept-timing"), group)) break;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="storyboard-workspace">
      {/* Verktøylinje */}
      <StoryboardReview state={state} projectId={projectId} productionId={productionId} cmds={cmds} editable={editable} />
      <BoordsSendButton state={state} projectId={projectId} productionId={productionId} cmds={cmds} editable={editable} />
      <SbproButton state={state} projectId={projectId} productionId={productionId} cmds={cmds} editable={editable} />
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-1 px-4 py-2" role="toolbar" aria-label={tk("sb2.toolbar")}>
        <label className="flex items-center gap-1 text-[13px] text-text-secondary">
          {tk("sb2.production")}
          <select className={ctl} value={productionId} onChange={(e) => setProductionId(e.target.value)} data-testid="sb-production">
            {productions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1" role="group" aria-label={tk("sb2.zoom")}>
          <Button size="icon" variant="ghost" aria-label={tk("sb2.zoom-out")} onClick={() => set({ size: zoomStep(prefs.size, -1) })} disabled={textView}><Minus /></Button>
          <input
            type="range"
            min={MIN_SIZE}
            max={MAX_SIZE}
            step={4}
            value={prefs.size}
            disabled={textView}
            onChange={(e) => set({ size: Number(e.target.value) })}
            aria-label={tk("sb2.panel-size")}
            data-testid="sb-size"
            className="w-28 accent-accent-brand"
          />
          <Button size="icon" variant="ghost" aria-label={tk("sb2.zoom-in")} onClick={() => set({ size: zoomStep(prefs.size, 1) })} disabled={textView}><Plus /></Button>
        </div>
        <Button variant={textView ? "secondary" : "ghost"} size="sm" aria-pressed={textView} onClick={() => set({ view: textView ? "grid" : "text" })} data-testid="sb-text-view">
          <FileText /> {tk("sb2.text-view")}
        </Button>
        <fieldset className="flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
          <legend className="sr-only">{tk("sb2.show-legend")}</legend>
          {GALLERY_SHOW_KEYS.map((k) => (
            <label key={k} className="flex items-center gap-1">
              <input type="checkbox" checked={prefs.show[k]} onChange={(e) => set({ show: { ...prefs.show, [k]: e.target.checked } })} data-testid={`sb-show-${k}`} />
              {SHOW_KEY[k]}
            </label>
          ))}
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={prefs.showHidden} onChange={(e) => set({ showHidden: e.target.checked })} data-testid="sb-show-hidden" />
            {tk("sb2.show-hidden")}
          </label>
        </fieldset>
        <label className="flex items-center gap-1 text-[13px] text-text-secondary">
          {tk("sb2.filter")}
          <select className={ctl} value={prefs.filterArea ?? ""} data-testid="sb-filter-area" aria-label={tk("sb2.filter-area")}
            onChange={(e) => set({ filterArea: (e.target.value || null) as ProductionArea | null, filterStatus: e.target.value ? prefs.filterStatus ?? "not_started" : null })}>
            <option value="">{tk("sb2.filter-none")}</option>
            {PRODUCTION_AREAS.map((a) => <option key={a} value={a}>{AREA_KEY[a]}</option>)}
          </select>
          <select className={ctl} value={prefs.filterStatus ?? ""} disabled={!prefs.filterArea} data-testid="sb-filter-status" aria-label={tk("sb2.filter-status")}
            onChange={(e) => set({ filterStatus: (e.target.value || null) as ProductionStatusValue | null })}>
            {PRODUCTION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_KEY[s]}</option>)}
          </select>
        </label>
        <Button variant="ghost" size="sm" onClick={jumpToScript} data-testid="sb-jump-script"><FileText /> {tk("sb2.jump-script")}</Button>
        {sel ? <Button variant="ghost" size="sm" onClick={() => open(sel)} data-testid="sb5-back-to-scene"><Clapperboard /> {tk("sb5.back-to-scene")}</Button> : null}
        <Button variant="ghost" size="sm" onClick={() => setFilmOpen(true)} data-testid="sb-play-film" aria-label={tk("sb4.play-film")}><Play /> {tk("sb4.play-film")}</Button>
        <div className="ms-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={cmds.undo} disabled={!cmds.canUndo} aria-label={tk("sb2.undo")} title={cmds.undoLabel ?? undefined}><Undo2 /></Button>
          <Button size="icon" variant="ghost" onClick={cmds.redo} disabled={!cmds.canRedo} aria-label={tk("sb2.redo")} title={cmds.redoLabel ?? undefined}><Redo2 /></Button>
        </div>
      </div>
      {/* Handlinger for valgt panel */}
      <GalleryPlayback key={productionId} state={state} projectId={projectId} productionId={productionId} selected={selected} onCurrent={followPanel} onPlaying={setPlayingOccurrence}/>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-1 px-4 py-1.5 text-[13px]" role="toolbar" aria-label={tk("sb2.panel-actions")}>
        <span className="text-text-secondary" aria-live="polite" data-testid="sb-selected">
          {sel ? tk("sb2.selected", { number: String(sel.index + 1) }) : tk("sb2.none-selected")}
        </span>
        {sel && editable ? (
          <>
            <span className="text-text-tertiary" data-testid="sb4-timing-source">{panelTiming(state, timingClips, sel.panel).source === "panel" ? tk("sb3.panel") : tk("sb4.inherited")} · {tk("sb4.scene-timing")}</span>
            {timingSuggestions.find(s => s.panelId === selected) ? <Button size="sm" variant="ghost" onClick={() => acceptTiming(false)} data-testid="sb4-accept-panel">{tk("sb4.accept-timing")} · {fmtSeconds(timingSuggestions.find(s => s.panelId === selected)?.frames ?? 0, fps)}</Button> : null}
            {timingSuggestions.length ? <Button size="sm" variant="ghost" onClick={() => acceptTiming(true)} data-testid="sb4-accept-scene">{tk("sb4.accept-scene-timing")}</Button> : null}
            <Button size="sm" variant="ghost" onClick={() => selScene && addPanel(selScene, sel.panel.id)} data-testid="sb-add"><Plus /> {tk("sb2.add")}</Button>
            <Button size="sm" variant="ghost" onClick={() => duplicate(sel)} data-testid="sb-duplicate"><Copy /> {tk("sb2.duplicate")}</Button>
            <Button size="sm" variant="ghost" onClick={() => toggleHidden(sel)} data-testid="sb-hide">{sel.panel.hidden ? <Eye /> : <EyeOff />} {sel.panel.hidden ? tk("sb2.show-panel") : tk("sb2.hide")}</Button>
            <Button size="sm" variant="ghost" onClick={() => toggleActive(sel)} data-testid="sb-deactivate">{sel.panel.active === false ? <RotateCcw /> : <Power />} {sel.panel.active === false ? tk("sb2.restore") : tk("sb2.deactivate")}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setMoveTarget(""); setMoveOpen(true); }} data-testid="sb-move-scene"><MoveRight /> {tk("sb2.move-to-scene")}</Button>
            {PRODUCTION_AREAS.map((a) => (
              <label key={a} className="flex items-center gap-1 text-text-secondary">
                {AREA_SHORT_KEY[a]}
                <select className={ctl} value={sel.statuses[a]} aria-label={tk("sb2.status-of", { area: AREA_KEY[a] })} data-testid={`sb-status-${a}`}
                  onChange={(e) => setStatus(a, e.target.value as ProductionStatusValue, { compositionId: sel.panel.id })}>
                  {PRODUCTION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_KEY[s]}</option>)}
                </select>
              </label>
            ))}
          </>
        ) : null}
        {error ? <span role="alert" className="text-status-danger">{error}</span> : null}
        {notice ? <span role="status" className="text-text-secondary" data-testid="sb-notice">{notice}</span> : null}
      </div>

      {/* Galleriet (virtualisert: bare synlige rader tegnes) */}
      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-auto bg-surface-2 px-4"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onKeyDown={onGridKey}
        role="grid"
        aria-label={tk("sb2.gallery")}
        aria-rowcount={rows.length}
        data-testid="sb-grid"
        data-view={textView ? "text" : "grid"}
        tabIndex={sel ? -1 : 0}
      >
        {gallery.length === 0 ? <p className="py-8 text-[13px] text-text-tertiary">{tk("sb2.empty")}</p> : null}
        <div style={{ height: totalH }} className="relative">
          {shown.map((r) => {
            const scene = gallery[r.sceneIndex]!;
            const key = `${r.kind}-${scene.occurrence.id}-${r.from}`;
            if (r.kind === "scene") {
              const si = r.sceneIndex;
              return (
                <div key={key} role="row" draggable={editable} onDragStart={onDragStart("scene", scene.occurrence.id)} onDragEnd={() => { drag.current = null; }} aria-rowindex={rows.indexOf(r) + 1} className="absolute inset-x-0 flex items-center gap-2 border-b border-border text-[13px]" style={{ top: r.top, height: r.height }}
                  onDragOver={(e) => drag.current?.kind === "scene" && e.preventDefault()} onDrop={onDropScene(scene)} data-testid="sb-scene" data-occurrence-id={scene.occurrence.id}>
                  {editable ? (
                    <span draggable onDragStart={onDragStart("scene", scene.occurrence.id)} className="cursor-grab text-text-tertiary" title={tk("sb2.drag-scene")} aria-label={tk("sb2.drag-scene")} role="button" tabIndex={-1}>
                      <GripVertical className="size-4" />
                    </span>
                  ) : null}
                  <span role="rowheader" className="font-medium text-text-primary" dir="auto">
                    {prefs.show.number && scene.number ? <span className="me-2 font-mono">{scene.number}</span> : null}
                    {prefs.show.name ? scene.heading || tk("sb2.untitled-scene") : null}
                  </span>
                  {prefs.show.status ? <StatusBadges statuses={scene.statuses} /> : null}
                  {editable ? (
                    <span className="ms-auto flex items-center gap-1">
                      <span className="text-[11px] text-status-discrepancy">{tk("sb2.scene-order-warning")}</span>
                      <Button size="icon" variant="ghost" disabled={si === 0} aria-label={tk("sb2.scene-earlier")} onClick={() => moveScene(scene.occurrence.id, si - 1)} data-testid="sb-scene-up"><ArrowUp /></Button>
                      <Button size="icon" variant="ghost" disabled={si === gallery.length - 1} aria-label={tk("sb2.scene-later")} onClick={() => moveScene(scene.occurrence.id, si + 1)} data-testid="sb-scene-down"><ArrowDown /></Button>
                      <Button size="sm" variant="ghost" onClick={() => addPanel(scene, scene.panels[scene.panels.length - 1]?.panel.id ?? null)} data-testid="sb-add-in-scene"><Plus /> {tk("sb2.add")}</Button>
                    </span>
                  ) : null}
                </div>
              );
            }
            if (r.kind === "empty")
              return <div key={key} className="absolute inset-x-0 py-3 text-[12px] text-text-tertiary" style={{ top: r.top, height: r.height }}>{tk("sb2.scene-empty")}</div>;
            return (
              <div key={key} role="row" aria-rowindex={rows.indexOf(r) + 1} className="absolute inset-x-0 flex gap-3 pt-2" style={{ top: r.top, height: r.height }}>
                {scene.panels.slice(r.from, r.to).map((p) => {
                  const path = thumbPath(p);
                  const url = path ? urls?.[path] : undefined;
                  const on = p.panel.id === selected;
                  const lines = prefs.show.dialogue || prefs.show.script ? panelLines(state, p.panel.variantId, p.blockIds) : null;
                  const noteCount = prefs.show.notes ? layersOf(state, p.panel.id).filter((l) => l.kind === "note").length : 0;
                  return (
                    <div
                      key={p.panel.id}
                      role="gridcell"
                      aria-selected={on}
                      tabIndex={on || (!selected && p.index === 0) ? 0 : -1}
                      data-panel-id={p.panel.id}
                      data-testid="sb-panel"
                      draggable={editable}
                      onDragStart={onDragStart("panel", p.panel.id)}
                      onDragOver={(e) => drag.current?.kind === "panel" && e.preventDefault()}
                      onDrop={onDropPanel(p, scene)}
                      onClick={() => selectPanel(p.panel.id)}
                      onDoubleClick={() => open(p)}
                      onFocus={() => selectPanel(p.panel.id)}
                      aria-label={p.panel.storyboard?.fields["description"] || tk("sb2.panel-label", { number: String(p.index + 1), scene: scene.number || scene.heading })}
                      className={
                        "flex shrink-0 flex-col overflow-hidden rounded border bg-surface-1 text-[12px] outline-none focus-visible:outline-2 focus-visible:outline-focus-ring " +
                        (on ? "border-accent-brand ring-2 ring-accent-selection " : "border-border ") +
                        (playingOccurrence && playingOccurrence !== p.panel.occurrenceId ? "opacity-40" : p.panel.hidden || p.panel.active === false ? "opacity-50" : "")
                      }
                      style={{ width: cardW, height: r.height - GAP }}
                    >
                      {!textView ? (
                        <div className="shrink-0 bg-surface-3" style={{ height: imageH }}>
                          <ScrubPreview state={state} projectId={projectId} productionId={productionId} panelId={p.panel.id} onSeek={(_frame, id) => setSelected(id)}/>
                        </div>
                      ) : null}
                      <div className="flex min-h-0 flex-col gap-0.5 px-2 py-1">
                        {prefs.show.name || prefs.show.number || prefs.show.timing ? (
                          <div className="flex items-center gap-2 truncate text-text-primary">
                            {prefs.show.number ? <span className="font-mono">{scene.number ? `${scene.number}.` : ""}{p.panel.storyboard?.number || p.index + 1}</span> : null}
                            {prefs.show.name ? <span className="truncate" dir="auto">{p.panel.name || scene.heading}</span> : null}
                            {prefs.show.timing ? <span className="ms-auto font-mono text-text-tertiary" data-testid="sb-timing">{fmtSeconds(p.frames, fps)}</span> : null}
                          </div>
                        ) : null}
                        {prefs.show.dialogue && lines ? (
                          <p className="line-clamp-2 text-text-secondary" dir="auto" data-testid="sb-dialogue">
                            {lines.dialogue.map((d) => (d.speaker ? `${d.speaker}: ${d.text}` : d.text)).join(" · ")}
                          </p>
                        ) : null}
                        {prefs.show.script && lines ? <p className="line-clamp-2 text-text-tertiary" dir="auto" data-testid="sb-script">{lines.script.join(" ")}</p> : null}
                        {p.panel.storyboard ? <div className="text-[11px] text-text-secondary" dir="auto">{[p.panel.storyboard.shot,p.panel.storyboard.angle,p.panel.storyboard.focalMm ? `${p.panel.storyboard.focalMm} mm` : "",p.panel.storyboard.movement,...Object.values(p.panel.storyboard.fields)].filter(Boolean).join(" · ")}</div> : null}
                        {prefs.show.status ? <StatusBadges statuses={p.statuses} /> : null}
                        {continuityFlags.has(p.panel.id)?<span className="text-status-warning" data-testid="sb9-panel-flag">{tk("sb9.continuity")}</span>:null}
                        {prefs.show.notes ? <span className="text-text-tertiary">{tk("sb2.notes-count", { count: String(noteCount) })}</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={seedOpen} onOpenChange={(o) => !o && setSeedDismissed(true)}>
        <DialogContent uiId="V-166">
          <DialogHeader>
            <DialogTitle>{tk("sb2.seed-title")}</DialogTitle>
            <DialogDescription>{tk("sb2.seed-body", { count: String(seedPlan.length) })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSeedDismissed(true)}>{tk("sb2.seed-later")}</Button>
            <Button
              data-testid="sb-seed-confirm"
              onClick={() => {
                const c = seedCommand(state, productionId, seedPlan);
                if (c) run(c, tk("sb2.undo.seed"));
                setSeedDismissed(true);
              }}
            >
              {tk("sb2.seed-confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {filmOpen ? (
        <StoryboardFilm
          projectId={projectId}
          state={state}
          productionId={productionId}
          open={filmOpen}
          onOpenChange={setFilmOpen}
          startOccurrenceId={sel?.panel.occurrenceId ?? null}
          onCurrentPanel={(panelId) => {
            if (panelId) {
              focusPending.current = true;
              setSelected(panelId);
            }
          }}
        />
      ) : null}
      {sel ? (
        <MovePanelDialog
          open={moveOpen}
          onOpenChange={setMoveOpen}
          state={state}
          gallery={gallery}
          panel={sel}
          initialTarget={moveTarget}
          onMove={(occurrenceId, blockIds) => {
            const occ = state.occurrences[occurrenceId];
            if (!occ) return;
            const e = run(
              { type: "MoveStoryboardPanelToScene", panelId: sel.panel.id, occurrenceId, variantId: occ.variantId, orderKey: panelKeyAfter(state, occurrenceId, storyboardPanelsOf(state, occurrenceId as never).at(-1)?.id ?? null), blocks: anchorRefs(blockIds) },
              tk("sb2.undo.move-to-scene"),
            );
            if (!e) setMoveOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function StatusBadges({ statuses }: { statuses: Readonly<Record<ProductionArea, ProductionStatusValue>> }) {
  return (
    <span className="flex gap-0.5" data-testid="sb-status">
      {PRODUCTION_AREAS.map((a) => (
        <span key={a} className={"rounded px-1 font-mono text-[11px] " + STATUS_CLASS[statuses[a]]} title={`${AREA_KEY[a]}: ${STATUS_KEY[statuses[a]]}`}
          aria-label={`${AREA_KEY[a]}: ${STATUS_KEY[statuses[a]]}`} data-area={a} data-status={statuses[a]}>
          {AREA_SHORT_KEY[a]}
        </span>
      ))}
    </span>
  );
}

function MovePanelDialog({
  open,
  onOpenChange,
  state,
  gallery,
  panel,
  initialTarget,
  onMove,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  state: ProjectState;
  gallery: readonly GalleryScene[];
  panel: GalleryPanel;
  initialTarget: string;
  onMove: (occurrenceId: string, blockIds: string[]) => void;
}) {
  const [target, setTarget] = useState(initialTarget);
  const [blocks, setBlocks] = useState<string[]>([]);
  useEffect(() => {
    if (open) {
      setTarget(initialTarget);
      setBlocks([]);
    }
  }, [open, initialTarget]);
  const occ = target ? state.occurrences[target] : undefined;
  const candidates = occ ? blocksOfVariant(state, occ.variantId).filter((b) => b.kind === "dialogue" || b.kind === "action") : [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent uiId="V-165">
        <DialogHeader>
          <DialogTitle>{tk("sb2.move-title")}</DialogTitle>
          <DialogDescription>{tk("sb2.move-body", { number: String(panel.index + 1) })}</DialogDescription>
        </DialogHeader>
        <SceneSelect
          ariaLabel={tk("sb2.move-target")}
          value={target}
          onChange={setTarget}
          emptyLabel={tk("sb2.move-choose")}
          testId="sb-move-target"
          options={gallery
            .filter((g) => g.occurrence.id !== panel.panel.occurrenceId)
            .map((g) => ({ value: g.occurrence.id, number: g.number || "–", label: g.heading, occurrence: g.occurrence }))}
        />
        {occ ? (
          <fieldset className="max-h-60 overflow-auto text-[13px]">
            <legend className="mb-1 text-text-secondary">{tk("sb2.move-anchor")}</legend>
            {candidates.length === 0 ? <p className="text-text-tertiary">{tk("sb2.move-no-blocks")}</p> : null}
            {candidates.map((b) => (
              <label key={b.id} className="flex items-start gap-2 py-0.5">
                <input type="checkbox" checked={blocks.includes(b.id)} onChange={(e) => setBlocks(e.target.checked ? [...blocks, b.id] : blocks.filter((x) => x !== b.id))} />
                <span dir="auto" className="line-clamp-2">{b.text}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{tk("sb2.cancel")}</Button>
          <Button disabled={!occ} onClick={() => occ && onMove(occ.id, blocks)} data-testid="sb-move-confirm">{tk("sb2.move-confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
