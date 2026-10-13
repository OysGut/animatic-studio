/**
 * AI-data for nettleseren (KI-181): jobbloggen i generation_jobs (bare lesing; serveren skriver), brukerens
 * tilkoblede leverandører og kostnadstak (DEC-0053, DEC-0069).
 */
import { db, plainError, type BackendError, type BackendResult } from "./client";

export interface ProjectJobRows {
  /** De siste 300 jobbene, nyeste først. */
  readonly list: BackendResult<Record<string, unknown>[] | null>;
  /** Antall genereringer siden `since` som ikke feilet (AI-skrevne beskrivelser teller ikke). */
  readonly count: { readonly count: number | null; readonly error: BackendError | null };
}

export async function fetchProjectJobs(projectId: string, since: string): Promise<ProjectJobRows> {
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
      // AI-skrevne beskrivelser (DEC-0066) teller ikke i bildebudsjettet
      .neq("kind", "prompt")
      .gte("created_at", since),
  ]);
  return {
    list: { data: list.data as Record<string, unknown>[] | null, error: plainError(list.error) },
    count: { count: count.count, error: plainError(count.error) },
  };
}

/** Brukerens leverandørnøkler – bare kolonnene uten selve nøkkelen (kolonnetilgang i migrasjon 0024). */
export async function fetchProviderKeys(userId: string): Promise<BackendResult<unknown[] | null>> {
  const keys = await db
    .from("ai_provider_keys")
    .select("id, provider, label, key_hint, status, status_message, last_tested_at, updated_at")
    .eq("user_id", userId)
    .order("provider", { ascending: true });
  return { data: keys.data, error: plainError(keys.error) };
}

export interface AccountSpendRows {
  readonly limit: unknown;
  readonly jobs: unknown[] | null;
  readonly kept: unknown;
}

/** Kostnadstaket og bruken med brukerens nøkler denne måneden (`month` = første dag i måneden, UTC). */
export async function fetchAccountSpend(userId: string, month: Date): Promise<AccountSpendRows> {
  const [limit, jobs, kept] = await Promise.all([
    db.from("ai_account_limits").select("monthly_cap_usd").eq("user_id", userId).maybeSingle(),
    db
      .from("generation_jobs")
      .select("cost_usd")
      .eq("key_owner", userId)
      .neq("status", "failed")
      .gte("created_at", month.toISOString())
      .limit(5000),
    db
      .from("ai_spend")
      .select("usd")
      .eq("key_owner", userId)
      .eq("month", month.toISOString().slice(0, 10))
      .maybeSingle(),
  ]);
  return { limit: limit.data, jobs: jobs.data, kept: kept.data };
}
