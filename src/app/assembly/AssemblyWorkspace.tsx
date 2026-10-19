import { Toolbar, ToolbarButton, ToolbarSeparator, IconButton as ChromeIconButton } from "@/app/shell/workspace-chrome";
/**
 * Montering (M4 del 1, mandat kap. 15, DEC-0043): den samlede filmen – alle aktive scener i manusets
 * rekkefølge, med 2D-scenene som materiale og tittelkort der 2D-scenen mangler. Forhåndsvis hele filmen,
 * flytt scener (speiles i manuset), juster lengder og eksporter animatic.
 * M4 del 2 (DEC-0044): lydspor med dialog, forteller, effekter, atmosfære og musikk. Lyden spilles og
 * eksporteres også der animasjonen ikke er laget.
 */
import { SubtitleDialog } from "./SubtitleDialog";
import { FilmLanguagePicker, useFilmLanguage } from "./use-film-language";
import { LanguageVersionDialog } from "./LanguageVersionDialog";
import { ProductionPicker, useActiveProduction } from "@/app/project/use-production";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Download,
  Music,
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
  discrepancies,
  AUDIO_MAX_MS,
  STILL_MAX_MS,
  stillMediaPaths,
  DEFAULT_COMPOSITION,
  blocksOfVariant,
  editableParts,
  splitParts,
  trimPart,
  audioClipFieldsOf,
  audioVersion,
  clipAtFrame,
  filmAudio,
  filmMediaPaths,
  filmTakeAudio,
  filmClips,
  blockSpans,
  filmDurationFrames,
  formatTimecode,
  framesToSeconds,
  keyBetween,
  isSharedIn,
  newId,
  ownCopyCommands,
  type AudioClipFields,
  type AudioKind,
  type ClipPartFields,
  type ExportSettings,
  type FilmClip,
  type Composition,
  type ProjectState,
  MAIN_LANGUAGE,
  cueAt,
  languageState,
  subtitleCues,
  L,
  locale,
  tm,
} from "@/core";
import { useImageUrls } from "@/app/library/asset-images";
import { useFilmVideo } from "./film-video";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
import { uploadFilm } from "./film-import";
import { LongFilmImportDialog } from "./LongFilmImportDialog";
import { useAudioLoaded, useAudioPlayback } from "@/app/audio/use-audio-playback";
import { AudioTracks, type AudioChange } from "./AudioTracks";
import { AudioClipPanel } from "./AudioClipPanel";
import { AddAudioDialog } from "./AddAudioDialog";
import { AudioClipEditor } from "@/app/audio/AudioClipEditor";
import { canEdit, useMembers, useProjectState } from "@/app/project/use-project";
import { useCommands, type Commands } from "@/app/project/use-commands";
import { SaveIndicator } from "@/app/script/ScriptWorkspace";
import { Button } from "@/components/ui/button";
import { PaneResizer, usePaneSize, useStoredFlag } from "@/app/shell/pane-size";
import { usePlayback } from "@/app/scene-editor/use-playback";
import { IconButton, iconButton, isTypingTarget } from "@/app/scene-editor/Timeline";
import { useFilmImages } from "./film-images";
import { FilmViewer } from "./FilmViewer";
import { GenerateSceneDialog } from "./GenerateSceneDialog";
import { BatchVideoDialog } from "./BatchVideoDialog";
import { AiDialogueDialog } from "./AiDialogueDialog";
import { FilmTimeline, formatSeconds } from "./FilmTimeline";
import { ClipPanel } from "./ClipPanel";
import { FilmPopout } from "./FilmPopout";
import { TransitionEditor } from "./TransitionEditor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExportAnimaticDialog } from "./ExportAnimaticDialog";
import { rememberScene } from "@/app/shell/current-scene";
import { AssemblyMoreMenu, AssemblyTextMenu, AssemblyViewMenu } from "./AssemblyToolbarMenus";
import { createKindScene } from "./mts-occurrences";
import { ShortcutsButton, ShortcutsDialog } from "@/app/shortcuts/ShortcutsDialog";
import { isShortcutHelpKey } from "@/app/shortcuts/shortcut-list";

/** Scene og blokk som skal vises når monteringen åpnes (fra manuset). */
export interface AssemblyFocus {
  readonly occurrenceId: string;
  readonly blockId: string | null;
  /** Åpne nedlastingen av scenen med en gang (fra sceneeditoren, DEC-0085). */
  readonly download?: boolean;
}

