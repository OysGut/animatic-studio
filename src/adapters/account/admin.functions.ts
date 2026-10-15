/**
 * Administratorens serverfunksjoner (DEC-0086, Mars 15.10.2026): alle brukerne med opprettet, sist aktiv,
 * status og AI-forbruk; blokkere, oppheve, slette (låst i 30 dager) og låse opp; gjøre andre til admin;
 * gi låste prosjekter ny eier; personvernerklæringens felt. Administrator ser aldri innholdet i prosjektene,
 * bare navnene. oystein@gutu.no er fast administrator og kan ikke blokkeres, slettes eller nedgraderes.
 * Kontoer som har stått låst for sletting i 30 dager, anonymiseres når administrator åpner siden.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { L, isUuid } from "@/core";
import type { AnyClient } from "@/adapters/storage/project-rows";
import { BAN_FOREVER, DELETE_AFTER_DAYS, type AuthAdmin, type AuthUser } from "./account.functions";

async function service(): Promise<AnyClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyClient;
}
const authAdmin = (db: AnyClient) => (db as unknown as { auth: { admin: AuthAdmin } }).auth.admin;
const emailOf = (claims: unknown) =>
  String((claims as { email?: unknown } | null)?.email ?? "")
    .trim()
    .toLowerCase();

async function permanentEmail(): Promise<string> {
  return (await import("./lock.server")).PERMANENT_ADMIN_EMAIL;
}

/** Er den som spør administrator? */
async function isAdmin(db: AnyClient, userId: string, email: string): Promise<boolean> {
  if (email && email === (await permanentEmail())) return true;
  const { data, error } = await db
    .from("app_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !error && !!data;
}

const NOT_ADMIN = () => L("Bare for administrator.", "Administrators only.");

async function allAuthUsers(db: AnyClient): Promise<AuthUser[]> {
  const out: AuthUser[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await authAdmin(db).listUsers({ page, perPage: 1000 });
    if (error || !data) break;
    out.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return out;
}

async function emailById(db: AnyClient, userId: string): Promise<string> {
  const users = await allAuthUsers(db);
  return (users.find((u) => u.id === userId)?.email ?? "").toLowerCase();
}

// ---------------------------------------------------------------- endelig sletting

/** Anonymiser én konto: innloggingen sperres, e-post, navn, nøkler og medlemskap fjernes; historikken står. */
export async function anonymizeAccount(db: AnyClient, userId: string): Promise<void> {
  await authAdmin(db).updateUserById(userId, {
    email: `deleted-${userId}@deleted.invalid`,
    email_confirm: true,
    user_metadata: {},
    ban_duration: BAN_FOREVER,
  });
  await db
    .from("profiles")
    .update({ display_name: "", locale: null } as never)
    .eq("user_id", userId);
  await db.from("ai_provider_keys").delete().eq("user_id", userId);
  await db.from("ai_account_limits").delete().eq("user_id", userId);
  // Medlemskap som ikke er eierskap, fjernes; eierskap blir stående til administrator gir prosjektet ny eier
  await db
    .from("project_members")
    .update({ removed_at: new Date().toISOString() } as never)
    .eq("user_id", userId)
    .neq("role", "owner")
    .is("removed_at", null);
  await db
    .from("account_status")
    .update({
      status: "deleted",
      delete_after: null,
      reason: "",
      changed_at: new Date().toISOString(),
    } as never)
    .eq("user_id", userId);
}

/** Kontoer der de 30 dagene er gått. */
export async function purgeDueAccounts(db: AnyClient, now = Date.now()): Promise<number> {
  const { data, error } = await db
    .from("account_status")
    .select("user_id")
    .eq("status", "deleting")
    .lt("delete_after", new Date(now).toISOString());
  if (error) return 0;
  const due = (data ?? []) as { user_id: string }[];
  for (const r of due) await anonymizeAccount(db, r.user_id);
  return due.length;
}

// ---------------------------------------------------------------- oversikten

export interface AdminUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly createdAt: string | null;
  readonly lastSignInAt: string | null;
  readonly lastActiveAt: string | null;
  readonly status: "active" | "blocked" | "deleting" | "deleted";
  readonly reason: string;
  readonly deleteAfter: string | null;
  readonly isAdmin: boolean;
  readonly permanentAdmin: boolean;
  readonly projects: { id: string; name: string; role: string }[];
  readonly spendUsd: number;
  readonly spend30Usd: number;
  readonly jobs: number;
}

export interface AdminProject {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly owners: { id: string; name: string; status: string }[];
  readonly lock: string | null;
}

export interface AdminOverview {
  readonly ok: boolean;
  readonly message?: string;
  readonly users: AdminUser[];
  readonly projects: AdminProject[];
  readonly purged: number;
  readonly permanentEmail: string;
}

export const fetchAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminOverview> => {
    const db = await service();
    const perm = await permanentEmail();
    const empty = { users: [], projects: [], purged: 0, permanentEmail: perm };
    if (!(await isAdmin(db, context.userId, emailOf(context.claims))))
      return { ok: false, message: NOT_ADMIN(), ...empty };
    const { error: schemaErr } = await db.from("account_status").select("user_id").limit(1);
    if (schemaErr)
      return {
        ok: false,
        message: L(
          "Databasen må oppdateres (migrasjon 0033) før adminsiden kan brukes.",
          "The database must be updated (migration 0033) before the admin page can be used.",
        ),
        ...empty,
      };
    const purged = await purgeDueAccounts(db);
    const authUsers = await allAuthUsers(db);
    const [{ data: st }, { data: admins }, { data: profs }, { data: mem }, { data: projs }] =
      await Promise.all([
        db.from("account_status").select("*"),
        db.from("app_admins").select("user_id"),
        db.from("profiles").select("user_id, display_name"),
        db.from("project_members").select("project_id, user_id, role").is("removed_at", null),
        db.from("projects").select("id, name, created_at, deleted_at"),
      ]);
    const status = new Map(
      ((st ?? []) as Record<string, unknown>[]).map((r) => [String(r["user_id"]), r]),
    );
    const adminSet = new Set(((admins ?? []) as { user_id: string }[]).map((r) => r.user_id));
    const names = new Map(
      ((profs ?? []) as { user_id: string; display_name: string }[]).map((r) => [
        r.user_id,
        r.display_name,
      ]),
    );
    const projects = (
      (projs ?? []) as {
        id: string;
        name: string;
        created_at: string;
        deleted_at: string | null;
      }[]
    ).filter((p) => !p.deleted_at);
    const projectName = new Map(projects.map((p) => [p.id, p.name]));
    const members = (mem ?? []) as { project_id: string; user_id: string; role: string }[];
    // Forbruk per bruker (alt som ikke feilet eller venter)
    const spend = new Map<string, { all: number; d30: number; n: number }>();
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (let from = 0; from < 200_000; from += 10_000) {
      const { data: jobs } = await db
        .from("generation_jobs")
        .select("created_by, cost_usd, created_at, status")
        .neq("status", "failed")
        .neq("status", "queued")
        .range(from, from + 9_999);
      const list = (jobs ?? []) as {
        created_by: string;
        cost_usd: number | string | null;
        created_at: string;
      }[];
      for (const j of list) {
        const s = spend.get(j.created_by) ?? { all: 0, d30: 0, n: 0 };
        const c = Number(j.cost_usd ?? 0);
        if (Number.isFinite(c)) {
          s.all += c;
          if (Date.parse(j.created_at) >= since) s.d30 += c;
        }
        s.n++;
        spend.set(j.created_by, s);
      }
      if (list.length < 10_000) break;
    }
    const statusOf = (id: string) => String(status.get(id)?.["status"] ?? "active");
    const users: AdminUser[] = authUsers.map((u) => {
      const s = status.get(u.id);
      const email = (u.email ?? "").toLowerCase();
      const sp = spend.get(u.id);
      return {
        id: u.id,
        email: statusOf(u.id) === "deleted" ? "" : (u.email ?? ""),
        displayName: names.get(u.id) ?? "",
        createdAt: u.created_at ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
        lastActiveAt: (s?.["last_active_at"] as string | null) ?? null,
        status: statusOf(u.id) as AdminUser["status"],
        reason: String(s?.["reason"] ?? ""),
        deleteAfter: (s?.["delete_after"] as string | null) ?? null,
        isAdmin: adminSet.has(u.id) || email === perm,
        permanentAdmin: email === perm,
        projects: members
          .filter((m) => m.user_id === u.id && projectName.has(m.project_id))
          .map((m) => ({ id: m.project_id, name: projectName.get(m.project_id)!, role: m.role }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        spendUsd: Math.round((sp?.all ?? 0) * 100) / 100,
        spend30Usd: Math.round((sp?.d30 ?? 0) * 100) / 100,
        jobs: sp?.n ?? 0,
      };
    });
    users.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    const adminProjects: AdminProject[] = projects
      .map((p) => {
        const owners = members
          .filter((m) => m.project_id === p.id && m.role === "owner")
          .map((m) => ({
            id: m.user_id,
            name: names.get(m.user_id) ?? "",
            status: statusOf(m.user_id),
          }));
        const lock = owners.some((o) => o.status === "active")
          ? null
          : owners.some((o) => o.status === "blocked")
            ? "owner_blocked"
            : owners.some((o) => o.status === "deleting")
              ? "owner_deleting"
              : owners.some((o) => o.status === "deleted")
                ? "owner_deleted"
                : "no_owner";
        return { id: p.id, name: p.name, createdAt: p.created_at, owners, lock };
      })
      .sort((a, b) => Number(!!b.lock) - Number(!!a.lock) || a.name.localeCompare(b.name));
    return { ok: true, users, projects: adminProjects, purged, permanentEmail: perm };
  });

// ---------------------------------------------------------------- handlinger

type Result = { ok: boolean; message: string };

const userAction = (d: unknown) => {
  const x = (d ?? {}) as Record<string, unknown>;
  if (typeof x["userId"] !== "string" || !isUuid(x["userId"]))
    throw new Error(L("Ugyldig bruker", "Invalid user"));
  const action = x["action"];
  if (action !== "block" && action !== "unblock" && action !== "delete" && action !== "unlock")
    throw new Error(L("Ukjent handling", "Unknown action"));
  const reason = typeof x["reason"] === "string" ? x["reason"].slice(0, 500) : "";
  return { userId: x["userId"], action, reason } as const;
};

export const adminSetUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(userAction)
  .handler(async ({ data, context }): Promise<Result> => {
    const db = await service();
    if (!(await isAdmin(db, context.userId, emailOf(context.claims))))
      return { ok: false, message: NOT_ADMIN() };
    if ((data.action === "block" || data.action === "delete") && data.userId === context.userId)
      return {
        ok: false,
        message: L(
          "Du kan ikke blokkere eller slette deg selv her.",
          "You cannot block or delete yourself here.",
        ),
      };
    const target = await emailById(db, data.userId);
    if (
      target === (await permanentEmail()) &&
      (data.action === "block" || data.action === "delete")
    )
      return {
        ok: false,
        message: L(
          "Den faste administratoren kan ikke blokkeres eller slettes.",
          "The permanent administrator cannot be blocked or deleted.",
        ),
      };
    const { data: cur } = await db
      .from("account_status")
      .select("status")
      .eq("user_id", data.userId)
      .maybeSingle();
    if ((cur as { status?: string } | null)?.status === "deleted")
      return {
        ok: false,
        message: L(
          "Kontoen er allerede slettet for godt.",
          "The account is already deleted for good.",
        ),
      };
    const now = new Date().toISOString();
    const row =
      data.action === "block"
        ? { status: "blocked", reason: data.reason, delete_after: null }
        : data.action === "delete"
          ? {
              status: "deleting",
              reason: data.reason,
              delete_after: new Date(Date.now() + DELETE_AFTER_DAYS * 86_400_000).toISOString(),
            }
          : { status: "active", reason: "", delete_after: null };
    const { error } = await db
      .from("account_status")
      .upsert(
        { user_id: data.userId, ...row, changed_by: context.userId, changed_at: now } as never,
        { onConflict: "user_id" },
      );
    if (error) return { ok: false, message: error.message };
    await authAdmin(db).updateUserById(data.userId, {
      ban_duration: row.status === "active" ? "none" : BAN_FOREVER,
    });
    return {
      ok: true,
      message:
        data.action === "block"
          ? L("Brukeren er blokkert.", "The user is blocked.")
          : data.action === "delete"
            ? L(
                `Kontoen er låst og slettes for godt om ${DELETE_AFTER_DAYS} dager.`,
                `The account is locked and will be deleted for good in ${DELETE_AFTER_DAYS} days.`,
              )
            : L("Kontoen er aktiv igjen.", "The account is active again."),
    };
  });

export const adminSetAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    if (typeof x["userId"] !== "string" || !isUuid(x["userId"]) || typeof x["on"] !== "boolean")
      throw new Error(L("Ugyldig bruker", "Invalid user"));
    return { userId: x["userId"], on: x["on"] };
  })
  .handler(async ({ data, context }): Promise<Result> => {
    const db = await service();
    if (!(await isAdmin(db, context.userId, emailOf(context.claims))))
      return { ok: false, message: NOT_ADMIN() };
    if ((await emailById(db, data.userId)) === (await permanentEmail()))
      return {
        ok: false,
        message: L(
          "Den faste administratoren kan ikke endres.",
          "The permanent administrator cannot be changed.",
        ),
      };
    const { error } = data.on
      ? await db
          .from("app_admins")
          .upsert({ user_id: data.userId, added_by: context.userId } as never, {
            onConflict: "user_id",
          })
      : await db.from("app_admins").delete().eq("user_id", data.userId);
    if (error) return { ok: false, message: error.message };
    return {
      ok: true,
      message: data.on
        ? L("Brukeren er administrator.", "The user is an administrator.")
        : L("Brukeren er ikke lenger administrator.", "The user is no longer an administrator."),
    };
  });

