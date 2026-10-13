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
import { useCallback, useEffect, useMemo, useState } from "react";
import { BeyondEndNotice } from "./BeyondEndNotice";
import { ContentSyncFlag } from "@/app/assembly/ContentSyncFlag";
import { useContentSync } from "@/app/assembly/use-content-sync";
import {
  DEFAULT_COMPOSITION,
  compositionDuration,
  defaultLayerFields,
  compositionOfVariant,
  formatHeading,
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
import { NeighbourScenes } from "./NeighbourScenes";
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
import { lastScene, rememberScene } from "@/app/shell/current-scene";
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
    return <p className="p-6 text-[13px] text-text-tertiary">Henter scenene …</p>;
  if (query.isError || !query.data)
    return (
      <div role="alert" className="p-6 text-[13px] text-status-danger">
        Scenene kunne ikke hentes.
        {query.error ? (
          <p className="mt-2 font-mono text-xs text-text-tertiary">
            Teknisk detalj: {query.error.message}
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
}: {
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
      const err = cmds.run(c, "Egen versjon av scenen", group);
      if (err) {
        setCopyError(err);
        return;
      }
    }
    setCopyError(null);
  }
  const [selectedLayerId, setSelectedLayerIdState] = useState<string | null>(null);
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
  /** Avvik ved manusendring for scenen (DEC-0054). */
  const found = useSceneDiscrepancies(state, occurrenceId);
  const [changesOpen, setChangesOpen] = useState(false);
  /** Naboscenene som film før og etter scenen (DEC-0052, REQ-0578). */
  const [neighbours, setNeighbours] = useStoredFlag("scene-editor-neighbours", false);
  /** Laget som får nytt bilde (dobbeltklikk, DEC-0044). */
  const [imageLayerId, setImageLayerId] = useState<string | null>(null);
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
        selectedLayer.path ? "Tegn banen på nytt" : "Ny bevegelsesbane",
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

  /** Ressurs fra «I denne scenen» med «+»: nytt lag øverst, midt i bildet (litt forskjøvet per lag). */
  const addAsset = useCallback(
    (assetId: string) => {
      if (!composition) return;
      // Utseendet kontinuiteten gir i denne scenen (DEC-0055)
      const f = defaultLayerFields(state, composition, {
        assetId,
        assetVariantId: sceneContinuityVariant(state, assetId, composition.variantId),
      });
      const n = layersOf(state, composition.id).length % 8;
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
        `Nytt lag «${f.name}»`,
      );
      setError(err);
      if (!err) setSelectedLayerId(layerId);
    },
    [state, composition, cmds, setSelectedLayerId],
  );

  function create() {
    if (!variant || !occurrence) return;
    // Delt med hovedfilmen i en avledet produksjon: egen versjon av scenen først (DEC-0057)
    let variantId: string = variant.id;
    let group: string | undefined;
    if (shared) {
      group = newId();
      for (const c of ownCopyCommands(state, occurrence.id) ?? []) {
        const e = cmds.run(c, "Egen versjon av scenen", group);
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
        "Ny 2D-scene",
        group,
      ),
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-surface-2 px-3">
        <span className="text-[13px] font-medium text-text-primary">Sceneeditor</span>
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
          title={cmds.undoLabel ? `Angre: ${cmds.undoLabel} (⌘Z)` : "Angre (⌘Z)"}
          aria-label={cmds.undoLabel ? `Angre: ${cmds.undoLabel}` : "Angre"}
        >
          <Undo2 />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={cmds.redo}
          disabled={!cmds.canRedo}
          title={cmds.redoLabel ? `Gjør om: ${cmds.redoLabel} (⇧⌘Z)` : "Gjør om (⇧⌘Z)"}
          aria-label={cmds.redoLabel ? `Gjør om: ${cmds.redoLabel}` : "Gjør om"}
        >
          <Redo2 />
        </Button>
        {editable && composition ? (
          <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
            <Plus />
            Legg til lag
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
            title="Ta opp en replikk eller lyd fra avspillingshodet"
          >
            <Mic aria-hidden />
            {/* Under 1400 px bare ikon (med verktøytips), så scenevelgeren får plass */}
            <span className="sr-only min-[1400px]:not-sr-only">Opptak</span>
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
                title="Spill scenen før og etter som ferdig film, i sammenheng med denne"
              >
                <Clapperboard aria-hidden />
                <span className="sr-only min-[1400px]:not-sr-only">Naboscener</span>
              </Button>
              {/* Forhåndsvisning med valg i en liten meny, så verktøylinjen ikke bryter tekst (DEC-0076 funn 6) */}
              <div className="flex shrink-0 items-center">
                <Button
                  size="sm"
                  variant={previewOpen ? "secondary" : "ghost"}
                  onClick={() => setPreviewOpen(!previewOpen)}
                  aria-pressed={previewOpen}
                  title="Vis det ferdige utsnittet (kamera og bevegelser) i et eget vindu"
                  className="rounded-r-none"
                >
                  <MonitorPlay aria-hidden />
                  <span className="sr-only min-[1400px]:not-sr-only">Forhåndsvisning</span>
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      size="sm"
                      variant={previewOpen ? "secondary" : "ghost"}
                      className="w-6 rounded-l-none px-0"
                      aria-label="Valg for forhåndsvisning"
                      title={
                        autoPreview
                          ? "Valg for forhåndsvisning: vises automatisk ved avspilling"
                          : "Valg for forhåndsvisning"
                      }
                    >
                      <ChevronDown className="size-3" aria-hidden />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="flex w-64 flex-col gap-1 p-3">
                    <label
                      className="flex items-start gap-2 text-xs text-text-secondary"
                      title="Det ferdige utsnittet vises mens scenen spilles, og lukkes når avspillingen stopper"
                    >
                      <input
                        type="checkbox"
                        checked={autoPreview}
                        onChange={(e) => setAutoPreview(e.target.checked)}
                        className="mt-0.5 size-3.5 accent-[var(--accent-brand)]"
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-text-primary">Automatisk visning</span>
                        <span className="text-[11px] text-text-tertiary">
                          Vis det ferdige utsnittet mens scenen spilles av.
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
            <span className="text-xs text-text-tertiary">Bare lesetilgang</span>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Ressursene i scenen */}
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
            label="Bredde på «I denne scenen»"
          />
          {occurrences.length === 0 ? (
            <p className="px-3 py-3 text-xs text-text-tertiary">
              Ingen scener. Importer manuset først.
            </p>
          ) : null}
          {occurrence ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <SceneAssetsPanel
                state={state}
                projectId={projectId}
                productionId={productionId}
                occurrenceId={occurrence.id}
                editable={editable}
                onAdd={composition ? addAsset : null}
                cmds={cmds}
              />
              <NearbyAudioPanel
                state={state}
                clips={film}
                occurrenceId={occurrence.id}
                editable={audioEditable}
                run={cmds.run}
              />
            </div>
          ) : null}
        </div>

        {/* Arbeidsflaten */}
        <main className="flex min-w-0 flex-1 flex-col bg-surface-0">
          {!occurrence || !variant ? (
            <p className="m-auto text-[13px] text-text-tertiary">
              {occurrences.length === 0 ? "Ingen scener i prosjektet ennå." : "Velg en scene."}
            </p>
          ) : !composition ? (
            <EmptyScene
              title={formatHeading(variant.heading)}
              editable={roleEditable}
              onCreate={create}
              format={`${state.project.frameWidth} × ${state.project.frameHeight} px · ${formatFps(state.project.fps)} bilder/s`}
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
                  2D-scenen deles med hovedfilmen. Lag en egen versjon for å endre den her –
                  hovedfilmen endres ikke.
                  <Button size="sm" variant="secondary" className="h-6" onClick={makeOwnCopy}>
                    Lag egen versjon for «{state.productions[productionId]?.name}»
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
                  Manuset er endret etter at materialet ble laget (
                  {(() => {
                    const n = new Set(found.flatMap((d) => d.changes.map((c) => c.blockId))).size;
                    return n === 1 ? "1 endring" : `${n} endringer`;
                  })()}
                  ).
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6"
                    onClick={() => setChangesOpen(true)}
                  >
                    Vis og velg …
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
                    onClose={closePreview}
                    onDock={() => setPopout(false)}
                    onBlocked={() => {
                      setPopout(false);
                      setPreviewNote("Nettleseren stoppet det egne vinduet");
                    }}
                    onTogglePlay={playback.toggle}
                  />
                ) : showPreview ? (
                  <PreviewWindow
                    state={state}
                    composition={composition}
                    frame={playback.frame}
                    imageUrls={urls.data ?? {}}
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
                  />
                )}
              />
            </>
          )}
        </main>

        {/* Lag og egenskaper */}
        {composition ? (
          <aside
            aria-label="Lag og egenskaper"
            style={{ width: rightWidth }}
            className="relative flex shrink-0 flex-col overflow-y-auto border-l border-border bg-surface-1"
          >
            <PaneResizer
              edge="left"
              size={rightWidth}
              onSize={setRightWidth}
              min={240}
              max={560}
              label="Bredde på lag og egenskaper"
            />
            <LayersPanel
              state={state}
              composition={composition}
              editable={editable}
              selectedLayerId={selectedLayer?.id ?? null}
              onSelect={setSelectedLayerId}
              run={cmds.run}
              onOpenImage={openLayerImage}
              frame={playback.playing ? 0 : playback.frame}
            />
            <div className="border-t border-border">
              {selectedShot ? (
                <CameraPanel
                  key={selectedShot.id}
                  previousFrame={
                    occurrenceId
                      ? (previousSceneCamera(state, productionId, occurrenceId, composition)
                          ?.frame ?? null)
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
              )}
            </div>
          </aside>
        ) : null}
      </div>

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
            <DialogTitle>Manusendringer i scenen</DialogTitle>
            <DialogDescription>
              Oppdater 2D-scenen her i editoren og godkjenn etterpå, godkjenn slik den er, eller
              angre manusendringen.
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
          if (!o) setImageLayerId(null);
        }}
        state={state}
        projectId={projectId}
        layer={imageLayerId ? (state.layers[imageLayerId] ?? null) : null}
        editable={editable}
        cmds={cmds}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} current="sceneeditor" />
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
        <span className="font-medium text-text-primary">{title}</span> har ingen 2D-scene ennå.
      </p>
      <p className="text-xs text-text-tertiary">
        Prosjektets format: {format}. Det endres på prosjektoversikten og gjelder alle scener.
      </p>
      {editable ? (
        <Button onClick={onCreate}>Lag 2D-scene</Button>
      ) : (
        <p className="text-xs text-text-tertiary">Du har bare lesetilgang.</p>
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
  return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(".", ",");
}

export type { Composition };
