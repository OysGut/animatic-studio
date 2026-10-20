/**
 * Kontostatus og låste prosjekter på serveren (DEC-0086, migrasjon 0033). BARE PÅ SERVEREN.
 * Samme regler som private.project_lock / private.account_active i databasen, så serverfunksjonene kan gi en
 * forståelig melding før databasen avviser. Uten migrasjon 0033 (tabellene finnes ikke) er alt åpent.
 */

import type { AnyClient } from "@/adapters/storage/project-rows";
import { t } from "@/core/i18n/keyed";

export type AccountStatus = "active" | "blocked" | "deleting" | "deleted";
export type ProjectLock = "owner_blocked" | "owner_deleting" | "owner_deleted" | "no_owner";

/** Fast administrator (DEC-0086): kan aldri fjernes eller nedgraderes. */
export const PERMANENT_ADMIN_EMAIL = "oystein@gutu.no";

export async function accountStatuses(
  db: AnyClient,
  userIds: readonly string[],
): Promise<Map<string, AccountStatus>> {
  const out = new Map<string, AccountStatus>();
  if (!userIds.length) return out;
  const { data, error } = await db
    .from("account_status")
    .select("user_id, status")
    .in("user_id", [...userIds]);
  if (error) return out; // før migrasjon 0033
  for (const r of (data ?? []) as { user_id: string; status: AccountStatus }[])
    out.set(r.user_id, r.status);
  return out;
}

export async function accountActive(db: AnyClient, userId: string): Promise<boolean> {
  return ((await accountStatuses(db, [userId])).get(userId) ?? "active") === "active";
}

/** Hvorfor prosjektet er låst, eller null. */
export async function projectLock(db: AnyClient, projectId: string): Promise<ProjectLock | null> {
  const { data } = await db
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("role", "owner")
    .is("removed_at", null);
  const owners = ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
  const st = await accountStatuses(db, owners);
  if (st.size === 0 && owners.length) return null; // før 0033, eller alle eiere aktive
  const of = owners.map((o) => st.get(o) ?? "active");
  if (of.includes("active")) return null;
  if (of.includes("blocked")) return "owner_blocked";
  if (of.includes("deleting")) return "owner_deleting";
  if (of.includes("deleted")) return "owner_deleted";
  return "no_owner";
}

/** Melding til medlemmene om et låst prosjekt (med hvem de kan kontakte). */
export function lockMessage(lock: ProjectLock, ownerName?: string | null): string {
  const admin = PERMANENT_ADMIN_EMAIL;
  const owner = ownerName?.trim();
  switch (lock) {
    case "owner_blocked":
      return owner ? t("adapters-account-lock-server.owner-blocked-with-owner", { owner: String(owner), admin: String(admin) }) : t("adapters-account-lock-server.owner-blocked", { admin: String(admin) });
    case "owner_deleting":
    case "owner_deleted":
      return t("adapters-account-lock-server.lock-message.message.64581fe53b63", { admin: String(admin) });
    default:
      return t("adapters-account-lock-server.lock-message.message.32733622aa57", { admin: String(admin) });
  }
}

/**
 * Kan brukeren skrive i prosjektet? null = ja; ellers en melding (brukeren er ikke aktiv, eller prosjektet er
 * låst).
 */
export async function writeBlocked(
  db: AnyClient,
  projectId: string,
  userId: string,
): Promise<string | null> {
  if (!(await accountActive(db, userId)))
    return t("adapters-account-lock-server.write-blocked.message.0094128db376");
  const lock = await projectLock(db, projectId);
  return lock ? lockMessage(lock) : null;
}
