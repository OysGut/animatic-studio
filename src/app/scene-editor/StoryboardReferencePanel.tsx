/**
 * SB-5: referansepanel for storyboard i sceneeditoren. Låst for redigering: viser scenens paneler
 * med bilder, figurer, piler, lapper, reginotater, kamerainstruksjoner, dialog, timing, kommentarer
 * og status. Følger avspillingshodet etter storyboardtimingen (aktivt panel) og markerer panelet
 * scenen ble åpnet fra. «Rediger storyboard» åpner panelet i storyboardet; «Tilbake til scenen»
 * (i storyboardet) bruker den felles posisjonen fra SB-4. Kan forstørres (stor dialog) eller åpnes
 * i eget popup-vindu med huska størrelse og plassering.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Layers, Maximize2, PinIcon } from "lucide-react";
import {
  activePanelIdAtFrame,
  filmClips,
  panelTiming,
  productionStatusOf,
  scenePanelReferences,
  storyboardFilm,
  stillMediaPaths,
  type ProductionStatusValue,
  type ProjectState,
} from "@/core";
import { t as tk, tLocalized } from "@/core/i18n/keyed";
import { useFilmImages } from "@/app/assembly/film-images";
import { useFilmVideo } from "@/app/assembly/film-video";
import { FilmViewer } from "@/app/assembly/FilmViewer";
import { useImageUrls } from "@/app/library/asset-images";
import { useUiPref } from "@/app/account/ui-prefs";
import { sourceWindowId, useActiveSceneInfo } from "@/app/shell/current-scene";
import { popupFeatures, validPopupPref, type PopupPref } from "@/app/script-explorer/window-geometry";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResizableDialogContent } from "@/app/shared/ResizableDialogContent";
import { UiId } from "@/app/shared/UiId";
import { runGroup } from "@/app/storylab/canvas/run-group";
import type { Commands } from "@/app/project/use-commands";
import type { Playback } from "./use-playback";
import { SceneSetupDialog } from "./SceneSetupDialog";

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

/** Storyboardstatusen for scenen, vist i sceneeditorens topp ved siden av de andre fagområdene. */
export function StoryboardStatusBadge({ state, occurrenceId }: { state: ProjectState; occurrenceId: string }) {
  const status = productionStatusOf(state, "storyboard", { occurrenceId: occurrenceId as never })?.status ?? "not_started";
  return (
    <span
      data-testid="sb5-status-badge"
      data-status={status}
      title={`${tk("sb2.area.storyboard")}: ${STATUS_KEY[status]}`}
      aria-label={`${tk("sb2.area.storyboard")}: ${STATUS_KEY[status]}`}
      className={"rounded px-1.5 py-0.5 font-mono text-[11px] " + STATUS_CLASS[status]}
    >
      {tk("sb2.area-short.storyboard")}
    </span>
  );
}

interface RefProps {
  state: ProjectState;
  projectId: string;
  productionId: string;
  occurrenceId: string;
  /** Avspillingen i sceneeditoren; i popup-vinduet følges delt posisjon i stedet. */
  playback?: Playback;
  /** Panelet scenen ble åpnet fra (dobbeltklikk i galleriet). */
  selectedPanelId?: string | null;
  /** Vindus-ID-en til kilden (popup følger hovedvinduets posisjon). */
  sourceWindow?: string;
  /** Stor visning (egen dialog/popup): større forhåndsvisninger. */
  large?: boolean;
  cmds?: Commands;
  editable?: boolean;
}

