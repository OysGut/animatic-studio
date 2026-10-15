/**
 * Kontostatus og låste prosjekter på serveren (DEC-0086, migrasjon 0033). BARE PÅ SERVEREN.
 * Samme regler som private.project_lock / private.account_active i databasen, så serverfunksjonene kan gi en
 * forståelig melding før databasen avviser. Uten migrasjon 0033 (tabellene finnes ikke) er alt åpent.
 */
import { L } from "@/core";
import type { AnyClient } from "@/adapters/storage/project-rows";

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
      return L(
        `Prosjektet er låst fordi eieren er blokkert. Kontakt ${owner ? `eieren (${owner}) eller ` : ""}administrator (${admin}).`,
        `The project is locked because the owner is blocked. Contact ${owner ? `the owner (${owner}) or ` : ""}the administrator (${admin}).`,
      );
    case "owner_deleting":
    case "owner_deleted":
      return L(
        `Prosjektet er låst fordi eieren har slettet kontoen sin. Administrator kan gi prosjektet en ny eier: kontakt ${admin}.`,
        `The project is locked because the owner has deleted their account. The administrator can give the project a new owner: contact ${admin}.`,
      );
    default:
      return L(
        `Prosjektet er låst fordi det ikke har noen eier. Kontakt administrator (${admin}).`,
        `The project is locked because it has no owner. Contact the administrator (${admin}).`,
      );
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
    return L(
      "Kontoen din er ikke aktiv. Kontakt administrator.",
      "Your account is not active. Contact the administrator.",
    );
  const lock = await projectLock(db, projectId);
  return lock ? lockMessage(lock) : null;
}
