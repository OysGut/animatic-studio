/**
 * Køen for AI-jobber i grensesnittet (DEC-0070, REQ-0289, REQ-0295, REQ-0300): rekkefølge, plass i køen og
 * fremdrift. Fremdriften er leverandørens eget tall når det finnes; ellers et anslag fra hvor lenge jobben har
 * gått mot vanlig tid for leverandøren – og da sier teksten at det er et anslag (REQ-0110, REQ-0295).
 */
import type { GenerationJob } from "./cost";

import { t, tLocalized } from "@/core/i18n/keyed";

export const PRIORITY_LABEL = tLocalized({ 1: "core-generation-queue.priority-label.1.54d429857915", 2: "core-generation-queue.priority-label.2.5719f22f0f42", 3: "core-generation-queue.priority-label.3.374c0dbd119b" });

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
  return m <= 1 ? t("core-generation-queue.minutes.message.5ef032dbe94a") : t("core-generation-queue.minutes.message.419446e5f4ae", { m: String(m) });
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
        label: t("core-generation-queue.label.label.d5b28f7b1888"),
        reported: false,
      };
    const pos = queueOrder(queue).findIndex((j) => j.id === job.id);
    return {
      fraction: 0,
      label:
        pos >= 0
          ? t("core-generation-queue.label.label.3f75e6d4faca", { value1: String(pos + 1) })
          : t("core-generation-queue.label.label.2a9a29015402"),
      reported: false,
    };
  }
  if (job.status !== "running")
    return { fraction: job.status === "done" ? 1 : null, label: "", reported: false };
  if (typeof job.progress === "number")
    return {
      fraction: job.progress,
      label: t("core-generation-queue.label.label.ac98afcbbdb1", { value1: String(Math.round(job.progress * 100)), provider: String(job.provider) }),
      reported: true,
    };
  const since = Date.parse(job.startedAt ?? job.createdAt);
  const elapsed = Math.max(0, now - since);
  const typical = TYPICAL_VIDEO_MS[job.provider] ?? 180_000;
  if (job.kind !== "video")
    return { fraction: null, label: t("core-generation-queue.label.label.0f438bff92bc"), reported: false };
  if (elapsed > typical * 1.5)
    return {
      fraction: 0.95,
      label: t("core-generation-queue.label.label.2fe376f90ecf", { value1: String(minutes(elapsed)) }),
      reported: false,
    };
  return {
    fraction: Math.min(0.9, elapsed / typical),
    label: t("core-generation-queue.label.label.3ea4155ca526", { value1: String(minutes(Math.max(0, typical - elapsed))) }),
    reported: false,
  };
}
