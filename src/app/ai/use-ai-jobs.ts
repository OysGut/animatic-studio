/**
 * AI-jobbene i prosjektet (DEC-0053, REQ-0292/0296): loggen i generation_jobs (bare lesing; serveren
 * skriver), de siste 300, og det nøyaktige antallet denne måneden (det som teller i budsjettet). Hentes på
 * nytt hvert femte sekund mens noe pågår, ellers hvert minutt.
 */
import { useQuery } from "@tanstack/react-query";
import { jobFromRow, jobState, monthStartUtc, type GenerationJob } from "@/core";
import { db } from "@/app/db";

export function aiJobsKey(projectId: string) {
  return ["ai-jobs", projectId] as const;
}

export interface AiJobs {
  readonly jobs: readonly GenerationJob[];
  /** Genereringer denne måneden som ikke feilet (null hvis tellingen ikke kunne hentes). */
  readonly monthCount: number | null;
}

const missing = (m: string) => /does not exist|schema cache|Could not find the table/i.test(m);

export function useAiJobs(projectId: string, enabled = true) {
  return useQuery({
    queryKey: aiJobsKey(projectId),
    enabled,
    queryFn: async (): Promise<AiJobs> => {
      const [list, count] = await Promise.all([
        db
          .from("generation_jobs")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(300),
        db
          .from("generation_jobs")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId)
          .neq("status", "failed")
          .gte("created_at", monthStartUtc(new Date()).toISOString()),
      ]);
      if (list.error) {
        // Før migrasjon 0010 finnes ikke loggen
        if (missing(list.error.message)) return { jobs: [], monthCount: 0 };
        throw new Error(list.error.message);
      }
      return {
        jobs: ((list.data ?? []) as Record<string, unknown>[]).map(jobFromRow),
        monthCount: count.error ? null : (count.count ?? 0),
      };
    },
    refetchInterval: (q) =>
      (q.state.data?.jobs ?? []).some((j) => jobState(j, new Date()) === "running") ? 5000 : 60000,
  });
}
