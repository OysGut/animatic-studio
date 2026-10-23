/**
 * G-5/G-8: endringslogg (statistikk, retensjon, «Rydd nå»), kvoter per arbeidsgruppe/bruker og
 * hastighetsgrenser. Databasen håndhever administrator; dette er bare styringen.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { locale } from "@/core";
import { gigabytesText, parseGigabytes, parseLimit, rateLimitError } from "@/core/admin-limits";
import {
  deleteUsageQuota,
  fetchChangeLogStats,
  fetchRateLimitRules,
  fetchUsageQuotas,
  pruneChangeLogsNow,
  setChangeLogRetention,
  setRateLimitRule,
  setUsageQuota,
  type RateLimitRule,
  type UsageQuota,
} from "@/adapters/browser/growth-admin";
import { findUsers, type FeatureTester } from "@/adapters/browser/features";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/core/i18n/keyed";

const STATS_KEY = ["admin-change-log-stats"] as const;
const QUOTAS_KEY = ["admin-usage-quotas"] as const;
const RULES_KEY = ["admin-rate-limits"] as const;
const n = (v: number) => v.toLocaleString(locale());
const mb = (b: number) => `${(b / 1024 / 1024).toLocaleString(locale(), { maximumFractionDigits: 1 })} MB`;

function Section({ id, title, note, children }: { id: string; title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-surface-1 p-4" data-testid={id}>
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      <p className="text-xs text-text-tertiary">{note}</p>
      {children}
    </section>
  );
}

export function GrowthAdmin() {
  return (
    <>
      <ChangeLogAdmin />
      <QuotasAdmin />
      <RateLimitsAdmin />
    </>
  );
}

function ChangeLogAdmin() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: STATS_KEY, queryFn: fetchChangeLogStats });
  const [days, setDays] = useState<string | null>(null);
  const [max, setMax] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = days ?? String(q.data?.retentionDays ?? "");
  const m = max ?? String(q.data?.maxRows ?? "");
  const pd = parseLimit(d, { min: 1, max: 3650 });
  const pm = parseLimit(m, { min: 100, max: 10_000_000 });
  const valid = pd.ok && pd.value !== null && pm.ok && pm.value !== null;
  async function run(f: () => Promise<string>) {
    setBusy(true);
    setMsg(null);
    try {
      setMsg(await f());
      await qc.invalidateQueries({ queryKey: STATS_KEY });
    } catch {
      setMsg(t("g5-admin.failed"));
    } finally {
      setBusy(false);
    }
  }
  const total = (q.data?.projects ?? []).reduce((s, p) => s + p.rows, 0);
  return (
    <Section id="admin-change-log" title={t("g5-admin.log.title")} note={t("g5-admin.log.note")}>
      {!q.data ? (
        <p className="text-xs text-text-tertiary">{q.isLoading ? t("b109.admin.loading") : t("g5-admin.unavailable")}</p>
      ) : (
        <>
          <p className="text-xs text-text-secondary">
            {t("g5-admin.log.total", { rows: n(total), projects: n(q.data.projects.length) })}
          </p>
          {q.data.projects.length ? (
            <table className="w-full text-left text-xs">
              <thead className="text-text-tertiary">
                <tr>
                  <th className="py-1 font-normal">{t("g5-admin.log.project")}</th>
                  <th className="py-1 font-normal">{t("g5-admin.log.rows")}</th>
                  <th className="py-1 font-normal">{t("g5-admin.log.size")}</th>
                </tr>
              </thead>
              <tbody>
                {q.data.projects.slice(0, 10).map((p) => (
                  <tr key={p.projectId} className="border-t border-border">
                    <td className="py-1" dir="auto">{p.projectName}</td>
                    <td className="py-1 tabular-nums">{n(p.rows)}</td>
                    <td className="py-1 tabular-nums">{mb(p.totalBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("g5-admin.log.days")}
              <Input className="h-8 w-28" inputMode="numeric" value={d} onChange={(e) => setDays(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("g5-admin.log.max-rows")}
              <Input className="h-8 w-32" inputMode="numeric" value={m} onChange={(e) => setMax(e.target.value)} />
            </label>
            <Button
              size="sm"
              disabled={busy || !valid}
              onClick={() =>
                void run(async () => {
                  await setChangeLogRetention(pd.ok ? pd.value! : 0, pm.ok ? pm.value! : 0);
                  return t("g5-admin.saved");
                })
              }
            >
              {t("g5-admin.save")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              data-testid="admin-prune-now"
              disabled={busy}
              onClick={() => void run(async () => t("g5-admin.log.pruned", { count: n(await pruneChangeLogsNow()) }))}
            >
              {t("g5-admin.log.prune")}
            </Button>
          </div>
          {!valid ? <p className="text-xs text-destructive">{t("g5-admin.log.invalid")}</p> : null}
        </>
      )}
      {msg ? <p role="status" className="text-xs text-text-secondary">{msg}</p> : null}
    </Section>
  );
}

function QuotasAdmin() {
  const q = useQuery({ queryKey: QUOTAS_KEY, queryFn: fetchUsageQuotas });
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<readonly FeatureTester[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [adding, setAdding] = useState<{ userId: string | null; workspaceId: string | null; label: string } | null>(null);
  return (
    <Section id="admin-quotas" title={t("g5-admin.quota.title")} note={t("g5-admin.quota.note")}>
      {!q.data ? (
        <p className="text-xs text-text-tertiary">{q.isLoading ? t("b109.admin.loading") : t("g5-admin.unavailable")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {q.data.length === 0 ? <li className="text-xs text-text-tertiary">{t("g5-admin.quota.none")}</li> : null}
          {q.data.map((x) => (
            <QuotaRow
              key={x.id}
              quota={x}
              label={x.workspaceName ?? x.email ?? x.workspaceId ?? x.userId ?? ""}
            />
          ))}
          {adding ? (
            <QuotaRow quota={null} target={adding} label={adding.label} onDone={() => setAdding(null)} />
          ) : null}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t("g5-admin.quota.find-user")}
          <Input
            className="h-8 w-56"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter") setHits(await findUsers(query));
            }}
          />
        </label>
        <Button size="sm" variant="secondary" onClick={async () => setHits(await findUsers(query))}>
          {t("g5-admin.quota.search")}
        </Button>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t("g5-admin.quota.workspace-id")}
          <Input className="h-8 w-72" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value.trim())} />
        </label>
        <Button
          size="sm"
          variant="secondary"
          disabled={!/^[0-9a-f-]{36}$/i.test(workspaceId)}
          onClick={() => setAdding({ userId: null, workspaceId, label: workspaceId })}
        >
          {t("g5-admin.quota.add-workspace")}
        </Button>
      </div>
      {hits.length ? (
        <ul className="flex flex-wrap gap-2">
          {hits.map((h) => (
            <li key={h.userId}>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setAdding({ userId: h.userId, workspaceId: null, label: h.email ?? h.userId });
                  setHits([]);
                }}
              >
                {t("g5-admin.quota.add-user", { user: h.email ?? h.displayName ?? h.userId })}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

function QuotaRow({
  quota,
  target,
  label,
  onDone,
}: {
  quota: UsageQuota | null;
  target?: { userId: string | null; workspaceId: string | null };
  label: string;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [gb, setGb] = useState(gigabytesText(quota?.maxStorageBytes ?? null));
  const [projects, setProjects] = useState(String(quota?.maxProjects ?? ""));
  const [rows, setRows] = useState(String(quota?.maxChangeLogRows ?? ""));
  const [uploads, setUploads] = useState(String(quota?.maxUploadsPerHour ?? ""));
  const [msg, setMsg] = useState<string | null>(null);
  const p = [parseGigabytes(gb), parseLimit(projects), parseLimit(rows), parseLimit(uploads)] as const;
  const valid = p.every((x) => x.ok);
  const v = (i: number) => (p[i]!.ok ? (p[i] as { value: number | null }).value : null);
  async function save() {
    setMsg(null);
    try {
      await setUsageQuota({
        workspaceId: quota?.workspaceId ?? target?.workspaceId ?? null,
        userId: quota?.workspaceId ? null : (quota?.userId ?? target?.userId ?? null),
        maxStorageBytes: v(0),
        maxProjects: v(1),
        maxChangeLogRows: v(2),
        maxUploadsPerHour: v(3),
      });
      await qc.invalidateQueries({ queryKey: QUOTAS_KEY });
      setMsg(t("g5-admin.saved"));
      onDone?.();
    } catch {
      setMsg(t("g5-admin.failed"));
    }
  }
  async function remove() {
    if (!quota) return onDone?.();
    try {
      await deleteUsageQuota(quota.id);
      await qc.invalidateQueries({ queryKey: QUOTAS_KEY });
    } catch {
      setMsg(t("g5-admin.failed"));
    }
  }
  const field = (lbl: string, val: string, set: (s: string) => void, used?: string) => (
    <label className="flex flex-col gap-1 text-xs text-text-secondary">
      {lbl}
      <Input className="h-8 w-28" inputMode="decimal" value={val} placeholder={t("g5-admin.quota.unlimited")} onChange={(e) => set(e.target.value)} />
      {used ? <span className="text-text-tertiary">{t("g5-admin.quota.used", { used })}</span> : null}
    </label>
  );
  return (
    <li className="flex flex-col gap-2 border-t border-border pt-2">
      <p className="text-xs font-medium text-text-primary" dir="auto">
        {(quota?.workspaceId ?? target?.workspaceId) ? t("g5-admin.quota.workspace", { name: label }) : t("g5-admin.quota.user", { name: label })}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        {field(t("g5-admin.quota.storage"), gb, setGb, quota ? mb(quota.usedStorageBytes) : undefined)}
        {field(t("g5-admin.quota.projects"), projects, setProjects, quota ? n(quota.usedProjects) : undefined)}
        {field(t("g5-admin.quota.log-rows"), rows, setRows, quota ? n(quota.usedChangeLogRows) : undefined)}
        {field(t("g5-admin.quota.uploads"), uploads, setUploads)}
        <Button size="sm" disabled={!valid} onClick={() => void save()}>
          {t("g5-admin.save")}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void remove()}>
          {quota ? t("g5-admin.quota.remove") : t("g5-admin.cancel")}
        </Button>
      </div>
      {!valid ? <p className="text-xs text-destructive">{t("g5-admin.quota.invalid")}</p> : null}
      {msg ? <p role="status" className="text-xs text-text-secondary">{msg}</p> : null}
    </li>
  );
}

function RateLimitsAdmin() {
  const q = useQuery({ queryKey: RULES_KEY, queryFn: fetchRateLimitRules });
  return (
    <Section id="admin-rate-limits" title={t("g5-admin.rate.title")} note={t("g5-admin.rate.note")}>
      {!q.data ? (
        <p className="text-xs text-text-tertiary">{q.isLoading ? t("b109.admin.loading") : t("g5-admin.unavailable")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {q.data.map((r) => <RateRow key={r.scope} rule={r} />)}
        </ul>
      )}
    </Section>
  );
}

function RateRow({ rule }: { rule: RateLimitRule }) {
  const qc = useQueryClient();
  const [w, setW] = useState(String(rule.windowSeconds));
  const [k, setK] = useState(String(rule.perKey));
  const [ip, setIp] = useState(String(rule.perIp));
  const [msg, setMsg] = useState<string | null>(null);
  const next = { scope: rule.scope, windowSeconds: Number(w), perKey: Number(k), perIp: Number(ip) };
  const bad = rateLimitError(next);
  async function save() {
    setMsg(null);
    try {
      await setRateLimitRule(next);
      await qc.invalidateQueries({ queryKey: RULES_KEY });
      setMsg(t("g5-admin.saved"));
    } catch {
      setMsg(t("g5-admin.failed"));
    }
  }
  const f = (lbl: string, val: string, set: (s: string) => void) => (
    <label className="flex flex-col gap-1 text-xs text-text-secondary">
      {lbl}
      <Input className="h-8 w-24" inputMode="numeric" value={val} onChange={(e) => set(e.target.value)} />
    </label>
  );
  return (
    <li className="flex flex-wrap items-end gap-2 border-t border-border pt-2">
      <code className="w-32 text-xs text-text-primary">{rule.scope}</code>
      {f(t("g5-admin.rate.window"), w, setW)}
      {f(t("g5-admin.rate.per-key"), k, setK)}
      {f(t("g5-admin.rate.per-ip"), ip, setIp)}
      <Button size="sm" disabled={bad} onClick={() => void save()}>
        {t("g5-admin.save")}
      </Button>
      {msg ? <span role="status" className="text-xs text-text-secondary">{msg}</span> : null}
    </li>
  );
}
