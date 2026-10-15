/**
 * AI-tilkoblinger og status for bakgrunnsjobben på serveren (Mars 15.10.2026, DEC-0088, migrasjon 0034).
 * BARE PÅ SERVEREN. Leser og skriver ai_model_settings, ai_provider_requests og app_status med
 * tjenestenøkkelen (tabellene kan bare skrives av serveren). Tilgangen (administrator) sjekkes i
 * serverfunksjonene i admin.functions.ts før noe her kalles.
 *
 * Alt tåler at tabellene ikke finnes ennå (database før 0034): da gjelder den innebygde katalogen som før,
 * og ingenting skrives.
 */
import {
  ALL_MODELS,
  L,
  disabledMessage,
  disabledReason,
  isProviderId,
  settingFromRow,
  validateCustomModel,
  type ModelSetting,
} from "@/core";
import { builtInModel } from "@/core/generation/providers";
import type { AnyClient } from "@/adapters/storage/project-rows";

export const CRON_STATUS_KEY = "cron.ai-jobs";

/** Innstillingene fra adminsiden; `ready` = tabellen finnes (migrasjon 0034). */
export async function loadModelSettings(
  db: AnyClient,
): Promise<{ ready: boolean; settings: ModelSetting[] }> {
  try {
    const { data, error } = await db.from("ai_model_settings").select("*");
    if (error) return { ready: false, settings: [] };
    return {
      ready: true,
      settings: ((data ?? []) as unknown[])
        .map(settingFromRow)
        .filter((s): s is ModelSetting => s !== null),
    };
  } catch {
    return { ready: false, settings: [] };
  }
}

// ---------------------------------------------------------------- administratorens endringer

type Result = { ok: boolean; message: string };

const MISSING = () =>
  L(
    "Databasen må oppdateres (migrasjon 0034) før AI-tilkoblingene kan endres.",
    "The database must be updated (migration 0034) before the AI connections can be changed.",
  );

/** Slå en leverandør ('*') eller en modell av eller på for alle brukere. */
export async function setModelEnabled(
  db: AnyClient,
  userId: string,
  provider: string,
  model: string,
  enabled: boolean,
): Promise<Result> {
  if (!isProviderId(provider))
    return { ok: false, message: L("Ukjent leverandør.", "Unknown provider.") };
  const { ready, settings } = await loadModelSettings(db);
  if (!ready) return { ok: false, message: MISSING() };
  const existing = settings.find((s) => s.provider === provider && s.model === model);
  if (model !== ALL_MODELS && !builtInModel(provider, model) && !existing?.custom)
    return {
      ok: false,
      message: L(
        "Modellen finnes ikke hos leverandøren.",
        "The model does not exist at the provider.",
      ),
    };
  const now = new Date().toISOString();
  const { error } = existing
    ? await db
        .from("ai_model_settings")
        .update({ enabled, updated_by: userId, updated_at: now } as never)
        .eq("provider", provider)
        .eq("model", model)
    : await db.from("ai_model_settings").insert({
        provider,
        model,
        enabled,
        custom: false,
        updated_by: userId,
        updated_at: now,
      } as never);
  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    message: enabled
      ? L("Slått på for alle brukere.", "Switched on for all users.")
      : L("Slått av for alle brukere.", "Switched off for all users."),
  };
}

