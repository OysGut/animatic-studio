/**
 * Montering (M4 del 1, mandat kap. 15, DEC-0043): den samlede filmen – alle aktive scener i manusets
 * rekkefølge, med 2D-scenene som materiale og tittelkort der 2D-scenen mangler. Forhåndsvis hele filmen,
 * flytt scener (speiles i manuset), juster lengder og eksporter animatic.
 */
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Download,
  Pause,
  Play,
  Redo2,
  Repeat,
  SkipBack,
  SkipForward,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_COMPOSITION,
  clipAtFrame,
  filmClips,
  filmDurationFrames,
  formatTimecode,
  framesToSeconds,
  keyBetween,
  mainProduction,
  newId,
  type Composition,
  type ProjectState,
} from "@/core";
import { canEdit, useMembers, useProjectState } from "@/app/project/use-project";
import { useCommands, type Commands } from "@/app/project/use-commands";
import { SaveIndicator } from "@/app/script/ScriptWorkspace";
import { Button } from "@/components/ui/button";
import { PaneResizer, usePaneSize, useStoredFlag } from "@/app/shell/pane-size";
import { usePlayback } from "@/app/scene-editor/use-playback";
import { IconButton, iconButton, isTypingTarget } from "@/app/scene-editor/Timeline";
import { useFilmImages } from "./film-images";
import { FilmViewer } from "./FilmViewer";
import { FilmTimeline, formatSeconds } from "./FilmTimeline";
import { ClipPanel } from "./ClipPanel";
import { ExportAnimaticDialog } from "./ExportAnimaticDialog";

export function AssemblyWorkspace({ projectId, userId }: { projectId: string; userId: string }) {
  const query = useProjectState(projectId);
  const members = useMembers(projectId);
  const role = members.data?.find((m) => m.user_id === userId)?.role;
  const editable = canEdit(role);
  const cmds = useCommands(projectId, userId, editable);
  if (query.isLoading) return <p className="p-6 text-[13px] text-text-tertiary">Henter filmen …</p>;
  if (query.isError || !query.data)
    return (
      <div role="alert" className="p-6 text-[13px] text-status-danger">
        Filmen kunne ikke hentes.
        {query.error ? (
          <p className="mt-2 font-mono text-xs text-text-tertiary">
            Teknisk detalj: {query.error.message}
          </p>
        ) : null}
      </div>
    );
  return (
    <Assembly
      projectId={projectId}
      state={query.data}
      editable={editable}
      roleKnown={members.isSuccess}
      cmds={cmds}
    />
  );
}

function fieldsOf(c: Composition) {
  return {
    name: c.name,
    width: c.width,
    height: c.height,
    durationFrames: c.durationFrames,
    background: c.background,
  };
}

