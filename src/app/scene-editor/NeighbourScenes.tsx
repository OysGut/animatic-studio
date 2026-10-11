/**
 * Naboscener i sceneeditoren (DEC-0052, REQ-0578): scenen før og etter vises som ferdig film (med lyd og
 * overganger), så du kan spole og spille scenen i sammenheng. Nabosceneenes lag vises ikke og kan ikke
 * endres her. Står avspillingshodet i scenen du redigerer (og avspillingen er stoppet), viser editoren
 * scenen som vanlig på samme sted.
 */
import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import {
  clipFrameToComposition,
  compositionFrameInClip,
  filmAudio,
  filmMediaPaths,
  filmTakeAudio,
  formatHeading,
  framesToSeconds,
  neighbourRange,
  type FilmClip,
  type ProjectState,
} from "@/core";
import { useImageUrls } from "@/app/library/asset-images";
import { useAudioPlayback } from "@/app/audio/use-audio-playback";
import { useFilmImages } from "@/app/assembly/film-images";
import { useFilmVideo } from "@/app/assembly/film-video";
import { FilmViewer } from "@/app/assembly/FilmViewer";
import { Button } from "@/components/ui/button";
import { usePlayback } from "./use-playback";

export function NeighbourScenes({
  state,
  film,
  occurrenceId,
  sceneFrame,
  scenePlaying,
  onSceneFrame,
  onPauseScene,
  language = "nb",
}: {
  state: ProjectState;
  film: readonly FilmClip[];
  occurrenceId: string;
  /** Avspillingshodet i scenen (2D-scenens bilde). */
  sceneFrame: number;
  scenePlaying: boolean;
  /** Flytt avspillingshodet i scenen (når hodet stopper i scenen du redigerer). */
  onSceneFrame: (frame: number) => void;
  onPauseScene: () => void;
  /** Dialogspråket som spilles (DEC-0059). */
  language?: string;
}) {
  const fps = state.project.fps;
  const range = useMemo(() => neighbourRange(film, occurrenceId), [film, occurrenceId]);
  const length = range ? Math.max(1, range.endFrame - range.startFrame) : 1;
  const play = usePlayback(length, fps, false);
  const filmFrame = (range?.startFrame ?? 0) + play.frame;
  const clips = useMemo(() => range?.clips ?? [], [range]);
  const current = range?.current ?? null;

  // Start der scenen står nå
  const placed = useRef<string | null>(null);
  /** Har brukeren spolt eller spilt her? Først da følger editoren etter. */
  const touched = useRef(false);
  // Ny scene: start der scenen står. Før du har spolt her, følger hodet scenen (også når lengdene endres).
  useEffect(() => {
    if (!range || !current) return;
    if (placed.current !== occurrenceId) {
      placed.current = occurrenceId;
      touched.current = false;
    } else if (touched.current) return;
    if (play.playing) return;
    const local = compositionFrameInClip(current, sceneFrame) ?? 0;
    play.setFrame(Math.max(0, current.startFrame + local - range.startFrame));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, current, occurrenceId, sceneFrame]);

  // Spilles scenen alene (mellomrom i editoren), stopper sammenhengen
  useEffect(() => {
    if (scenePlaying && play.playing) play.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenePlaying]);

  // Stopper hodet i scenen du redigerer: editoren viser det samme bildet
  const local = current ? filmFrame - current.startFrame : -1;
  const inCurrent = !!current && local >= 0 && local < current.durationFrames;
  const compFrame = inCurrent && current ? clipFrameToComposition(current, local) : null;
  useEffect(() => {
    if (touched.current && !play.playing && compFrame !== null) onSceneFrame(compFrame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play.playing, compFrame]);

  // Bilder, importert film og lyd for de tre scenene
  const images = useFilmImages(state, clips);
  const filmPaths = useMemo(() => filmMediaPaths(clips), [clips]);
  const filmUrls = useImageUrls(filmPaths);
  const video = useFilmVideo(filmUrls.data ?? null, play.playing);
  const sound = useMemo(
    () => [...filmAudio(state, clips, fps, language), ...filmTakeAudio(clips, fps)],
    [state, clips, fps, language],
  );
  const soundPaths = useMemo(
    () => [...new Set(sound.flatMap((it) => (it.version ? [it.version.mediaPath] : [])))],
    [sound],
  );
  const soundUrls = useImageUrls(soundPaths);
  useAudioPlayback({
    items: sound,
    urls: soundUrls.data ?? null,
    playing: play.playing,
    time: framesToSeconds(filmFrame, fps),
  });

  const stripRef = useRef<HTMLDivElement>(null);
  function seek(clientX: number) {
    const r = stripRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return;
    touched.current = true;
    const f = Math.round(((clientX - r.left) / r.width) * length);
    play.setFrame(Math.min(length - 1, Math.max(0, f)));
  }

  if (!range || !current) return null;
  // Filmen dekker editoren bare når du har spolt eller spilt i sammenhengen
  const showFilm = play.playing || (touched.current && compFrame === null);
  const where = !inCurrent
    ? filmFrame < current.startFrame
      ? "Forrige scene"
      : "Neste scene"
    : compFrame === null
      ? "Denne scenen (importert film)"
      : null;
  const secs = (f: number) =>
    `${framesToSeconds(f, fps).toLocaleString("nb-NO", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} s`;

  return (
    <>
      {showFilm ? (
        <div
          className="absolute inset-x-0 top-0 z-30 flex flex-col bg-background p-3"
          style={{ bottom: 48 }}
          aria-label="Naboscener som film"
        >
          <FilmViewer
            state={state}
            clips={clips}
            frame={filmFrame}
            tick={images.tick + video.tick}
            video={video.provider}
            onDrawn={video.settle}
          />
          {where ? (
            <p className="absolute left-4 top-4 rounded-sm bg-surface-2/90 px-2 py-1 text-xs text-text-secondary">
              {where} · bare visning
            </p>
          ) : null}
        </div>
      ) : null}
      <div
        className="flex h-12 shrink-0 items-center gap-2 border-t border-border bg-surface-1 px-2"
        aria-label="Naboscener"
      >
        <Button
          size="sm"
          variant="secondary"
          aria-label={play.playing ? "Pause" : "Spill i sammenheng"}
          title="Spill forrige scene, denne og neste i sammenheng"
          onClick={() => {
            touched.current = true;
            if (!play.playing) onPauseScene();
            play.toggle();
          }}
        >
          {play.playing ? <Pause /> : <Play />}
        </Button>
        <div
          ref={stripRef}
          className="relative flex h-8 min-w-0 flex-1 cursor-pointer touch-none overflow-hidden rounded-sm border border-border"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            seek(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) seek(e.clientX);
          }}
        >
          {clips.map((c) => {
            const mine = c.occurrenceId === occurrenceId;
            const w = (c.durationFrames / length) * 100;
            return (
              <div
                key={c.occurrenceId}
                className={
                  "flex h-full min-w-0 items-center border-r border-border px-1.5 text-[11px] last:border-r-0 " +
                  (mine
                    ? "bg-accent-selection text-text-primary"
                    : "bg-surface-3 text-text-tertiary")
                }
                style={{ width: `${w}%` }}
                title={`${c.productionNumber ?? ""} ${formatHeading(c.heading)}`}
              >
                <span className="truncate">
                  {mine ? "Denne: " : c.startFrame < current.startFrame ? "Forrige: " : "Neste: "}
                  {c.productionNumber ? `${c.productionNumber} ` : ""}
                  {formatHeading(c.heading)}
                </span>
              </div>
            );
          })}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent-brand"
            style={{ left: `${(play.frame / length) * 100}%` }}
          />
        </div>
        <span className="w-24 shrink-0 text-right text-xs tabular-nums text-text-secondary">
          {secs(play.frame)} / {secs(length)}
        </span>
      </div>
    </>
  );
}
