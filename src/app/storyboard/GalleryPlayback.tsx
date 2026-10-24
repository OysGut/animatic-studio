import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Square, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { filmAudio, filmClips, filmTakeAudio, filmMediaPaths, stillMediaPaths, languageState, framesToSeconds, shotAtFrame, storyboardFilm, storyboardTempAudioItems, type ProjectState } from "@/core";
import { panelPosition, scrubFrame } from "@/core/storyboard/position";
import { currentPosition, rememberPosition } from "@/app/shell/current-scene";
import { usePlaybackStore, useFrame } from "@/app/scene-editor/use-playback";
import { useAudioPlayback } from "@/app/audio/use-audio-playback";
import { useFilmLanguage } from "@/app/assembly/use-film-language";
import { useFilmImages } from "@/app/assembly/film-images";
import { useFilmVideo } from "@/app/assembly/film-video";
import { FilmViewer } from "@/app/assembly/FilmViewer";
import { useImageUrls } from "@/app/library/asset-images";
import { Button } from "@/components/ui/button";
import { t } from "@/core/i18n/keyed";

export function GalleryPlayback({ state, projectId, productionId, selected, onCurrent, onPlaying }: { state: ProjectState; projectId: string; productionId: string; selected: string | null; onCurrent: (id: string) => void; onPlaying: (occurrenceId: string | null) => void }) {
  const [lang] = useFilmLanguage(projectId);
  const view = useMemo(() => languageState(state, lang.dialogue), [state, lang.dialogue]);
  const clips = useMemo(() => filmClips(view, productionId), [view, productionId]);
  const sound = useMemo(() => [...filmAudio(view, clips, view.project.fps, lang.dialogue), ...filmTakeAudio(clips, view.project.fps)], [view, clips, lang.dialogue]);
  const film = useMemo(() => storyboardFilm(view, clips, sound), [view, clips, sound]);
  const temp = useMemo(() => storyboardTempAudioItems(view, film.shots, view.project.fps), [view, film.shots]);
  const [temporary, setTemporary] = useState(false);
  const [muted, setMuted] = useState(false);
  const items = useMemo(() => temporary ? [...film.audio, ...temp] : film.audio, [temporary, film.audio, temp]);
  const urls = useImageUrls(items.flatMap(i => i.version ? [i.version.mediaPath] : []));
  const clock = useRef<(() => number | null) | null>(null);
  const playback = usePlaybackStore(film.durationFrames, view.project.fps, false, null, clock);
  const frame = useFrame(playback);
  useAudioPlayback({ items, urls: urls.data ?? null, playing: playback.playing, time: framesToSeconds(frame, view.project.fps), clock, volume: muted ? 0 : 1 });
  const current = shotAtFrame(film.shots, frame);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current || !film.shots.length) return;
    initialized.current = true;
    const saved = currentPosition(projectId);
    const shot = film.shots.find(x => x.panel.id === (selected ?? saved?.panelId));
    const first = film.shots.find(x => x.occurrenceId === saved?.occurrenceId);
    playback.setFrame(shot?.startFrame ?? (first ? first.startFrame + Math.round((saved?.timeMs ?? 0) * view.project.fps.num / view.project.fps.den / 1000) : 0));
  }, [film, selected, projectId, playback, view.project.fps]);
  useEffect(() => {
    if (!current || !playback.playing) { onPlaying(null); return; }
    onPlaying(current.shot.occurrenceId);
    onCurrent(current.shot.panel.id);
  }, [current?.shot.panel.id, playback.playing, onCurrent, onPlaying]);
  useEffect(() => {
    if (!current || !initialized.current) return;
    const first = film.shots.find(x => x.occurrenceId === current.shot.occurrenceId);
    const p = panelPosition(state, current.shot.occurrenceId, current.shot.panel.id, null, Math.round((frame - (first?.startFrame ?? 0)) * 1000 * view.project.fps.den / view.project.fps.num));
    if (p) rememberPosition(projectId, p);
  }, [frame, current?.shot.panel.id, projectId, state, film.shots]);
  useEffect(() => {
    if (playback.playing) return;
    const shot = film.shots.find(x => x.panel.id === selected);
    if (shot && shotAtFrame(film.shots, playback.frame)?.shot.panel.id !== selected) playback.setFrame(shot.startFrame);
  }, [selected, film.shots, playback]);
  const jump = (offset: number) => { const shot = film.shots[Math.max(0, Math.min(film.shots.length - 1, (current?.shot.index ?? 0) + offset))]; if (shot) { playback.setFrame(shot.startFrame); onCurrent(shot.panel.id); } };
  return <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-1.5" data-testid="sb4-gallery-playback">
    <Button size="icon" variant="ghost" aria-label={t("sb4.previous")} disabled={!film.shots.length} onClick={() => jump(-1)}><SkipBack/></Button>
    <Button size="icon" variant="ghost" aria-label={playback.playing ? t("sb4.film.pause") : t("sb4.film.play")} disabled={!film.shots.length} onClick={playback.toggle} data-testid="sb4-gallery-play"><span>{playback.playing ? <Pause/> : <Play/>}</span></Button>
    <Button size="icon" variant="ghost" aria-label={t("sb4.stop")} onClick={() => { playback.pause(); playback.setFrame(0); const first = film.shots[0]; if (first) onCurrent(first.panel.id); }}><Square/></Button>
    <Button size="icon" variant="ghost" aria-label={t("sb4.next")} disabled={!film.shots.length} onClick={() => jump(1)}><SkipForward/></Button>
    <Button size="icon" variant="ghost" aria-label={muted ? t("sb4.film.unmute") : t("sb4.film.mute")} aria-pressed={muted} onClick={() => setMuted(!muted)}>{muted ? <VolumeX/> : <Volume2/>}</Button>
    <input className="min-w-28 flex-1 accent-accent-brand" type="range" min={0} max={Math.max(0, film.durationFrames - 1)} value={frame} aria-label={t("sb4.film.timeline")} onChange={e => { playback.pause(); playback.setFrame(Number(e.target.value)); const next = shotAtFrame(film.shots, Number(e.target.value)); if (next) onCurrent(next.shot.panel.id); }} data-testid="sb4-gallery-progress"/>
    <output className="font-mono text-xs text-text-secondary">{framesToSeconds(frame, view.project.fps).toFixed(1)} / {framesToSeconds(film.durationFrames, view.project.fps).toFixed(1)} s</output>
    {temp.length ? <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={temporary} onChange={e => setTemporary(e.target.checked)}/>{t("sb4.temp-audio")}</label> : null}
  </div>;
}