function Assembly({
  projectId,
  state,
  editable,
  roleKnown,
  cmds,
}: {
  projectId: string;
  state: ProjectState;
  editable: boolean;
  roleKnown: boolean;
  cmds: Commands;
}) {
  const navigate = useNavigate();
  const productionId = mainProduction(state)?.id ?? Object.keys(state.productions)[0] ?? "";
  const clips = useMemo(() => filmClips(state, productionId), [state, productionId]);
  const duration = Math.max(1, filmDurationFrames(clips));
  const fps = state.project.fps;
  const playback = usePlayback(duration, fps, false);
  const images = useFilmImages(state, clips);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [follow, setFollow] = useStoredFlag("assembly-follow", true);
  const [exportOpen, setExportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelW, setPanelW] = useStoredPanel();

  const at = clipAtFrame(clips, playback.frame);
  // «Følg avspillingen»: valget følger scenen under avspillingshodet
  // (bare når hodet flyttes – ikke når klippene byttes om under et stillestående hode)
  useEffect(() => {
    if (follow && at && at.clip.occurrenceId !== selectedId) setSelectedId(at.clip.occurrenceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, playback.frame]);
  const selected =
    clips.find((c) => c.occurrenceId === selectedId) ?? (follow ? (at?.clip ?? null) : null);
  // Valgt scene forsvant (deaktivert eller fjernet av en annen)
  useEffect(() => {
    if (selectedId && !clips.some((c) => c.occurrenceId === selectedId)) setSelectedId(null);
  }, [clips, selectedId]);

  const run = useCallback(
    (command: Parameters<Commands["run"]>[0], label: string) => {
      const err = cmds.run(command, label);
      setError(err);
      return err === null;
    },
    [cmds],
  );

  // Etter en flytting: hodet følger den flyttede scenen (samme sted i scenen), så valget blir stående
  const pendingMove = useRef<{ id: string; offset: number } | null>(null);
  useEffect(() => {
    const pm = pendingMove.current;
    if (!pm) return;
    const c = clips.find((x) => x.occurrenceId === pm.id);
    if (!c) return;
    pendingMove.current = null;
    setSelectedId(c.occurrenceId);
    playback.setFrame(c.startFrame + Math.min(pm.offset, c.durationFrames - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips]);

  const moveTo = useCallback(
    (occurrenceId: string, index: number) => {
      const from = clips.findIndex((c) => c.occurrenceId === occurrenceId);
      if (from < 0) return;
      const rest = clips.filter((c) => c.occurrenceId !== occurrenceId);
      const to = index > from ? index - 1 : index;
      const before = rest[to - 1];
      const after = rest[to];
      const k = (id: string | undefined) => (id ? (state.occurrences[id]?.orderKey ?? null) : null);
      const clip = clips[from]!;
      const local = playback.frame - clip.startFrame;
      pendingMove.current = {
        id: occurrenceId,
        offset: local >= 0 && local < clip.durationFrames ? local : 0,
      };
      const ok = run(
        {
          type: "MoveOccurrence",
          occurrenceId: occurrenceId as never,
          orderKey: keyBetween(k(before?.occurrenceId), k(after?.occurrenceId)),
        },
        `Flytt scene ${clip.productionNumber ?? ""}`.trim(),
      );
      if (!ok) pendingMove.current = null;
    },
    [clips, state.occurrences, run, playback.frame],
  );

  const setDuration = useCallback(
    (occurrenceId: string, frames: number) => {
      const clip = clips.find((c) => c.occurrenceId === occurrenceId);
      const c = clip?.compositionId ? state.compositions[clip.compositionId] : undefined;
      if (!c) return;
      run(
        {
          type: "UpdateComposition",
          compositionId: c.id,
          fields: { ...fieldsOf(c), durationFrames: frames },
        },
        "Endre lengde på scene",
      );
    },
    [clips, state.compositions, run],
  );

  function createComposition(occurrenceId: string) {
    const clip = clips.find((c) => c.occurrenceId === occurrenceId);
    if (!clip) return;
    run(
      {
        type: "CreateComposition",
        compositionId: newId<"composition">(),
        variantId: clip.variantId,
        fields: {
          ...DEFAULT_COMPOSITION,
          width: state.project.frameWidth,
          height: state.project.frameHeight,
        },
      },
      "Ny 2D-scene",
    );
  }

  function deactivate(occurrenceId: string) {
    const i = clips.findIndex((c) => c.occurrenceId === occurrenceId);
    if (
      run(
        { type: "SetOccurrenceActive", occurrenceId: occurrenceId as never, active: false },
        "Deaktiver scene",
      )
    )
      setSelectedId(clips[i + 1]?.occurrenceId ?? clips[i - 1]?.occurrenceId ?? null);
  }

  const goToScene = useCallback(
    (index: number) => {
      const c = clips[Math.max(0, Math.min(clips.length - 1, index))];
      if (!c) return;
      setSelectedId(c.occurrenceId);
      playback.setFrame(c.startFrame);
    },
    [clips, playback],
  );

  const openInEditor = useCallback(
    (occurrenceId: string) =>
      void navigate({
        to: "/prosjekt/$projectId/scene",
        params: { projectId },
        search: { scene: occurrenceId },
      }),
    [navigate, projectId],
  );

  // Tastatur (UX: J/K/L-lignende transport, mellomrom, piler)
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Tastene virker med en gang siden er åpnet, og etter klikk i visningen eller tidslinjen
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);
  function onKeyDown(e: React.KeyboardEvent) {
    if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey) return;
    const f = playback.frame;
    const sec = Math.round(fps.num / fps.den);
    const idx = at?.index ?? 0;
    switch (e.key) {
      case " ":
      case "k":
      case "K":
        if (e.key === " " && (e.target as HTMLElement).closest("button,a,select")) return;
        e.preventDefault();
        playback.toggle();
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (e.altKey && selected && editable) {
          const i = clips.findIndex((c) => c.occurrenceId === selected.occurrenceId);
          if (i > 0) moveTo(selected.occurrenceId, i - 1);
        } else playback.setFrame(f - (e.shiftKey ? sec : 1));
        break;
      case "ArrowRight":
        e.preventDefault();
        if (e.altKey && selected && editable) {
          const i = clips.findIndex((c) => c.occurrenceId === selected.occurrenceId);
          if (i >= 0 && i < clips.length - 1) moveTo(selected.occurrenceId, i + 2);
        } else playback.setFrame(f + (e.shiftKey ? sec : 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        // Til starten av scenen, eller forrige scene hvis vi allerede står der
        goToScene(at && f === at.clip.startFrame ? idx - 1 : idx);
        break;
      case "ArrowDown":
        e.preventDefault();
        goToScene(idx + 1);
        break;
      case "Home":
        e.preventDefault();
        playback.setFrame(0);
        break;
      case "End":
        e.preventDefault();
        playback.setFrame(duration - 1);
        break;
      case "Enter":
        if (selected && !(e.target as HTMLElement).closest("button,a,select")) {
          e.preventDefault();
          openInEditor(selected.occurrenceId);
        }
        break;
    }
  }

  const withComposition = clips.filter((c) => c.source === "composition").length;
  const sceneLabel = at
    ? `Scene ${at.clip.productionNumber ?? at.index + 1} av ${clips.length}`
    : "Ingen scener";

  const toolbar = (
    <>
      <IconButton label="Til start (Home)" onClick={() => playback.setFrame(0)}>
        <SkipBack className="size-3.5" />
      </IconButton>
      <IconButton
        label="Forrige scene (pil opp)"
        onClick={() =>
          goToScene(at && playback.frame === at.clip.startFrame ? at.index - 1 : (at?.index ?? 0))
        }
      >
        <ChevronFirst className="size-3.5" />
      </IconButton>
      <IconButton
        label="Forrige bilde (pil venstre)"
        onClick={() => playback.setFrame(playback.frame - 1)}
      >
        <ChevronLeft className="size-3.5" />
      </IconButton>
      <button
        type="button"
        aria-label={playback.playing ? "Pause" : "Spill av"}
        title={playback.playing ? "Pause (mellomrom)" : "Spill av hele filmen (mellomrom)"}
        onClick={playback.toggle}
        className={iconButton + " bg-surface-3 text-text-primary"}
      >
        {playback.playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
      </button>
      <IconButton
        label="Neste bilde (pil høyre)"
        onClick={() => playback.setFrame(playback.frame + 1)}
      >
        <ChevronRight className="size-3.5" />
      </IconButton>
      <IconButton label="Neste scene (pil ned)" onClick={() => goToScene((at?.index ?? -1) + 1)}>
        <ChevronLast className="size-3.5" />
      </IconButton>
      <IconButton label="Til slutt (End)" onClick={() => playback.setFrame(duration - 1)}>
        <SkipForward className="size-3.5" />
      </IconButton>
      <IconButton
        label="Løkke"
        active={playback.loop}
        onClick={() => playback.setLoop(!playback.loop)}
      >
        <Repeat className="size-3.5" />
      </IconButton>
      <span
        className="shrink-0 whitespace-nowrap px-1 font-mono text-xs tabular-nums text-text-primary"
        aria-label="Tid i filmen"
      >
        {formatTimecode(playback.frame, fps)}
        <span className="text-text-tertiary">
          {" "}
          / {formatTimecode(filmDurationFrames(clips), fps)}
        </span>
      </span>
      <span className="truncate text-xs text-text-tertiary">{sceneLabel}</span>
    </>
  );

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerDownCapture={(e) => {
        const t = e.target as HTMLElement;
        if (!isTypingTarget(t) && !t.closest("button,a,select,[role=dialog]"))
          rootRef.current?.focus({ preventScroll: true });
      }}
      className="flex min-h-0 flex-1 flex-col outline-none"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-surface-2 px-3">
        <span className="text-[13px] font-medium text-text-primary">Montering</span>
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
        <span className="ml-2 truncate text-xs text-text-tertiary">
          {clips.length} {clips.length === 1 ? "scene" : "scener"} ·{" "}
          {formatSeconds(framesToSeconds(filmDurationFrames(clips), fps))} · {withComposition} med
          2D-scene
        </span>
        <div className="ml-auto flex items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setExportOpen(true)}
            disabled={clips.length === 0}
            title="Lag en video av filmen eller et utvalg av scener"
          >
            <Download />
            Eksporter animatic
          </Button>
          <SaveIndicator cmds={cmds} />
          {roleKnown && !editable ? (
            <span className="text-xs text-text-tertiary">Bare lesetilgang</span>
          ) : null}
        </div>
      </div>
      {error ? (
        <p
          role="alert"
          className="shrink-0 border-b border-border px-3 py-1 text-xs text-status-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col bg-surface-0 p-3">
          <FilmViewer state={state} clips={clips} frame={playback.frame} tick={images.tick} />
        </main>
        <aside
          aria-label="Scene og manus"
          style={{ width: panelW }}
          className="relative flex shrink-0 flex-col border-l border-border bg-surface-1"
        >
          <PaneResizer
            edge="left"
            size={panelW}
            onSize={setPanelW}
            min={260}
            max={620}
            label="Bredde på scenepanelet"
          />
          <ClipPanel
            state={state}
            projectId={projectId}
            clip={selected}
            clipCount={clips.length}
            editable={editable}
            follow={follow}
            onFollowChange={setFollow}
            onDuration={(frames) => selected && setDuration(selected.occurrenceId, frames)}
            onEstimate={() => selected && setDuration(selected.occurrenceId, 0)}
            onCreateComposition={() => selected && createComposition(selected.occurrenceId)}
            onDeactivate={() => selected && deactivate(selected.occurrenceId)}
          />
        </aside>
      </div>

      <FilmTimeline
        state={state}
        clips={clips}
        durationFrames={duration}
        frame={playback.frame}
        playing={playback.playing}
        onFrame={playback.setFrame}
        selectedId={selected?.occurrenceId ?? null}
        onSelect={(id) => {
          setSelectedId(id);
          // Et valg mens man står stille slår ikke av «Følg avspillingen», men hodet flyttes til scenen
        }}
        onOpen={openInEditor}
        editable={editable}
        onMove={moveTo}
        onDuration={setDuration}
        tick={images.tick}
        toolbar={toolbar}
      />

      <ExportAnimaticDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        state={state}
        productionId={productionId}
        clips={clips}
        selectedId={selected?.occurrenceId ?? null}
        urls={images.urls}
      />
    </div>
  );
}

function useStoredPanel() {
  return usePaneSize("assembly-panel", 340, 260, 620);
}