/**
 * Gi et prosjekt en ny eier. Den nye eieren må være aktiv. Tidligere eiere blir redaktører (blokkerte og
 * kontoer låst for sletting kan da få tilgang igjen hvis de låses opp); slettede kontoer fjernes.
 */
export const adminReassignProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    if (
      typeof x["projectId"] !== "string" ||
      !isUuid(x["projectId"]) ||
      typeof x["newOwnerId"] !== "string" ||
      !isUuid(x["newOwnerId"])
    )
      throw new Error(L("Ugyldig prosjekt eller bruker", "Invalid project or user"));
    return { projectId: x["projectId"], newOwnerId: x["newOwnerId"] };
  })
  .handler(async ({ data, context }): Promise<Result> => {
    const db = await service();
    if (!(await isAdmin(db, context.userId, emailOf(context.claims))))
      return { ok: false, message: NOT_ADMIN() };
    const { accountActive } = await import("./lock.server");
    if (!(await accountActive(db, data.newOwnerId)))
      return {
        ok: false,
        message: L(
          "Den nye eieren må ha en aktiv konto.",
          "The new owner must have an active account.",
        ),
      };
    const { data: owners } = await db
      .from("project_members")
      .select("user_id")
      .eq("project_id", data.projectId)
      .eq("role", "owner")
      .is("removed_at", null);
    const { data: existing } = await db
      .from("project_members")
      .select("user_id")
      .eq("project_id", data.projectId)
      .eq("user_id", data.newOwnerId)
      .maybeSingle();
    const now = new Date().toISOString();
    const { error } = existing
      ? await db
          .from("project_members")
          .update({ role: "owner", removed_at: null, can_approve_costs: true } as never)
          .eq("project_id", data.projectId)
          .eq("user_id", data.newOwnerId)
      : await db.from("project_members").insert({
          project_id: data.projectId,
          user_id: data.newOwnerId,
          role: "owner",
          can_approve_costs: true,
          invited_by: context.userId,
        } as never);
    if (error) return { ok: false, message: error.message };
    const { accountStatuses } = await import("./lock.server");
    const old = ((owners ?? []) as { user_id: string }[])
      .map((o) => o.user_id)
      .filter((id) => id !== data.newOwnerId);
    const st = await accountStatuses(db, old);
    for (const id of old) {
      const gone = st.get(id) === "deleted";
      await db
        .from("project_members")
        .update((gone ? { removed_at: now } : { role: "editor" }) as never)
        .eq("project_id", data.projectId)
        .eq("user_id", id);
    }
    return {
      ok: true,
      message: L("Prosjektet har fått ny eier.", "The project has a new owner."),
    };
  });

