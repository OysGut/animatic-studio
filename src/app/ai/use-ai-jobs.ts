/**
 * AI-jobbene i prosjektet (DEC-0053, REQ-0292/0296): loggen i generation_jobs (bare lesing; serveren
 * skriver), de siste 300, og det nøyaktige antallet denne måneden (det som teller i budsjettet). Hentes på
 * nytt hvert femte sekund mens noe pågår, ellers hvert minutt.
 */
import { useQuery } from "@tanstack/react-query";
import { jobFromRow, jobState, type GenerationJob } from "@/core";
import { fetchProjectJobs, fetchProjectPeriodStart } from "@/adapters/browser/ai";

export function aiJobsKey(projectId: string) {
  return ["ai-jobs", projectId] as const;
}

export interface AiJobs {
  readonly jobs: readonly GenerationJob[];
  /** Genereringer denne måneden som ikke feilet (null hvis tellingen ikke kunne hentes). */
  readonly monthCount: number | null;
  /** Starten på budsjettmåneden i prosjektets tidssone (G-3 del 2); null hvis den ikke kunne hentes. */
  readonly periodStart: Date | null;
}

const missing = (m: string) => /does not exist|schema cache|Could not find the table/i.test(m);

export function useAiJobs(projectId: string, enabled = true) {
  return useQuery({
    queryKey: aiJobsKey(projectId),
    enabled,
    queryFn: async (): Promise<AiJobs> => {
      const period = await fetchProjectPeriodStart(projectId);
      if (period.error || !period.data) throw new Error(period.error?.message ?? "project_period_start");
      const periodStart = new Date(period.data);
      const { list, count } = await fetchProjectJobs(projectId, period.data);
      if (list.error) {
        // Før migrasjon 0010 finnes ikke loggen
        if (missing(list.error.message)) return { jobs: [], monthCount: 0, periodStart };
        throw new Error(list.error.message);
      }
      return {
        jobs: ((list.data ?? []) as Record<string, unknown>[]).map(jobFromRow),
        monthCount: count.error ? null : (count.count ?? 0),
        periodStart,
      };
    },
    refetchInterval: (q) =>
      (q.state.data?.jobs ?? []).some((j) => {
        const st = jobState(j, new Date());
        return st === "running" || st === "queued";
      })
        ? 5000
        : 60000,
  });
}
