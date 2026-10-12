/**
 * Brukerens tilkoblede AI-leverandører og kostnadstak (DEC-0069). Bare kolonnene uten selve nøkkelen kan
 * leses (kolonnetilgang i migrasjon 0024): leverandør, navn, de fire siste tegnene og status.
 */
import { useQuery } from "@tanstack/react-query";
import { monthStartUtc } from "@/core";
import { db } from "@/app/db";

export interface ProviderKeyRow {
  readonly id: string;
  readonly provider: string;
  readonly label: string;
  readonly key_hint: string;
  readonly status: "untested" | "ok" | "failed";
  readonly status_message: string | null;
  readonly last_tested_at: string | null;
  readonly updated_at: string;
}

export interface AccountAi {
  readonly keys: readonly ProviderKeyRow[];
  readonly capUsd: number | null;
  /** Anslått bruk denne måneden med brukerens nøkler (USD). */
  readonly usedUsd: number;
  /** Databasen mangler migrasjon 0024. */
  readonly missing: boolean;
}

export const accountAiKey = (userId: string) => ["account-ai", userId] as const;

const missingTable = (m: string) =>
  /does not exist|schema cache|Could not find the table|permission denied for table/i.test(m);

export function useAccountAi(userId: string, enabled = true) {
  return useQuery({
    queryKey: accountAiKey(userId),
    enabled,
    queryFn: async (): Promise<AccountAi> => {
      const keys = await db
        .from("ai_provider_keys")
        .select("id, provider, label, key_hint, status, status_message, last_tested_at, updated_at")
        .eq("user_id", userId)
        .order("provider", { ascending: true });
      if (keys.error) {
        if (missingTable(keys.error.message))
          return { keys: [], capUsd: null, usedUsd: 0, missing: true };
        throw new Error(keys.error.message);
      }
      const month = monthStartUtc(new Date());
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
      const cap = (limit.data as { monthly_cap_usd?: number | string | null } | null)
        ?.monthly_cap_usd;
      const used =
        ((jobs.data ?? []) as { cost_usd: number | string | null }[]).reduce(
          (t, j) => t + (j.cost_usd === null ? 0 : Number(j.cost_usd)),
          0,
        ) + Number((kept.data as { usd?: number | string | null } | null)?.usd ?? 0);
      return {
        keys: (keys.data ?? []) as ProviderKeyRow[],
        capUsd: cap === null || cap === undefined ? null : Number(cap),
        usedUsd: Math.round(used * 100) / 100,
        missing: false,
      };
    },
  });
}
