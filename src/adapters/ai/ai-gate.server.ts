/**
 * Felles kostnadsport for genereringer med egne nøkler (DEC-0069, REQ-0279–0284, REQ-0302). BARE PÅ
 * SERVEREN.
 *
 * - Nøkkelen: et prosjekt bruker nøklene til prosjektets eiere (den som ber om genereringen først, hvis hen
 *   er eier). Redaktører kan generere med eierens nøkkel, alltid med bekreftelse og innenfor tak og budsjett.
 * - Overordnet tak: summen av anslått kostnad (USD) denne måneden for alle jobber med eierens nøkler, pluss
 *   den nye jobben, må være innenfor eierens tak (ai_account_limits). Kontrolleres før jobben registreres og
 *   igjen etter (samtidige jobber).
 * - Prosjektets eget budsjett (antall genereringer per måned, DEC-0053) gjelder i tillegg.
 */
import { monthStartUtc } from "@/core";
import type { AnyClient } from "@/adapters/storage/project-rows";
import { t as tk } from "@/core/i18n/keyed";

export const ROLE_RANK: Record<string, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

/** Only generateText tasks count, including user-triggered calls using the built-in fallback. */
export async function userTextJobsInHour(admin: AnyClient, userId: string, hourAgo: string): Promise<number> {
  const { count, error } = await admin
    .from("generation_jobs")
    .select("id", { count: "exact", head: true })
    .eq("created_by", userId)
    .eq("kind", "text")
    .or("params->>task.is.null,params->>task.not.in.(entity_analysis,translation_align)")
    .gte("created_at", hourAgo);
  if (error) throw new Error(tk("adapters-ai-ai-gate-server.user-text-jobs-in-hour.message.e0f99d10b26a"));
  return count ?? 0;
}

export interface KeyRow {
  readonly id: string;
  readonly user_id: string;
  readonly provider: string;
  readonly ciphertext: string;
  readonly iv: string;
  readonly key_version: number;
}

/** Rollen til brukeren i prosjektet (fra brukerens egen klient, så RLS gjelder). */
export async function memberRole(
  userDb: AnyClient,
  projectId: string,
  userId: string,
): Promise<string | null> {
  const { data } = await userDb
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .is("removed_at", null)
    .maybeSingle();
  const role = (data as { role?: string } | null)?.role ?? null;
  if (!role) return null;
  // Låst prosjekt eller konto som ikke er aktiv (DEC-0086): ingen AI-kall, bare lesing
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { writeBlocked } = await import("@/adapters/account/lock.server");
  if (await writeBlocked(supabaseAdmin as unknown as AnyClient, projectId, userId)) return "viewer";
  return role;
}

/** Eierne av prosjektet (aktive), med den som spør først hvis hen er eier. */
async function owners(
  admin: AnyClient,
  projectId: string,
  preferUserId: string,
): Promise<string[]> {
  const { data } = await admin
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("role", "owner")
    .is("removed_at", null);
  const ids = ((data ?? []) as { user_id: string }[]).map((r) => r.user_id).sort();
  return ids.includes(preferUserId)
    ? [preferUserId, ...ids.filter((x) => x !== preferUserId)]
    : ids;
}

/** Nøkkelen prosjektet kan bruke for leverandøren, eller null. */
export async function projectKey(
  admin: AnyClient,
  projectId: string,
  provider: string,
  requesterId: string,
): Promise<KeyRow | null> {
  for (const owner of await owners(admin, projectId, requesterId)) {
    const { data } = await admin
      .from("ai_provider_keys")
      .select("id, user_id, provider, ciphertext, iv, key_version")
      .eq("user_id", owner)
      .eq("provider", provider)
      .neq("status", "failed")
      .maybeSingle();
    if (data) return data as KeyRow;
  }
  return null;
}

/** Leverandørene prosjektet har nøkler til (for valglistene), uten nøklene. */
export async function projectProviderIds(
  admin: AnyClient,
  projectId: string,
  requesterId: string,
): Promise<string[]> {
  const ids = await owners(admin, projectId, requesterId);
  if (!ids.length) return [];
  const { data } = await admin
    .from("ai_provider_keys")
    .select("provider")
    .in("user_id", ids)
    .neq("status", "failed");
  return [...new Set(((data ?? []) as { provider: string }[]).map((r) => r.provider))].sort();
}