/** A per-card subscription keeps pointer scrubbing out of the gallery's React tree. */
export function ScrubPreview({ state, projectId, panelId, productionId, onSeek }: { state: ProjectState; projectId: string; panelId: string; productionId: string; onSeek: (frame: number, panelId: string) => void }) {
  const clips = useMemo(() => filmClips(state, productionId), [state, productionId]);
  const film = useMemo(() => storyboardFilm(state, clips, []), [state, clips]);
  const shot = film.shots.find(x => x.panel.id === panelId);
  const clip = clips.find(c => c.occurrenceId === shot?.occurrenceId);
  const available = !!clip && (clip.source === "film" || clip.source === "composition");
  const sceneShots = film.shots.filter(x => x.occurrenceId === shot?.occurrenceId);
  const first = sceneShots[0]?.startFrame ?? 0;
  const end = sceneShots.at(-1);
  const duration = available && clip ? clip.durationFrames : end ? end.startFrame + end.durationFrames - first : 1;
  const [hover, setHover] = useState<number | null>(null);
  const imageState = available ? state : film.state;
  const imageClips = available ? clips : film.clips;
  const images = useFilmImages(imageState, imageClips);
  const urls = useImageUrls(hover !== null ? filmMediaPaths(imageClips) : []);
  const stills = useMemo(() => stillMediaPaths(imageClips), [imageClips]);
  const video = useFilmVideo(urls.data ?? null, false, stills);
  const seek = (f: number) => {
    setHover(f);
    if (!shot) return;
    const p = panelPosition(state, shot.occurrenceId, null, null, Math.round(f * 1000 * state.project.fps.den / state.project.fps.num));
    if (p) rememberPosition(projectId, p);
    onSeek(f, p?.panelId ?? panelId);
  };
  return <div className="relative flex size-full touch-pan-y" role="slider" tabIndex={0} aria-label={t("sb4.scrub")} aria-valuemin={0} aria-valuemax={Math.max(0, duration - 1)} aria-valuenow={hover ?? 0} data-testid="sb4-scrub"
    onPointerMove={e => { if (e.pointerType === "touch" && e.buttons === 0) return; const box = e.currentTarget.getBoundingClientRect(); seek(scrubFrame(e.clientX - box.left, box.width, duration, getComputedStyle(e.currentTarget).direction === "rtl")); }}
    onPointerDown={e => { e.stopPropagation(); if (e.pointerType === "touch") e.currentTarget.setPointerCapture(e.pointerId); const box = e.currentTarget.getBoundingClientRect(); seek(scrubFrame(e.clientX - box.left, box.width, duration, getComputedStyle(e.currentTarget).direction === "rtl")); }}
    onPointerLeave={() => setHover(null)}
    onKeyDown={e => { const rtl = getComputedStyle(e.currentTarget).direction === "rtl"; if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return; e.preventDefault(); e.stopPropagation(); const n = e.key === "Home" ? 0 : e.key === "End" ? duration - 1 : (hover ?? 0) + ((e.key === "ArrowRight") !== rtl ? 1 : -1); seek(Math.max(0, Math.min(duration - 1, n))); }}>
    <FilmViewer state={imageState} clips={imageClips} frame={hover === null ? (available ? clip?.startFrame ?? 0 : shot?.startFrame ?? 0) : (available ? clip?.startFrame ?? 0 : first) + hover} tick={images.tick + video.tick} video={video.provider} onDrawn={video.settle}/>
    {hover !== null ? <output className="pointer-events-none absolute bottom-0 end-0 bg-surface-1 px-1 font-mono text-xs text-text-primary">{(hover * state.project.fps.den / state.project.fps.num).toFixed(1)} s</output> : null}
  </div>;
}