/** Legg til (eller endre) en egen modell hos en leverandør vi allerede støtter. */
export async function saveCustomModel(
  db: AnyClient,
  userId: string,
  raw: unknown,
): Promise<Result> {
  const v = validateCustomModel(raw, (p, m) => !!builtInModel(p, m));
  if (!v.ok) return { ok: false, message: v.error };
  const { ready, settings } = await loadModelSettings(db);
  if (!ready) return { ok: false, message: MISSING() };
  const x = v.value;
  const existing = settings.find((s) => s.provider === x.provider && s.model === x.model);
  if (existing && !existing.custom)
    return {
      ok: false,
      message: L(
        "Modellen finnes allerede i den innebygde katalogen.",
        "The model is already in the built-in catalogue.",
      ),
    };
  const row = {
    kind: x.kind,
    label: x.label,
    price_usd: x.priceUsd,
    price_unit: x.priceUnit,
    note: x.note,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  const { error } = existing
    ? await db
        .from("ai_model_settings")
        .update(row as never)
        .eq("provider", x.provider)
        .eq("model", x.model)
    : await db.from("ai_model_settings").insert({
        provider: x.provider,
        model: x.model,
        enabled: true,
        custom: true,
        ...row,
      } as never);
  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    message: existing
      ? L(`«${x.label}» er oppdatert.`, `“${x.label}” has been updated.`)
      : L(
          `«${x.label}» er lagt til og vises nå i valglistene for alle som har koblet til leverandøren.`,
          `“${x.label}” has been added and now appears in the lists for everyone who has connected the provider.`,
        ),
  };
}

/** Fjern en egen modell (de innebygde kan bare slås av). */
export async function removeCustomModel(
  db: AnyClient,
  provider: string,
  model: string,
): Promise<Result> {
  const { ready, settings } = await loadModelSettings(db);
  if (!ready) return { ok: false, message: MISSING() };
  const existing = settings.find((s) => s.provider === provider && s.model === model);
  if (!existing?.custom)
    return {
      ok: false,
      message: L(
        "Bare modeller lagt til av administrator kan fjernes. De innebygde kan slås av.",
        "Only models added by an administrator can be removed. The built-in ones can be switched off.",
      ),
    };
  const { error } = await db
    .from("ai_model_settings")
    .delete()
    .eq("provider", provider)
    .eq("model", model)
    .eq("custom", true);
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: L("Modellen er fjernet.", "The model has been removed.") };
}

// ---------------------------------------------------------------- ønsker om nye leverandører

export type RequestStatus = "open" | "done" | "rejected";

export interface ProviderRequest {
  readonly id: string;
  readonly name: string;
  readonly website: string;
  readonly docsUrl: string;
  readonly note: string;
  readonly status: RequestStatus;
  readonly createdAt: string | null;
  readonly createdBy: string | null;
}

/** Nettadresse: tom, eller http(s) uten mellomrom (lagres som tekst, vises som lenke). */
export function cleanUrl(v: unknown, max = 400): string | null {
  if (v === undefined || v === null || v === "") return "";
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return "";
  if (s.length > max || /\s/.test(s)) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function listProviderRequests(
  db: AnyClient,
): Promise<{ ready: boolean; requests: ProviderRequest[] }> {
  try {
    const { data, error } = await db
      .from("ai_provider_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return { ready: false, requests: [] };
    return {
      ready: true,
      requests: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r["id"] ?? ""),
        name: String(r["name"] ?? ""),
        website: String(r["website"] ?? ""),
        docsUrl: String(r["docs_url"] ?? ""),
        note: String(r["note"] ?? ""),
        status: (["open", "done", "rejected"].includes(String(r["status"]))
          ? r["status"]
          : "open") as RequestStatus,
        createdAt: typeof r["created_at"] === "string" ? r["created_at"] : null,
        createdBy: typeof r["created_by"] === "string" ? r["created_by"] : null,
      })),
    };
  } catch {
    return { ready: false, requests: [] };
  }
}

export async function addProviderRequest(
  db: AnyClient,
  userId: string,
  input: { name: string; website: string; docsUrl: string; note: string },
): Promise<Result> {
  const { error } = await db.from("ai_provider_requests").insert({
    id: crypto.randomUUID(),
    name: input.name,
    website: input.website,
    docs_url: input.docsUrl,
    note: input.note,
    status: "open",
    created_by: userId,
  } as never);
  if (error) return { ok: false, message: MISSING() };
  return {
    ok: true,
    message: L(
      "Ønsket er lagret. Utvikleren lager koblingen i koden; status vises i listen.",
      "The request has been saved. The developer builds the connection in the code; the status is shown in the list.",
    ),
  };
}