/** Periodestart (måned) i eierens tidssone, fra databasen (G-3 del 2) – samme grense som ai_spend. */
async function ownerMonthStart(admin: AnyClient, ownerId: string): Promise<{ since: string; month: string }> {
  const [{ data: since, error: e1 }, { data: month, error: e2 }] = await Promise.all([
    admin.rpc("user_period_start", { p_user: ownerId, p_unit: "month" }),
    admin.rpc("user_period_start_date", { p_user: ownerId, p_unit: "month" }),
  ]);
  if (e1 || e2 || typeof since !== "string" || typeof month !== "string")
    throw new Error(String(e1?.message ?? e2?.message ?? "user_period_start"));
  return { since, month };
}

/** Brukt denne måneden (USD) med eierens nøkler, i eierens tidssone (G-3 del 2). */
export async function usedUsd(admin: AnyClient, ownerId: string): Promise<number> {
  const { since, month } = await ownerMonthStart(admin, ownerId);
  const { data } = await admin
    .from("generation_jobs")
    .select("cost_usd")
    .eq("key_owner", ownerId)
    .neq("status", "failed")
    .gte("created_at", since)
    .limit(20000);
  const jobs = ((data ?? []) as { cost_usd: number | string | null }[]).reduce(
    // Ugyldige tall telles som 0 her, så summen aldri blir NaN (NaN ville sluppet forbi taket)
    (t, r) => t + finite(r.cost_usd),
    0,
  );
  // Forbruk fra prosjekter som er slettet for godt (ai_spend)
  const { data: kept } = await admin
    .from("ai_spend")
    .select("usd")
    .eq("key_owner", ownerId)
    .eq("month", month)
    .maybeSingle();
  const k = (kept as { usd?: number | string | null } | null)?.usd;
  return jobs + finite(k);
}

function finite(v: number | string | null | undefined): number {
  const n = v === null || v === undefined ? 0 : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Eierens tak (USD per måned), eller null. */
export async function capUsd(admin: AnyClient, ownerId: string): Promise<number | null> {
  const { data } = await admin
    .from("ai_account_limits")
    .select("monthly_cap_usd")
    .eq("user_id", ownerId)
    .maybeSingle();
  const c = (data as { monthly_cap_usd?: number | string | null } | null)?.monthly_cap_usd;
  return c === null || c === undefined ? null : Number(c);
}

/**
 * Er taket nådd? `includesThisJob`: jobben er allerede registrert (kontroll etter registrering).
 * Gir en norsk melding eller null.
 */
export async function overAccountCap(
  admin: AnyClient,
  ownerId: string,
  estimate: number,
  includesThisJob: boolean,
): Promise<string | null> {
  const cap = await capUsd(admin, ownerId);
  if (cap === null) return null;
  // Uten et gyldig anslag kan taket ikke kontrolleres: stopp heller enn å slippe gjennom (INV-12)
  if (!Number.isFinite(estimate))
    return tk("adapters-ai-ai-gate-server.over-account-cap.message.c279a49212be");
  const used = await usedUsd(admin, ownerId);
  if (!Number.isFinite(used))
    return tk("adapters-ai-ai-gate-server.over-account-cap.message.4d0adc86abf5");
  const total = includesThisJob ? used : used + estimate;
  if (total > cap + 1e-9)
    return tk("adapters-ai-ai-gate-server.over-account-cap.message.4fe934b43882", { value1: String(cap.toFixed(2)), value2: String((includesThisJob ? used - estimate : used).toFixed(2)), value3: String(estimate.toFixed(2)) });
  return null;
}

/** Prosjektets budsjett (antall genereringer per måned, DEC-0053). Gir melding eller null. */
export async function overProjectBudget(
  admin: AnyClient,
  projectId: string,
  limit: number | null | undefined,
  includesThisJob: boolean,
): Promise<string | null> {
  if (limit === null || limit === undefined) return null;
  // Månedsstarten i prosjektets budsjettidssone (G-3 del 2) – samme grense som databasetriggerne
  const { data: since, error: pe } = await admin.rpc("project_period_start", {
    p_project: projectId,
    p_unit: "month",
  });
  if (pe || typeof since !== "string") throw new Error(String(pe?.message ?? "project_period_start"));
  const { count } = await admin
    .from("generation_jobs")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .neq("status", "failed")
    .neq("kind", "prompt")
    // Tekstkall (T1) teller heller ikke i genereringsbudsjettet, som AI-beskrivelsene
    .neq("kind", "text")
    .gte("created_at", since);
  const used = count ?? 0;
  if (includesThisJob ? used > limit : used >= limit)
    return tk("adapters-ai-ai-gate-server.over-project-budget.message.d516d5c0ac48", { limit: String(limit) });
  return null;
}
