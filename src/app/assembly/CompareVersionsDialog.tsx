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
          <DialogTitle>Sammenlign versjoner – {title}</DialogTitle>
          <DialogDescription>
            Velg to versjoner av scenen. De spilles og spoles sammen; ingen av dem endres eller tas
            i bruk herfra.
          </DialogDescription>
        </DialogHeader>
        {versions.length < 2 || !a || !b ? (
          <p className="text-[13px] text-text-secondary">
            Scenen har bare én versjon. Importer film, lag AI-video eller legg inn et stillbilde for
            å kunne sammenligne.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={playback.toggle}>
                {playback.playing ? <Pause /> : <Play />}
                {playback.playing ? "Pause" : "Spill begge"}
              </Button>
              <input
                type="range"
                min={0}
                max={Math.max(0, total - 1)}
                value={playback.frame}
                onChange={(e) => playback.setFrame(Number(e.target.value))}
                aria-label="Felles avspillingshode"
                className="min-w-[160px] flex-1 accent-[var(--accent-brand)]"
              />
              <span className="font-mono text-[11px] text-text-secondary">
                {formatTimecode(playback.frame, fps)}
              </span>
              <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                Følg
                <select
                  aria-label="Hvordan versjonene følger hverandre"
                  value={sync}
                  onChange={(e) => setSync(e.target.value as CompareSync)}
                  className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                >
                  <option value="time">samme tid fra start</option>
                  <option value="relative">samme andel av lengden</option>
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
              Sammenligningen er uten lyd. Når en versjon er kortere, står siste bilde til den andre
              er ferdig (med «samme tid fra start»).
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
        aria-label={side === 0 ? "Versjon til venstre" : "Versjon til høyre"}
        value={version.key}
        onChange={(e) => onPick(e.target.value)}
        className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
      >
        {versions.map((x) => (
          <option key={x.key} value={x.key}>
            {x.label}
            {x.inUse ? " (i bruk)" : ""}
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
          {version.inUse ? " · i bruk i filmen" : ""}
        </dd>
        <dt className="text-text-tertiary">Lengde</dt>
        <dd className="font-mono text-text-primary">
          {secs.toLocaleString("nb-NO", { maximumFractionDigits: 2 })} s · {version.durationFrames}{" "}
          bilder
        </dd>
        <dt className="text-text-tertiary">Laget</dt>
        <dd className="text-text-primary">
          {version.createdAt
            ? new Date(version.createdAt).toLocaleString("nb-NO", {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : "ukjent"}
        </dd>
        <dt className="text-text-tertiary">Her</dt>
        <dd className="font-mono text-text-primary">{formatTimecode(frame, fps)}</dd>
      </dl>
    </div>
  );
}
