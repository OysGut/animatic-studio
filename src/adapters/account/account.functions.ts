/**
 * Serverfunksjoner for brukerens egen konto (DEC-0086): slett meg selv, AI-forbruk og valutakurser.
 * Sletting: kontoen låses i 30 dager (kan bare låses opp av administrator), innloggingen sperres, og
 * prosjektene brukeren eier, låses til administrator gir dem en ny eier. Ingenting slettes med en gang.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { L, isUuid, parseNorgesBankRates, type CostJobRow } from "@/core";
import type { AnyClient } from "@/adapters/storage/project-rows";

async function service(): Promise<AnyClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyClient;
}

const ROLE_RANK: Record<string, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };
/** Så lenge en slettet konto står låst før den slettes for godt. */
export const DELETE_AFTER_DAYS = 30;
/** Innloggingen sperres (Supabase: «ban»). */
export const BAN_FOREVER = "876000h";

const claimEmail = (claims: unknown) =>
  String((claims as { email?: unknown } | null)?.email ?? "")
    .trim()
    .toLowerCase();

// ---------------------------------------------------------------- slett meg selv

export const requestMyDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    if (typeof x["confirmEmail"] !== "string" || x["confirmEmail"].length > 320)
      throw new Error(L("Skriv e-postadressen din", "Type your email address"));
    return { confirmEmail: x["confirmEmail"] };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const email = claimEmail(context.claims);
    if (!email || data.confirmEmail.trim().toLowerCase() !== email)
      return {
        ok: false,
        message: L(
          "E-postadressen stemmer ikke med kontoen din.",
          "The email address does not match your account.",
        ),
      };
    const { PERMANENT_ADMIN_EMAIL } = await import("./lock.server");
    if (email === PERMANENT_ADMIN_EMAIL)
      return {
        ok: false,
        message: L(
          "Den faste administratorkontoen kan ikke slettes.",
          "The permanent administrator account cannot be deleted.",
        ),
      };
    const db = await service();
    const after = new Date(Date.now() + DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await db.from("account_status").upsert(
      {
        user_id: context.userId,
        status: "deleting",
        reason: "",
        changed_by: context.userId,
        changed_at: new Date().toISOString(),
        delete_after: after,
      } as never,
      { onConflict: "user_id" },
    );
    if (error)
      return {
        ok: false,
        message: L(
          "Databasen må oppdateres (migrasjon 0033) før kontoen kan slettes.",
          "The database must be updated (migration 0033) before the account can be deleted.",
        ),
      };
    const auth = (db as unknown as { auth: { admin: AuthAdmin } }).auth.admin;
    await auth.updateUserById(context.userId, { ban_duration: BAN_FOREVER });
    return {
      ok: true,
      message: L(
        `Kontoen er låst og slettes for godt ${after.slice(0, 10)}. Bare administrator kan låse den opp før det.`,
        `The account is locked and will be deleted for good on ${after.slice(0, 10)}. Only the administrator can unlock it before then.`,
      ),
    };
  });

export interface AuthAdmin {
  updateUserById(id: string, attrs: Record<string, unknown>): Promise<{ error: unknown }>;
  listUsers(o: { page: number; perPage: number }): Promise<{
    data: { users: AuthUser[] } | null;
    error: unknown;
  }>;
}
export interface AuthUser {
  id: string;
  email?: string | null;
  created_at?: string;
  last_sign_in_at?: string | null;
}

// ---------------------------------------------------------------- AI-forbruk

export type UsageScope = "mine" | "project" | "account";

export interface UsageResult {
  readonly ok: boolean;
  readonly message?: string;
  readonly rows: CostJobRow[];
  readonly projectNames: Record<string, string>;
  readonly userNames: Record<string, string>;
}

const COLS =
  "id, project_id, kind, provider, model, status, cost_usd, created_at, created_by, external_id, occurrence_id, asset_id, params";

