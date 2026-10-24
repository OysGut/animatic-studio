/**
 * SB-4: storyboardfilmen. Panelene spilles av som en film med scenens eksisterende lyd (dialog, musikk,
 * atmosfære og effekter med automatisering) som tidsmaster – lyden kopieres aldri, den samme lyden flyttes
 * bare i tid til panelets plass (storyboardFilm i kjernen). Bildet følger lydklokken (REQ-0210).
 * Scrubbing i spilleren flytter lyden med; scrubbing over kortene i galleriet er uten lyd.
 * Lyd av/på og volum huskes per bruker (useUiPref). Spilleren endrer aldri prosjektdata.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import {
  AUDIO_KINDS,
  filmAudio,
  filmClips,
  filmTakeAudio,
  formatTimecode,
  framesToSeconds,
  languageState,
  panelDetails,
  shotAtFrame,
  storyboardFilm,
  type ProjectState,
} from "@/core";
import { t } from "@/core/i18n/keyed";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResizableDialogContent } from "@/app/shared/ResizableDialogContent";
import { Button } from "@/components/ui/button";
import { usePlayback } from "@/app/scene-editor/use-playback";
import { useAudioPlayback } from "@/app/audio/use-audio-playback";
import { useFilmImages } from "@/app/assembly/film-images";
import { FilmViewer } from "@/app/assembly/FilmViewer";
import { useFilmLanguage } from "@/app/assembly/use-film-language";
import { useImageUrls } from "@/app/library/asset-images";
import { useUiPref } from "@/app/account/ui-prefs";
import { rememberScene } from "@/app/shell/current-scene";

interface AudioPref { readonly muted: boolean; readonly volume: number }
function isAudioPref(v: unknown): v is AudioPref {
  return !!v && typeof v === "object" &&
    typeof (v as AudioPref).muted === "boolean" &&
    typeof (v as AudioPref).volume === "number" &&
    (v as AudioPref).volume >= 0 && (v as AudioPref).volume <= 1;
}

export function StoryboardFilm({
  projectId,
  state,
  productionId,
  open,
  onOpenChange,
  startOccurrenceId = null,
  onCurrentPanel,
}: {
  readonly projectId: string;
  readonly state: ProjectState;
  readonly productionId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Start i denne scenen når spilleren åpnes (ellers fra begynnelsen). */
  readonly startOccurrenceId?: string | null;
  /** Panelet under avspillingshodet, også etter at spilleren lukkes (fokus følger panelet). */
  readonly onCurrentPanel?: (panelId: string | null) => void;
}) {
  const filmLang = useFilmLanguage(projectId);
  const fps = state.project.fps;
  const view = useMemo(() => languageState(state, filmLang.value.dialogue), [state, filmLang.value.dialogue]);
  const clips = useMemo(() => filmClips(view, productionId), [view, productionId]);
  const audioItems = useMemo(
    () => [...filmAudio(view, clips, fps, filmLang.value.dialogue), ...filmTakeAudio(clips, fps)],
    [view, clips, fps, filmLang.value.dialogue],
  );
  const film = useMemo(() => storyboardFilm(view, clips, audioItems), [view, clips, audioItems]);
  const images = useFilmImages(film.state, film.clips);
  const audioPaths = useMemo(
    () => [...new Set(film.audio.flatMap((it) => (it.version ? [it.version.mediaPath] : [])))],
    [film.audio],
  );
  const audioUrls = useImageUrls(audioPaths);

  const [audioPref, setAudioPref] = useUiPref<AudioPref>("sb4-film-audio", { muted: false, volume: 1 }, isAudioPref);
  const mutedKinds = useMemo<ReadonlySet<string>>(
    () => (audioPref.muted ? new Set(AUDIO_KINDS) : new Set()),
    [audioPref.muted],
  );

  const clock = useRef<(() => number | null) | null>(null);
  const playback = usePlayback(film.durationFrames, fps, false, null, clock);
  useAudioPlayback({
    items: film.audio,
    urls: audioUrls.data ?? null,
    playing: playback.playing,
    time: framesToSeconds(playback.frame, fps),
    mutedKinds: mutedKinds as never,
    clock,
    volume: audioPref.volume,
  });

  const current = shotAtFrame(film.shots, playback.frame);
  const currentPanelId = current?.shot.panel.id ?? null;
  // Delt posisjon: scenen under hodet publiseres på den felles bussen, så Manus, Scene, Montering og
  // Manusutforskeren følger samme sted i filmen (én felles posisjon).
  const lastPublished = useRef<string | null>(null);
  useEffect(() => {
    const occId = current?.shot.occurrenceId ?? null;
    if (!occId || occId === lastPublished.current) return;
    lastPublished.current = occId;
    rememberScene(projectId, occId, current?.shot.panel.sceneId ?? null);
  }, [current, projectId]);
  useEffect(() => () => { lastPublished.current = null; }, []);
  const close = useCallback(() => {
    playback.pause();
    onCurrentPanel?.(currentPanelId);
    onOpenChange(false);
  }, [playback, onCurrentPanel, currentPanelId, onOpenChange]);

  // Startpunkt når spilleren åpnes
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      const shot = startOccurrenceId ? film.shots.find((s) => s.occurrenceId === startOccurrenceId) : null;
      playback.setFrame(shot?.startFrame ?? 0);
    }
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const box = useRef<HTMLDivElement | null>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void box.current?.requestFullscreen();
  }, []);

  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement && e.target.type === "range") return;
    if (e.key === " ") { e.preventDefault(); playback.toggle(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); playback.setFrame(playback.frame - (e.shiftKey ? fps.num : 1)); }
    else if (e.key === "ArrowRight") { e.preventDefault(); playback.setFrame(playback.frame + (e.shiftKey ? fps.num : 1)); }
    else if (e.key === "Home") { e.preventDefault(); playback.setFrame(0); }
    else if (e.key === "End") { e.preventDefault(); playback.setFrame(film.durationFrames - 1); }
  }, [playback, fps, film.durationFrames]);

  const details = current ? panelDetails(current.shot.panel) : null;
  const panelLabel = current
    ? t("sb4.film.panel-label", {
        scene: details?.sceneNumber || String(current.shot.index + 1),
        panel: details?.number || "",
        name: current.shot.panel.name,
      })
    : "";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <ResizableDialogContent
        uiId="V-171"
        sizeKey="storyboard-film"
        minWidth={480}
        minHeight={320}
        className="max-h-[95dvh] w-[calc(100vw-32px)] max-w-[1100px] border-border bg-surface-2"
        onKeyDown={onKey}
        data-testid="sb4-film"
      >
        <DialogHeader>
          <DialogTitle>{t("sb4.film.title")}</DialogTitle>
          <DialogDescription>{t("sb4.film.description")}</DialogDescription>
        </DialogHeader>
        <div ref={box} className="flex min-h-0 flex-1 flex-col gap-2 bg-surface-2">
          {film.shots.length === 0 ? (
            <p className="p-6 text-center text-[13px] text-text-tertiary">{t("sb4.film.empty")}</p>
          ) : (
            <FilmViewer state={film.state} clips={film.clips} frame={playback.frame} tick={images.tick} />
          )}
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => playback.toggle()}
              aria-label={playback.playing ? t("sb4.film.pause") : t("sb4.film.play")}
              data-testid="sb4-play-toggle"
              disabled={film.shots.length === 0}
            >
              {playback.playing ? <Pause /> : <Play />}
            </Button>
            <input
              type="range"
              min={0}
              max={Math.max(0, film.durationFrames - 1)}
              value={Math.min(playback.frame, Math.max(0, film.durationFrames - 1))}
              onChange={(e) => playback.setFrame(Number(e.target.value))}
              aria-label={t("sb4.film.timeline")}
              data-testid="sb4-scrub"
              className="min-w-0 flex-1"
              disabled={film.shots.length === 0}
            />
            <span className="shrink-0 font-mono text-[12px] text-text-secondary" data-testid="sb4-timecode">
              {formatTimecode(playback.frame, fps)} / {formatTimecode(film.durationFrames, fps)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setAudioPref({ ...audioPref, muted: !audioPref.muted })}
              aria-label={audioPref.muted ? t("sb4.film.unmute") : t("sb4.film.mute")}
              aria-pressed={audioPref.muted}
              data-testid="sb4-mute"
            >
              {audioPref.muted ? <VolumeX /> : <Volume2 />}
            </Button>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(audioPref.volume * 100)}
              onChange={(e) => setAudioPref({ ...audioPref, volume: Number(e.target.value) / 100, muted: false })}
              aria-label={t("sb4.film.volume")}
              data-testid="sb4-volume"
              className="w-28"
            />
            <span className="min-w-0 flex-1 truncate text-[12px] text-text-secondary" dir="auto" aria-live="polite" data-testid="sb4-panel-label">
              {panelLabel}
            </span>
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleFull}
              aria-label={full ? t("sb4.film.exit-fullscreen") : t("sb4.film.fullscreen")}
              data-testid="sb4-fullscreen"
            >
              {full ? <Minimize /> : <Maximize />}
            </Button>
          </div>
        </div>
      </ResizableDialogContent>
    </Dialog>
  );
}
