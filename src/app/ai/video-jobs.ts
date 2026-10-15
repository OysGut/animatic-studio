/**
 * Oppfølging av AI-videojobber og innlegging som versjon av scenen (DEC-0069, REQ-0180, REQ-0291).
 * Videoene lages hos leverandøren; så lenge noen med redigeringstilgang har prosjektet åpent, spør
 * nettleseren serveren hvert 10. sekund om jobbene er ferdige. Ferdige videoer legges inn som ny versjon
 * (AddTake, «ai_video») – også hvis siden som startet jobben ble lukket.
 */
import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  newId,
  SCENE_VIDEO_SOURCE,
  secondsToFrames,
  takeIdFromResultPath,
  type GenerationJob,
  type ProjectState,
} from "@/core";
import { pollVideoJob } from "@/adapters/ai/video.functions";
import { pumpProjectQueue } from "@/adapters/ai/queue.functions";
import { useCommands, type Commands } from "@/app/project/use-commands";
import { projectStateKey } from "@/app/project/use-project";
import { fetchProjectState } from "@/adapters/browser/project-data";
import { L } from "@/core";
import { signedUrls } from "@/app/library/asset-images";
import { readFilmMetadata } from "@/app/assembly/film-import";
import { aiJobsKey, useAiJobs } from "./use-ai-jobs";
import { storeLastFrame } from "./last-frame";
import { addVideoAudioTrack, audioFromVideo } from "./video-audio";

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
  const queued = jobs.some(
    (j) =>
      (j.kind === "video" && j.status === "queued") ||
      // Bilde-, lyd- og tekstjobber som har stått som «pågår» i over 15 minutter, ble stoppet av plattformen
      // (KI-145): serveren merker dem når køen pumpes
      (j.kind !== "video" &&
        j.status === "running" &&
        Date.now() - Date.parse(j.createdAt) > 15 * 60_000),
  );
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
/** Jobber som legges inn akkurat nå (flere visninger kan prøve samtidig). */
const claiming = new Set<string>();

export async function claimVideo(
  state: ProjectState,
  cmds: Commands,
  job: GenerationJob,
): Promise<string | null> {
  if (claiming.has(job.id)) return null;
  claiming.add(job.id);
  try {
    return await claimVideoOnce(state, cmds, job);
  } finally {
    claiming.delete(job.id);
  }
}

async function claimVideoOnce(
  state: ProjectState,
  cmds: Commands,
  job: GenerationJob,
): Promise<string | null> {
  if (!job.resultPath || !job.occurrenceId)
    return L("Jobben har ingen video.", "The job has no video.");
  const now = cmds.current() ?? state;
  if (Object.values(now.takes).some((t) => t.mediaRef === job.resultPath)) return null;
  if (!now.occurrences[job.occurrenceId])
    return L("Scenen finnes ikke lenger.", "The scene no longer exists.");
  const urls = await signedUrls([job.resultPath], 600);
  const url = urls[job.resultPath];
  if (!url)
    return L(
      "Videoen kunne ikke hentes fra lagringen.",
      "The video could not be fetched from storage.",
    );
  const res = await fetch(url);
  if (!res.ok)
    return L(
      `Videoen kunne ikke hentes (${res.status}).`,
      `The video could not be fetched (${res.status}).`,
    );
  const blob = await res.blob();
  const file = new File([blob], `AI-video (${job.provider}).mp4`, {
    type: blob.type || "video/mp4",
  });
  let media;
  // Video fra 2D-scenen (DEC-0083): bare bildet erstattes – scenens egen lyd spilles som før
  const fromScene = job.params?.["source"] === SCENE_VIDEO_SOURCE;
  try {
    media = await readFilmMetadata(file);
  } catch (e) {
    return L(
      `Videoen kunne ikke leses: ${(e as Error).message}`,
      `The video could not be read: ${(e as Error).message}`,
    );
  }
  // AI-videoens lyd spilles aldri som filmlyd: den legges inn som eget lydspor under (DEC-0085)
  const hadAudio = media.hasAudio;
  media = { ...media, hasAudio: false };
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
    fromScene
      ? L(
          `AI-video fra 2D-scenen (${job.provider}) som ny versjon`,
          `AI video from the 2D scene (${job.provider}) as new version`,
        )
      : L(`AI-video (${job.provider}) som ny versjon`, `AI video (${job.provider}) as new version`),
  );
  if (r.error && (cmds.current() ?? now).takes[takeId as never]) return null;
  if (r.error) return r.error;
  // Lyden i videoen blir et eget, dempet lydspor (DEC-0085); videoen spilles uten lyd
  if (hadAudio) {
    const name = L(`Lyd fra AI-video (${job.provider})`, `Audio from AI video (${job.provider})`);
    const wav = await audioFromVideo(blob, name);
    if (wav) {
      const startMs = typeof job.params?.["startMs"] === "number" ? job.params["startMs"] : 0;
      await addVideoAudioTrack(cmds.current() ?? now, cmds, job.occurrenceId, wav, name, startMs);
    }
  }
  return null;
}

/**
 * Følger opp AI-jobbene i hele prosjektet mens det er åpent (DEC-0072/0073): ingen bakgrunnsjobb, så
 * nettleseren til en redaktør sender ventende jobber brukeren har lagt i kø, henter ferdige videoer, legger
 * dem inn som versjon av scenen (kan angres; lagrer også siste bilde til neste segment) og merker jobber
 * plattformen stoppet. Starter aldri en ny generering. Kjører bare for redaktører.
 */
export function AiJobsWatcher({
  projectId,
  userId,
  editable,
}: {
  projectId: string;
  userId: string;
  editable: boolean;
}) {
  const jobs = useAiJobs(projectId, editable);
  const list = useMemo(() => jobs.data?.jobs ?? [], [jobs.data]);
  useVideoPolling(projectId, list, editable);
  // Prosjekttilstanden fra hurtigbufferen (samme spørring som sidene; ingen egen sanntidskanal)
  const project = useQuery({
    queryKey: projectStateKey(projectId),
    queryFn: () => fetchProjectState(projectId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    enabled: editable,
  });
  const cmds = useCommands(projectId, userId, editable);
  const state = project.data;
  useEffect(() => {
    if (!editable || !state) return;
    const stored = new Set(Object.values(state.takes).map((t) => t.mediaRef));
    for (const j of list)
      if (
        j.kind === "video" &&
        j.status === "done" &&
        j.resultPath &&
        j.occurrenceId &&
        !stored.has(j.resultPath)
      )
        void claimVideo(state, cmds, j);
  }, [list, state, cmds, editable]);
  return null;
}
