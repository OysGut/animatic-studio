/**
 * Forbruk og budsjett for AI-generering (DEC-0053, REQ-0279–0284). Budsjettet er et antall genereringer
 * per kalendermåned for prosjektet; prisen per bilde er et anslag satt av eieren (Lovable oppgir ikke
 * prisen per kall på forhånd), så beløpene er alltid merket som anslag (REQ-0281).
 */
import type { Project } from "../model";

/** En rad i loggen over AI-genereringer (generation_jobs). */
export interface GenerationJob {
  readonly id: string;
  readonly kind: "image" | "video";
  readonly provider: string;
  readonly model: string;
  readonly prompt: string;
  readonly assetId: string | null;
  /** «lost»: tjenesten laget resultatet (og tok betalt), men det kunne ikke lagres. */
  readonly status: "running" | "done" | "failed" | "lost";
  readonly error: string | null;
  readonly resultPath: string | null;
  readonly createdAt: string;
  readonly finishedAt: string | null;
  readonly createdBy: string;
  /** Anslått kostnad da jobben ble startet (null = ukjent). */
  readonly estimatedCost: number | null;
  readonly occurrenceId: string | null;
  readonly segmentId: string | null;
}

export function jobFromRow(r: Record<string, unknown>): GenerationJob {
  const opt = (v: unknown) => (v === null || v === undefined ? null : String(v));
  return {
    id: String(r["id"]),
    kind: r["kind"] === "video" ? "video" : "image",
    provider: String(r["provider"] ?? ""),
    model: String(r["model"] ?? ""),
    prompt: String(r["prompt"] ?? ""),
    assetId: opt(r["asset_id"]),
    status:
      r["status"] === "done"
        ? "done"
        : r["status"] === "failed"
          ? "failed"
          : r["status"] === "lost"
            ? "lost"
            : "running",
    error: opt(r["error"]),
    resultPath: opt(r["result_path"]),
    createdAt: String(r["created_at"] ?? ""),
    finishedAt: opt(r["finished_at"]),
    createdBy: String(r["created_by"] ?? ""),
    estimatedCost:
      r["estimated_cost"] === null || r["estimated_cost"] === undefined
        ? null
        : Number(r["estimated_cost"]),
    occurrenceId: opt(r["occurrence_id"]),
    segmentId: opt(r["segment_id"]),
  };
}

/** En jobb som har stått som «pågår» i over ti minutter, har sannsynligvis stoppet (fanen ble lukket). */
export const STALE_JOB_MS = 10 * 60 * 1000;

export type JobState = "running" | "done" | "failed" | "lost" | "stale";

export function jobState(j: GenerationJob, now: Date): JobState {
  if (j.status !== "running") return j.status;
  const t = Date.parse(j.createdAt);
  return Number.isFinite(t) && now.getTime() - t > STALE_JOB_MS ? "stale" : "running";
}

export const JOB_STATE_LABEL: Record<JobState, string> = {
  running: "Pågår",
  done: "Ferdig",
  failed: "Feilet",
  lost: "Betalt, ikke lagret",
  stale: "Stoppet underveis",
};

/** Første øyeblikk i kalendermåneden (UTC). */
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface AiUsage {
  /** Genereringer denne måneden som teller mot budsjettet (alt som ikke feilet). */
  readonly used: number;
  /** Månedens ramme, eller null (bare de faste grensene). */
  readonly limit: number | null;
  /** Hvor mange som er igjen (null = ingen egen ramme). */
  readonly remaining: number | null;
  /** Anslått kostnad denne måneden, eller null når prisen er ukjent for alle. */
  readonly estimatedCost: number | null;
  /** Noen av jobbene mangler anslag (summen er da for lav). */
  readonly partlyUnknown: boolean;
  /** Anslag for neste generering, eller null. */
  readonly nextCost: number | null;
}

export function aiUsage(
  project: Pick<Project, "aiMonthLimit" | "aiPricePerImage">,
  jobs: readonly GenerationJob[],
  now: Date,
  /** Nøyaktig antall denne måneden fra databasen (listen kan være avkortet). */
  monthCount?: number,
): AiUsage {
  const from = monthStartUtc(now).getTime();
  const month = jobs.filter((j) => j.status !== "failed" && Date.parse(j.createdAt) >= from);
  const known = month.filter((j) => j.estimatedCost !== null);
  const limit = project.aiMonthLimit ?? null;
  const used = Math.max(month.length, monthCount ?? 0);
  return {
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    estimatedCost: known.length ? known.reduce((a, j) => a + (j.estimatedCost ?? 0), 0) : null,
    partlyUnknown: known.length < month.length,
    nextCost: project.aiPricePerImage ?? null,
  };
}

/** «12,50 kreditter». */
export function formatCredits(n: number): string {
  return `${n.toLocaleString("nb-NO", { maximumFractionDigits: 2 })} kreditter`;
}
