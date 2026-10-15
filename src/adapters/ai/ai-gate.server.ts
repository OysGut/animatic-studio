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
import { L, monthStartUtc } from "@/core";
import type { AnyClient } from "@/adapters/storage/project-rows";

export const ROLE_RANK: Record<string, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

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

/** Brukt denne måneden (USD) med eierens nøkler. */
export async function usedUsd(admin: AnyClient, ownerId: string): Promise<number> {
  const { data } = await admin
    .from("generation_jobs")
    .select("cost_usd")
    .eq("key_owner", ownerId)
    .neq("status", "failed")
    .gte("created_at", monthStartUtc(new Date()).toISOString())
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
    .eq("month", monthStartUtc(new Date()).toISOString().slice(0, 10))
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
    return L(
      "Prisen for jobben kunne ikke anslås, så kostnadstaket kan ikke kontrolleres. Jobben ble ikke sendt.",
      "The price of the job could not be estimated, so the cost cap cannot be checked. The job was not sent.",
    );
  const used = await usedUsd(admin, ownerId);
  if (!Number.isFinite(used))
    return L(
      "Forbruket for nøkkelen kunne ikke regnes ut, så kostnadstaket kan ikke kontrolleres. Jobben ble ikke sendt.",
      "The usage for the key could not be calculated, so the cost cap cannot be checked. The job was not sent.",
    );
  const total = includesThisJob ? used : used + estimate;
  if (total > cap + 1e-9)
    return L(
      `Kostnadstaket for nøkkelen (${cap.toFixed(2)} USD per måned) er nådd – brukt ca. ${(includesThisJob ? used - estimate : used).toFixed(2)} USD, denne jobben ca. ${estimate.toFixed(2)} USD. Eieren kan endre taket under «AI-leverandører».`,
      `The cost cap for the key (${cap.toFixed(2)} USD per month) has been reached – about ${(includesThisJob ? used - estimate : used).toFixed(2)} USD used, this job about ${estimate.toFixed(2)} USD. The owner can change the cap under “AI providers”.`,
    );
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
  const { count } = await admin
    .from("generation_jobs")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .neq("status", "failed")
    .neq("kind", "prompt")
    .gte("created_at", monthStartUtc(new Date()).toISOString());
  const used = count ?? 0;
  if (includesThisJob ? used > limit : used >= limit)
    return L(
      `Prosjektets AI-budsjett for denne måneden (${limit} genereringer) er brukt opp. Eieren kan endre budsjettet på prosjektoversikten.`,
      `The project's AI budget for this month (${limit} generations) has been used up. The owner can change the budget on the project overview.`,
    );
  return null;
}
