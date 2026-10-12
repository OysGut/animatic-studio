/**
 * Oppfølging av AI-videojobber og innlegging som versjon av scenen (DEC-0069, REQ-0180, REQ-0291).
 * Videoene lages hos leverandøren; så lenge noen med redigeringstilgang har prosjektet åpent, spør
 * nettleseren serveren hvert 10. sekund om jobbene er ferdige. Ferdige videoer legges inn som ny versjon
 * (AddTake, «ai_video») – også hvis siden som startet jobben ble lukket.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  newId,
  secondsToFrames,
  takeIdFromResultPath,
  type GenerationJob,
  type ProjectState,
} from "@/core";
import { pollVideoJob } from "@/adapters/ai/video.functions";
import { pumpProjectQueue } from "@/adapters/ai/queue.functions";
import type { Commands } from "@/app/project/use-commands";
import { signedUrls } from "@/app/library/asset-images";
import { readFilmMetadata } from "@/app/assembly/film-import";
import { aiJobsKey } from "./use-ai-jobs";
import { storeLastFrame } from "./last-frame";

const POLL_MS = 10_000;

/** Følger opp videojobbene som pågår (én forespørsel om gangen per jobb). */
export function useVideoPolling(
  projectId: string,
  jobs: readonly GenerationJob[],
  enabled: boolean,
) {
  const qc = useQueryClient();
  const busy = useRef(new Set<string>());
  const running = jobs.filter((j) => j.kind === "video" && j.status === "running");
  const ids = running.map((j) => j.id).join(",");
  // Ventende jobber i køen (DEC-0070): uten bakgrunnskø sender nettleseren dem mens prosjektet er åpent
  const queued = jobs.some((j) => j.kind === "video" && j.status === "queued");
  const pumping = useRef(false);
  useEffect(() => {
    if (!enabled || !queued) return;
    const pump = async () => {
      if (pumping.current) return;
      pumping.current = true;
      try {
        const r = await pumpProjectQueue({ data: { projectId } });
        if (r.sent) void qc.invalidateQueries({ queryKey: aiJobsKey(projectId) });
      } catch {
        /* prøv igjen neste gang */
      } finally {
        pumping.current = false;
      }
    };
    void pump();
    const t = window.setInterval(() => void pump(), 20_000);
    return () => window.clearInterval(t);
  }, [enabled, queued, projectId, qc]);
  useEffect(() => {
    if (!enabled || !ids) return;
    let stop = false;
    const tick = async () => {
      for (const id of ids.split(",")) {
        if (stop || busy.current.has(id)) continue;
        busy.current.add(id);
        try {
          const r = await pollVideoJob({ data: { projectId, jobId: id } });
          if (r.state !== "running") void qc.invalidateQueries({ queryKey: aiJobsKey(projectId) });
        } catch {
          /* nettfeil: prøv igjen neste gang */
        } finally {
          busy.current.delete(id);
        }
      }
    };
    void tick();
    const t = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [enabled, ids, projectId, qc]);
}

/** Legg en ferdig AI-video inn som ny versjon av scenen. Returnerer feilmelding eller null. */
export async function claimVideo(
  state: ProjectState,
  cmds: Commands,
  job: GenerationJob,
): Promise<string | null> {
  if (!job.resultPath || !job.occurrenceId) return "Jobben har ingen video.";
  const now = cmds.current() ?? state;
  if (Object.values(now.takes).some((t) => t.mediaRef === job.resultPath)) return null;
  if (!now.occurrences[job.occurrenceId]) return "Scenen finnes ikke lenger.";
  const urls = await signedUrls([job.resultPath], 600);
  const url = urls[job.resultPath];
  if (!url) return "Videoen kunne ikke hentes fra lagringen.";
  const res = await fetch(url);
  if (!res.ok) return `Videoen kunne ikke hentes (${res.status}).`;
  const blob = await res.blob();
  const file = new File([blob], `AI-video (${job.provider}).mp4`, {
    type: blob.type || "video/mp4",
  });
  let media;
  try {
    media = await readFilmMetadata(file);
  } catch (e) {
    return `Videoen kunne ikke leses: ${(e as Error).message}`;
  }
  // Siste bilde til neste segment (REQ-0263); feil her stopper ikke innleggingen
  void storeLastFrame(job.resultPath, blob).catch(() => null);
  const takeId = takeIdFromResultPath(job.resultPath) ?? newId<"take">();
  // En annen fane eller visning har allerede lagt den inn
  if (now.takes[takeId as never]) return null;
  const segmentId = job.segmentId && now.segments[job.segmentId] ? job.segmentId : null;
  const r = await cmds.runAndWait(
    {
      type: "AddTake",
      takeId: takeId as never,
      occurrenceId: job.occurrenceId as never,
      segmentId: segmentId as never,
      kind: "ai_video",
      status: "in_progress",
      durationFrames: Math.max(1, secondsToFrames(media.durationMs / 1000, now.project.fps)),
      mediaRef: job.resultPath,
      media,
    },
    `AI-video (${job.provider}) som ny versjon`,
  );
  if (r.error && (cmds.current() ?? now).takes[takeId as never]) return null;
  return r.error ?? null;
}
