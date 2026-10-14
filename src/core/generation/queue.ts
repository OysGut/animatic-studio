/**
 * Køen for AI-jobber i grensesnittet (DEC-0070, REQ-0289, REQ-0295, REQ-0300): rekkefølge, plass i køen og
 * fremdrift. Fremdriften er leverandørens eget tall når det finnes; ellers et anslag fra hvor lenge jobben har
 * gått mot vanlig tid for leverandøren – og da sier teksten at det er et anslag (REQ-0110, REQ-0295).
 */
import type { GenerationJob } from "./cost";
import { L, localized } from "../i18n";

export const PRIORITY_LABEL = localized({
  1: ["Høy", "High"],
  2: ["Normal", "Normal"],
  3: ["Lav", "Low"],
});

/** Vanlig tid hos leverandøren for én video (anslag, millisekunder). */
const TYPICAL_VIDEO_MS: Record<string, number> = {
  runway: 90_000,
  fal: 180_000,
  google: 150_000,
  openai: 240_000,
};

/** Ventende jobber i den rekkefølgen køen sender dem (prioritet, så når de ble lagt i køen). */
export function queueOrder(jobs: readonly GenerationJob[]): GenerationJob[] {
  return jobs
    .filter((j) => j.status === "queued")
    .sort(
      (a, b) =>
        (a.priority ?? 2) - (b.priority ?? 2) ||
        (a.queuePosition ?? Date.parse(a.createdAt)) -
          (b.queuePosition ?? Date.parse(b.createdAt)) ||
        a.id.localeCompare(b.id),
    );
}

export interface JobProgress {
  /** 0–1 (null = ukjent). */
  readonly fraction: number | null;
  /** Kort tekst på norsk. */
  readonly label: string;
  /** Tallet kommer fra leverandøren (ikke et anslag). */
  readonly reported: boolean;
}

function minutes(ms: number): string {
  const m = Math.round(ms / 60_000);
  return m <= 1 ? L("under ett minutt", "less than a minute") : L(`${m} minutter`, `${m} minutes`);
}

export function jobProgress(
  job: GenerationJob,
  now: number,
  queue: readonly GenerationJob[] = [],
): JobProgress {
  if (job.status === "queued") {
    if (job.params && typeof job.params["chainAfter"] === "string")
      return {
        fraction: 0,
        label: L(
          "I kø – venter på videoen til segmentet før (sammenheng)",
          "In queue – waiting for the video of the previous segment (continuity)",
        ),
        reported: false,
      };
    const pos = queueOrder(queue).findIndex((j) => j.id === job.id);
    return {
      fraction: 0,
      label:
        pos >= 0
          ? L(`I kø – nummer ${pos + 1}`, `In queue – number ${pos + 1}`)
          : L("I kø", "In queue"),
      reported: false,
    };
  }
  if (job.status !== "running")
    return { fraction: job.status === "done" ? 1 : null, label: "", reported: false };
  if (typeof job.progress === "number")
    return {
      fraction: job.progress,
      label: L(
        `${Math.round(job.progress * 100)} % (fra ${job.provider})`,
        `${Math.round(job.progress * 100)} % (from ${job.provider})`,
      ),
      reported: true,
    };
  const since = Date.parse(job.startedAt ?? job.createdAt);
  const elapsed = Math.max(0, now - since);
  const typical = TYPICAL_VIDEO_MS[job.provider] ?? 180_000;
  if (job.kind !== "video")
    return { fraction: null, label: L("Lages …", "Generating …"), reported: false };
  if (elapsed > typical * 1.5)
    return {
      fraction: 0.95,
      label: L(
        `Tar lengre tid enn vanlig (${minutes(elapsed)} så langt)`,
        `Taking longer than usual (${minutes(elapsed)} so far)`,
      ),
      reported: false,
    };
  return {
    fraction: Math.min(0.9, elapsed / typical),
    label: L(
      `Anslag: ca. ${minutes(Math.max(0, typical - elapsed))} igjen`,
      `Estimate: about ${minutes(Math.max(0, typical - elapsed))} left`,
    ),
    reported: false,
  };
}
