/**
 * Sceneeditoren (M3 del 2, mandat kap. 11, DEC-0035): én 2D-scene per scene i manuset, bygget av lag
 * (bakgrunner, mellomgrunner, karakterer, objekter …) med bilder fra ressursbiblioteket eller fargeflater.
 * Kamera, tidslinje og avspilling kommer i neste leveranse (mandat kap. 12).
 */
import { ProductionPicker, useActiveProduction } from "@/app/project/use-production";
import {
  AlertTriangle,
  ChevronDown,
  Clapperboard,
  Copy,
  Layers,
  Mic,
  MonitorPlay,
  Plus,
  Redo2,
  Undo2,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BeyondEndNotice } from "./BeyondEndNotice";
import { ContentSyncFlag } from "@/app/assembly/ContentSyncFlag";
import { useContentSync } from "@/app/assembly/use-content-sync";
import {
  DEFAULT_COMPOSITION,
  L,
  compositionDuration,
  defaultLayerFields,
  compositionOfVariant,
  formatHeading,
  sceneNumberOf,
  framesToSeconds,
  layerVersion,
  layerVersions,
  layerFieldsOf,
  layersOf,
  newMotionPath,
  pathPointsFromDrawing,
  isSharedIn,
  newId,
  ownCopyCommands,
  orderedOccurrences,
  audioClipFieldsOf,
  audioVersion,
  filmClips,
  sceneWindowAudio,
  type Composition,
  type ProjectState,
  sceneContinuityVariant,
  previousSceneCamera,
  sourceAt,
} from "@/core";
import { canEdit, useMembers, useProjectState } from "@/app/project/use-project";
import { useCommands, type Commands } from "@/app/project/use-commands";
import { SaveIndicator } from "@/app/script/ScriptWorkspace";
import { useImageUrls } from "@/app/library/asset-images";
import { useAudioLoaded, useAudioPlayback } from "@/app/audio/use-audio-playback";
import { AudioClipEditor } from "@/app/audio/AudioClipEditor";
import { SceneAudioRows } from "./SceneAudioRows";
import { NearbyAudioPanel } from "./NearbyAudioPanel";
import { Button } from "@/components/ui/button";
import { AddLayerDialog } from "./AddLayerDialog";
import { CompositionInspector, LayerInspector } from "./LayerInspector";
import { LayersPanel } from "./LayersPanel";
import { Stage } from "./Stage";
import { SceneAssetsPanel } from "./SceneAssetsPanel";
import { ScenePicker } from "./ScenePicker";
import { PaneResizer, usePaneSize, useStoredFlag } from "@/app/shell/pane-size";
import { PopoutPreview, PreviewWindow } from "./PreviewWindow";
import { CameraPanel } from "./CameraPanel";
import { Timeline } from "./Timeline";
import { LayerImageDialog } from "./LayerImageDialog";
import { RecordAudioDialog } from "./RecordAudioDialog";
import { SceneToVideoDialog } from "./SceneToVideoDialog";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { NeighbourScenes } from "./NeighbourScenes";
import { PanelBar, SidePanels, StackedPanels } from "./ScenePanels";
import { SceneScriptPanel } from "./SceneScriptPanel";
import { MobileCameraButton } from "@/app/mobile/MobileImportDialog";
import { SceneMobileActions } from "@/app/mobile/mobile-actions";
import { SceneScriptDialog } from "./SceneScriptDialog";
import { useProfiles } from "@/app/project/use-project";
import { useScenePanels } from "./use-scene-panels";
import { LEFT_PANELS, type PanelId } from "./panel-layout";
import { useFilmLanguage } from "@/app/assembly/use-film-language";
import { ScriptChanges, useSceneDiscrepancies } from "@/app/assembly/ScriptChanges";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePlayback } from "./use-playback";
import { lastScene, onGotoScene, rememberScene } from "@/app/shell/current-scene";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ShortcutsButton, ShortcutsDialog } from "@/app/shortcuts/ShortcutsDialog";
import { isShortcutHelpKey } from "@/app/shortcuts/shortcut-list";
import { isTypingTarget } from "./Timeline";

export function SceneEditorWorkspace({
  projectId,
  userId,
  initialOccurrenceId,
}: {
  projectId: string;
  userId: string;
  initialOccurrenceId: string | null;
}) {
  const query = useProjectState(projectId);
  const members = useMembers(projectId);
  const role = members.data?.find((m) => m.user_id === userId)?.role;
  const editable = canEdit(role);
  const cmds = useCommands(projectId, userId, editable);
  if (query.isLoading)
    return (
      <p className="p-6 text-[13px] text-text-tertiary">
        {L("Henter scenene …", "Loading the scene …")}
      </p>
    );
  if (query.isError || !query.data)
    return (
      <div role="alert" className="p-6 text-[13px] text-status-danger">
        {L("Scenene kunne ikke hentes.", "The scene could not be loaded.")}
        {query.error ? (
          <p className="mt-2 font-mono text-xs text-text-tertiary">
            {L("Teknisk detalj:", "Technical detail:")} {query.error.message}
          </p>
        ) : null}
      </div>
    );
  return (
    <Editor
      projectId={projectId}
      state={query.data}
      editable={editable}
      roleKnown={members.isSuccess}
      cmds={cmds}
      initialOccurrenceId={initialOccurrenceId}
      userId={userId}
    />
  );
}

