/**
 * Lest-status for mislykkede AI-jobber (B-095, Mars 21.10.2026): personlig, lagres i profiles.ui_prefs
 * under nøkkelen «aiJobsRead». «aiJobsReadBefore» er tidspunktet for «Merk alle som lest»; «readIds» er
 * enkeltjobber merket etter det, begrenset til de siste 500. Ingenting slettes – leste feil vises nedtonet.
 * En ny feil (ferdig etter readBefore) tenner varseltrekanten igjen.
 */

/** Personlig lest-status i profiles.ui_prefs. */
export interface AiJobsReadPrefs {
  /** ISO-tidspunkt: alle feil ferdig før dette regnes som lest. */
  readonly readBefore?: string;
  /** Enkeltjobber merket som lest (nyeste sist), maks 500. */
  readonly readIds?: readonly string[];
}

export const AI_JOBS_READ_KEY = "aiJobsRead";
/** Maks antall enkelt-ID-er som huskes. */
export const MAX_READ_IDS = 500;

/** Typevakt for en lagret verdi (gamle eller ødelagte verdier gir standardverdien). */
export function isAiJobsReadPrefs(v: unknown): v is AiJobsReadPrefs {
  if (!v || typeof v !== "object") return false;
  const x = v as Record<string, unknown>;
  if (x["readBefore"] !== undefined && typeof x["readBefore"] !== "string") return false;
  if (
    x["readIds"] !== undefined &&
    (!Array.isArray(x["readIds"]) || !x["readIds"].every((i) => typeof i === "string"))
  )
    return false;
  return true;
}

interface JobLike {
  readonly id: string;
  readonly status: string;
  readonly createdAt: string;
  readonly finishedAt: string | null;
}

/** Er jobben en feil (mislykket eller tapt)? */
export const isFailedJob = (j: JobLike): boolean => j.status === "failed" || j.status === "lost";

/** Tidspunktet feilen ble kjent (ferdig, ellers opprettet). */
const failedAt = (j: JobLike): number => Date.parse(j.finishedAt ?? j.createdAt);

/** Er denne feilen lest for brukeren? En ny feil etter «alle lest» er ulest. */
export function isJobRead(j: JobLike, prefs: AiJobsReadPrefs): boolean {
  if (prefs.readIds?.includes(j.id)) return true;
  const before = prefs.readBefore ? Date.parse(prefs.readBefore) : Number.NaN;
  return Number.isFinite(before) && failedAt(j) <= before;
}

/** Uleste feil blant jobbene (bare failed/lost teller). */
export function unreadFailedJobs<J extends JobLike>(
  jobs: readonly J[],
  prefs: AiJobsReadPrefs,
): J[] {
  return jobs.filter((j) => isFailedJob(j) && !isJobRead(j, prefs));
}

/** Merk enkeltjobber som lest. Listen holdes på de siste 500. */
export function markJobsRead(
  prefs: AiJobsReadPrefs,
  ids: readonly string[],
): AiJobsReadPrefs {
  const known = new Set(prefs.readIds ?? []);
  const next = [...(prefs.readIds ?? [])];
  for (const id of ids)
    if (!known.has(id)) {
      known.add(id);
      next.push(id);
    }
  return {
    ...(prefs.readBefore ? { readBefore: prefs.readBefore } : {}),
    readIds: next.slice(-MAX_READ_IDS),
  };
}

/** Merk alle feil som lest: tidspunktet settes, enkeltlisten tømmes. */
export function markAllJobsRead(nowIso: string): AiJobsReadPrefs {
  return { readBefore: nowIso, readIds: [] };
}
