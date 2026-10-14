/**
 * Sammenlign to versjoner av en scene side ved side (mandat 21.5, REQ-0318, DEC-0075): 2D-animatic, klippet
 * versjon, importert film, AI-video og stillbilde. Begge spilles og spoles sammen fra samme tid (eller samme
 * andel av lengden), med navn, type, lengde og når versjonen ble laget. Tegnes med den samme filmvisningen
 * som monteringen. Bare visning: aktiv versjon endres ikke.
 */
import { Pause, Play } from "lucide-react";
import { useMemo, useState } from "react";
import {
  VERSION_KIND_LABEL,
  comparableVersions,
  compareLength,
  filmMediaPaths,
  formatTimecode,
  L,
  locale,
  stillMediaPaths,
  versionFrameAt,
  versionSeconds,
  type ComparableVersion,
  type CompareSync,
  type ProjectState,
} from "@/core";
import { useAiJobs } from "@/app/ai/use-ai-jobs";
import { useImageUrls } from "@/app/library/asset-images";
import { usePlayback } from "@/app/scene-editor/use-playback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFilmImages } from "./film-images";
import { useFilmVideo } from "./film-video";
import { FilmViewer } from "./FilmViewer";

export function CompareVersionsDialog({
  open,
  onOpenChange,
  state,
  projectId,
  productionId,
  occurrenceId,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  projectId: string;
  productionId: string;
  occurrenceId: string;
  title: string;
}) {
  const jobs = useAiJobs(projectId, open);
  const versions = useMemo(
    () => comparableVersions(state, productionId, occurrenceId, jobs.data?.jobs ?? []),
    [state, productionId, occurrenceId, jobs.data],
  );
  const [left, setLeft] = useState<string | null>(null);
  const [right, setRight] = useState<string | null>(null);
  const [sync, setSync] = useState<CompareSync>("time");
  // Standard: versjonen i bruk mot den nyeste av de andre
  const a = versions.find((v) => v.key === left) ?? versions.find((v) => v.inUse) ?? versions[0];
  const b =
    versions.find((v) => v.key === right) ??
    [...versions].reverse().find((v) => v.key !== a?.key) ??
    null;
  const total = a && b ? compareLength(a, b) : Math.max(1, a?.durationFrames ?? 1);
  const fps = state.project.fps;
  const playback = usePlayback(total, fps, false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {L(`Sammenlign versjoner – ${title}`, `Compare versions – ${title}`)}
          </DialogTitle>
          <DialogDescription>
            {L(
              "Velg to versjoner av scenen. De spilles og spoles sammen; ingen av dem endres eller tas i bruk herfra.",
              "Choose two versions of the scene. They play and scrub together; neither of them is changed or taken into use from here.",
            )}
          </DialogDescription>
        </DialogHeader>
        {versions.length < 2 || !a || !b ? (
          <p className="text-[13px] text-text-secondary">
            {L(
              "Scenen har bare én versjon. Importer film, lag AI-video eller legg inn et stillbilde for å kunne sammenligne.",
              "The scene has only one version. Import a film, make an AI video or add a still image to be able to compare.",
            )}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={playback.toggle}>
                {playback.playing ? <Pause /> : <Play />}
                {playback.playing ? "Pause" : L("Spill begge", "Play both")}
              </Button>
              <input
                type="range"
                min={0}
                max={Math.max(0, total - 1)}
                value={playback.frame}
                onChange={(e) => playback.setFrame(Number(e.target.value))}
                aria-label={L("Felles avspillingshode", "Shared playhead")}
                className="min-w-[160px] flex-1 accent-[var(--accent-brand)]"
              />
              <span className="font-mono text-[11px] text-text-secondary">
                {formatTimecode(playback.frame, fps)}
              </span>
              <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                {L("Følg", "Follow")}
                <select
                  aria-label={L(
                    "Hvordan versjonene følger hverandre",
                    "How the versions follow each other",
                  )}
                  value={sync}
                  onChange={(e) => setSync(e.target.value as CompareSync)}
                  className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                >
                  <option value="time">
                    {L("samme tid fra start", "same time from the start")}
                  </option>
                  <option value="relative">
                    {L("samme andel av lengden", "same share of the length")}
                  </option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[a, b].map((v, side) => (
                <Side
                  key={side}
                  side={side}
                  state={state}
                  version={v}
                  versions={versions}
                  onPick={(key) => (side === 0 ? setLeft : setRight)(key)}
                  frame={versionFrameAt(v.durationFrames, playback.frame, total, sync)}
                  playing={playback.playing}
                />
              ))}
            </div>
            <p className="text-[11px] text-text-tertiary">
              {L(
                "Sammenligningen er uten lyd. Når en versjon er kortere, står siste bilde til den andre er ferdig (med «samme tid fra start»).",
                "The comparison has no sound. When one version is shorter, its last frame stays until the other has finished (with “same time from the start”).",
              )}
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Side({
  side,
  state,
  version,
  versions,
  onPick,
  frame,
  playing,
}: {
  side: number;
  state: ProjectState;
  version: ComparableVersion;
  versions: readonly ComparableVersion[];
  onPick: (key: string) => void;
  frame: number;
  playing: boolean;
}) {
  const clips = useMemo(() => [version.clip], [version.clip]);
  const images = useFilmImages(state, clips);
  const paths = useMemo(() => filmMediaPaths(clips), [clips]);
  const stills = useMemo(() => stillMediaPaths(clips), [clips]);
  const urls = useImageUrls(paths);
  // Hver side har egne videoelementer, så de kan spoles uavhengig
  const video = useFilmVideo(urls.data ?? null, playing, stills);
  const fps = state.project.fps;
  const secs = versionSeconds(version, fps);
  return (
    <div className="flex flex-col gap-1.5">
      <select
        aria-label={
          side === 0
            ? L("Versjon til venstre", "Version on the left")
            : L("Versjon til høyre", "Version on the right")
        }
        value={version.key}
        onChange={(e) => onPick(e.target.value)}
        className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
      >
        {versions.map((x) => (
          <option key={x.key} value={x.key}>
            {x.label}
            {x.inUse ? L(" (i bruk)", " (in use)") : ""}
          </option>
        ))}
      </select>
      <div className="flex aspect-video w-full bg-black">
        <FilmViewer
          state={state}
          clips={clips}
          frame={frame}
          tick={images.tick + video.tick}
          video={video.provider}
          onDrawn={video.settle}
        />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
        <dt className="text-text-tertiary">Type</dt>
        <dd className="text-text-primary">
          {VERSION_KIND_LABEL[version.kind]}
          {version.inUse ? L(" · i bruk i filmen", " · in use in the film") : ""}
        </dd>
        <dt className="text-text-tertiary">{L("Lengde", "Length")}</dt>
        <dd className="font-mono text-text-primary">
          {secs.toLocaleString(locale(), { maximumFractionDigits: 2 })} s · {version.durationFrames}{" "}
          {L("bilder", "frames")}
        </dd>
        <dt className="text-text-tertiary">{L("Laget", "Created")}</dt>
        <dd className="text-text-primary">
          {version.createdAt
            ? new Date(version.createdAt).toLocaleString(locale(), {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : L("ukjent", "unknown")}
        </dd>
        <dt className="text-text-tertiary">{L("Her", "Here")}</dt>
        <dd className="font-mono text-text-primary">{formatTimecode(frame, fps)}</dd>
      </dl>
    </div>
  );
}