function Editor({
  projectId,
  state,
  editable: roleEditable,
  roleKnown,
  cmds,
  initialOccurrenceId,
  userId,
}: {
  userId: string;
  state: ProjectState;
  editable: boolean;
  roleKnown: boolean;
  cmds: Commands;
  initialOccurrenceId: string | null;
  projectId: string;
}) {
  const [copyError, setCopyError] = useState<string | null>(null);
  // Valgt produksjon (DEC-0057)
  const [productionId, setProductionId] = useActiveProduction(
    projectId,
    state,
    initialOccurrenceId,
  );
  const occurrences = useMemo(() => orderedOccurrences(state, productionId), [state, productionId]);
  // Uten ?scene= åpnes scenen som sist var valgt i manus, montering eller sceneeditor (REQ-0168)
  const [occurrenceId, setOccurrenceId] = useState<string | null>(() => {
    const wanted = initialOccurrenceId ?? lastScene(projectId);
    return (
      (wanted && occurrences.some((o) => o.id === wanted) ? wanted : occurrences[0]?.id) ?? null
    );
  });
  useEffect(() => rememberScene(projectId, occurrenceId), [projectId, occurrenceId]);
  // Scenen er borte (annen bruker, angre) eller ingen var valgt (tomt prosjekt før import): velg første
  useEffect(() => {
    if (!occurrences.length) return;
    if (!occurrenceId || !occurrences.some((o) => o.id === occurrenceId))
      setOccurrenceId(occurrences[0]!.id);
  }, [occurrences, occurrenceId]);
  const occurrence = occurrenceId ? state.occurrences[occurrenceId] : undefined;
  const variant = occurrence ? state.variants[occurrence.variantId] : undefined;
  const composition = variant ? compositionOfVariant(state, variant.id) : null;
  // Scenen deles med hovedfilmen i en avledet produksjon (DEC-0057): 2D-scenen kan ikke endres her før
  // produksjonen har fått sin egen kopi – ellers ville hovedfilmen endres (REQ-0365)
  const shared = !!occurrence && isSharedIn(state, productionId, occurrence.variantId);
  const editable = roleEditable && !shared;
  // Lyd hører til forekomsten, ikke 2D-scenen (KI-111): kan legges inn også i en delt scene i spinoffen
  const audioEditable = roleEditable;
  function makeOwnCopy() {
    if (!occurrence) return;
    const commands = ownCopyCommands(state, occurrence.id);
    if (!commands) return;
    const group = newId();
    for (const c of commands) {
      const err = cmds.run(c, L("Egen versjon av scenen", "Own copy of the scene"), group);
      if (err) {
        setCopyError(err);
        return;
      }
    }
    setCopyError(null);
  }
  const [selectedLayerId, setSelectedLayerIdState] = useState<string | null>(null);
  // Manuset i eget vindu (DEC-0089)
  const [scriptEdit, setScriptEdit] = useState<{ blockId: string | null } | null>(null);
  const me = useProfiles([userId]);
  const myName = me.data?.[userId]?.display_name || L("Medlem", "Member");
  const [selectedShotId, setSelectedShotIdState] = useState<string | null>(null);
  // Ett valg om gangen: et lag eller et kamerautsnitt
  // Stabile funksjoner, så panelene som er memoisert ikke tegnes om for hvert bilde under avspilling
  const setSelectedLayerId = useCallback((id: string | null) => {
    setSelectedLayerIdState(id);
    if (id) setSelectedShotIdState(null);
  }, []);
  const setSelectedShotId = useCallback((id: string | null) => {
    setSelectedShotIdState(id);
    if (id) setSelectedLayerIdState(null);
  }, []);
  /** «scene»: hele scenen med kamerarammer (redigering). «camera»: det filmen viser (avspilling). */
  const [view, setView] = useState<"scene" | "camera">("scene");
  /** Automatiske nøkkelbilder: endringer på et bilde blir nøkkelbilder (mandat 11.3). */
  const [autoKey, setAutoKey] = useState(false);
  /** Forhåndsvisning av ferdig utsnitt: åpnet manuelt, eller automatisk ved avspilling (huskes). */
  const [previewOpen, setPreviewOpen] = useStoredFlag("scene-editor-preview-open", false);
  const [autoPreview, setAutoPreview] = useStoredFlag("scene-editor-preview-auto", true);
  // Spill versjonen som brukes i filmen (AI-video/film) i forhåndsvisningen (DEC-0085)
  const [previewVersion, setPreviewVersion] = useStoredFlag("scene-editor-preview-version", true);
  /** Forhåndsvisningen i et eget nettleservindu (kan ligge på en annen skjerm, DEC-0041). */
  const [popout, setPopout] = useStoredFlag("scene-editor-preview-popout", false);
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  /** «Hurtigtaster»-oversikten (DEC-0078); «?» åpner den når man ikke skriver. */
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isShortcutHelpKey(e) || e.defaultPrevented || isTypingTarget(e.target)) return;
      if (e.target instanceof HTMLElement && e.target.closest("[role=dialog], [role=menu]")) return;
      e.preventDefault();
      setShortcutsOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // «Ressurs oppdatert» (REQ-0022): scener laget med en eldre ressursversjon
  const contentSync = useContentSync(state, projectId, productionId);
  const duration = useMemo(
    () => (composition ? compositionDuration(state, composition) : 1),
    [state, composition],
  );
  const playback = usePlayback(duration, state.project.fps);
  // Lyden i scenen spilles med (DEC-0044)
  // Filmens scener (for lyd som løper inn fra tidligere scener og lyd i scenene rundt, DEC-0045)
  // Språkversjonen som er valgt i monteringen (DEC-0059): bare den lyden spilles
  const [filmLang] = useFilmLanguage(projectId);
  const film = useMemo(() => filmClips(state, productionId), [state, productionId]);
  const sceneSound = useMemo(
    () =>
      occurrenceId
        ? sceneWindowAudio(state, film, occurrenceId, state.project.fps, filmLang.dialogue)
        : [],
    [state, film, occurrenceId, filmLang.dialogue],
  );
  const audioLoaded = useAudioLoaded();
  const [profileId, setProfileId] = useState<string | null>(null);
  const profileClip = profileId ? (state.audioClips[profileId] ?? null) : null;
  const profileScene = profileClip
    ? film.find((c) => c.occurrenceId === profileClip.occurrenceId)
    : undefined;
  const profileVersion = profileClip ? audioVersion(state, profileClip) : null;
  const soundPaths = useMemo(
    () => [...new Set(sceneSound.flatMap((it) => (it.version ? [it.version.mediaPath] : [])))],
    [sceneSound],
  );
  const soundUrls = useImageUrls(soundPaths);
  useAudioPlayback({
    items: sceneSound,
    urls: soundUrls.data ?? null,
    playing: playback.playing,
    time: framesToSeconds(playback.frame, state.project.fps),
  });
  // I kameravisningen viser lerretet allerede det ferdige utsnittet
  const showPreview = view === "scene" && (previewOpen || (autoPreview && playback.playing));
  // Versjonen scenen vises som i filmen, på avspillingshodet (DEC-0085)
  const shownClip = useMemo(
    () =>
      occurrence
        ? (filmClips(state, productionId).find((c) => c.occurrenceId === occurrence.id) ?? null)
        : null,
    [state, productionId, occurrence],
  );
  const shownSource =
    previewVersion && shownClip && shownClip.source === "film"
      ? sourceAt(
          shownClip,
          Math.min(playback.frame, shownClip.durationFrames - 1),
          state.project.fps,
        )
      : null;
  const shownTake = shownSource?.kind === "take" ? shownSource.take : null;
  const shownUrl = useImageUrls(
    shownTake?.mediaRef && shownTake.kind !== "still" ? [shownTake.mediaRef] : [],
  );
  const previewFilm =
    shownSource?.kind === "take" && shownTake?.mediaRef && shownUrl.data?.[shownTake.mediaRef]
      ? {
          url: shownUrl.data[shownTake.mediaRef]!,
          seconds: shownSource.seconds,
          playing: playback.playing,
        }
      : null;
  const closePreview = useCallback(() => {
    setPreviewOpen(false);
    if (playback.playing) setAutoPreview(false);
  }, [playback.playing, setPreviewOpen, setAutoPreview]);
  const selectedShot =
    composition && selectedShotId
      ? (composition.camera.shots.find((x) => x.id === selectedShotId) ?? null)
      : null;
  const [addOpen, setAddOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [aiVideoOpen, setAiVideoOpen] = useState(false);
  /** Avvik ved manusendring for scenen (DEC-0054). */
  const found = useSceneDiscrepancies(state, occurrenceId);
  const [changesOpen, setChangesOpen] = useState(false);
  /** Naboscenene som film før og etter scenen (DEC-0052, REQ-0578). */
  const [neighbours, setNeighbours] = useStoredFlag("scene-editor-neighbours", false);
  /** Laget som får nytt bilde (dobbeltklikk, DEC-0044). */
  const [imageLayerId, setImageLayerId] = useState<string | null>(null);
  /** Åpne bildet stort med «Oppskaler» fremme (advarselen om forstørrelse, DEC-0080). */
  const [upscaleOpen, setUpscaleOpen] = useState(false);
  const openLayerImage = useCallback(
    (id: string) => {
      setSelectedLayerId(id);
      setImageLayerId(id);
    },
    [setSelectedLayerId],
  );
  /** Laget som får tegnet en bevegelsesbane i scenen (DEC-0052). */
  const [drawPathFor, setDrawPathFor] = useState<string | null>(null);
  const [leftWidth, setLeftWidth] = usePaneSize("scene-editor-left", 220, 180, 480);
  const [rightWidth, setRightWidth] = usePaneSize("scene-editor-right", 300, 240, 560);
  /** Panelene stablet eller side om side, i brukerens rekkefølge (Mars 15.10.2026). */
  const panelsUi = useScenePanels();
  const [error, setError] = useState<string | null>(null);

  // Valgt lag som er slettet eller tilhører en annen scene, velges bort
  const selectedLayer =
    selectedLayerId && composition
      ? (() => {
          const l = state.layers[selectedLayerId];
          return l && !l.removed && l.compositionId === composition.id ? l : null;
        })()
      : null;
  useEffect(() => {
    if (selectedLayerId && !selectedLayer) setSelectedLayerIdState(null);
  }, [selectedLayerId, selectedLayer]);
  useEffect(() => {
    if (selectedShotId && !selectedShot) setSelectedShotIdState(null);
  }, [selectedShotId, selectedShot]);
  const drawingPath = !!selectedLayer && drawPathFor === selectedLayer.id && view === "scene";
  useEffect(() => {
    if (drawPathFor && (!selectedLayer || selectedLayer.id !== drawPathFor)) setDrawPathFor(null);
  }, [drawPathFor, selectedLayer]);

  /** En tegnet bane blir lagets bevegelsesbane (tidene beholdes når banen tegnes på nytt). */
  function pathDrawn(points: { x: number; y: number }[]) {
    setDrawPathFor(null);
    if (!selectedLayer || !composition) return;
    const pts = pathPointsFromDrawing(points);
    if (!pts) return;
    const fps = state.project.fps.num / state.project.fps.den;
    const path = selectedLayer.path
      ? { ...selectedLayer.path, points: pts }
      : newMotionPath(pts, playback.frame, duration, fps);
    setError(
      cmds.run(
        {
          type: "UpdateLayers",
          layers: [
            { layerId: selectedLayer.id, fields: { ...layerFieldsOf(selectedLayer), path } },
          ],
        },
        selectedLayer.path
          ? L("Tegn banen på nytt", "Redraw the path")
          : L("Ny bevegelsesbane", "New motion path"),
      ),
    );
  }

  // Signerte lenker for bildene i scenen
  const paths = useMemo(() => {
    if (!composition) return [];
    const out: string[] = [];
    for (const l of layersOf(state, composition.id)) {
      for (const v of layerVersions(state, l)) out.push(v.mediaPath);
    }
    return out;
  }, [state, composition]);
  const urls = useImageUrls(paths);

  const hasComposition = useMemo(() => {
    const set = new Set<string>();
    for (const c of Object.values(state.compositions)) if (!c.removed) set.add(c.variantId);
    return set;
  }, [state.compositions]);

  function pickScene(id: string) {
    setOccurrenceId(id);
    setSelectedLayerId(null);
    setSelectedShotId(null);
    playback.pause();
    playback.setFrame(0);
  }
  // Oppgavene i toppstripen (DEC-0088): gå til neste/forrige scene som skal oppdateres
  const pickRef = useRef(pickScene);
  pickRef.current = pickScene;
  useEffect(
    () =>
      onGotoScene(projectId, (id) => {
        if (occurrences.some((o) => o.id === id)) pickRef.current(id);
      }),
    [projectId, occurrences],
  );

  /** Ressurs fra «I denne scenen» med «+»: nytt lag øverst (bakgrunn nederst), midt i bildet. */
  const addAsset = useCallback(
    (assetId: string): string | null => {
      if (!composition) return null;
      // Nyeste tilstand: et element som nettopp er laget («Legg til element», DEC-0088), er med
      const now = cmds.current() ?? state;
      // Utseendet kontinuiteten gir i denne scenen (DEC-0055)
      const f = defaultLayerFields(now, composition, {
        assetId,
        assetVariantId: sceneContinuityVariant(now, assetId, composition.variantId),
      });
      // Bakgrunner (lokasjon, miljø) dekker bildet og legges nederst; andre lag forskyves litt per lag
      const n = f.kind === "background" ? 0 : layersOf(now, composition.id).length % 8;
      const layerId = newId<"composition_layer">();
      const err = cmds.run(
        {
          type: "AddLayers",
          layers: [
            {
              layerId,
              compositionId: composition.id,
              fields: {
                ...f,
                transform: { ...f.transform, x: f.transform.x + n * 30, y: f.transform.y + n * 30 },
              },
            },
          ],
        },
        L(`Nytt lag «${f.name}»`, `New layer “${f.name}”`),
      );
      setError(err);
      if (!err) setSelectedLayerId(layerId);
      return err ? null : layerId;
    },
    [state, composition, cmds, setSelectedLayerId],
  );
  /** Lagene hver ressurs har i 2D-scenen («I denne scenen» viser hvilke som alt er lagt inn, DEC-0079). */
  const layersByAsset = useMemo(() => {
    const m = new Map<string, string[]>();
    if (!composition) return m;
    for (const l of layersOf(state, composition.id)) {
      if (!l.assetId || l.removed) continue;
      m.set(l.assetId, [...(m.get(l.assetId) ?? []), l.id]);
    }
    return m;
  }, [state, composition]);

  function create() {
    if (!variant || !occurrence) return;
    // Delt med hovedfilmen i en avledet produksjon: egen versjon av scenen først (DEC-0057)
    let variantId: string = variant.id;
    let group: string | undefined;
    if (shared) {
      group = newId();
      for (const c of ownCopyCommands(state, occurrence.id) ?? []) {
        const e = cmds.run(c, L("Egen versjon av scenen", "Own copy of the scene"), group);
        if (e) {
          setError(e);
          return;
        }
        if (c.type === "ForkVariant") variantId = c.newVariantId;
      }
    }
    setError(
      cmds.run(
        {
          type: "CreateComposition",
          compositionId: newId<"composition">(),
          variantId: variantId as never,
          // Formatet følger prosjektet (DEC-0039)
          fields: {
            ...DEFAULT_COMPOSITION,
            width: state.project.frameWidth,
            height: state.project.frameHeight,
          },
        },
        L("Ny 2D-scene", "New 2D scene"),
        group,
      ),
    );
  }

  const side = panelsUi.mode === "side";
  const filmClip = occurrence ? (film.find((c) => c.occurrenceId === occurrence.id) ?? null) : null;
  /** Innholdet i hvert panel (null = vises ikke nå). Plasseringen bestemmes av brukerens valg over. */
  const panelContent: Record<PanelId, ReactNode | null> = {
    // Manuset for scenen (DEC-0089); redigeres i eget vindu
    script: occurrence ? (
      <SceneScriptPanel
        state={state}
        occurrenceId={occurrence.id}
        clip={filmClip}
        frame={playback.frame}
        playing={playback.playing}
        editable={roleEditable}
        onOpenEditor={(blockId) => setScriptEdit({ blockId })}
      />
    ) : null,
    assets: occurrence ? (
      <SceneAssetsPanel
        state={state}
        projectId={projectId}
        productionId={productionId}
        occurrenceId={occurrence.id}
        editable={editable}
        onAdd={composition ? addAsset : null}
        cmds={cmds}
        layersByAsset={layersByAsset}
        onOpenImage={(assetId) => {
          // Samme bildevalg som dobbeltklikk på laget i scenen; ikke i scenen ennå: legg inn først
          const id = layersByAsset.get(assetId)?.[0] ?? (editable ? addAsset(assetId) : null);
          if (id) openLayerImage(id);
        }}
      />
    ) : null,
    nearbyAudio:
      occurrence && film.length > 1 && film.some((c) => c.occurrenceId === occurrence.id) ? (
        <NearbyAudioPanel
          state={state}
          clips={film}
          occurrenceId={occurrence.id}
          editable={audioEditable}
          run={cmds.run}
        />
      ) : null,
    layers: composition ? (
      <LayersPanel
        hideHeading
        state={state}
        composition={composition}
        editable={editable}
        selectedLayerId={selectedLayer?.id ?? null}
        onSelect={setSelectedLayerId}
        run={cmds.run}
        onOpenImage={openLayerImage}
        frame={playback.playing ? 0 : playback.frame}
      />
    ) : null,
    properties: composition ? (
      selectedShot ? (
        <CameraPanel
          key={selectedShot.id}
          previousFrame={
            occurrenceId
              ? (previousSceneCamera(state, productionId, occurrenceId, composition)?.frame ?? null)
              : null
          }
          composition={composition}
          shot={selectedShot}
          durationFrames={duration}
          fps={state.project.fps}
          editable={editable}
          run={cmds.run}
          onRemoved={() => setSelectedShotId(null)}
        />
      ) : selectedLayer ? (
        <LayerInspector
          key={selectedLayer.id}
          state={state}
          composition={composition}
          layer={selectedLayer}
          editable={editable}
          run={cmds.run}
          frame={playback.frame}
          autoKey={autoKey}
          onOpenImage={() => openLayerImage(selectedLayer.id)}
          onUpscale={() => {
            setUpscaleOpen(true);
            openLayerImage(selectedLayer.id);
          }}
          onSeek={playback.setFrame}
          durationFrames={duration}
          drawingPath={drawingPath}
          onDrawingPathChange={(on) => {
            if (on) setView("scene");
            setDrawPathFor(on ? selectedLayer.id : null);
          }}
        />
      ) : (
        <CompositionInspector
          key={composition.id}
          composition={composition}
          editable={editable}
          run={cmds.run}
        />
      )
    ) : null,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-surface-2 px-3">
        <span className="text-[13px] font-medium text-text-primary">
          {L("Sceneeditor", "Scene editor")}
        </span>
        <ProductionPicker state={state} value={productionId} onChange={setProductionId} />
        <div className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ScenePicker
          state={state}
          occurrences={occurrences}
          occurrenceId={occurrenceId}
          hasComposition={hasComposition}
          onPick={pickScene}
          synced={contentSync}
        />
        <ContentSyncFlag
          state={state}
          projectId={projectId}
          productionId={productionId}
          sync={occurrenceId ? contentSync.get(occurrenceId) : undefined}
          editable={editable}
          cmds={cmds}
          compact
        />
        <div className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Button
          size="sm"
          variant="ghost"
          onClick={cmds.undo}
          disabled={!cmds.canUndo}
          title={
            cmds.undoLabel
              ? L(`Angre: ${cmds.undoLabel} (⌘Z)`, `Undo: ${cmds.undoLabel} (⌘Z)`)
              : L("Angre (⌘Z)", "Undo (⌘Z)")
          }
          aria-label={
            cmds.undoLabel
              ? L(`Angre: ${cmds.undoLabel}`, `Undo: ${cmds.undoLabel}`)
              : L("Angre", "Undo")
          }
        >
          <Undo2 />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={cmds.redo}
          disabled={!cmds.canRedo}
          title={
            cmds.redoLabel
              ? L(`Gjør om: ${cmds.redoLabel} (⇧⌘Z)`, `Redo: ${cmds.redoLabel} (⇧⌘Z)`)
              : L("Gjør om (⇧⌘Z)", "Redo (⇧⌘Z)")
          }
          aria-label={
            cmds.redoLabel
              ? L(`Gjør om: ${cmds.redoLabel}`, `Redo: ${cmds.redoLabel}`)
              : L("Gjør om", "Redo")
          }
        >
          <Redo2 />
        </Button>
        {editable && composition ? (
          <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
            <Plus />
            {L("Legg til lag", "Add layer")}
          </Button>
        ) : null}
        {audioEditable && occurrence ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              playback.pause();
              setRecordOpen(true);
            }}
            title={L(
              "Ta opp en replikk eller lyd fra avspillingshodet",
              "Record a line or sound from the playhead",
            )}
          >
            <Mic aria-hidden />
            {/* Under 1400 px bare ikon (med verktøytips), så scenevelgeren får plass */}
            <span className="sr-only min-[1400px]:not-sr-only">{L("Opptak", "Recording")}</span>
          </Button>
        ) : null}
        {/* Bilder og video fra mobilen til denne scenen (DEC-0090): én QR-kode per scene */}
        {roleEditable && occurrence && variant ? (
          <MobileCameraButton
            projectId={projectId}
            context={{ type: "occurrence", occurrenceId: occurrence.id }}
            label={L(
              `Scene ${sceneNumberOf(state, occurrence) ?? ""} · ${formatHeading(variant.heading)}`,
              `Scene ${sceneNumberOf(state, occurrence) ?? ""} · ${formatHeading(variant.heading)}`,
            )}
            actions={(row) => (
              <SceneMobileActions
                state={state}
                cmds={cmds}
                occurrenceId={occurrence.id}
                row={row}
              />
            )}
          />
        ) : null}
        {occurrence ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              playback.pause();
              setAiVideoOpen(true);
            }}
            title={L(
              "Send 2D-scenen til AI og få den tegnet om til ferdig film. Bare bildet erstattes; lyden beholdes. Du velger selv hva som viser scenen.",
              "Send the 2D scene to AI and have it redrawn as finished film. Only the picture is replaced; the sound is kept. You choose what shows the scene.",
            )}
            data-testid="scene-ai-video"
          >
            <AiGlyph aria-hidden />
            {L("AI-video …", "AI video …")}
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {composition ? (
            <>
              <Button
                size="sm"
                variant={neighbours ? "secondary" : "ghost"}
                onClick={() => setNeighbours(!neighbours)}
                aria-pressed={neighbours}
                title={L(
                  "Spill scenen før og etter som ferdig film, i sammenheng med denne",
                  "Play the scene before and after as a finished film, in context with this one",
                )}
              >
                <Clapperboard aria-hidden />
                <span className="sr-only min-[1400px]:not-sr-only">
                  {L("Naboscener", "Neighbouring scenes")}
                </span>
              </Button>
              {/* Forhåndsvisning med valg i en liten meny, så verktøylinjen ikke bryter tekst (DEC-0076 funn 6) */}
              <div className="flex shrink-0 items-center">
                <Button
                  size="sm"
                  variant={previewOpen ? "secondary" : "ghost"}
                  onClick={() => setPreviewOpen(!previewOpen)}
                  aria-pressed={previewOpen}
                  title={L(
                    "Vis det ferdige utsnittet (kamera og bevegelser) i et eget vindu",
                    "Show the finished shot (camera and movement) in a separate window",
                  )}
                  className="rounded-r-none"
                >
                  <MonitorPlay aria-hidden />
                  <span className="sr-only min-[1400px]:not-sr-only">
                    {L("Forhåndsvisning", "Preview")}
                  </span>
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      size="sm"
                      variant={previewOpen ? "secondary" : "ghost"}
                      className="w-6 rounded-l-none px-0"
                      aria-label={L("Valg for forhåndsvisning", "Preview options")}
                      title={
                        autoPreview
                          ? L(
                              "Valg for forhåndsvisning: vises automatisk ved avspilling",
                              "Preview options: shown automatically during playback",
                            )
                          : L("Valg for forhåndsvisning", "Preview options")
                      }
                    >
                      <ChevronDown className="size-3" aria-hidden />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="flex w-64 flex-col gap-1 p-3">
                    <label
                      className="flex items-start gap-2 text-xs text-text-secondary"
                      title={L(
                        "Det ferdige utsnittet vises mens scenen spilles, og lukkes når avspillingen stopper",
                        "The finished shot is shown while the scene plays, and closes when playback stops",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={autoPreview}
                        onChange={(e) => setAutoPreview(e.target.checked)}
                        className="mt-0.5 size-3.5 accent-[var(--accent-brand)]"
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-text-primary">
                          {L("Automatisk visning", "Automatic preview")}
                        </span>
                        <span className="text-[11px] text-text-tertiary">
                          {L(
                            "Vis det ferdige utsnittet mens scenen spilles av.",
                            "Show the finished shot while the scene plays.",
                          )}
                        </span>
                      </span>
                    </label>
                    <label className="mt-1 flex items-start gap-2 text-xs text-text-secondary">
                      <input
                        type="checkbox"
                        checked={previewVersion}
                        onChange={(e) => setPreviewVersion(e.target.checked)}
                        className="mt-0.5 size-3.5 accent-[var(--accent-brand)]"
                        data-testid="preview-version"
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-text-primary">
                          {L(
                            "Spill versjonen som brukes i filmen",
                            "Play the version used in the film",
                          )}
                        </span>
                        <span className="text-[11px] text-text-tertiary">
                          {L(
                            "Vises scenen som AI-video eller film, spilles den i forhåndsvisningen. Av: alltid 2D-scenen. Velg versjon under «AI-video …».",
                            "If the scene is shown as AI video or film, it plays in the preview. Off: always the 2D scene. Choose the version under “AI video …”.",
                          )}
                        </span>
                      </span>
                    </label>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="h-5 w-px bg-border" aria-hidden />
            </>
          ) : null}
          <ShortcutsButton onClick={() => setShortcutsOpen(true)} />
          <div className="h-5 w-px shrink-0 bg-border" aria-hidden />
          <SaveIndicator cmds={cmds} />
          {roleKnown && !roleEditable ? (
            <span className="text-xs text-text-tertiary">
              {L("Bare lesetilgang", "Read-only access")}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Ressursene i scenen (side om side står de sammen med de andre panelene til høyre) */}
        {side ? null : (
          <div
            style={{ width: leftWidth }}
            className="relative flex shrink-0 flex-col border-r border-border bg-surface-1"
          >
            <PaneResizer
              edge="right"
              size={leftWidth}
              onSize={setLeftWidth}
              min={180}
              max={480}
              label={L("Bredde på «I denne scenen»", "Width of “In this scene”")}
            />
            {occurrences.length === 0 ? (
              <p className="px-3 py-3 text-xs text-text-tertiary">
                {L("Ingen scener. Importer manuset først.", "No scenes. Import the script first.")}
              </p>
            ) : null}
            {occurrence ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <StackedPanels
                  ids={panelsUi.order.filter((id) => LEFT_PANELS.has(id))}
                  order={panelsUi.order}
                  panels={panelContent}
                  collapsed={panelsUi.collapsed}
                  onToggle={panelsUi.toggle}
                  onOrder={panelsUi.setOrder}
                />
              </div>
            ) : null}
          </div>
        )}

        {/* Arbeidsflaten */}
        <main
          className={
            "flex flex-1 flex-col bg-surface-0 " +
            // Side om side: lerretet beholder en brukbar bredde; panelområdet ruller sidelengs
            (side ? "min-w-[480px]" : "min-w-0")
          }
        >
          {!occurrence || !variant ? (
            <p className="m-auto text-[13px] text-text-tertiary">
              {occurrences.length === 0
                ? L("Ingen scener i prosjektet ennå.", "No scenes in the project yet.")
                : L("Velg en scene.", "Choose a scene.")}
            </p>
          ) : !composition ? (
            <EmptyScene
              title={formatHeading(variant.heading)}
              editable={roleEditable}
              onCreate={create}
              format={L(
                `${state.project.frameWidth} × ${state.project.frameHeight} px · ${formatFps(state.project.fps)} bilder/s`,
                `${state.project.frameWidth} × ${state.project.frameHeight} px · ${formatFps(state.project.fps)} fps`,
              )}
              error={error}
            />
          ) : (
            <>
              {shared && roleEditable ? (
                <div
                  role="status"
                  className="flex min-h-8 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface-2 px-3 py-1 text-xs text-text-primary"
                >
                  <Copy className="size-3.5 text-text-tertiary" aria-hidden />
                  {L(
                    "2D-scenen deles med hovedfilmen. Lag en egen versjon for å endre den her – hovedfilmen endres ikke.",
                    "The 2D scene is shared with the main film. Make an own copy to change it here – the main film is not changed.",
                  )}
                  <Button size="sm" variant="secondary" className="h-6" onClick={makeOwnCopy}>
                    {L("Lag egen versjon for «", "Make an own copy for “")}
                    {state.productions[productionId]?.name}
                    {L("»", "”")}
                  </Button>
                  {copyError ? <span className="text-status-danger">{copyError}</span> : null}
                </div>
              ) : null}
              {found.length > 0 ? (
                <div
                  role="status"
                  className="flex h-8 shrink-0 items-center gap-2 border-b border-status-danger/40 bg-status-danger-bg px-3 text-xs text-text-primary"
                >
                  <AlertTriangle className="size-3.5 text-status-danger" aria-hidden />
                  {L(
                    "Manuset er endret etter at materialet ble laget",
                    "The script has changed since the material was made",
                  )}{" "}
                  (
                  {(() => {
                    const n = new Set(found.flatMap((d) => d.changes.map((c) => c.blockId))).size;
                    return n === 1
                      ? L("1 endring", "1 change")
                      : L(`${n} endringer`, `${n} changes`);
                  })()}
                  ).
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6"
                    onClick={() => setChangesOpen(true)}
                  >
                    {L("Vis og velg …", "View and choose …")}
                  </Button>
                </div>
              ) : null}
              <BeyondEndNotice
                state={state}
                composition={composition}
                durationFrames={duration}
                editable={editable}
                run={cmds.run}
                onSelectLayer={setSelectedLayerId}
                onSelectShot={setSelectedShotId}
                onSeek={playback.setFrame}
              />
              <div className="relative flex min-h-0 flex-1 flex-col">
                <Stage
                  state={state}
                  composition={composition}
                  editable={editable}
                  selectedLayerId={selectedLayer?.id ?? null}
                  onSelect={setSelectedLayerId}
                  selectedShotId={selectedShot?.id ?? null}
                  onSelectShot={setSelectedShotId}
                  run={cmds.run}
                  imageUrls={urls.data ?? {}}
                  frame={playback.frame}
                  playing={playback.playing}
                  view={view}
                  onViewChange={setView}
                  autoKey={autoKey}
                  onTogglePlay={playback.toggle}
                  onOpenLayerImage={openLayerImage}
                  drawPath={drawingPath}
                  onPathDrawn={pathDrawn}
                  onDrawCancel={() => setDrawPathFor(null)}
                />
                {showPreview && popout ? (
                  <PopoutPreview
                    state={state}
                    composition={composition}
                    frame={playback.frame}
                    imageUrls={urls.data ?? {}}
                    film={previewFilm}
                    onClose={closePreview}
                    onDock={() => setPopout(false)}
                    onBlocked={() => {
                      setPopout(false);
                      setPreviewNote(
                        L(
                          "Nettleseren stoppet det egne vinduet",
                          "The browser blocked its own window",
                        ),
                      );
                    }}
                    onTogglePlay={playback.toggle}
                  />
                ) : showPreview ? (
                  <PreviewWindow
                    state={state}
                    composition={composition}
                    frame={playback.frame}
                    imageUrls={urls.data ?? {}}
                    film={previewFilm}
                    onClose={closePreview}
                    onPopOut={() => {
                      setPreviewNote(null);
                      setPopout(true);
                    }}
                    note={previewNote}
                  />
                ) : null}
                {neighbours && occurrence ? (
                  <NeighbourScenes
                    state={state}
                    language={filmLang.dialogue}
                    film={film}
                    occurrenceId={occurrence.id}
                    sceneFrame={playback.frame}
                    scenePlaying={playback.playing}
                    onSceneFrame={playback.setFrame}
                    onPauseScene={playback.pause}
                  />
                ) : null}
              </div>
              <Timeline
                state={state}
                composition={composition}
                durationFrames={duration}
                playback={playback}
                editable={editable}
                selectedLayerId={selectedLayer?.id ?? null}
                onSelectLayer={setSelectedLayerId}
                selectedShotId={selectedShot?.id ?? null}
                onSelectShot={setSelectedShotId}
                autoKey={autoKey}
                onAutoKeyChange={setAutoKey}
                run={cmds.run}
                audioRows={(g) => (
                  <SceneAudioRows
                    state={state}
                    occurrenceId={occurrence.id}
                    items={sceneSound}
                    g={g}
                    loaded={audioLoaded}
                    onFrame={playback.setFrame}
                    onOpen={setProfileId}
                    onChange={
                      audioEditable
                        ? (clipId, label, patch) => {
                            const clip = state.audioClips[clipId];
                            if (!clip) return;
                            setError(
                              cmds.run(
                                {
                                  type: "UpdateAudioClips",
                                  clips: [
                                    {
                                      clipId: clip.id,
                                      fields: { ...audioClipFieldsOf(clip), ...patch },
                                    },
                                  ],
                                },
                                label,
                              ),
                            );
                          }
                        : null
                    }
                  />
                )}
              />
            </>
          )}
        </main>

        {/* Lag og egenskaper (side om side: alle panelene i kolonner, i brukerens rekkefølge) */}
        {side && occurrence ? (
          <SidePanels
            order={panelsUi.order}
            panels={panelContent}
            onOrder={panelsUi.setOrder}
            onMode={panelsUi.setMode}
            collapsed={panelsUi.collapsed}
            onToggle={panelsUi.toggle}
          />
        ) : composition ? (
          <aside
            aria-label={L("Lag og egenskaper", "Layers and properties")}
            style={{ width: rightWidth }}
            className="relative flex shrink-0 flex-col overflow-y-auto border-l border-border bg-surface-1"
          >
            <PaneResizer
              edge="left"
              size={rightWidth}
              onSize={setRightWidth}
              min={240}
              max={560}
              label={L("Bredde på lag og egenskaper", "Width of layers and properties")}
            />
            <PanelBar mode="stacked" onChange={panelsUi.setMode} />
            <StackedPanels
              ids={panelsUi.order.filter((id) => !LEFT_PANELS.has(id))}
              order={panelsUi.order}
              panels={panelContent}
              collapsed={panelsUi.collapsed}
              onToggle={panelsUi.toggle}
              onOrder={panelsUi.setOrder}
            />
          </aside>
        ) : null}
      </div>

      {occurrence ? (
        <SceneScriptDialog
          open={scriptEdit !== null}
          onOpenChange={(o) => {
            if (!o) setScriptEdit(null);
          }}
          state={state}
          projectId={projectId}
          productionId={productionId}
          occurrenceId={occurrence.id}
          initialBlockId={scriptEdit?.blockId ?? null}
          editable={roleEditable}
          cmds={cmds}
          authorName={myName}
        />
      ) : null}

      <AudioClipEditor
        open={profileClip !== null}
        onOpenChange={(o) => {
          if (!o) setProfileId(null);
        }}
        state={state}
        clip={profileClip}
        sceneSeconds={
          profileScene ? framesToSeconds(profileScene.durationFrames, state.project.fps) : null
        }
        editable={audioEditable}
        url={profileVersion ? (soundUrls.data?.[profileVersion.mediaPath] ?? null) : null}
        onChange={(label, patch) => {
          if (!profileClip) return;
          setError(
            cmds.run(
              {
                type: "UpdateAudioClips",
                clips: [
                  {
                    clipId: profileClip.id,
                    fields: { ...audioClipFieldsOf(profileClip), ...patch },
                  },
                ],
              },
              label,
            ),
          );
        }}
      />
      <Dialog open={changesOpen && found.length > 0} onOpenChange={setChangesOpen}>
        <DialogContent className="max-h-[86vh] max-w-[620px] overflow-y-auto border-border bg-surface-2">
          <DialogHeader>
            <DialogTitle>{L("Manusendringer i scenen", "Script changes in the scene")}</DialogTitle>
            <DialogDescription>
              {L(
                "Oppdater 2D-scenen her i editoren og godkjenn etterpå, godkjenn slik den er, eller angre manusendringen.",
                "Update the 2D scene here in the editor and approve afterwards, approve it as it is, or undo the script change.",
              )}
            </DialogDescription>
          </DialogHeader>
          {occurrenceId ? (
            <ScriptChanges
              state={state}
              projectId={projectId}
              occurrenceId={occurrenceId}
              found={found}
              editable={editable}
              run={cmds.run}
              showEditorLink={false}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <LayerImageDialog
        open={imageLayerId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setImageLayerId(null);
            setUpscaleOpen(false);
          }
        }}
        state={state}
        projectId={projectId}
        layer={imageLayerId ? (state.layers[imageLayerId] ?? null) : null}
        editable={editable}
        cmds={cmds}
        openUpscale={upscaleOpen}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} current="sceneeditor" />
      {occurrence && aiVideoOpen ? (
        <SceneToVideoDialog
          open
          onOpenChange={setAiVideoOpen}
          state={state}
          projectId={projectId}
          productionId={productionId}
          occurrenceId={occurrence.id}
          cmds={cmds}
          editable={roleEditable}
        />
      ) : null}
      {occurrence && audioEditable ? (
        <RecordAudioDialog
          open={recordOpen}
          onOpenChange={setRecordOpen}
          state={state}
          projectId={projectId}
          cmds={cmds}
          occurrenceId={occurrence.id}
          variantId={occurrence.variantId}
          frame={playback.frame}
          onPlay={playback.play}
          onStop={playback.pause}
          onAdded={(id) => setProfileId(id)}
        />
      ) : null}
      {composition && editable ? (
        <AddLayerDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          state={state}
          composition={composition}
          run={cmds.run}
          onAdded={setSelectedLayerId}
        />
      ) : null}
    </div>
  );
}