function plainParams(p: unknown): Record<string, number | string | boolean | null> {
  const out: Record<string, number | string | boolean | null> = {};
  if (!p || typeof p !== "object") return out;
  for (const k of ["seconds", "startMs", "endMs", "piece", "pieces"]) {
    const v = (p as Record<string, unknown>)[k];
    if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

export function toCostRow(r: Record<string, unknown>): CostJobRow {
  const n = r["cost_usd"];
  return {
    id: String(r["id"]),
    projectId: String(r["project_id"]),
    kind: r["kind"] as CostJobRow["kind"],
    provider: String(r["provider"] ?? ""),
    model: String(r["model"] ?? ""),
    status: r["status"] as CostJobRow["status"],
    costUsd: n == null ? null : Number(n),
    createdAt: String(r["created_at"]),
    createdBy: String(r["created_by"] ?? ""),
    externalId: (r["external_id"] as string | null) ?? null,
    occurrenceId: (r["occurrence_id"] as string | null) ?? null,
    assetId: (r["asset_id"] as string | null) ?? null,
    params: plainParams(r["params"]),
  };
}

/** Visningsnavn for brukerne (profiler); faller tilbake på e-postens første del. */
export async function displayNames(db: AnyClient, ids: readonly string[]) {
  const out: Record<string, string> = {};
  if (!ids.length) return out;
  const { data } = await db
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", [...ids]);
  for (const r of (data ?? []) as { user_id: string; display_name: string }[])
    if (r.display_name) out[r.user_id] = r.display_name;
  return out;
}

export const fetchAiUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    const scope = x["scope"];
    if (scope !== "mine" && scope !== "project" && scope !== "account")
      throw new Error(L("Ukjent utvalg", "Unknown selection"));
    const projectId = x["projectId"];
    if (scope !== "account" && !(typeof projectId === "string" && isUuid(projectId)))
      throw new Error(L("Ugyldig prosjekt", "Invalid project"));
    return { scope: scope as UsageScope, projectId: (projectId as string | undefined) ?? null };
  })
  .handler(async ({ data, context }): Promise<UsageResult> => {
    const db = await service();
    const empty = { rows: [], projectNames: {}, userNames: {} };
    if (data.scope !== "account") {
      const { data: m } = await db
        .from("project_members")
        .select("role")
        .eq("project_id", data.projectId!)
        .eq("user_id", context.userId)
        .is("removed_at", null)
        .maybeSingle();
      const rank = ROLE_RANK[(m as { role?: string } | null)?.role ?? ""] ?? 0;
      const need = data.scope === "project" ? ROLE_RANK["owner"]! : ROLE_RANK["editor"]!;
      if (rank < need)
        return {
          ok: false,
          message:
            data.scope === "project"
              ? L(
                  "Bare eieren ser hva prosjektet har kostet totalt.",
                  "Only the owner sees what the project has cost in total.",
                )
              : L(
                  "Forbruket vises for dem som kan endre prosjektet.",
                  "The usage is shown to those who can change the project.",
                ),
          ...empty,
        };
    }
    let q = db.from("generation_jobs").select(COLS).neq("status", "failed").neq("status", "queued");
    if (data.scope !== "account") q = q.eq("project_id", data.projectId!);
    if (data.scope !== "project") q = q.eq("created_by", context.userId);
    const { data: rows, error } = await q.order("created_at", { ascending: true }).limit(20000);
    if (error) return { ok: false, message: error.message, ...empty };
    const list = ((rows ?? []) as Record<string, unknown>[]).map(toCostRow);
    const pids = [...new Set(list.map((r) => r.projectId))];
    const projectNames: Record<string, string> = {};
    if (pids.length) {
      const { data: ps } = await db.from("projects").select("id, name").in("id", pids);
      for (const p of (ps ?? []) as { id: string; name: string }[]) projectNames[p.id] = p.name;
    }
    const userNames = await displayNames(db, [...new Set(list.map((r) => r.createdBy))]);
    return { ok: true, rows: list, projectNames, userNames };
  });

// ---------------------------------------------------------------- valutakurs (Norges Bank)

const rateCache = new Map<string, { at: number; rates: [string, number][] }>();

/** USD→NOK per dag fra Norges Bank for perioden (ti dager før start tas med for helger og helligdager). */
export const fetchUsdNokRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    const ok = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (!ok(x["from"]) || !ok(x["to"])) throw new Error(L("Ugyldig periode", "Invalid period"));
    return { from: x["from"] as string, to: x["to"] as string };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; rates: [string, number][] }> => {
    const start = new Date(Date.parse(data.from) - 10 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const key = `${start}:${data.to}`;
    const hit = rateCache.get(key);
    if (hit && Date.now() - hit.at < 6 * 60 * 60 * 1000) return { ok: true, rates: hit.rates };
    try {
      const url = `https://data.norges-bank.no/api/data/EXR/B.USD.NOK.SP?format=sdmx-json&startPeriod=${start}&endPeriod=${data.to}&locale=no`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return { ok: false, rates: [] };
      const rates = [...parseNorgesBankRates(await res.json()).entries()];
      rateCache.set(key, { at: Date.now(), rates });
      return { ok: true, rates };
    } catch {
      return { ok: false, rates: [] };
    }
  });
