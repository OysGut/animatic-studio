/**
 * Kontoen i nettleseren (DEC-0086, migrasjon 0033): egen konto, sist aktiv, språk, passord, personvern og
 * låste prosjekter. Uten migrasjon 0033 gir funksjonene «ukjent» i stedet for å feile.
 */
import { browserClient, db, plainError, type BackendError } from "./client";
import { isUiLang, type UiLang } from '@/core/i18n/languages';

export interface MyAccount {
  readonly status: "active" | "blocked" | "deleting" | "deleted";
  readonly isAdmin: boolean;
  readonly permanentAdmin: boolean;
  readonly locale: UiLang | null;
  readonly displayName: string;
  readonly privacyVersion: number | null;
  readonly acceptedVersion: number | null;
  readonly createdAt: string | null;
  /** Brukerens visningsvalg (migrasjon 0034, DEC-0088). Tom før migrasjonen. */
  readonly uiPrefs: Readonly<Record<string, unknown>>;
  /** B-097 (migrasjon 0073): ISO 3166-1 alpha-2. null = ikke valgt; undefined = før migrasjonen. */
  readonly country: string | null | undefined;
  /** B-117 (migrasjon 0085): GeoNames-id. null = ingen by; undefined = før migrasjonen. */
  readonly city: number | null | undefined;
}

/** Min konto, eller null før migrasjon 0033. */
export async function fetchMyAccount(): Promise<MyAccount | null> {
  const { data, error } = await db.rpc("my_account", {});
  if (error || !data) return null;
  const a = data as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : v == null ? null : Number(v));
  return {
    status: (a["status"] as MyAccount["status"]) ?? "active",
    isAdmin: a["is_admin"] === true,
    permanentAdmin: a["permanent_admin"] === true,
    locale: isUiLang(a['locale']) ? a['locale'] : null,
    displayName: typeof a["display_name"] === "string" ? a["display_name"] : "",
    privacyVersion: num(a["privacy_version"]),
    acceptedVersion: num(a["accepted_version"]),
    createdAt: typeof a["created_at"] === "string" ? a["created_at"] : null,
    uiPrefs:
      a["ui_prefs"] && typeof a["ui_prefs"] === "object" && !Array.isArray(a["ui_prefs"])
        ? (a["ui_prefs"] as Record<string, unknown>)
        : {},
    country: !("country" in a)
      ? undefined
      : typeof a["country"] === "string" && /^[A-Z]{2}$/.test(a["country"])
        ? a["country"]
        : null,
    city: !("city" in a) ? undefined : typeof a["city"] === "number" && a["city"] > 0 ? a["city"] : null,
  };
}

/** B-097: mitt land (ISO 3166-1 alpha-2). */
export async function saveMyCountry(country: string): Promise<BackendError | null> {
  const { error } = await db.rpc("set_my_country", { p_country: country });
  return plainError(error);
}

/** B-097: antall brukere per land, bare for administrator. null = ikke tilgjengelig. */
export async function fetchCountryCounts(): Promise<{ country: string | null; users: number }[] | null> {
  const { data, error } = await db.rpc("admin_country_counts", {});
  if (error || !Array.isArray(data)) return null;
  return (data as Record<string, unknown>[]).map((r) => ({
    country: typeof r["country"] === "string" ? r["country"] : null,
    users: Number(r["users"] ?? 0),
  }));
}

/** Sist aktiv (databasen oppdaterer høyst én gang i timen). Feiler stille. */
export async function touchActivity(): Promise<void> {
  await db.rpc("touch_activity", {});
}

export async function saveMyLocale(locale: UiLang): Promise<BackendError | null> {
  const { error } = await db.rpc("set_my_locale", { p_locale: locale });
  return plainError(error);
}

export async function saveDisplayName(name: string): Promise<BackendError | null> {
  const { error } = await db.rpc("upsert_my_profile", { p_display_name: name });
  return plainError(error);
}

export async function changePassword(password: string): Promise<BackendError | null> {
  const { error } = await browserClient.auth.updateUser({ password });
  return plainError(error);
}

export async function acceptPrivacy(version: number): Promise<BackendError | null> {
  const { error } = await db.rpc("accept_privacy", { p_version: version });
  return plainError(error);
}

export interface PrivacyFields {
  readonly version: number;
  readonly controllerName: string;
  readonly orgNumber: string;
  readonly address: string;
  readonly contactEmail: string;
  readonly storageRegion: string;
  readonly note: string;
  readonly publishedAt: string;
}

export function privacyFromRow(r: Record<string, unknown>): PrivacyFields {
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "");
  return {
    version: Number(r["version"]),
    controllerName: s("controller_name"),
    orgNumber: s("org_number"),
    address: s("address"),
    contactEmail: s("contact_email"),
    storageRegion: s("storage_region"),
    note: s("note"),
    publishedAt: s("published_at"),
  };
}

/** Gjeldende personvernerklæring (kan leses uten innlogging), eller null før migrasjon 0033. */
export async function fetchPrivacyPolicy(): Promise<PrivacyFields | null> {
  const { data, error } = await db
    .from("privacy_policy")
    .select("*")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return privacyFromRow(data as Record<string, unknown>);
}

export interface ProjectLockInfo {
  readonly lock: "owner_blocked" | "owner_deleting" | "owner_deleted" | "no_owner" | null;
  readonly ownerName: string | null;
  readonly adminEmail: string | null;
}

/** Er prosjektet låst? null = ukjent (før 0033 eller ikke medlem). */
export async function fetchProjectLock(projectId: string): Promise<ProjectLockInfo | null> {
  const { data, error } = await db.rpc("project_lock_info", { p_project: projectId });
  if (error || !data) return null;
  const a = data as Record<string, unknown>;
  return {
    lock: (a["lock"] as ProjectLockInfo["lock"]) ?? null,
    ownerName: typeof a["owner_name"] === "string" ? a["owner_name"] : null,
    adminEmail: typeof a["admin_email"] === "string" ? a["admin_email"] : null,
  };
}

/** Lagre visningsvalg på kontoen (slås sammen med det som er lagret; null fjerner). */
export async function saveUiPrefs(prefs: Record<string, unknown>): Promise<BackendError | null> {
  const { error } = await db.rpc("set_my_ui_prefs", { p_prefs: prefs });
  return plainError(error);
}

/** B-117: min by (GeoNames-id), null fjerner. */
export async function saveMyCity(city: number | null): Promise<BackendError | null> {
  const { error } = await db.rpc("set_my_city", { p_city: city });
  return plainError(error);
}

export interface GlobePoint {
  readonly lat: number;
  readonly lon: number;
  readonly active: boolean;
}

/** B-117: anonyme punkter til globusen på innloggingssiden. Tom liste før migrasjon 0085 eller ved feil. */
export async function fetchGlobePoints(): Promise<GlobePoint[]> {
  const { data, error } = await db.rpc("globe_points", {});
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[])
    .map((r) => ({ lat: Number(r["lat"]), lon: Number(r["lon"]), active: r["active"] === true }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}