function EmptyScene({
  title,
  editable,
  onCreate,
  error,
  format,
}: {
  title: string;
  editable: boolean;
  onCreate: () => void;
  error: string | null;
  format: string;
}) {
  return (
    <div className="m-auto flex max-w-[420px] flex-col items-center gap-3 text-center">
      <Layers className="size-8 text-text-tertiary" aria-hidden />
      <p className="text-[13px] text-text-secondary">
        <span className="font-medium text-text-primary">{title}</span>{" "}
        {L("har ingen 2D-scene ennå.", "has no 2D scene yet.")}
      </p>
      <p className="text-xs text-text-tertiary">
        {L("Prosjektets format:", "Project format:")} {format}.{" "}
        {L(
          "Det endres på prosjektoversikten og gjelder alle scener.",
          "It is changed on the project overview and applies to all scenes.",
        )}
      </p>
      {editable ? (
        <Button onClick={onCreate}>{L("Lag 2D-scene", "Create 2D scene")}</Button>
      ) : (
        <p className="text-xs text-text-tertiary">
          {L("Du har bare lesetilgang.", "You have read-only access.")}
        </p>
      )}
      {error ? (
        <p role="alert" className="text-xs text-status-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** «25», «23,976». */
function formatFps(fps: { num: number; den: number }): string {
  const v = fps.num / fps.den;
  return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(".", L(",", "."));
}

export type { Composition };