export const adminSavePrivacy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    const f = (k: string, max: number) => {
      const v = x[k];
      if (v !== undefined && typeof v !== "string")
        throw new Error(L("Ugyldig felt", "Invalid field"));
      return String(v ?? "").slice(0, max);
    };
    return {
      controller_name: f("controllerName", 200),
      org_number: f("orgNumber", 40),
      address: f("address", 400),
      contact_email: f("contactEmail", 200),
      storage_region: f("storageRegion", 200),
      note: f("note", 4000),
    };
  })
  .handler(async ({ data, context }): Promise<Result & { version?: number }> => {
    const db = await service();
    if (!(await isAdmin(db, context.userId, emailOf(context.claims))))
      return { ok: false, message: NOT_ADMIN() };
    const { data: last } = await db
      .from("privacy_policy")
      .select("version")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const version = Number((last as { version?: number } | null)?.version ?? 0) + 1;
    const { error } = await db
      .from("privacy_policy")
      .insert({ version, ...data, published_by: context.userId } as never);
    if (error) return { ok: false, message: error.message };
    return {
      ok: true,
      version,
      message: L(
        `Personvernerklæringen er lagret som versjon ${version}. Brukerne blir bedt om å lese den ved neste innlogging.`,
        `The privacy statement is saved as version ${version}. Users are asked to read it at their next sign-in.`,
      ),
    };
  });

