/**
 * B-114 C0 (migrasjon 0080): funksjonsbrytere. Klienten bruker svarene bare til å skjule menyer;
 * databasen og serverfunksjonene håndhever. Ved feil (før migrasjonen, utlogget) regnes alt som av.
 */
import { db } from "./client";
import { FEATURE_KEYS, isFeatureKey, isFeatureState, parseMyFeatures, type FeatureKey, type FeatureState } from "@/core/community";

export async function fetchMyFeatures(): Promise<Readonly<Record<FeatureKey, boolean>>> {
  const { data, error } = await db.rpc("my_features" as never, {} as never);
  return parseMyFeatures(error ? null : data);
}

export interface FeatureTester {
  readonly userId: string;
  readonly email: string | null;
  readonly displayName: string | null;
}

export interface AdminFeature {
  readonly key: FeatureKey;
  readonly state: FeatureState;
  readonly changedAt: string | null;
  readonly testers: readonly FeatureTester[];
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const tester = (v: unknown): FeatureTester | null => {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  return typeof r["user_id"] === "string" ? { userId: r["user_id"], email: str(r["email"]), displayName: str(r["display_name"]) } : null;
};

/** Bare for administrator. null = ikke tilgjengelig (ingen tilgang eller før migrasjonen). */
export async function fetchAdminFeatures(): Promise<readonly AdminFeature[] | null> {
  const { data, error } = await db.rpc("admin_list_features" as never, {} as never);
  if (error || !Array.isArray(data)) return null;
  const out: AdminFeature[] = [];
  for (const row of data as Record<string, unknown>[]) {
    if (!isFeatureKey(row["key"]) || !isFeatureState(row["state"])) continue;
    out.push({
      key: row["key"],
      state: row["state"],
      changedAt: str(row["changed_at"]),
      testers: Array.isArray(row["testers"]) ? (row["testers"] as unknown[]).map(tester).filter((x): x is FeatureTester => x !== null) : [],
    });
  }
  return out.sort((a, b) => FEATURE_KEYS.indexOf(a.key) - FEATURE_KEYS.indexOf(b.key));
}

export async function setFeatureState(key: FeatureKey, state: FeatureState): Promise<boolean> {
  const { error } = await db.rpc("admin_set_feature" as never, { p_key: key, p_state: state, p_message: null } as never);
  return !error;
}

export async function setFeatureTesters(key: FeatureKey, userIds: readonly string[]): Promise<boolean> {
  const { error } = await db.rpc("admin_set_feature_testers" as never, { p_key: key, p_users: [...userIds] } as never);
  return !error;
}

/** Søk blant eksisterende brukere på e-post (bare administrator, minst tre tegn). */
export async function findUsers(query: string): Promise<readonly FeatureTester[]> {
  if (query.trim().length < 3) return [];
  const { data, error } = await db.rpc("admin_find_users" as never, { p_query: query.trim() } as never);
  if (error || !Array.isArray(data)) return [];
  return (data as unknown[]).map(tester).filter((x): x is FeatureTester => x !== null);
}
