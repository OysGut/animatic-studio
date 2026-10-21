import { Toolbar, ToolbarButton, ToolbarSeparator, ToolbarGroup, IconButton } from "@/app/shell/workspace-chrome";
/**
 * Sceneeditoren (M3 del 2, mandat kap. 11, DEC-0035): én 2D-scene per scene i manuset, bygget av lag
 * (bakgrunner, mellomgrunner, karakterer, objekter …) med bilder fra ressursbiblioteket eller fargeflater.
 * Kamera, tidslinje og avspilling kommer i neste leveranse (mandat kap. 12).
 */
import { Link } from "@tanstack/react-router";
import { ProductionPicker, useActiveProduction } from "@/app/project/use-production";
import {
  AlertTriangle,
  ChevronDown,
  Clapperboard,
  Copy,
  Drama,
  Layers,
  Mic,
  MonitorPlay,
  Plus,
  Redo2,
  Undo2,
} from "lucide-react";
import { followRangeLength } from "@/core/animation/time-format";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BeyondEndNotice } from "./BeyondEndNotice";
import { ContentSyncFlag } from "@/app/assembly/ContentSyncFlag";
import { useContentSync } from "@/app/assembly/use-content-sync";
import { DEFAULT_COMPOSITION, compositionDuration, defaultLayerFields, compositionOfVariant, formatHeading, sceneNumberOf, framesToSeconds, layerVersion, layerVersions, layerFieldsOf, layersOf, newMotionPath, pathPointsFromDrawing, isSharedIn, newId, ownCopyCommands, occurrenceKind, orderedOccurrences, audioClipFieldsOf, audioVersion, filmClips, sceneWindowAudio, versionImagePath, type Composition, type ProjectState, sceneContinuityVariant, previousSceneCamera, sourceAt, carryTargets, scriptSeekTarget } from "@/core";
import { NoteFlagControl } from "@/app/dialogue/NoteFlagControl";
import { publishSceneBookmark } from "@/app/shell/bookmark-context";
import { canEdit, useMembers, useProjectState } from "@/app/project/use-project";
import { useCommands, type Commands } from "@/app/project/use-commands";
import { ensureDerivedFiles } from "@/app/library/derived-backfill";
import { SaveIndicator } from "@/app/script/ScriptWorkspace";
import { useImageUrls } from "@/app/library/asset-images";
import { useAudioLoaded, useAudioPlayback } from "@/app/audio/use-audio-playback";
import { AudioClipEditor } from "@/app/audio/AudioClipEditor";
import { SceneAudioRows } from "./SceneAudioRows";
import { NearbyAudioPanel } from "./NearbyAudioPanel";
import { Button } from "@/components/ui/button";
import { AddLayerDialog } from "./AddLayerDialog";
import { TextMenu } from "./TextMenu";
import { PagesPanel } from "./PagesPanel";
import { CreditsPanel } from "./CreditsPanel";
import { CompositionInspector, LayerInspector } from "./LayerInspector";
import { LayersPanel } from "./LayersPanel";
import { Stage } from "./Stage";
import { SceneAssetsPanel } from "./SceneAssetsPanel";
import { useSceneLastChanges } from "./use-scene-last-changes";
import { ScenePicker } from "./ScenePicker";
import { PaneResizer, usePaneSize, useStoredFlag } from "@/app/shell/pane-size";
import { PopoutPreview, PreviewWindow } from "./PreviewWindow";
import { CameraPanel } from "./CameraPanel";
import { Timeline } from "./Timeline";
import { LayerImageDialog } from "./LayerImageDialog";
import { AssetStudio } from "@/app/asset-studio/AssetStudio";
import { CarryOverDialog, runCarryOver } from "./CarryOverDialog";
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
import { VariantTracks } from "./animation/VariantTracks";
import { DialogueTrack } from "./animation/DialogueTrack";
import { MouthTrack } from "./animation/MouthTrack";
import { PatternStudio } from "./animation/PatternStudio";
import { SceneTrackGroups } from "./animation/SceneTrackGroups";
import { RhythmPanel } from "./animation/RhythmPanel";
import { runGroup } from "@/app/storylab/canvas/run-group";
import { t as tk } from "@/core/i18n/keyed";