// ---------------------------------------------------------------- AI-tilkoblinger (DEC-0088, migrasjon 0034)
// Mars 15.10.2026: «administrer lovlige api koblinger» og «legg til nytt api for ai generering». Logikken
// ligger i ai-models.server.ts; her sjekkes bare at den som spør er administrator.

export interface AiAdminOverview {
  readonly ok: boolean;
  readonly message?: string;
  /** Tabellene fra migrasjon 0034 finnes. */
  readonly ready: boolean;
  readonly settings: import("@/core").ModelSetting[];
  readonly requests: import("./ai-models.server").ProviderRequest[];
  readonly cron: import("./ai-models.server").CronRun | null;
}

export const fetchAiAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiAdminOverview> => {
    const db = await service();
    const empty = { ready: false, settings: [], requests: [], cron: null };
    if (!(await isAdmin(db, context.userId, emailOf(context.claims))))
      return { ok: false, message: NOT_ADMIN(), ...empty };
    const m = await import("./ai-models.server");
    const [s, r, cron] = await Promise.all([
      m.loadModelSettings(db),
      m.listProviderRequests(db),
      m.readCronRun(db),
    ]);
    if (!s.ready || !r.ready)
      return {
        ok: true,
        message: L(
          "Databasen må oppdateres (migrasjon 0034) før AI-tilkoblingene kan administreres.",
          "The database must be updated (migration 0034) before the AI connections can be managed.",
        ),
        ...empty,
      };
    return { ok: true, ready: true, settings: s.settings, requests: r.requests, cron };
  });

