/**
 * Forbruk og budsjett for AI-generering (DEC-0053, REQ-0279–0284). Budsjettet er et antall genereringer
 * per kalendermåned for prosjektet; prisen per bilde er et anslag satt av eieren (Lovable oppgir ikke
 * prisen per kall på forhånd), så beløpene er alltid merket som anslag (REQ-0281).
 */
import type { Project, ProjectState } from "../model";
import { L, locale, localized } from "../i18n";

/** En rad i loggen over AI-genereringer (generation_jobs). */
export interface GenerationJob {
  readonly id: string;
  /** «prompt»: en språkmodell skrev bildebeskrivelsen (DEC-0066) – teller ikke i bildebudsjettet. */
  readonly kind: "image" | "video" | "prompt" | "sound";
  readonly provider: string;
  readonly model: string;
  readonly prompt: string;
  readonly assetId: string | null;
  /** «lost»: tjenesten laget resultatet (og tok betalt), men det kunne ikke lagres. */
  readonly status: "queued" | "running" | "done" | "failed" | "lost";
  readonly error: string | null;
  readonly resultPath: string | null;
  /** Teksten AI skrev (jobber av typen «prompt», migrasjon 0022). */
  readonly resultText: string | null;
  readonly createdAt: string;
  readonly finishedAt: string | null;
  readonly createdBy: string;
  /** Anslått kostnad da jobben ble startet (null = ukjent). */
  readonly estimatedCost: number | null;
  readonly occurrenceId: string | null;
  readonly segmentId: string | null;
  /** Anslått kostnad i USD med egen nøkkel (DEC-0069), eller null (innebygd leverandør). */
  readonly costUsd?: number | null;
  /** Leverandørens jobb-ID (video kjører hos leverandøren), eller null. */
  readonly externalId?: string | null;
  /** Bildet som ble sendt med (forbilde eller startbilde), sti i bøtta «assets». */
  readonly referencePath?: string | null;
  /** Innstillinger for jobben (lengde, modell, scene …). */
  readonly params?: Readonly<Record<string, unknown>>;
  /** Kø (DEC-0070, migrasjon 0025): 1 høy, 2 normal, 3 lav. */
  readonly priority?: 1 | 2 | 3;
  readonly queuePosition?: number | null;
  /** Fremdrift 0–1 når leverandøren oppgir den. */
  readonly progress?: number | null;
  /** Når jobben ble sendt til leverandøren. */
  readonly startedAt?: string | null;
}

export function jobFromRow(r: Record<string, unknown>): GenerationJob {
  const opt = (v: unknown) => (v === null || v === undefined ? null : String(v));
  return {
    id: String(r["id"]),
    kind:
      r["kind"] === "video"
        ? "video"
        : r["kind"] === "prompt"
          ? "prompt"
          : r["kind"] === "sound"
            ? "sound"
            : "image",
    provider: String(r["provider"] ?? ""),
    model: String(r["model"] ?? ""),
    prompt: String(r["prompt"] ?? ""),
    assetId: opt(r["asset_id"]),
    status:
      r["status"] === "queued"
        ? "queued"
        : r["status"] === "done"
          ? "done"
          : r["status"] === "failed"
            ? "failed"
            : r["status"] === "lost"
              ? "lost"
              : "running",
    error: opt(r["error"]),
    resultPath: opt(r["result_path"]),
    resultText: opt(r["result_text"]),
    createdAt: String(r["created_at"] ?? ""),
    finishedAt: opt(r["finished_at"]),
    createdBy: String(r["created_by"] ?? ""),
    estimatedCost:
      r["estimated_cost"] === null || r["estimated_cost"] === undefined
        ? null
        : Number(r["estimated_cost"]),
    occurrenceId: opt(r["occurrence_id"]),
    segmentId: opt(r["segment_id"]),
    costUsd: r["cost_usd"] === null || r["cost_usd"] === undefined ? null : Number(r["cost_usd"]),
    externalId: opt(r["external_id"]),
    referencePath: opt(r["reference_path"]),
    priority: r["priority"] === 1 || r["priority"] === 3 ? r["priority"] : 2,
    queuePosition:
      r["queue_position"] === null || r["queue_position"] === undefined
        ? null
        : Number(r["queue_position"]),
    progress: r["progress"] === null || r["progress"] === undefined ? null : Number(r["progress"]),
    startedAt: opt(r["started_at"]),
    params:
      r["params"] && typeof r["params"] === "object"
        ? (r["params"] as Record<string, unknown>)
        : {},
  };
}

/** En jobb som har stått som «pågår» i over ti minutter, har sannsynligvis stoppet (fanen ble lukket). */
export const STALE_JOB_MS = 10 * 60 * 1000;

export type JobState = "queued" | "running" | "done" | "failed" | "lost" | "stale";

export function jobState(j: GenerationJob, now: Date): JobState {
  if (j.status !== "running") return j.status;
  // Video kjører hos leverandøren og følges opp av serveren (høyst 3 timer)
  const t = Date.parse(j.startedAt ?? j.createdAt);
  const limit = j.kind === "video" ? 3 * 60 * 60 * 1000 : STALE_JOB_MS;
  return Number.isFinite(t) && now.getTime() - t > limit ? "stale" : "running";
}