export function SceneEditorWorkspace({
  projectId,
  userId,
  initialOccurrenceId,
  initialLineId = null,
  initialFrame = null,
  initialTab = null,
}: {
  initialTab?: string | null;
  projectId: string;
  userId: string;
  initialOccurrenceId: string | null;
  /** DV7: lenke ut fra et avvik – sett avspillingshodet på replikkstart (uten å starte avspilling). */
  initialLineId?: string | null;
  /** DV8: bokmerke – bildet avspillingshodet stod på. */
  initialFrame?: number | null;
}) {
  const query = useProjectState(projectId);
  const members = useMembers(projectId);
  const role = members.data?.find((m) => m.user_id === userId)?.role;
  const editable = canEdit(role);
  const cmds = useCommands(projectId, userId, editable);
  if (query.isLoading)
    return (
      <p className="p-6 text-[13px] text-text-tertiary">
        {tk("app-scene-editor-scene-editor-workspace.scene-editor-workspace.p.23040d10d318")}
      </p>
    );
  if (query.isError || !query.data)
    return (
      <div role="alert" className="p-6 text-[13px] text-status-danger">
        {tk("app-scene-editor-scene-editor-workspace.scene-editor-workspace.div.1f17b61153ea")}
        {query.error ? (
          <p className="mt-2 font-mono text-xs text-text-tertiary">
            {tk("app-scene-editor-scene-editor-workspace.scene-editor-workspace.p.41327cc1e871")} {query.error.message}
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
      initialLineId={initialLineId}
      initialFrame={initialFrame}
      initialTab={initialTab}
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
  initialLineId = null,
  initialFrame = null,
  initialTab = null,
  userId,
}: {
  initialTab?: string | null;
  initialLineId?: string | null;
  initialFrame?: number | null;
  userId: string;
  state: ProjectState;
  editable: boolean;
  roleKnown: boolean;
  cmds: Commands;
  initialOccurrenceId: string | null;
  projectId: string;
}) {
  const lastChanges = useSceneLastChanges(projectId);
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
  useEffect(
    () =>
      rememberScene(
        projectId,
        occurrenceId,
        state.occurrences[occurrenceId ?? ""]?.sceneId ?? null,
      ),
    [projectId, occurrenceId, state.occurrences],
  );
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
      const err = cmds.run(c, tk("app-scene-editor-scene-editor-workspace.err.cmds-run.0f6070f03631"), group);
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
  const myName = me.data?.[userId]?.display_name || tk("app-scene-editor-scene-editor-workspace.my-name.message.fb62c54c5770");
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
  const [retimeRequest, setRetimeRequest] = useState(0);
  /** B-100: foreslått lengde når endringen åpnes fra varselet om tid etter slutten. */
  const [retimeFrames, setRetimeFrames] = useState<number | undefined>(undefined);
  const duration = useMemo(
    () => (composition ? compositionDuration(state, composition) : 1),
    [state, composition],
  );
  const [tracksOpen, setTracksOpen] = useState(initialTab === "animation");
  // B-100: spacing-drag – forhåndsvisning (ingen skriving) og uthevingen på lerretet
  const [spacingPreview, setSpacingPreview] = useState<ProjectState | null>(null);
  const [spacingHover, setSpacingHover] = useState<{ layerId: string; frame: number; whole: boolean } | null>(null);
  const [animationRange, setAnimationRange] = useState<{ from: number; to: number } | null>(null);
  useEffect(() => { setAnimationRange(null); }, [composition?.id]);
  // B-100: avspillingsområdet følger ny lengde etter omtiming
  const prevDurationRef = useRef(duration);
  useEffect(() => {
    const prev = prevDurationRef.current; prevDurationRef.current = duration;
    if (prev !== duration) setAnimationRange(r => followRangeLength(r, prev, duration));
  }, [duration]);
  const playback = usePlayback(duration, state.project.fps, true, tracksOpen ? animationRange : null);
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
  /** Lyden for forhåndsspillet i «Endre scenevarighet» (SV1), fra den midlertidige tilstanden. */
  const retimeAudioOf = useCallback(
    (s: ProjectState) => {
      if (!occurrenceId) return { items: [], startSec: 0 };
      const f = filmClips(s, productionId);
      const c = f.find((x) => x.occurrenceId === occurrenceId);
      return {
        items: sceneWindowAudio(s, f, occurrenceId, s.project.fps, filmLang.dialogue),
        startSec: c ? framesToSeconds(c.startFrame, s.project.fps) : 0,
      };
    },
    [occurrenceId, productionId, filmLang.dialogue],
  );
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
  /** DV1: replikken opptaksvinduet åpnes med (dobbeltklikk i manuset), eller null (mikrofonikonet). */
  const [recordBlockId, setRecordBlockId] = useState<string | null>(null);
  const [aiVideoOpen, setAiVideoOpen] = useState(false);
  /** Avvik ved manusendring for scenen (DEC-0054). */
  const found = useSceneDiscrepancies(state, occurrenceId);
  const [changesOpen, setChangesOpen] = useState(false);
  /** Naboscenene som film før og etter scenen (DEC-0052, REQ-0578). */
  const [neighbours, setNeighbours] = useStoredFlag("scene-editor-neighbours", false);
  /** Laget som får nytt bilde (dobbeltklikk, DEC-0044). */
  const [imageLayerId, setImageLayerId] = useState<string | null>(null);
  /** Laget som er åpent i Asset Studio (AS1). */
  const [studioLayerId, setStudioLayerId] = useState<string | null>(null);
  const openAssetStudio = useCallback(
    (id: string) => {
      setSelectedLayerId(id);
      playback.pause();
      setStudioLayerId(id);
    },
    [setSelectedLayerId, playback],
  );
  /** «Bruk også i …» (GP3): laget og scenen som er forhåndsvalgt. */
  const [carry, setCarry] = useState<{ layerId: string; preselect: string | null } | null>(null);
  const carryNext = useCallback(
    async (id: string): Promise<string | null> => {
      if (!occurrenceId) return null;
      const t = carryTargets(state, id, occurrenceId);
      if (!t.next)
        return tk("app-scene-editor-scene-editor-workspace.carry-next.use-callback.30073f7c98b9");
      const opt = t.options.find((o) => o.occurrenceId === t.next);
      if (opt?.duplicates.length) {
        setCarry({ layerId: id, preselect: t.next });
        return null;
      }
      const r = await runCarryOver(state, cmds, id, occurrenceId, [{ occurrenceId: t.next, mode: "add" }]);
      if (r.error) return r.error;
      return tk("app-scene-editor-scene-editor-workspace.added-to-scene", { scene: `${opt?.number ?? ""} ${opt?.heading ?? ""}`.trim() });
    },
    [occurrenceId, state, cmds],
  );
  /** Åpne bildet stort med «Oppskaler» fremme (advarselen om forstørrelse, DEC-0080). */
  const [upscaleOpen, setUpscaleOpen] = useState(false);
  const [harmonizeOpen, setHarmonizeOpen] = useState(false);
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
          ? tk("app-scene-editor-scene-editor-workspace.path-drawn.cmds-run.dec8783983a0")
          : tk("app-scene-editor-scene-editor-workspace.path-drawn.cmds-run.671f6aaabff3"),
      ),
    );
  }

  // Signerte lenker for bildene i scenen
  const paths = useMemo(() => {
    if (!composition) return [];
    const out: string[] = [];
    for (const l of layersOf(state, composition.id)) {
      // B-105a: scenevisningen bruker proxyn når den finnes (fallback: originalen)
      for (const v of layerVersions(state, l)) out.push(versionImagePath(v, "playback"));
    }
    return out;
  }, [state, composition]);
  const urls = useImageUrls(paths);
  // B-105a: eldre bilder får proxy og miniatyr i bakgrunnen første gang de vises (uten å blokkere)
  useEffect(() => {
    if (!composition) return;
    const versions = layersOf(state, composition.id).flatMap((l) => layerVersions(state, l));
    ensureDerivedFiles(cmds.runAndWait, state, projectId, versions, {
      width: state.project.frameWidth,
      height: state.project.frameHeight,
    });
  }, [state, composition, projectId, cmds]);

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
        tk("app-scene-editor-scene-editor-workspace.err.cmds-run.4d683d6ca3aa", { name: String(f.name) }),
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
        const e = cmds.run(c, tk("app-scene-editor-scene-editor-workspace.e.cmds-run.ab974716bf79"), group);
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
        tk("app-scene-editor-scene-editor-workspace.create.cmds-run.9a4e15ced040"),
        group,
      ),
    );
  }

  const side = panelsUi.mode === "side";
  const filmClip = occurrence ? (film.find((c) => c.occurrenceId === occurrence.id) ?? null) : null;
  // DV7/DV8: hopp til replikken eller bokmerket én gang etter åpning. Avspilling startes aldri automatisk.
  const [entrySeek, setEntrySeek] = useState<string | null>(null);
  const entryDone = useRef(false);
  useEffect(() => {
    if (entryDone.current || !occurrence || occurrence.id !== initialOccurrenceId) return;
    entryDone.current = true;
    if (initialLineId) {
      const t = scriptSeekTarget(state, filmClip, initialLineId);
      if (t.compFrame !== null) { playback.pause(); playback.setFrame(t.compFrame); setEntrySeek(null); }
      else setEntrySeek(tk("app-scene-editor-scene-editor-workspace.editor.set-entry-seek.3bc01f2622c8"));
    } else if (initialFrame !== null && initialFrame >= 0) { playback.pause(); playback.setFrame(initialFrame); }
  }, [occurrence, initialOccurrenceId, initialLineId, initialFrame, filmClip, state, playback]);
  useEffect(() => { publishSceneBookmark({ projectId, occurrenceId: occurrence?.id ?? null, frame: playback.frame, tab: tracksOpen ? "animation" : "scene" }); }, [projectId, occurrence?.id, playback.frame, tracksOpen]);
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
        run={cmds.run}
        authorName={myName}
        projectId={projectId}
        onSeek={(f) => {
          playback.pause();
          playback.setFrame(f);
        }}
        onOpenDialogue={
          audioEditable
            ? (blockId) => {
                setRecordBlockId(blockId);
                setRecordOpen(true);
              }
            : undefined
        }
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
          projectId={projectId}
          runAndWait={cmds.runAndWait}
          frame={playback.frame}
          autoKey={autoKey}
          onOpenImage={() => openLayerImage(selectedLayer.id)}
          {...(occurrenceId
            ? {
                onOpenAssetStudio: () => openAssetStudio(selectedLayer.id),
                onCarryNext: () => carryNext(selectedLayer.id),
                onCarryPick: () => setCarry({ layerId: selectedLayer.id, preselect: null }),
              }
            : {})}
          onUpscale={() => {
            setUpscaleOpen(true);
            openLayerImage(selectedLayer.id);
          }}
          onHarmonize={() => {
            setHarmonizeOpen(true);
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
          onChangeDuration={() => { setRetimeFrames(undefined); setRetimeRequest((n) => n + 1); }}
        />
      )
    ) : null,
    // Sider i tittel- og tekstscener (MTS MT6)
    pages:
      composition && occurrence && (occurrenceKind(occurrence) === "title" || occurrenceKind(occurrence) === "text") ? (
        <PagesPanel
          state={state}
          composition={composition}
          editable={editable}
          run={cmds.run}
          onSelect={setSelectedLayerId}
        />
      ) : null,
    // Rulleteksten: design og deltakerregister (MTS MT7)
    credits:
      occurrence && occurrenceKind(occurrence) === "credits" ? (
        <CreditsPanel state={state} occurrenceId={occurrence.id} editable={editable} run={cmds.run} cmds={cmds} />
      ) : null,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar overflow="menu">
        <ToolbarGroup priority={9} className="[&>select]:max-w-[180px] [&>select]:truncate">
        <span className="text-chrome font-medium text-text-primary">
          {tk("app-scene-editor-scene-editor-workspace.editor.span.2249b830c7b6")}
        </span>
        <ProductionPicker state={state} value={productionId} onChange={setProductionId} />
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup priority={8}>
        <ScenePicker
          state={state}
          occurrences={occurrences}
          occurrenceId={occurrenceId}
          hasComposition={hasComposition}
          onPick={pickScene}
          synced={contentSync}
          lastChanged={lastChanges.data}
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
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup priority={7}>
        <IconButton
          onClick={cmds.undo}
          shortcut="⌘Z"
          disabled={!cmds.canUndo}
          title={
            cmds.undoLabel
              ? tk("app-scene-editor-scene-editor-workspace.editor.title.e806c9272ff8", { undoLabel: String(cmds.undoLabel) })
              : tk("app-scene-editor-scene-editor-workspace.editor.title.d4b1594b01d6")
          }
          label={
            cmds.undoLabel
              ? tk("app-scene-editor-scene-editor-workspace.editor.label.99e804f17a71", { undoLabel: String(cmds.undoLabel) })
              : tk("app-scene-editor-scene-editor-workspace.editor.label.7e7750dbf9be")
          }
        >
          <Undo2 />
        </IconButton>
        <IconButton
          onClick={cmds.redo}
          shortcut="⇧⌘Z"
          disabled={!cmds.canRedo}
          title={
            cmds.redoLabel
              ? tk("app-scene-editor-scene-editor-workspace.editor.title.e9e4b22177d6", { redoLabel: String(cmds.redoLabel) })
              : tk("app-scene-editor-scene-editor-workspace.editor.title.529ee1aa35be")
          }
          label={
            cmds.redoLabel
              ? tk("app-scene-editor-scene-editor-workspace.editor.label.ecc4ac262fd0", { redoLabel: String(cmds.redoLabel) })
              : tk("app-scene-editor-scene-editor-workspace.editor.label.25ea55415f55")
          }
        >
          <Redo2 />
        </IconButton>
        </ToolbarGroup>
        <ToolbarGroup priority={1}>
        {occurrence ? (
          <ToolbarButton variant="icon" asChild>
            <Link
              to="/prosjekt/$projectId/storylab"
              params={{ projectId }}
              search={{ scene: occurrence.sceneId }}
              data-testid="scene-editor-storylab"
              title={tk("app-scene-editor-scene-editor-workspace.editor.title.52abdb98d1c3")}
              aria-label={tk("app-scene-editor-scene-editor-workspace.editor.aria-label.4202ee21c2e3")}
            >
              <Drama />
            </Link>
          </ToolbarButton>
        ) : null}
        {editable && composition ? (
          <ToolbarButton variant="default" onClick={() => setAddOpen(true)}>
            <Plus />
            {tk("app-scene-editor-scene-editor-workspace.editor.toolbar-button.c5dfcc6d6a55")}
          </ToolbarButton>
        ) : null}
        {editable && composition ? (
          <TextMenu state={state} composition={composition} run={cmds.run} cmds={cmds} onAdded={setSelectedLayerId} />
        ) : null}
        {audioEditable && occurrence ? (
          <ToolbarButton
            variant="default"
            onClick={() => {
              playback.pause();
              setRecordOpen(true);
            }}
            title={tk("app-scene-editor-scene-editor-workspace.editor.title.8ac2c1b9be74")}
            data-testid="scene-record-audio"
          >
            <Mic aria-hidden />
            {/* Under 1400 px bare ikon (med verktøytips), så scenevelgeren får plass */}
            <span className="sr-only min-[1400px]:not-sr-only">{tk("app-scene-editor-scene-editor-workspace.editor.span.afe8e346b772")}</span>
          </ToolbarButton>
        ) : null}
        {/* Bilder og video fra mobilen til denne scenen (DEC-0090): én QR-kode per scene */}
        {roleEditable && occurrence && variant ? (
          <MobileCameraButton
            projectId={projectId}
            context={{ type: "occurrence", occurrenceId: occurrence.id }}
            label={tk("app-scene-editor-scene-editor-workspace.editor.label.6667cd0c77de", { value1: String(sceneNumberOf(state, occurrence) ?? ""), value2: String(formatHeading(variant.heading)) })}
            actions={(row) => (
              <SceneMobileActions
                state={state}
                cmds={cmds}
                occurrenceId={occurrence.id}
                row={row}
                atMs={Math.round((playback.frame / (state.project.fps.num / state.project.fps.den)) * 1000)}
              />
            )}
          />
        ) : null}
        {occurrence ? (
          <ToolbarButton
            variant="default"
            onClick={() => {
              playback.pause();
              setAiVideoOpen(true);
            }}
            title={tk("app-scene-editor-scene-editor-workspace.editor.title.4491df52ab98")}
            data-testid="scene-ai-video"
          >
            <AiGlyph aria-hidden />
            {tk("app-scene-editor-scene-editor-workspace.editor.toolbar-button.8c25f8bf1c29")}
          </ToolbarButton>
        ) : null}
        </ToolbarGroup>
        <div data-toolbar-fixed className="ml-auto flex shrink-0 flex-nowrap items-center gap-2">
          {composition ? (
            <>
              <ToolbarButton
                active={neighbours}
                onClick={() => setNeighbours(!neighbours)}
                aria-pressed={neighbours}
                title={tk("app-scene-editor-scene-editor-workspace.editor.title.3b3587ae10f7")}
              >
                <Clapperboard aria-hidden />
                <span className="sr-only min-[1400px]:not-sr-only">
                  {tk("app-scene-editor-scene-editor-workspace.editor.span.ebe0ce4c8f96")}
                </span>
              </ToolbarButton>
              {/* Forhåndsvisning med valg i en liten meny, så verktøylinjen ikke bryter tekst (DEC-0076 funn 6) */}
              <div className="flex shrink-0 items-center">
                <ToolbarButton
                  active={previewOpen}
                  onClick={() => setPreviewOpen(!previewOpen)}
                  aria-pressed={previewOpen}
                  title={tk("app-scene-editor-scene-editor-workspace.editor.title.2e07b83195bb")}
                  className="rounded-r-none"
                >
                  <MonitorPlay aria-hidden />
                  <span className="sr-only min-[1400px]:not-sr-only">
                    {tk("app-scene-editor-scene-editor-workspace.editor.span.ec87bccdc2ea")}
                  </span>
                </ToolbarButton>
                <Popover>
                  <PopoverTrigger asChild>
                    <ToolbarButton
                      active={previewOpen}
                      className="w-6 rounded-l-none px-0"
                      aria-label={tk("app-scene-editor-scene-editor-workspace.editor.aria-label.e7ce1cd78f42")}
                      title={
                        autoPreview
                          ? tk("app-scene-editor-scene-editor-workspace.editor.title.01b7c41be3cc")
                          : tk("app-scene-editor-scene-editor-workspace.editor.title.e7ce1cd78f42")
                      }
                    >
                      <ChevronDown className="size-3" aria-hidden />
                    </ToolbarButton>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="flex w-64 flex-col gap-1 p-3">
                    <label
                      className="flex items-start gap-2 text-xs text-text-secondary"
                      title={tk("app-scene-editor-scene-editor-workspace.editor.title.5a93217ad16a")}
                    >
                      <input
                        type="checkbox"
                        checked={autoPreview}
                        onChange={(e) => setAutoPreview(e.target.checked)}
                        className="mt-0.5 size-3.5 accent-[var(--accent-brand)]"
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-text-primary">
                          {tk("app-scene-editor-scene-editor-workspace.editor.span.f49b32ec6483")}
                        </span>
                        <span className="text-[11px] text-text-tertiary">
                          {tk("app-scene-editor-scene-editor-workspace.editor.span.95f187b65135")}
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
                          {tk("app-scene-editor-scene-editor-workspace.editor.span.7c545b56fb78")}
                        </span>
                        <span className="text-[11px] text-text-tertiary">
                          {tk("app-scene-editor-scene-editor-workspace.editor.span.eb3fdde9ba7e")}
                        </span>
                      </span>
                    </label>
                  </PopoverContent>
                </Popover>
              </div>
              <ToolbarSeparator />
            </>
          ) : null}
          <ShortcutsButton onClick={() => setShortcutsOpen(true)} />
          <ToolbarSeparator />
          <SaveIndicator cmds={cmds} />
          {roleKnown && !roleEditable ? (
            <span className="text-xs text-text-tertiary">
              {tk("app-scene-editor-scene-editor-workspace.editor.span.c8853089711a")}
            </span>
          ) : null}
        </div>
      </Toolbar>
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
              label={tk("app-scene-editor-scene-editor-workspace.editor.label.f81097ddcd9e")}
            />
            {occurrences.length === 0 ? (
              <p className="px-3 py-3 text-xs text-text-tertiary">
                {tk("app-scene-editor-scene-editor-workspace.editor.p.d4f81c086c37")}
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
          aria-label={tk("app-scene-editor-scene-editor-workspace.editor.tabs-trigger.676cd3d0670d")}
          className={
            "flex flex-1 flex-col bg-surface-0 " +
            // Side om side: lerretet beholder en brukbar bredde; panelområdet ruller sidelengs
            (side ? "min-w-[480px]" : "min-w-0")
          }
        >
          {!occurrence || !variant ? (
            <p className="m-auto text-[13px] text-text-tertiary">
              {occurrences.length === 0
                ? tk("app-scene-editor-scene-editor-workspace.editor.p.969df8128793")
                : tk("app-scene-editor-scene-editor-workspace.editor.p.0d6cb3a369bf")}
            </p>
          ) : !composition ? (
            <EmptyScene
              title={formatHeading(variant.heading)}
              editable={roleEditable}
              onCreate={create}
              format={tk("app-scene-editor-scene-editor-workspace.editor.format.4c15e7a68aa4", { frameWidth: String(state.project.frameWidth), frameHeight: String(state.project.frameHeight), value3: String(formatFps(state.project.fps)) })}
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
                  {tk("app-scene-editor-scene-editor-workspace.editor.div.2743259f00d0")}
                  <Button size="sm" variant="secondary" className="h-6" onClick={makeOwnCopy}>
                    {tk("app-scene-editor-scene-editor-workspace.editor.button.3df8bce7bb3c")}
                    {state.productions[productionId]?.name}
                    {tk("app-scene-editor-scene-editor-workspace.editor.button.e4566fdbafd5")}
                  </Button>
                  {copyError ? <span className="text-status-danger">{copyError}</span> : null}
                </div>
              ) : null}
              {entrySeek ? (
                <div role="status" data-testid="scene-entry-seek" className="flex min-h-8 shrink-0 items-center gap-2 border-b border-border bg-status-uncertain-bg px-3 py-1 text-xs text-text-primary">
                  {entrySeek}
                  <Button size="sm" variant="ghost" className="h-6" onClick={() => setEntrySeek(null)}>{tk("app-scene-editor-scene-editor-workspace.editor.button.462670b432ce")}</Button>
                </div>
              ) : null}
              {occurrence ? <div className="flex h-7 shrink-0 items-center gap-2 border-b border-border px-3 text-xs text-text-secondary"><NoteFlagControl state={state} kind="occurrence" targetId={occurrence.id} run={cmds.run} editable={roleEditable} />{tk("app-scene-editor-scene-editor-workspace.editor.div.b16b3f213ee9")}</div> : null}
              {found.length > 0 ? (
                <div
                  role="status"
                  className="flex h-8 shrink-0 items-center gap-2 border-b border-status-danger/40 bg-status-danger-bg px-3 text-xs text-text-primary"
                >
                  <AlertTriangle className="size-3.5 text-status-danger" aria-hidden />
                  {tk("app-scene-editor-scene-editor-workspace.editor.div.25c199e50762")}{" "}
                  (
                  {(() => {
                    const n = new Set(found.flatMap((d) => d.changes.map((c) => c.blockId))).size;
                    return n === 1
                      ? tk("app-scene-editor-scene-editor-workspace.editor.const-n-new-set-found-flat-map-d-d-changes-map-c-c-block-id-size-return-n-1-l-1-endring-1-change-l-n-endringer-n-changes.ea7ccda45330")
                      : tk("app-scene-editor-scene-editor-workspace.editor.const-n-new-set-found-flat-map-d-d-changes-map-c-c-block-id-size-return-n-1-l-1-endring-1-change-l-n-endringer-n-changes.81a678653c53", { n: String(n) });
                  })()}
                  ).
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6"
                    onClick={() => setChangesOpen(true)}
                  >
                    {tk("app-scene-editor-scene-editor-workspace.editor.button.ffbcd021abf4")}
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
                onExtend={(f) => { setRetimeFrames(f); setRetimeRequest((n) => n + 1); }}
              />
              <div className="relative flex min-h-[180px] flex-1 flex-col">
                <Stage
                  state={spacingPreview ?? state}
                  spacingHover={spacingHover}
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
                  onOpenAssetStudio={openAssetStudio}
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
                        tk("app-scene-editor-scene-editor-workspace.editor.set-preview-note.b5e1a42baaeb"),
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
                spacing={{ onHover: setSpacingHover, onPreview: setSpacingPreview }}
                retime={{
                  occurrenceId: occurrence.id,
                  runAndWait: cmds.runAndWait,
                  imageUrls: urls.data ?? {},
                  audioOf: retimeAudioOf,
                  audioUrls: soundUrls.data ?? null,
                  request: retimeRequest,
                  requestFrames: retimeFrames,
                }}
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
              {occurrence ? (
                <SceneTrackGroups key={composition.id} state={state} duration={duration} playback={playback}
                  range={animationRange ?? { from: 0, to: duration - 1 }} onRange={setAnimationRange}
                  selectedLayerId={selectedLayer?.id ?? null} selectedLayerName={selectedLayer?.name ?? null}
                  title={tk("app-scene-editor-scene-editor-workspace.editor.tabs-trigger.9161a95d0f51")}
                  forceOpen={initialTab === "animation"} onOpenChange={setTracksOpen}
                  tools={<RhythmPanel state={state} occurrenceId={occurrence.id} editable={editable} run={cmds.run} />}
                  rhythm={{ state, occurrenceId: occurrence.id, editable, run: cmds.run }}
                  tracks={animView => <>
            <VariantTracks state={state} compositionId={composition.id} occurrenceId={occurrence.id} duration={duration} view={animView}
              frame={playback.frame} editable={editable} run={cmds.run} onSeek={playback.setFrame} onStudio={openAssetStudio}
              runGroup={(cs, label) => runGroup(cmds, cs, label)} onJump={pickScene} />
            <DialogueTrack state={state} occurrenceId={occurrence.id} language={filmLang.dialogue}
              view={animView} onOpen={setProfileId} />
            <MouthTrack state={state} occurrenceId={occurrence.id} language={filmLang.dialogue}
              view={animView} frame={playback.frame} editable={editable} run={cmds.run} urls={urls.data ?? {}} />
            <PatternStudio state={state} duration={duration} editable={editable} run={cmds.run} />
          </>} />
              ) : null}
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
            aria-label={tk("app-scene-editor-scene-editor-workspace.editor.aria-label.fbb8fed39145")}
            style={{ width: rightWidth }}
            className="relative flex shrink-0 flex-col overflow-y-auto border-l border-border bg-surface-1"
          >
            <PaneResizer
              edge="left"
              size={rightWidth}
              onSize={setRightWidth}
              min={240}
              max={560}
              label={tk("app-scene-editor-scene-editor-workspace.editor.label.b8136a3a9179")}
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
            <DialogTitle>{tk("app-scene-editor-scene-editor-workspace.editor.dialog-title.71d5a70577f4")}</DialogTitle>
            <DialogDescription>
              {tk("app-scene-editor-scene-editor-workspace.editor.dialog-description.150558d60e28")}
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
            setHarmonizeOpen(false);
          }
        }}
        state={state}
        projectId={projectId}
        layer={imageLayerId ? (state.layers[imageLayerId] ?? null) : null}
        editable={editable}
        cmds={cmds}
        openUpscale={upscaleOpen}
        openHarmonize={harmonizeOpen}
      />
      {carry && occurrenceId ? (
        <CarryOverDialog
          open
          onOpenChange={(o) => {
            if (!o) setCarry(null);
          }}
          state={state}
          cmds={cmds}
          layerId={carry.layerId}
          sourceOccurrenceId={occurrenceId}
          preselect={carry.preselect}
        />
      ) : null}
      {studioLayerId && composition && occurrenceId && state.layers[studioLayerId as never] ? (
        <AssetStudio
          projectId={projectId}
          state={state}
          cmds={cmds}
          composition={composition}
          occurrenceId={occurrenceId}
          productionId={productionId}
          layerId={studioLayerId}
          editable={editable}
          audioEditable={audioEditable}
          authorName={myName}
          audioOf={(s) => retimeAudioOf(s).items}
          onClose={() => setStudioLayerId(null)}
        />
      ) : null}
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
          onOpenChange={(o) => {
            setRecordOpen(o);
            if (!o) setRecordBlockId(null);
          }}
          initialBlockId={recordBlockId}
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
        {tk("app-scene-editor-scene-editor-workspace.empty-scene.p.8f9d55023582")}
      </p>
      <p className="text-xs text-text-tertiary">
        {tk("app-scene-editor-scene-editor-workspace.empty-scene.p.9ee061ca293a")} {format}.{" "}
        {tk("app-scene-editor-scene-editor-workspace.empty-scene.p.fe57990443df")}
      </p>
      {editable ? (
        <Button onClick={onCreate}>{tk("app-scene-editor-scene-editor-workspace.empty-scene.button.5855c8d3e5cf")}</Button>
      ) : (
        <p className="text-xs text-text-tertiary">
          {tk("app-scene-editor-scene-editor-workspace.empty-scene.p.202428296275")}
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
  return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(".", tk("app-scene-editor-scene-editor-workspace.format-fps.v-to-fixed-3-replace.c0fa8edc6e8f"));
}

export type { Composition };