export const adminSetModelEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    if (
      typeof x["provider"] !== "string" ||
      typeof x["model"] !== "string" ||
      !x["model"] ||
      x["model"].length > 200 ||
      typeof x["enabled"] !== "boolean"
    )
      throw new Error(L("Ugyldig modell", "Invalid model"));
    return { provider: x["provider"], model: x["model"], enabled: x["enabled"] };
  })
  .handler(async ({ data, context }): Promise<Result> => {
    const db = await service();
    if (!(await isAdmin(db, context.userId, emailOf(context.claims))))
      return { ok: false, message: NOT_ADMIN() };
    const { setModelEnabled } = await import("./ai-models.server");
    return setModelEnabled(db, context.userId, data.provider, data.model, data.enabled);
  });

export const adminSaveCustomModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    // Den strenge kontrollen (leverandør, modell-ID, type, pris) står i kjernen og kjøres i handleren,
    // så administrator får meldingen i stedet for en feil
    const x = (d ?? {}) as Record<string, unknown>;
    return {
      provider: x["provider"],
      model: x["model"],
      kind: x["kind"],
      label: x["label"],
      priceUsd: x["priceUsd"],
      priceUnit: x["priceUnit"],
      note: x["note"],
    } as Record<string, unknown>;
  })
  .handler(async ({ data, context }): Promise<Result> => {
    const db = await service();
    if (!(await isAdmin(db, context.userId, emailOf(context.claims))))
      return { ok: false, message: NOT_ADMIN() };
    const { saveCustomModel } = await import("./ai-models.server");
    return saveCustomModel(db, context.userId, data);
  });