export const JOB_STATE_LABEL: Record<JobState, string> = localized({
  queued: ["I kø", "Queued"],
  running: ["Pågår", "Running"],
  done: ["Ferdig", "Done"],
  failed: ["Feilet", "Failed"],
  lost: ["Betalt, ikke lagret", "Paid, not saved"],
  stale: ["Stoppet underveis", "Stopped along the way"],
});

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
  /**
   * Anslått API-kostnad i USD denne måneden for jobber med egne nøkler (DEC-0069, REQ-0405), også AI-skrevne
   * beskrivelser; null når ingen jobb brukte egen nøkkel. Belastes nøkkeleierens konto hos leverandøren.
   * Jobber som fortsatt venter i køen, telles ikke (de er ikke sendt og kan avbrytes uten kostnad).
   */
  readonly costUsd: number | null;
}

export function aiUsage(
  project: Pick<Project, "aiMonthLimit" | "aiPricePerImage">,
  jobs: readonly GenerationJob[],
  now: Date,
  /** Nøyaktig antall denne måneden fra databasen (listen kan være avkortet). */
  monthCount?: number,
): AiUsage {
  const from = monthStartUtc(now).getTime();
  // Beskrivelser skrevet av AI (DEC-0066) koster lite og teller ikke som generering
  const month = jobs.filter(
    (j) => j.kind !== "prompt" && j.status !== "failed" && Date.parse(j.createdAt) >= from,
  );
  const known = month.filter((j) => j.estimatedCost !== null);
  const limit = project.aiMonthLimit ?? null;
  const used = Math.max(month.length, monthCount ?? 0);
  // Bare jobber som er sendt (venter de i køen, er de ikke betalt og kan avbrytes gratis)
  const usd = jobs.filter(
    (j) =>
      j.status !== "failed" &&
      j.status !== "queued" &&
      Date.parse(j.createdAt) >= from &&
      typeof j.costUsd === "number" &&
      Number.isFinite(j.costUsd),
  );
  return {
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    estimatedCost: known.length ? known.reduce((a, j) => a + (j.estimatedCost ?? 0), 0) : null,
    partlyUnknown: known.length < month.length,
    nextCost: project.aiPricePerImage ?? null,
    costUsd: usd.length ? usd.reduce((a, j) => a + (j.costUsd ?? 0), 0) : null,
  };
}

/** «12,50 kreditter». */
export function formatCredits(n: number): string {
  const v = n.toLocaleString(locale(), { maximumFractionDigits: 2 });
  return L(`${v} kreditter`, `${v} credits`);
}

/**
 * AI-bilder som ble laget og lagret i lagringen, men aldri lagt inn i biblioteket (REQ-0291/0504, runde 1
 * natt til 12.10.2026): genereringen kjører på serveren, men versjonen lages av nettleseren etterpå. Ble
 * fanen lukket underveis, ligger bildet der uten versjon. Disse kan hentes inn fra AI-jobbene.
 */
export function unclaimedImageJobs(
  s: Pick<ProjectState, "assets" | "assetVersions">,
  jobs: readonly GenerationJob[],
  now: Date,
): GenerationJob[] {
  // Rett etter genereringen legger siden som bestilte bildet det inn selv: vent litt
  const settled = now.getTime() - CLAIM_GRACE_MS;
  const stored = new Set(Object.values(s.assetVersions).map((v) => v.mediaPath));
  return jobs.filter(
    (j) =>
      j.kind === "image" &&
      j.status === "done" &&
      j.resultPath !== null &&
      j.assetId !== null &&
      !!s.assets[j.assetId] &&
      !s.assets[j.assetId]!.archived &&
      !s.assets[j.assetId]!.removed &&
      !stored.has(j.resultPath) &&
      Date.parse(j.finishedAt ?? j.createdAt) <= settled,
  );
}

/**
 * Hvor lenge siden som bestilte et AI-bilde får legge det inn selv før andre tilbys å gjøre det (med
 * margin for at nettleserens klokke kan gå litt foran serverens).
 */
export const CLAIM_GRACE_MS = 5 * 60 * 1000;

/** Versjons-ID-en serveren valgte (`<prosjekt>/<ressurs>/<versjon>/fil`), eller null. */
export function versionIdFromResultPath(path: string): string | null {
  const id = path.split("/")[2] ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

/**
 * AI-videoer som er ferdige og lagret, men ikke lagt inn som versjon av scenen (DEC-0069, REQ-0180,
 * REQ-0291/0504): videoen lages hos leverandøren og hentes av serveren, men versjonen lages av nettleseren.
 */
export function unclaimedVideoJobs(
  s: Pick<ProjectState, "takes" | "occurrences">,
  jobs: readonly GenerationJob[],
  now: Date,
): GenerationJob[] {
  const stored = new Set(
    Object.values(s.takes)
      .map((t) => t.mediaRef)
      .filter((x): x is string => !!x),
  );
  const settled = now.getTime() - CLAIM_GRACE_MS;
  return jobs.filter(
    (j) =>
      j.kind === "video" &&
      j.status === "done" &&
      j.resultPath !== null &&
      j.occurrenceId !== null &&
      !!s.occurrences[j.occurrenceId] &&
      !stored.has(j.resultPath) &&
      Date.parse(j.finishedAt ?? j.createdAt) <= settled,
  );
}

/** Versjons-ID-en (take) serveren valgte for en AI-video (`<prosjekt>/films/<take>/fil`), eller null. */
export function takeIdFromResultPath(path: string): string | null {
  const [, folder, id] = path.split("/");
  return folder === "films" && id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/** Innsatsnivået jobben ble kjørt med (REQ-0275), eller null for eldre jobber uten det. */
export function jobEffort(
  job: Pick<GenerationJob, "params">,
): "fast" | "balanced" | "premium" | null {
  const e = job.params?.["effort"];
  return e === "fast" || e === "balanced" || e === "premium" ? e : null;
}
