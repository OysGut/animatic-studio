/**
 * Sceneeditoren (M3 del 2, mandat kap. 11, DEC-0035): én 2D-scene per scene i manuset, bygget av lag
 * (bakgrunner, mellomgrunner, karakterer, objekter …) med bilder fra ressursbiblioteket eller fargeflater.
 * Kamera, tidslinje og avspilling kommer i neste leveranse (mandat kap. 12).
 */
import { Layers, MonitorPlay, Plus, Redo2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_COMPOSITION,
  compositionDuration,
  defaultLayerFields,
  compositionOfVariant,
  formatHeading,
  layerVersion,
  layersOf,
  mainProduction,
  newId,
  orderedOccurrences,
  type Composition,
  type ProjectState,
} from "@/core";
import { canEdit, useMembers, useProjectState } from "@/app/project/use-project";
import { useCommands, type Commands } from "@/app/project/use-commands";
import { SaveIndicator } from "@/app/script/ScriptWorkspace";
import { useImageUrls } from "@/app/library/asset-images";
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
import { usePlayback } from "./use-playback";

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
  editable,
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
  const productionId = mainProduction(state)?.id ?? Object.keys(state.productions)[0] ?? "";
  const occurrences = useMemo(() => orderedOccurrences(state, productionId), [state, productionId]);
  const [occurrenceId, setOccurrenceId] = useState<string | null>(
    () =>
      (initialOccurrenceId && state.occurrences[initialOccurrenceId]
        ? initialOccurrenceId
        : occurrences[0]?.id) ?? null,
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
  const duration = useMemo(
    () => (composition ? compositionDuration(state, composition) : 1),
    [state, composition],
  );
  const playback = usePlayback(duration, state.project.fps);
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

  // Signerte lenker for bildene i scenen
  const paths = useMemo(() => {
    if (!composition) return [];
    const out: string[] = [];
    for (const l of layersOf(state, composition.id)) {
      const v = layerVersion(state, l);
      if (v) out.push(v.mediaPath);
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
      const f = defaultLayerFields(state, composition, { assetId });
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
    if (!variant) return;
    setError(
      cmds.run(
        {
          type: "CreateComposition",
          compositionId: newId<"composition">(),
          variantId: variant.id,
          // Formatet følger prosjektet (DEC-0039)
          fields: {
            ...DEFAULT_COMPOSITION,
            width: state.project.frameWidth,
            height: state.project.frameHeight,
          },
        },
        "Ny 2D-scene",
      ),
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-surface-2 px-3">
        <span className="text-[13px] font-medium text-text-primary">Sceneeditor</span>
        <div className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ScenePicker
          state={state}
          occurrences={occurrences}
          occurrenceId={occurrenceId}
          hasComposition={hasComposition}
          onPick={pickScene}
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
        <div className="ml-auto flex items-center gap-3">
          {composition ? (
            <>
              <Button
                size="sm"
                variant={previewOpen ? "secondary" : "ghost"}
                onClick={() => setPreviewOpen(!previewOpen)}
                aria-pressed={previewOpen}
                title="Vis det ferdige utsnittet (kamera og bevegelser) i et eget vindu"
              >
                <MonitorPlay />
                Forhåndsvisning
              </Button>
              <label
                className="flex items-center gap-1.5 text-xs text-text-secondary"
                title="Vis automatisk ved avspilling"
              >
                <input
                  type="checkbox"
                  checked={autoPreview}
                  onChange={(e) => setAutoPreview(e.target.checked)}
                  className="size-3.5 accent-[var(--accent-brand)]"
                />
                Automatisk visning
              </label>
              <div className="h-5 w-px bg-border" aria-hidden />
            </>
          ) : null}
          <SaveIndicator cmds={cmds} />
          {roleKnown && !editable ? (
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
              editable={editable}
              onCreate={create}
              format={`${state.project.frameWidth} × ${state.project.frameHeight} px · ${formatFps(state.project.fps)} bilder/s`}
              error={error}
            />
          ) : (
            <>
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
            />
            <div className="border-t border-border">
              {selectedShot ? (
                <CameraPanel
                  key={selectedShot.id}
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