export const adminRemoveCustomModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    if (
      typeof x["provider"] !== "string" ||
      typeof x["model"] !== "string" ||
      x["model"].length > 200
    )
      throw new Error(L("Ugyldig modell", "Invalid model"));
    return { provider: x["provider"], model: x["model"] };
  })
  .handler(async ({ data, context }): Promise<Result> => {
    const db = await service();
    if (!(await isAdmin(db, context.userId, emailOf(context.claims))))
      return { ok: false, message: NOT_ADMIN() };
    const { removeCustomModel } = await import("./ai-models.server");
    return removeCustomModel(db, data.provider, data.model);
  });

export const adminAddProviderRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    return {
      name: typeof x["name"] === "string" ? x["name"].trim() : "",
      website: x["website"],
      docsUrl: x["docsUrl"],
      note: typeof x["note"] === "string" ? x["note"].trim() : "",
    };
  })
  .handler(async ({ data, context }): Promise<Result> => {
    const db = await service();
    if (!(await isAdmin(db, context.userId, emailOf(context.claims))))
      return { ok: false, message: NOT_ADMIN() };
    const { addProviderRequest, cleanUrl } = await import("./ai-models.server");
    if (!data.name || data.name.length > 120)
      return {
        ok: false,
        message: L(
          "Skriv navnet på leverandøren (høyst 120 tegn).",
          "Enter the name of the provider (120 characters at most).",
        ),
      };
    const website = cleanUrl(data.website);
    const docsUrl = cleanUrl(data.docsUrl);
    if (website === null || docsUrl === null)
      return {
        ok: false,
        message: L(
          "Nettadressene må begynne med https:// (eller http://).",
          "The web addresses must start with https:// (or http://).",
        ),
      };
    if (data.note.length > 2000)
      return { ok: false, message: L("Merknaden er for lang.", "The note is too long.") };
    return addProviderRequest(db, context.userId, {
      name: data.name,
      website,
      docsUrl,
      note: data.note,
    });
  });

export const adminSetProviderRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    const status = x["status"];
    if (typeof x["id"] !== "string" || !isUuid(x["id"]))
      throw new Error(L("Ugyldig ønske", "Invalid request"));
    if (status !== "open" && status !== "done" && status !== "rejected")
      throw new Error(L("Ugyldig status", "Invalid status"));
    return { id: x["id"], status } as const;
  })
  .handler(async ({ data, context }): Promise<Result> => {
    const db = await service();
    if (!(await isAdmin(db, context.userId, emailOf(context.claims))))
      return { ok: false, message: NOT_ADMIN() };
    const { setProviderRequestStatus } = await import("./ai-models.server");
    return setProviderRequestStatus(db, data.id, data.status);
  });