export function StoryboardReferencePanel(props: RefProps) {
  const { state, projectId, productionId, occurrenceId } = props;
  const panels = useMemo(() => scenePanelReferences(state, occurrenceId), [state, occurrenceId]);
  const clips = useMemo(() => filmClips(state, productionId), [state, productionId]);
  const film = useMemo(() => storyboardFilm(state, clips, []), [state, clips]);
  const images = useFilmImages(film.state, film.clips);
  const stills = useMemo(() => stillMediaPaths(film.clips), [film.clips]);
  const urls = useImageUrls([]);
  const video = useFilmVideo(urls.data ?? null, false, stills);
  const sceneShots = useMemo(() => film.shots.filter((s) => s.occurrenceId === occurrenceId), [film.shots, occurrenceId]);

  // Aktivt panel etter avspillingshodet (N8: butikksabonnement, reagerer bare når panelet endres)
  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  const playback = props.playback;
  useEffect(() => {
    if (!playback) return;
    const update = () => {
      const id = activePanelIdAtFrame(state, clips, occurrenceId, playback.store.get());
      setActivePanelId((prev) => (prev === id ? prev : id));
    };
    update();
    return playback.store.subscribe(update);
  }, [playback, state, clips, occurrenceId]);
  // Popup-vinduet har ingen egen avspilling: det følger hovedvinduets delte posisjon (SB-4-bussen).
  const shared = useActiveSceneInfo(projectId, props.sourceWindow);
  const sharedPanelId = !playback && shared.scene?.occurrenceId === occurrenceId ? shared.scene.panelId ?? null : null;
  const effectiveActive = playback ? activePanelId : sharedPanelId;

  const highlighted = props.selectedPanelId ?? null;
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const id = playback?.playing ? effectiveActive : highlighted;
    if (!id) return;
    listRef.current?.querySelector(`[data-ref-panel="${id}"]`)?.scrollIntoView({ block: "nearest" });
  }, [effectiveActive, highlighted, playback?.playing]);

  const [largeOpen, setLargeOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [popupPref] = useUiPref<PopupPref | null>("sceneEditor.storyboardRef.popup", null, validPopupPref);

  const editTarget = highlighted ?? effectiveActive ?? panels[0]?.panel.id ?? null;
  const pin = () => {
    const url = `${window.location.origin}/prosjekt/${projectId}/storyboardref?scene=${occurrenceId}&kilde=${sourceWindowId()}`;
    const opened = window.open(url, `animatic-storyboardref-${projectId}-${sourceWindowId()}`, popupFeatures(popupPref, { w: 480, h: 720 }));
    if (opened) opened.focus();
    else setBlocked(url);
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="sb5-reference-panel">
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1">
        <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[11px] text-text-tertiary">{tk("sb5.read-only")}</span>
        {editTarget ? (
          <Button asChild size="sm" variant="ghost" data-testid="sb5-edit-storyboard">
            <Link to="/prosjekt/$projectId/storyboard" params={{ projectId }} search={{ scene: occurrenceId, panel: editTarget }}>
              <ExternalLink /> {tk("sb5.edit-storyboard")}
            </Link>
          </Button>
        ) : null}
        {props.cmds && props.editable && panels.length > 0 ? (
          <Button size="sm" variant="ghost" data-testid="sb5-create-setup" onClick={() => setSetupOpen(true)}>
            <Layers /> {tk("sb5.create-setup")}
          </Button>
        ) : null}
        <div className="ms-auto flex items-center gap-1">
          {!props.large ? (
            <Button size="icon" variant="ghost" aria-label={tk("sb5.open-large")} title={tk("sb5.open-large")} data-testid="sb5-open-large" onClick={() => setLargeOpen(true)}>
              <Maximize2 />
            </Button>
          ) : null}
          {!props.large && !props.sourceWindow ? (
            <Button size="icon" variant="ghost" aria-label={tk("sb5.open-popup")} title={tk("sb5.open-popup")} data-testid="sb5-open-popup" onClick={pin}>
              <PinIcon />
            </Button>
          ) : null}
        </div>
      </div>
      {blocked ? (
        <div role="alert" className="border-b border-border p-2 text-xs text-status-uncertain">
          <p>{tk("sb5.popup-blocked")}</p>
          <Button asChild variant="ghost" size="sm">
            <a href={blocked} target={`animatic-storyboardref-${projectId}`}>{tk("sb5.open-link")}</a>
          </Button>
        </div>
      ) : null}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        {panels.length === 0 ? (
          <p className="p-2 text-xs text-text-tertiary">{tk("sb5.no-panels")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {panels.map((info) => {
              const shot = sceneShots.find((s) => s.panel.id === info.panel.id);
              const isActive = info.panel.id === effectiveActive;
              const isSelected = info.panel.id === highlighted;
              const timing = panelTiming(state, clips, info.panel);
              return (
                <li
                  key={info.panel.id}
                  data-ref-panel={info.panel.id}
                  data-active={isActive || undefined}
                  data-selected={isSelected || undefined}
                  aria-current={isSelected ? "true" : undefined}
                  className={
                    "rounded-sm border p-2 " +
                    (isSelected
                      ? "border-accent-brand bg-accent-selection"
                      : isActive
                        ? "border-accent-brand"
                        : "border-border bg-surface-2")
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-text-tertiary">{info.number}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">{info.panel.name || tk("sb5.untitled-panel")}</span>
                    <span className={"rounded px-1 font-mono text-[11px] " + STATUS_CLASS[info.status as ProductionStatusValue]} data-testid="sb5-panel-status">
                      {STATUS_KEY[info.status as ProductionStatusValue] ?? info.status}
                    </span>
                  </div>
                  {shot ? (
                    <div className={"mt-1 w-full overflow-hidden rounded-sm " + (props.large ? "max-h-80" : "max-h-40")}>
                      <FilmViewer state={film.state} clips={film.clips} frame={shot.startFrame} tick={images.tick + video.tick} video={video.provider} onDrawn={video.settle} />
                    </div>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-text-secondary">
                    <span>{tk("sb5.figures", { count: String(info.figures) })}</span>
                    {info.notes > 0 ? <span>{tk("sb5.notes", { count: String(info.notes) })}</span> : null}
                    {info.arrows > 0 ? <span>{tk("sb5.arrows", { count: String(info.arrows) })}</span> : null}
                    {info.cameraMark ? <span>{tk("sb5.camera-mark")}</span> : null}
                    {info.dialogue > 0 ? <span>{tk("sb5.dialogue", { count: String(info.dialogue) })}</span> : null}
                    {info.comments > 0 ? <span>{tk("sb5.comments", { count: String(info.comments) })}</span> : null}
                    <span>{timing.source === "panel" ? tk("sb3.panel") : tk("sb4.inherited")}</span>
                  </div>
                  {info.shot || info.angle || info.focalMm || info.movement ? (
                    <p className="mt-0.5 text-[11px] text-text-tertiary">
                      {[info.shot, info.angle, info.focalMm ? `${info.focalMm} mm` : null, info.movement || null].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Dialog open={largeOpen} onOpenChange={setLargeOpen}>
        <ResizableDialogContent sizeKey="storyboard-reference" className="max-h-[86vh] max-w-[900px] overflow-y-auto border-border bg-surface-1">
          <UiId id="V-172" />
          <DialogHeader>
            <DialogTitle>{tk("sb5.reference-title")}</DialogTitle>
            <DialogDescription>{tk("sb5.read-only")}</DialogDescription>
          </DialogHeader>
          <StoryboardReferencePanel {...props} large />
        </ResizableDialogContent>
      </Dialog>
      {props.cmds ? (
        <SceneSetupDialog
          open={setupOpen}
          onOpenChange={setSetupOpen}
          state={state}
          projectId={projectId}
          productionId={productionId}
          occurrenceId={occurrenceId}
          initialPanelId={editTarget}
          cmds={props.cmds}
        />
      ) : null}
    </div>
  );
}
