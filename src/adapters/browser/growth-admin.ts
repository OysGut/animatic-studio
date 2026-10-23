/**
 * G-5/G-8 i adminsiden: endringslogg (statistikk, retensjon, rydd nå), kvoter og hastighetsgrenser.
 * Alle funksjonene sjekker administrator i databasen (0097, 0101); klienten bare viser og sender.
 */
import { db } from "./client";

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export interface ChangeLogStat {
  readonly projectId: string;
  readonly projectName: string;
  readonly rows: number;
  readonly totalBytes: number;
  readonly oldestAt: string | null;
}
export interface ChangeLogStats {
  readonly retentionDays: number | null;
  readonly maxRows: number | null;
  readonly projects: readonly ChangeLogStat[];
}

async function rpc(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await db.rpc(name as never, args as never);
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchChangeLogStats(): Promise<ChangeLogStats> {
  const rows = ((await rpc("admin_change_log_stats")) as Record<string, unknown>[] | null) ?? [];
  return {
    retentionDays: num(rows[0]?.["retention_days"]),
    maxRows: num(rows[0]?.["max_rows"]),
    projects: rows.map((r) => ({
      projectId: String(r["project_id"]),
      projectName: String(r["project_name"] ?? ""),
      rows: Number(r["rows"] ?? 0),
      totalBytes: Number(r["total_bytes"] ?? 0),
      oldestAt: str(r["oldest_at"]),
    })),
  };
}

export async function setChangeLogRetention(days: number, maxRows: number): Promise<void> {
  await rpc("admin_set_change_log_retention", { p_days: days, p_max_rows: maxRows });
}

/** Rydder nå. Gir antall slettede endringer. */
export async function pruneChangeLogsNow(): Promise<number> {
  const rows = ((await rpc("prune_change_logs")) as { removed?: number }[] | null) ?? [];
  return rows.reduce((n, r) => n + Number(r.removed ?? 0), 0);
}

export interface UsageQuota {
  readonly id: string;
  readonly workspaceId: string | null;
  readonly workspaceName: string | null;
  readonly userId: string | null;
  readonly email: string | null;
  readonly maxStorageBytes: number | null;
  readonly maxProjects: number | null;
  readonly maxChangeLogRows: number | null;
  readonly maxUploadsPerHour: number | null;
  readonly usedStorageBytes: number;
  readonly usedProjects: number;
  readonly usedChangeLogRows: number;
}

export async function fetchUsageQuotas(): Promise<UsageQuota[]> {
  const rows = ((await rpc("admin_usage_quotas")) as Record<string, unknown>[] | null) ?? [];
  return rows.map((r) => ({
    id: String(r["quota_id"]),
    workspaceId: str(r["workspace_id"]),
    workspaceName: str(r["workspace_name"]),
    userId: str(r["user_id"]),
    email: str(r["email"]),
    maxStorageBytes: num(r["max_storage_bytes"]),
    maxProjects: num(r["max_projects"]),
    maxChangeLogRows: num(r["max_change_log_rows"]),
    maxUploadsPerHour: num(r["max_uploads_per_hour"]),
    usedStorageBytes: Number(r["used_storage_bytes"] ?? 0),
    usedProjects: Number(r["used_projects"] ?? 0),
    usedChangeLogRows: Number(r["used_change_log_rows"] ?? 0),
  }));
}

export interface QuotaInput {
  readonly workspaceId: string | null;
  readonly userId: string | null;
  readonly maxStorageBytes: number | null;
  readonly maxProjects: number | null;
  readonly maxChangeLogRows: number | null;
  readonly maxUploadsPerHour: number | null;
}

export async function setUsageQuota(q: QuotaInput): Promise<void> {
  await rpc("admin_set_usage_quota", {
    p_workspace_id: q.workspaceId,
    p_user_id: q.userId,
    p_max_storage_bytes: q.maxStorageBytes,
    p_max_projects: q.maxProjects,
    p_max_change_log_rows: q.maxChangeLogRows,
    p_max_uploads_per_hour: q.maxUploadsPerHour,
  });
}

export async function deleteUsageQuota(id: string): Promise<void> {
  await rpc("admin_delete_usage_quota", { p_id: id });
}

export interface RateLimitRule {
  readonly scope: string;
  readonly windowSeconds: number;
  readonly perKey: number;
  readonly perIp: number;
}

export async function fetchRateLimitRules(): Promise<RateLimitRule[]> {
  const rows = ((await rpc("admin_rate_limit_rules")) as Record<string, unknown>[] | null) ?? [];
  return rows.map((r) => ({
    scope: String(r["scope"]),
    windowSeconds: Number(r["window_seconds"]),
    perKey: Number(r["per_key"]),
    perIp: Number(r["per_ip"]),
  }));
}

export async function setRateLimitRule(r: RateLimitRule): Promise<void> {
  await rpc("admin_set_rate_limit_rule", {
    p_scope: r.scope,
    p_window_seconds: r.windowSeconds,
    p_per_key: r.perKey,
    p_per_ip: r.perIp,
  });
}