export async function setProviderRequestStatus(
  db: AnyClient,
  id: string,
  status: RequestStatus,
): Promise<Result> {
  const { data, error } = await db
    .from("ai_provider_requests")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, message: MISSING() };
  if (!data) return { ok: false, message: L("Ønsket finnes ikke.", "The request does not exist.") };
  const { error: upErr } = await db
    .from("ai_provider_requests")
    .update({ status } as never)
    .eq("id", id);
  if (upErr) return { ok: false, message: upErr.message };
  return { ok: true, message: L("Status er endret.", "The status has been changed.") };
}

// ---------------------------------------------------------------- bakgrunnsjobben

export interface CronRun {
  readonly at: string;
  readonly durationMs: number;
  readonly stopped: number;
  readonly sent: number;
  readonly purged: number;
  readonly checked: number;
  readonly done: number;
  readonly failed: number;
  readonly running: number;
  readonly skipped: string | null;
  readonly error: string | null;
}

/** Lagrer siste kjøring av /api/public/cron/ai-jobs. Feiler aldri (før 0034 finnes tabellen ikke). */
export async function recordCronRun(db: AnyClient, run: CronRun): Promise<void> {
  try {
    const value = { ...run, error: run.error ? run.error.slice(0, 1000) : null };
    const now = new Date().toISOString();
    const { data, error } = await db
      .from("app_status")
      .select("key")
      .eq("key", CRON_STATUS_KEY)
      .maybeSingle();
    if (error) return;
    if (data)
      await db
        .from("app_status")
        .update({ value, updated_at: now } as never)
        .eq("key", CRON_STATUS_KEY);
    else
      await db.from("app_status").insert({ key: CRON_STATUS_KEY, value, updated_at: now } as never);
  } catch {
    // Statusen er bare informasjon; jobben skal ikke feile av den
  }
}

/** Siste kjøring, eller null (aldri kjørt / før 0034). */
export async function readCronRun(db: AnyClient): Promise<CronRun | null> {
  try {
    const { data, error } = await db
      .from("app_status")
      .select("value, updated_at")
      .eq("key", CRON_STATUS_KEY)
      .maybeSingle();
    if (error || !data) return null;
    const v = ((data as { value?: unknown }).value ?? {}) as Record<string, unknown>;
    const n = (k: string) => (Number.isFinite(Number(v[k])) ? Number(v[k]) : 0);
    const at =
      typeof v["at"] === "string"
        ? v["at"]
        : String((data as { updated_at?: unknown }).updated_at ?? "");
    if (!at) return null;
    return {
      at,
      durationMs: n("durationMs"),
      stopped: n("stopped"),
      sent: n("sent"),
      purged: n("purged"),
      checked: n("checked"),
      done: n("done"),
      failed: n("failed"),
      running: n("running"),
      skipped: typeof v["skipped"] === "string" ? v["skipped"] : null,
      error: typeof v["error"] === "string" ? v["error"] : null,
    };
  } catch {
    return null;
  }
}

/**
 * Av/på-kontrollen alene (DEC-0088): serverfunksjonene som allerede kontrollerer modellen mot katalogen,
 * bruker denne og sender `settings` videre til providerModel/estimateCostUsd, så egne modeller får sine
 * egenskaper og sin pris. `message` er satt når administrator har slått av leverandøren eller modellen.
 */
export async function modelGate(
  db: AnyClient,
  provider: string,
  model: string,
): Promise<{ settings: ModelSetting[]; message: string | null }> {
  const { settings } = await loadModelSettings(db);
  const why = disabledReason(settings, provider, model);
  return { settings, message: why ? disabledMessage(why) : null };
}