export function AssemblyWorkspace({
  projectId,
  userId,
  focus = null,
}: {
  projectId: string;
  userId: string;
  focus?: AssemblyFocus | null;
}) {
  const query = useProjectState(projectId);
  const members = useMembers(projectId);
  const role = members.data?.find((m) => m.user_id === userId)?.role;
  const editable = canEdit(role);
  const cmds = useCommands(projectId, userId, editable);
  if (query.isLoading)
    return (
      <p className="p-6 text-[13px] text-text-tertiary">
        {L("Henter filmen …", "Loading the film …")}
      </p>
    );
  if (query.isError || !query.data)
    return (
      <div role="alert" className="p-6 text-[13px] text-status-danger">
        {L("Filmen kunne ikke hentes.", "The film could not be loaded.")}
        {query.error ? (
          <p className="mt-2 font-mono text-xs text-text-tertiary">
            {L("Teknisk detalj:", "Technical detail:")} {query.error.message}
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
      focus={focus}
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
  focus,
}: {
  projectId: string;
  state: ProjectState;
  editable: boolean;
  roleKnown: boolean;
  cmds: Commands;
  focus: AssemblyFocus | null;
}) {
  const navigate = useNavigate();
  // Valgt produksjon (DEC-0057): hovedfilm eller avledet produksjon
  const [productionId, setProductionId] = useActiveProduction(
    projectId,
    state,
    focus?.occurrenceId ?? null,
  );
  // Språkversjon (DEC-0059): dialogspråket bestemmer lyden og språkavhengige bilder i visningen,
  // avspillingen og eksporten. Endringer gjøres alltid på den egentlige tilstanden.
  const [filmLang, setFilmLang] = useFilmLanguage(projectId);
  const view = useMemo(() => languageState(state, filmLang.dialogue), [state, filmLang.dialogue]);
  const clips = useMemo(() => filmClips(view, productionId), [view, productionId]);
  const subtitleList = useMemo(
    () => (filmLang.subtitles ? subtitleCues(view, productionId, filmLang.subtitles).cues : []),
    [view, productionId, filmLang.subtitles],
  );
  const [languageOpen, setLanguageOpen] = useState(false);
  // Avvik ved manusendring: berørte tidsrom per scene (DEC-0054)
  const flagged = useMemo(() => {
    const m = new Map<string, { startFrame: number; endFrame: number }[]>();
    for (const d of discrepancies(state, clips)) {
      const list = m.get(d.occurrenceId) ?? [];
      for (const sp of d.spans)
        if (!list.some((x) => x.startFrame === sp.startFrame && x.endFrame === sp.endFrame))
          list.push(sp);
      m.set(d.occurrenceId, list);
    }
    return m;
  }, [state, clips]);
  const duration = Math.max(1, filmDurationFrames(clips));
  const fps = state.project.fps;
  const playback = usePlayback(duration, fps, false);
  const images = useFilmImages(view, clips);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => rememberScene(projectId, selectedId, state.occurrences[selectedId ?? ""]?.sceneId ?? null), [projectId, selectedId, state.occurrences]);
  const [follow, setFollow] = useStoredFlag("assembly-follow", true);
  // Hele filmen i svart-hvitt (visning; foreslås i eksporten, REQ-0573)
  const [monochrome, setMonochrome] = useStoredFlag("assembly-monochrome", false);
  // Teknisk visning (DEC-0072, REQ-0103): tidskoder og filinformasjon i scenepanelet
  const [technical, setTechnical] = useStoredFlag("assembly-technical", false);
  // Lagrede eksportinnstillinger krever migrasjon 0027
  const schema27 = useSchemaAtLeast(27);
  const [popout, setPopout] = useState(false);
  /** «Hurtigtaster»-oversikten (DEC-0078). */
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [standardOpen, setStandardOpen] = useState(false);
  const [subtitlesOpen, setSubtitlesOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelW, setPanelW] = useStoredPanel();

  // ---------- Lyd (DEC-0044) ----------
  const audioItems = useMemo(
    () => filmAudio(view, clips, fps, filmLang.dialogue),
    [view, clips, fps, filmLang.dialogue],
  );
  // Det som høres: lydklippene og lyden i importert film som er tatt i bruk (DEC-0047)
  const playItems = useMemo(
    () => [...audioItems, ...filmTakeAudio(clips, fps)],
    [audioItems, clips, fps],
  );
  const audioPaths = useMemo(
    () => [...new Set(playItems.flatMap((it) => (it.version ? [it.version.mediaPath] : [])))],
    [playItems],
  );
  // ---------- Importert film (DEC-0047) ----------
  const filmPaths = useMemo(() => filmMediaPaths(clips), [clips]);
  const filmUrls = useImageUrls(filmPaths);
  const audioUrls = useImageUrls(audioPaths);
  const [mutedKinds, setMutedKinds] = useState<ReadonlySet<AudioKind>>(new Set());
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
  const selectedAudio = selectedAudioId ? state.audioClips[selectedAudioId] : undefined;
  const audioLoaded = useAudioLoaded();
  const stillPaths = useMemo(() => stillMediaPaths(clips), [clips]);
  const filmVideo = useFilmVideo(filmUrls.data ?? null, playback.playing, stillPaths);
  useAudioPlayback({
    items: playItems,
    urls: audioUrls.data ?? null,
    playing: playback.playing,
    time: framesToSeconds(playback.frame, fps),
    mutedKinds,
  });
  const [addAudio, setAddAudio] = useState<AudioKind | null>(null);
  const [longFilm, setLongFilm] = useState(false);
  /** «Generer scene» (DEC-0053). */
  const [generateOpen, setGenerateOpen] = useState(false);
  /** Video for flere scener (DEC-0070). */
  const [batchOpen, setBatchOpen] = useState(false);
  /** Dialog med AI-stemmer (DEC-0071). */
  const [dialogueOpen, setDialogueOpen] = useState(false);
  useEffect(() => {
    if (selectedAudioId && (!selectedAudio || selectedAudio.removed)) setSelectedAudioId(null);
  }, [selectedAudioId, selectedAudio]);

  const at = clipAtFrame(clips, playback.frame);
  const subtitle = filmLang.subtitles
    ? (cueAt(subtitleList, framesToSeconds(playback.frame, fps) * 1000)?.text ?? null)
    : null;
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

  // Åpnet fra manuset (DEC-0049, REQ-0092/0099): avspillingshodet til scenen eller replikken
  const focused = useRef<string | null>(null);
  useEffect(() => {
    if (!focus) return;
    const key = `${focus.occurrenceId}:${focus.blockId ?? ""}`;
    if (focused.current === key) return;
    const clip = clips.find((c) => c.occurrenceId === focus.occurrenceId);
    if (!clip) {
      // Prøves igjen hvis klippene endres (f.eks. når siste versjon er hentet)
      setError(
        L(
          "Scenen er ikke med i filmen (den er deaktivert eller hører til en spinoff).",
          "The scene is not in the film (it is deactivated or belongs to a spin-off).",
        ),
      );
      return;
    }
    focused.current = key;
    setError(null);
    const span = focus.blockId
      ? blockSpans(state, clip).find((x) => x.blockId === focus.blockId)
      : undefined;
    setSelectedId(clip.occurrenceId);
    playback.setFrame(span ? span.startFrame : clip.startFrame);
    if (focus.download) setExportOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.occurrenceId, focus?.blockId, clips.length]);

  const run = useCallback(
    (command: Parameters<Commands["run"]>[0], label: string, group?: string) => {
      const err = cmds.run(command, label, group);
      setError(err);
      return err === null;
    },
    [cmds],
  );

  /** Importer ferdig film til scenen og ta den i bruk (DEC-0047). Returnerer feilmelding eller null. */
  const importFilm = useCallback(
    async (occurrenceId: string, file: File): Promise<string | null> => {
      try {
        const f = await uploadFilm(projectId, file, fps);
        // Importen og «ta i bruk» angres som ett steg (DEC-0049)
        const group = newId();
        const label = `${L("Importer film", "Import film")} «${f.media.fileName}»`;
        const r = await cmds.runAndWait(
          {
            type: "AddTake",
            takeId: f.takeId as never,
            occurrenceId: occurrenceId as never,
            segmentId: null,
            kind: "imported_film",
            status: "approved",
            durationFrames: f.durationFrames,
            mediaRef: f.mediaRef,
            media: f.media,
          },
          label,
          group,
        );
        if (r.error) return r.error;
        // Tas i bruk som hele versjonen (eventuelle kutt i scenen fjernes; de kan angres)
        const err = cmds.run(
          {
            type: "SetSceneEdit",
            occurrenceId: occurrenceId as never,
            activeTakeId: f.takeId as never,
            parts: [],
          },
          label,
          group,
        );
        return err === null
          ? null
          : L(
              "Filmen er lagret som versjon, men kunne ikke tas i bruk.",
              "The film was saved as a version, but could not be put into use.",
            );
      } catch (e) {
        return (
          (e as Error).message ||
          L("Filmen kunne ikke importeres.", "The film could not be imported.")
        );
      }
    },
    [projectId, fps, cmds],
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
        `${L("Flytt scene", "Move scene")} ${clip.productionNumber ?? ""}`.trim(),
      );
      if (!ok) pendingMove.current = null;
    },
    [clips, state.occurrences, run, playback.frame],
  );

  // ---------- Klipping (DEC-0048) ----------
  /** Lengste mulige utpunkt (ms) for en del: filmens lengde eller 2D-scenens lengde. */
  const maxMsOf = useCallback(
    (clip: FilmClip, takeId: string | null) => {
      if (takeId)
        return state.takes[takeId]?.kind === "still"
          ? STILL_MAX_MS
          : (state.takes[takeId]?.media?.durationMs ?? AUDIO_MAX_MS);
      const comp = clip.compositionId ? state.compositions[clip.compositionId] : undefined;
      return comp && comp.durationFrames > 0
        ? Math.round(framesToSeconds(comp.durationFrames, fps) * 1000)
        : AUDIO_MAX_MS;
    },
    [state.takes, state.compositions, fps],
  );
  const editScene = useCallback(
    (
      occurrenceId: string,
      parts: readonly ClipPartFields[],
      label: string,
      takeId?: string | null,
    ) => {
      const o = state.occurrences[occurrenceId];
      if (!o) return false;
      return run(
        {
          type: "SetSceneEdit",
          occurrenceId: o.id,
          activeTakeId: (takeId === undefined ? o.activeTakeId : takeId) as never,
          parts,
        },
        label,
      );
    },
    [state.occurrences, run],
  );
  const splitAtPlayhead = useCallback(() => {
    const a = clipAtFrame(clips, playback.frame);
    if (!a) return;
    const parts = splitParts(a.clip, playback.frame - a.clip.startFrame, fps, () => newId());
    if (!parts) {
      setError(
        a.clip.source === "placeholder"
          ? L(
              "Et tittelkort kan ikke splittes. Lag en 2D-scene eller importer film først.",
              "A title card cannot be split. Create a 2D scene or import a film first.",
            )
          : L(
              "Avspillingshodet står på en grense mellom deler – flytt det litt og prøv igjen.",
              "The playhead is on a boundary between parts – move it a little and try again.",
            ),
      );
      return;
    }
    editScene(a.clip.occurrenceId, parts, L("Splitt klipp", "Split clip"));
  }, [clips, playback.frame, fps, editScene]);

  // ---------- Tidskoblinger for manus (DEC-0048) ----------
  /** «Synk replikker»: T setter tiden for blokken som står for tur, og går videre til neste. */
  const [sync, setSync] = useState<{ occurrenceId: string; blockId: string } | null>(null);
  const linkBlock = useCallback(
    (occurrenceId: string, blockId: string, ms: number, mode: "replace" | "add") => {
      // Hendelser i 2D-scenen (med lag) flyttes ikke herfra
      const existing = Object.values(state.timeLinks).filter(
        (l) => !l.removed && !l.layerId && l.occurrenceId === occurrenceId && l.blockId === blockId,
      );
      const fields = {
        occurrenceId: occurrenceId as never,
        blockId: blockId as never,
        startMs: Math.max(0, Math.round(ms)),
        endMs: null,
      };
      if (mode === "replace" && existing.length > 0) {
        const first = existing.sort((a, b) => a.startMs - b.startMs)[0]!;
        return run(
          { type: "UpdateTimeLinks", links: [{ linkId: first.id, fields }] },
          L("Flytt tidskobling", "Move time link"),
        );
      }
      return run(
        { type: "AddTimeLinks", links: [{ linkId: newId() as never, fields }] },
        L("Koble replikk til tid", "Link line to time"),
      );
    },
    [state.timeLinks, run],
  );
  const removeLink = useCallback(
    (linkId: string) =>
      run(
        { type: "SetTimeLinksRemoved", linkIds: [linkId as never], removed: true },
        L("Fjern tidskobling", "Remove time link"),
      ),
    [run],
  );
  const stampSync = useCallback(() => {
    if (!sync) return;
    const c = clips.find((x) => x.occurrenceId === sync.occurrenceId);
    if (!c) return;
    const local = playback.frame - c.startFrame;
    if (local < 0 || local >= c.durationFrames) {
      setError(
        L(
          "Avspillingshodet er utenfor scenen du synker. Gå tilbake til scenen og prøv igjen.",
          "The playhead is outside the scene you are syncing. Go back to the scene and try again.",
        ),
      );
      return;
    }
    if (!linkBlock(c.occurrenceId, sync.blockId, framesToSeconds(local, fps) * 1000, "replace"))
      return;
    // Neste replikk eller handling i scenen
    const blocks = blocksOfVariant(state, c.variantId).filter(
      (b) => b.kind === "dialogue" || b.kind === "action" || b.kind === "shot",
    );
    const i = blocks.findIndex((b) => b.id === sync.blockId);
    const next = blocks[i + 1];
    setSync(next ? { occurrenceId: c.occurrenceId, blockId: next.id } : null);
  }, [sync, clips, playback.frame, fps, linkBlock, state]);

  /**
   * Scenen deles med hovedfilmen i en avledet produksjon (DEC-0057): lag egen versjon (og kopi av 2D-scenen)
   * først, så hovedfilmen ikke endres. null = ikke nødvendig; false = feilet.
   */
  const ownFirst = useCallback(
    (occurrenceId: string) => {
      const o = state.occurrences[occurrenceId];
      if (!o || !isSharedIn(state, o.productionId, o.variantId)) return null;
      const commands = ownCopyCommands(state, o.id) ?? [];
      const group = newId();
      for (const c of commands)
        if (!run(c, L("Egen versjon av scenen", "Own version of the scene"), group)) return false;
      const fork = commands.find((c) => c.type === "ForkVariant");
      const comp = commands.find((c) => c.type === "CreateComposition");
      return {
        group,
        variantId: fork?.type === "ForkVariant" ? (fork.newVariantId as string) : o.variantId,
        compositionId: comp?.type === "CreateComposition" ? (comp.compositionId as string) : null,
      };
    },
    [state, run],
  );

  const setDuration = useCallback(
    (occurrenceId: string, frames: number) => {
      const clip = clips.find((c) => c.occurrenceId === occurrenceId);
      // Kuttet klipp eller importert film: flytt utpunktet til den siste delen
      if (clip && (clip.edited || clip.source === "film")) {
        const parts = editableParts(clip, () => newId());
        if (!parts) return;
        const i = parts.length - 1;
        const last = parts[i]!;
        const delta = Math.round(((frames - clip.durationFrames) * 1000 * fps.den) / fps.num);
        editScene(
          occurrenceId,
          trimPart(parts, i, { outMs: last.outMs + delta }, maxMsOf(clip, last.takeId)),
          L("Kutt slutten av klippet", "Trim the end of the clip"),
        );
        return;
      }
      const c = clip?.compositionId ? state.compositions[clip.compositionId] : undefined;
      if (!c) return;
      // 2D-scenen deles med hovedfilmen i en avledet produksjon: egen kopi først (DEC-0057)
      const own = ownFirst(occurrenceId);
      if (own === false) return;
      run(
        {
          type: "UpdateComposition",
          compositionId: (own?.compositionId ?? c.id) as never,
          fields: { ...fieldsOf(c), durationFrames: frames },
        },
        L("Endre lengde på scene", "Change scene length"),
        own?.group,
      );
    },
    [clips, state.compositions, run, fps, editScene, maxMsOf, ownFirst],
  );

  /** Ny plassering fra tidslinjen: lyden festes til scenen den starter i (mandat 6.4). */
  const changeAudio = useCallback(
    (clipId: string, ch: AudioChange) => {
      const a = state.audioClips[clipId];
      if (!a) return;
      // Kutt beholder scenen så lenge lyden fortsatt starter i den; bare flytting fester den på nytt
      const own = clips.find((c) => c.occurrenceId === a.occurrenceId);
      const ownStart = own ? framesToSeconds(own.startFrame, fps) : null;
      const keep = ch.mode !== "move" && ownStart !== null && ch.start >= ownStart - 1e-6;
      const at2 = keep
        ? { clip: own! }
        : clipAtFrame(clips, Math.floor(ch.start * (fps.num / fps.den) + 1e-6));
      if (!at2) return;
      const sceneStart = framesToSeconds(at2.clip.startFrame, fps);
      const moved = at2.clip.occurrenceId !== a.occurrenceId;
      const block = a.blockId ? state.blocks[a.blockId] : undefined;
      const fields: AudioClipFields = {
        ...audioClipFieldsOf(a),
        occurrenceId: at2.clip.occurrenceId,
        // Kutt i slutten: start og start i filen er uendret (ingen avrunding)
        offsetMs:
          keep && ch.mode === "out"
            ? a.offsetMs
            : Math.max(0, Math.round((ch.start - sceneStart) * 1000)),
        sourceInMs:
          keep && ch.mode === "out" ? a.sourceInMs : Math.max(0, Math.round(ch.sourceIn * 1000)),
        lengthMs: Math.max(1, Math.round(ch.length * 1000)),
        // Replikken hører til en annen scene enn den lyden flyttes til: koblingen tas bort
        blockId: block && block.variantId === at2.clip.variantId ? a.blockId : null,
      };
      run(
        { type: "UpdateAudioClips", clips: [{ clipId: a.id, fields }] },
        moved
          ? L("Flytt lyd til annen scene", "Move audio to another scene")
          : L("Flytt eller kutt lyd", "Move or trim audio"),
      );
    },
    [state.audioClips, state.blocks, clips, fps, run],
  );

  function patchAudioClip(clipId: string, label: string, patch: Partial<AudioClipFields>) {
    const a = state.audioClips[clipId];
    if (!a) return;
    run(
      {
        type: "UpdateAudioClips",
        clips: [{ clipId: a.id, fields: { ...audioClipFieldsOf(a), ...patch } }],
      },
      label,
    );
  }
  function patchAudio(label: string, patch: Partial<AudioClipFields>) {
    if (selectedAudio) patchAudioClip(selectedAudio.id, label, patch);
  }
  /** Lydprofilen som er åpen (DEC-0045). */
  const [profileId, setProfileId] = useState<string | null>(null);
  const profileClip = profileId ? (state.audioClips[profileId] ?? null) : null;
  const profileScene = profileClip
    ? clips.find((c) => c.occurrenceId === profileClip.occurrenceId)
    : undefined;
  const profileVersion = profileClip ? audioVersion(state, profileClip) : null;

  function removeAudio(clipId: string) {
    if (
      run(
        { type: "SetAudioClipsRemoved", clipIds: [clipId as never], removed: true },
        L("Fjern lyd", "Remove audio"),
      )
    )
      setSelectedAudioId(null);
  }

  function createComposition(occurrenceId: string) {
    const clip = clips.find((c) => c.occurrenceId === occurrenceId);
    if (!clip) return;
    const own = ownFirst(occurrenceId);
    if (own === false) return;
    run(
      {
        type: "CreateComposition",
        compositionId: newId<"composition">(),
        variantId: (own?.variantId ?? clip.variantId) as never,
        fields: {
          ...DEFAULT_COMPOSITION,
          width: state.project.frameWidth,
          height: state.project.frameHeight,
        },
      },
      L("Ny 2D-scene", "New 2D scene"),
      own?.group,
    );
  }

  function deactivate(occurrenceId: string) {
    const i = clips.findIndex((c) => c.occurrenceId === occurrenceId);
    if (
      run(
        { type: "SetOccurrenceActive", occurrenceId: occurrenceId as never, active: false },
        L("Deaktiver scene", "Deactivate scene"),
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
    // Taster fra dialoger (portaler) bobler hit i React, men hører ikke til arbeidsflaten
    if (!(e.currentTarget as Node).contains(e.target as Node)) return;
    const f = playback.frame;
    const sec = Math.round(fps.num / fps.den);
    const idx = at?.index ?? 0;
    if (isShortcutHelpKey(e)) {
      e.preventDefault();
      setShortcutsOpen(true);
      return;
    }
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
      case "Delete":
      case "Backspace":
        if (selectedAudio && editable) {
          e.preventDefault();
          removeAudio(selectedAudio.id);
        }
        break;
      case "s":
      case "S":
        if (editable) {
          e.preventDefault();
          splitAtPlayhead();
        }
        break;
      case "t":
      case "T":
        if (editable && sync) {
          e.preventDefault();
          stampSync();
        }
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
    ? `${L("Scene", "Scene")} ${at.clip.productionNumber ?? at.index + 1} ${L("av", "of")} ${clips.length}`
    : L("Ingen scener", "No scenes");

  const toolbar = (
    <>
      <IconButton
        label={L("Til start av filmen (Home)", "To the start of the film (Home)")}
        onClick={() => playback.setFrame(0)}
      >
        <SkipBack className="size-3.5" />
      </IconButton>
      <IconButton
        label={L("Forrige scene (pil opp)", "Previous scene (up arrow)")}
        onClick={() =>
          goToScene(at && playback.frame === at.clip.startFrame ? at.index - 1 : (at?.index ?? 0))
        }
      >
        <ChevronFirst className="size-3.5" />
      </IconButton>
      <IconButton
        label={L("Forrige bilde (pil venstre)", "Previous frame (left arrow)")}
        onClick={() => playback.setFrame(playback.frame - 1)}
      >
        <ChevronLeft className="size-3.5" />
      </IconButton>
      <button
        type="button"
        aria-label={playback.playing ? "Pause" : L("Spill av", "Play")}
        title={
          playback.playing
            ? L("Pause (mellomrom eller K)", "Pause (space or K)")
            : L("Spill av hele filmen (mellomrom eller K)", "Play the whole film (space or K)")
        }
        onClick={playback.toggle}
        className={iconButton + " bg-surface-3 text-text-primary"}
      >
        {playback.playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
      </button>
      <IconButton
        label={L("Neste bilde (pil høyre)", "Next frame (right arrow)")}
        onClick={() => playback.setFrame(playback.frame + 1)}
      >
        <ChevronRight className="size-3.5" />
      </IconButton>
      <IconButton
        label={L("Neste scene (pil ned)", "Next scene (down arrow)")}
        onClick={() => goToScene((at?.index ?? -1) + 1)}
      >
        <ChevronLast className="size-3.5" />
      </IconButton>
      <IconButton
        label={L("Til slutten av filmen (End)", "To the end of the film (End)")}
        onClick={() => playback.setFrame(duration - 1)}
      >
        <SkipForward className="size-3.5" />
      </IconButton>
      <IconButton
        label={L("Spill i løkke", "Loop playback")}
        active={playback.loop}
        onClick={() => playback.setLoop(!playback.loop)}
      >
        <Repeat className="size-3.5" />
      </IconButton>
      <span
        className="shrink-0 whitespace-nowrap px-1 font-mono text-xs tabular-nums text-text-primary"
        aria-label={L("Tid i filmen", "Time in the film")}
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
      <Toolbar>
        <span className="text-[13px] font-medium text-text-primary">
          {L("Montering", "Assembly")}
        </span>
        <ProductionPicker state={state} value={productionId} onChange={setProductionId} />
        <FilmLanguagePicker value={filmLang} onChange={setFilmLang} compact />
        <ToolbarSeparator />
        <ChromeIconButton
          onClick={cmds.undo}
          shortcut="⌘Z"
          disabled={!cmds.canUndo}
          title={
            cmds.undoLabel
              ? `${L("Angre", "Undo")}: ${cmds.undoLabel} (⌘Z)`
              : L("Angre (⌘Z)", "Undo (⌘Z)")
          }
          label={
            cmds.undoLabel ? `${L("Angre", "Undo")}: ${cmds.undoLabel}` : L("Angre", "Undo")
          }
        >
          <Undo2 />
        </ChromeIconButton>
        <ChromeIconButton
          onClick={cmds.redo}
          shortcut="⇧⌘Z"
          disabled={!cmds.canRedo}
          title={
            cmds.redoLabel
              ? `${L("Gjør om", "Redo")}: ${cmds.redoLabel} (⇧⌘Z)`
              : L("Gjør om (⇧⌘Z)", "Redo (⇧⌘Z)")
          }
          label={
            cmds.redoLabel ? `${L("Gjør om", "Redo")}: ${cmds.redoLabel}` : L("Gjør om", "Redo")
          }
        >
          <Redo2 />
        </ChromeIconButton>
        {/* Antall og lengde uten avkutting; resten står i verktøytipset. Smalere enn 1600 px vises det samme i
            transportlinjen («Scene 1 av 13», samlet tid), så etiketten skjules der (DEC-0076 funn 5) */}
        <span
          className="ml-1 hidden shrink-0 whitespace-nowrap text-xs tabular-nums text-text-tertiary min-[1600px]:inline"
          title={`${clips.length} ${clips.length === 1 ? L("scene", "scene") : L("scener", "scenes")} · ${formatSeconds(
            framesToSeconds(filmDurationFrames(clips), fps),
          )} · ${withComposition} ${L("med 2D-scene", "with 2D scene")}`}
        >
          {clips.length} {clips.length === 1 ? L("scene", "scene") : L("scener", "scenes")} ·{" "}
          {formatSeconds(framesToSeconds(filmDurationFrames(clips), fps))}
        </span>
        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-1.5">
          {editable ? (
            <ToolbarButton
              variant="default"
              className="shrink-0"
              onClick={() => setAddAudio("dialogue")}
              disabled={clips.length === 0}
              title={L("Legg til lyd ved avspillingshodet", "Add audio at the playhead")}
            >
              <Music aria-hidden />
              <span className="sr-only min-[1400px]:not-sr-only">
                {L("Legg til lyd", "Add audio")}
              </span>
            </ToolbarButton>
          ) : null}
          <ToolbarButton
            variant="primary"
            className="shrink-0"
            onClick={() => setExportOpen(true)}
            disabled={clips.length === 0}
            title={L(
              "Lag en video av filmen eller et utvalg av scener",
              "Make a video of the film or a selection of scenes",
            )}
            aria-label={L("Eksporter animatic", "Export animatic")}
          >
            <Download aria-hidden />
            <span>
              {L("Eksporter", "Export")}
              <span className="hidden min-[1400px]:inline"> animatic</span>
            </span>
          </ToolbarButton>
          <AssemblyMoreMenu
            editable={editable}
            hasClips={clips.length > 0}
            onStandardTransition={() => setStandardOpen(true)}
            onLongFilm={() => setLongFilm(true)}
            onBatchVideo={() => setBatchOpen(true)}
            onLanguage={() => setLanguageOpen(true)}
            onSubtitles={() => setSubtitlesOpen(true)}
          />
          {editable ? (
            <AssemblyTextMenu
              onCreate={(kind) => {
                const r = createKindScene(cmds.run, state, productionId, kind);
                if (r.error) setError(r.error);
                else if (r.occurrenceId)
                  void navigate({
                    to: "/prosjekt/$projectId/scene",
                    params: { projectId },
                    search: { scene: r.occurrenceId },
                  });
              }}
            />
          ) : null}
          <AssemblyViewMenu
            monochrome={monochrome}
            onMonochrome={setMonochrome}
            technical={technical}
            onTechnical={setTechnical}
            popout={popout}
            onPopout={setPopout}
            hasClips={clips.length > 0}
          />
          <ShortcutsButton onClick={() => setShortcutsOpen(true)} />
          <ToolbarSeparator />
          <SaveIndicator cmds={cmds} />
          {roleKnown && !editable ? (
            <span className="text-xs text-text-tertiary">
              {L("Bare lesetilgang", "Read-only access")}
            </span>
          ) : null}
        </div>
      </Toolbar>
      {error ? (
        <p
          role="alert"
          className="shrink-0 border-b border-border px-3 py-1 text-xs text-status-danger"
        >
          {tm(error)}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col bg-surface-0 p-3">
          <FilmViewer
            state={view}
            clips={clips}
            frame={playback.frame}
            tick={images.tick + filmVideo.tick}
            video={filmVideo.provider}
            onDrawn={filmVideo.settle}
            monochrome={monochrome}
            subtitle={subtitle}
          />
          {popout ? (
            <FilmPopout
              state={view}
              clips={clips}
              frame={playback.frame}
              tick={images.tick + filmVideo.tick}
              video={filmVideo.provider}
              monochrome={monochrome}
              subtitle={subtitle}
              onClose={() => setPopout(false)}
              onBlocked={() => {
                setPopout(false);
                setError(
                  L(
                    "Nettleseren stoppet det egne vinduet. Tillat sprettoppvinduer for siden.",
                    "The browser blocked the separate window. Allow pop-ups for this site.",
                  ),
                );
              }}
              onTogglePlay={playback.toggle}
            />
          ) : null}
        </main>
        <aside
          aria-label={L("Scene og manus", "Scene and script")}
          style={{ width: panelW }}
          className="relative flex shrink-0 flex-col border-l border-border bg-surface-1"
        >
          <PaneResizer
            edge="left"
            size={panelW}
            onSize={setPanelW}
            min={260}
            max={620}
            label={L("Bredde på scenepanelet", "Width of the scene panel")}
          />
          {selectedAudio && !selectedAudio.removed ? (
            <AudioClipPanel
              key={selectedAudio.id}
              state={state}
              projectId={projectId}
              clip={selectedAudio}
              editable={editable}
              onChange={patchAudio}
              onRemove={() => removeAudio(selectedAudio.id)}
              onOpenProfile={() => setProfileId(selectedAudio.id)}
              cmds={cmds}
            />
          ) : (
            <ClipPanel
              cmds={cmds}
              technical={technical}
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
              onGenerateScene={() => setGenerateOpen(true)}
              onAiDialogue={editable ? () => setDialogueOpen(true) : undefined}
              run={cmds.run}
              frame={playback.frame}
              onSeek={playback.setFrame}
              onUseTake={(takeId) => {
                if (!selected) return;
                // Spinoff med arvet film (DEC-0072): «animatic» må lagres som egen del, ellers arves
                // hovedfilmens valg igjen
                if (takeId === null && selected.inheritedFrom) {
                  const ms = maxMsOf(selected, null);
                  if (!selected.compositionId || ms >= AUDIO_MAX_MS) {
                    setError(
                      L(
                        "Scenen har ingen 2D-scene å bruke i stedet.",
                        "The scene has no 2D scene to use instead.",
                      ),
                    );
                    return;
                  }
                  editScene(
                    selected.occurrenceId,
                    [
                      {
                        partId: newId() as never,
                        source: "composition",
                        takeId: null,
                        inMs: 0,
                        outMs: ms,
                      },
                    ],
                    L("Bruk animatic i spinoffen", "Use animatic in the spin-off"),
                    null,
                  );
                  return;
                }
                editScene(
                  selected.occurrenceId,
                  [],
                  takeId
                    ? L("Bruk importert film", "Use imported film")
                    : L("Bruk animatic", "Use animatic"),
                  takeId,
                );
              }}
              onTakeStatus={(takeId, status) =>
                run(
                  { type: "SetTakeStatus", takeId: takeId as never, status },
                  L("Endre status for film", "Change film status"),
                )
              }
              maxMsOf={(takeId) => (selected ? maxMsOf(selected, takeId) : AUDIO_MAX_MS)}
              onEditParts={(parts, label) =>
                selected && editScene(selected.occurrenceId, parts, label)
              }
              onResetParts={() =>
                selected &&
                editScene(selected.occurrenceId, [], L("Hele klippet igjen", "Whole clip again"))
              }
              onSplit={() => {
                // Splitt i den valgte scenen; står hodet utenfor, flyttes det til midten av scenen først
                if (
                  selected &&
                  clipAtFrame(clips, playback.frame)?.clip.occurrenceId !== selected.occurrenceId
                ) {
                  playback.setFrame(selected.startFrame + Math.floor(selected.durationFrames / 2));
                  setError(
                    L(
                      "Avspillingshodet er flyttet til scenen. Plasser det der klippet skal deles, og trykk igjen.",
                      "The playhead was moved to the scene. Place it where the clip should be split, and press again.",
                    ),
                  );
                  return;
                }
                splitAtPlayhead();
              }}
              sync={sync}
              onSync={(blockId) =>
                setSync(
                  blockId && selected ? { occurrenceId: selected.occurrenceId, blockId } : null,
                )
              }
              onLink={(blockId, mode) => {
                if (!selected) return;
                const local = playback.frame - selected.startFrame;
                if (local < 0 || local >= selected.durationFrames) {
                  setError(
                    L(
                      "Avspillingshodet er utenfor scenen. Flytt det inn i scenen først.",
                      "The playhead is outside the scene. Move it into the scene first.",
                    ),
                  );
                  return;
                }
                linkBlock(selected.occurrenceId, blockId, framesToSeconds(local, fps) * 1000, mode);
              }}
              onRemoveLink={removeLink}
              onImportFilm={(file) =>
                selected ? importFilm(selected.occurrenceId, file) : Promise.resolve(null)
              }
              onTransition={(t) =>
                selected &&
                run(
                  { type: "SetTransition", occurrenceId: selected.occurrenceId, transition: t },
                  L("Endre overgang", "Change transition"),
                )
              }
              onMonochrome={(on) =>
                selected &&
                run(
                  {
                    type: "SetOccurrenceMonochrome",
                    occurrenceId: selected.occurrenceId,
                    monochrome: on,
                  },
                  on
                    ? L("Svart-hvitt for scenen", "Black and white for the scene")
                    : L("Farger for scenen", "Colour for the scene"),
                )
              }
            />
          )}
        </aside>
      </div>

      <FilmTimeline
        state={view}
        clips={clips}
        flagged={flagged}
        durationFrames={duration}
        frame={playback.frame}
        playing={playback.playing}
        onFrame={playback.setFrame}
        selectedId={selected?.occurrenceId ?? null}
        onSelect={(id) => {
          setSelectedId(id);
          setSelectedAudioId(null);
        }}
        onOpen={openInEditor}
        editable={editable}
        onMove={moveTo}
        onDuration={setDuration}
        tick={images.tick}
        toolbar={toolbar}
        audio={(g) => (
          <AudioTracks
            state={view}
            items={audioItems}
            clips={clips}
            g={g}
            frame={playback.frame}
            editable={editable}
            selectedId={selectedAudioId}
            onSelect={setSelectedAudioId}
            onChange={changeAudio}
            onFrame={playback.setFrame}
            mutedKinds={mutedKinds}
            onToggleMute={(k) =>
              setMutedKinds((m) => {
                const n = new Set(m);
                if (n.has(k)) n.delete(k);
                else n.add(k);
                return n;
              })
            }
            onAdd={(k) => setAddAudio(k)}
            onOpen={(id) => {
              setSelectedAudioId(id);
              setProfileId(id);
            }}
            loaded={audioLoaded}
          />
        )}
      />

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} current="montering" />
      <SubtitleDialog
        state={state}
        productionId={productionId}
        open={subtitlesOpen}
        onOpenChange={setSubtitlesOpen}
      />
      <ExportAnimaticDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        state={view}
        productionId={productionId}
        clips={clips}
        selectedId={selected?.occurrenceId ?? null}
        initialScope={focus?.download ? "selected" : undefined}
        urls={images.urls}
        audioItems={playItems}
        audioUrls={audioUrls.data ?? null}
        mutedKinds={mutedKinds}
        filmUrls={filmUrls.data ?? null}
        monochrome={monochrome}
        language={filmLang}
        onLanguage={setFilmLang}
        subtitles={subtitleList}
        {...(editable && schema27
          ? {
              onSaveSettings: (settings: ExportSettings) =>
                cmds.runSilent(
                  {
                    type: "SetExportSettings",
                    productionId: productionId as never,
                    settings,
                  },
                  L("Lagre eksportinnstillingene", "Save the export settings"),
                ),
            }
          : {})}
      />
      <LanguageVersionDialog
        open={languageOpen}
        onOpenChange={setLanguageOpen}
        state={state}
        productionId={productionId}
        language={filmLang.dialogue === MAIN_LANGUAGE ? "en" : filmLang.dialogue}
        editable={editable}
        run={run}
        onSeek={(occurrenceId, ms) => {
          const c = clips.find((x) => x.occurrenceId === occurrenceId);
          if (!c) return;
          setSelectedId(occurrenceId);
          playback.setFrame(
            c.startFrame +
              Math.min(c.durationFrames - 1, Math.round((ms / 1000) * (fps.num / fps.den))),
          );
        }}
      />
      <Dialog open={standardOpen} onOpenChange={setStandardOpen}>
        <DialogContent className="max-w-[440px] border-border bg-surface-2">
          <DialogHeader>
            <DialogTitle>{L("Standardovergang", "Default transition")}</DialogTitle>
            <DialogDescription>
              {L(
                "Overgangen alle scener får når de ikke har sin egen. Scener med eget valg endres ikke.",
                "The transition every scene gets when it has no transition of its own. Scenes with their own choice are not changed.",
              )}
            </DialogDescription>
          </DialogHeader>
          <TransitionEditor
            idPrefix="standardovergang"
            value={state.project.defaultTransition ?? { kind: "cut", frames: 0 }}
            fps={fps.num / fps.den}
            editable={editable}
            onChange={(t) => {
              const next = t && t.kind !== "cut" ? t : null;
              const now = state.project.defaultTransition ?? null;
              if (JSON.stringify(next) === JSON.stringify(now)) return;
              run(
                { type: "SetDefaultTransition", transition: next },
                L("Endre standardovergang", "Change default transition"),
              );
            }}
          />
          {error ? (
            <p role="alert" className="text-xs text-status-danger">
              {tm(error)}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
      <AudioClipEditor
        open={profileClip !== null}
        onOpenChange={(o) => {
          if (!o) setProfileId(null);
        }}
        state={state}
        clip={profileClip}
        sceneSeconds={profileScene ? framesToSeconds(profileScene.durationFrames, fps) : null}
        editable={editable}
        url={profileVersion ? (audioUrls.data?.[profileVersion.mediaPath] ?? null) : null}
        onChange={(label, patch) => profileClip && patchAudioClip(profileClip.id, label, patch)}
      />
      {editable ? (
        <AiDialogueDialog
          open={dialogueOpen}
          onOpenChange={setDialogueOpen}
          state={state}
          clip={selected}
          cmds={cmds}
        />
      ) : null}
      {editable ? (
        <BatchVideoDialog
          open={batchOpen}
          onOpenChange={setBatchOpen}
          state={state}
          productionId={productionId}
          cmds={cmds}
        />
      ) : null}
      <GenerateSceneDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        state={state}
        productionId={productionId}
        clip={selected}
        editable={editable}
        cmds={cmds}
      />
      <LongFilmImportDialog
        open={longFilm}
        onOpenChange={setLongFilm}
        projectId={projectId}
        clips={clips}
        firstOccurrenceId={selected?.occurrenceId ?? null}
        cmds={cmds}
        fps={fps}
      />
      <AddAudioDialog
        open={addAudio !== null}
        onOpenChange={(o) => {
          if (!o) setAddAudio(null);
        }}
        state={state}
        projectId={projectId}
        cmds={cmds}
        clip={at?.clip ?? null}
        offsetMs={at ? Math.round(framesToSeconds(at.localFrame, fps) * 1000) : 0}
        initialKind={addAudio ?? "dialogue"}
        onAdded={(id) => setSelectedAudioId(id)}
        language={filmLang.dialogue}
      />
    </div>
  );
}

function useStoredPanel() {
  return usePaneSize("assembly-panel", 340, 260, 620);
}
