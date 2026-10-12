/**
 * Køen for AI-jobber i grensesnittet (DEC-0070, REQ-0289, REQ-0295, REQ-0300): rekkefølge, plass i køen og
 * fremdrift. Fremdriften er leverandørens eget tall når det finnes; ellers et anslag fra hvor lenge jobben har
 * gått mot vanlig tid for leverandøren – og da sier teksten at det er et anslag (REQ-0110, REQ-0295).
 */
import type { GenerationJob } from "./cost";

export const PRIORITY_LABEL: Record<1 | 2 | 3, string> = { 1: "Høy", 2: "Normal", 3: "Lav" };

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
  return m <= 1 ? "under ett minutt" : `${m} minutter`;
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
        label: "I kø – venter på videoen til segmentet før (sammenheng)",
        reported: false,
      };
    const pos = queueOrder(queue).findIndex((j) => j.id === job.id);
    return {
      fraction: 0,
      label: pos >= 0 ? `I kø – nummer ${pos + 1}` : "I kø",
      reported: false,
    };
  }
  if (job.status !== "running")
    return { fraction: job.status === "done" ? 1 : null, label: "", reported: false };
  if (typeof job.progress === "number")
    return {
      fraction: job.progress,
      label: `${Math.round(job.progress * 100)} % (fra ${job.provider})`,
      reported: true,
    };
  const since = Date.parse(job.startedAt ?? job.createdAt);
  const elapsed = Math.max(0, now - since);
  const typical = TYPICAL_VIDEO_MS[job.provider] ?? 180_000;
  if (job.kind !== "video") return { fraction: null, label: "Lages …", reported: false };
  if (elapsed > typical * 1.5)
    return {
      fraction: 0.95,
      label: `Tar lengre tid enn vanlig (${minutes(elapsed)} så langt)`,
      reported: false,
    };
  return {
    fraction: Math.min(0.9, elapsed / typical),
    label: `Anslag: ca. ${minutes(Math.max(0, typical - elapsed))} igjen`,
    reported: false,
  };
}
