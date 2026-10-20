/**
 * AI-forbruk og kostnadsrapport (DEC-0086). Brukes på kontosiden (alt jeg har brukt, alle prosjekter) og i
 * prosjektet («Mitt forbruk i prosjektet» for alle med endringsrett, «Prosjektet totalt» bare for eieren).
 * Kalendermåned eller hele perioden; dollar, eller kroner etter Norges Banks kurs; eksport til PDF/Word/Excel.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { buildCostReport, locale, reportMonths, tm, type CostJobRow, type Currency } from "@/core";
import {
  fetchAiUsage,
  fetchUsdNokRates,
  type UsageScope,
} from "@/adapters/account/account.functions";
import { Button } from "@/components/ui/button";
import { exportCostReport, type ExportFormat } from "./cost-export";
import { t as tk } from "@/core/i18n/keyed";

const money = (n: number | null, cur: string) =>
  n === null
    ? "–"
    : `${n.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;

const monthLabel = (ym: string) =>
  new Date(`${ym}-15T12:00:00Z`).toLocaleDateString(locale(), { month: "long", year: "numeric" });

export function CostReportView({
  scope,
  projectId,
  projectName,
  generatedBy,
  subjectOf,
}: {
  scope: UsageScope;
  projectId?: string;
  /** Navnet øverst i rapporten (kontosiden: «Alle prosjekter»). */
  projectName: string;
  generatedBy: string;
  subjectOf?: (r: CostJobRow) => string;
}) {
  const usage = useQuery({
    queryKey: ["ai-usage", scope, projectId ?? null],
    queryFn: () => fetchAiUsage({ data: { scope, ...(projectId ? { projectId } : {}) } }),
    staleTime: 30_000,
  });
  const [month, setMonth] = useState<string>("all");
  const [currency, setCurrency] = useState<Currency>("NOK");
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = useMemo(() => usage.data?.rows ?? [], [usage.data]);
  const months = useMemo(() => reportMonths(rows), [rows]);
  const picked = useMemo(
    () => (month === "all" ? rows : rows.filter((r) => r.createdAt.startsWith(month))),
    [rows, month],
  );
  const span = useMemo(() => {
    const d = picked.map((r) => r.createdAt.slice(0, 10)).sort();
    return d.length ? { from: d[0]!, to: d[d.length - 1]! } : null;
  }, [picked]);
  const rates = useQuery({
    queryKey: ["usd-nok", span?.from, span?.to],
    enabled: currency === "NOK" && !!span,
    queryFn: () => fetchUsdNokRates({ data: span! }),
    staleTime: 6 * 60 * 60 * 1000,
  });
  const rateMap = useMemo(() => new Map(rates.data?.rates ?? []), [rates.data]);
  const nokOk = currency !== "NOK" || (rates.data?.ok ?? false);
  const scopeLabel =
    scope === "account"
      ? tk("app-account-cost-report-view.scope-label.message.1bd28d168ca5")
      : scope === "mine"
        ? tk("app-account-cost-report-view.scope-label.message.9105670d93c0")
        : tk("app-account-cost-report-view.scope-label.message.5c9c4aad4c7f");
  const report = useMemo(
    () =>
      buildCostReport({
        rows: picked,
        projectName,
        scopeLabel,
        periodLabel:
          month === "all"
            ? span
              ? `${span.from} – ${span.to}`
              : tk("app-account-cost-report-view.period-label.period-label.0ada20877409")
            : monthLabel(month),
        generatedBy,
        currency: nokOk ? currency : "USD",
        projectNames: usage.data?.projectNames ?? {},
        userNames: usage.data?.userNames ?? {},
        ...(subjectOf ? { subjectOf } : {}),
        rates: rateMap,
      }),
    [
      picked,
      projectName,
      scopeLabel,
      month,
      span,
      generatedBy,
      currency,
      nokOk,
      usage.data,
      subjectOf,
      rateMap,
    ],
  );

  async function doExport(f: ExportFormat) {
    setBusy(f);
    setError(null);
    try {
      await exportCostReport(report, f);
    } catch (e) {
      setError(tm((e as Error).message));
    } finally {
      setBusy(null);
    }
  }

  if (usage.isLoading)
    return (
      <p className="flex items-center gap-2 text-xs text-text-tertiary">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        {tk("app-account-cost-report-view.cost-report-view.p.ceaeca173f41")}
      </p>
    );
  if (usage.data && !usage.data.ok)
    return <p className="text-xs text-text-secondary">{tm(usage.data.message ?? "")}</p>;
  const sel =
    "h-7 rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary";
  const cur = report.currency;
  return (
    <div className="flex flex-col gap-3" data-testid="cost-report">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={sel}
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          aria-label={tk("app-account-cost-report-view.cost-report-view.aria-label.453e6c187a4c")}
          data-testid="cost-month"
        >
          <option value="all">
            {scope === "account"
              ? tk("app-account-cost-report-view.cost-report-view.option.56734ca9629b")
              : tk("app-account-cost-report-view.cost-report-view.option.9bebccc5beb9")}
          </option>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <select
          className={sel}
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
          aria-label={tk("app-account-cost-report-view.cost-report-view.aria-label.1e8854fe8733")}
          data-testid="cost-currency"
        >
          <option value="NOK">{tk("app-account-cost-report-view.cost-report-view.option.c33ff407a7af")}</option>
          <option value="USD">{tk("app-account-cost-report-view.cost-report-view.option.26db8ed7da9c")}</option>
        </select>
        <div className="ml-auto flex gap-1.5">
          {(["pdf", "docx", "xlsx"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant="secondary"
              disabled={!report.lines.length || busy !== null}
              onClick={() => void doExport(f)}
              data-testid={`cost-export-${f}`}
            >
              {busy === f ? <Loader2 className="animate-spin" /> : <Download />}
              {f === "pdf" ? "PDF" : f === "docx" ? "Word" : "Excel"}
            </Button>
          ))}
        </div>
      </div>
      {currency === "NOK" && rates.isFetched && !nokOk ? (
        <p className="text-[11px] text-status-uncertain">
          {tk("app-account-cost-report-view.cost-report-view.p.7828b010f0dc")}
        </p>
      ) : null}
      {error ? <p className="text-xs text-status-danger">{error}</p> : null}
      {!report.lines.length ? (
        <p className="text-xs text-text-tertiary">
          {tk("app-account-cost-report-view.cost-report-view.p.53c1cfc327df")}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={tk("app-account-cost-report-view.cost-report-view.label.c8612319559f")} value={String(report.lines.length)} />
            <Stat label={tk("app-account-cost-report-view.cost-report-view.label.e37f457fa385")} value={money(report.totalUsd, "USD")} />
            {cur === "NOK" ? (
              <Stat label={tk("app-account-cost-report-view.cost-report-view.label.324a52e3e6f8")} value={money(report.totalNok, "NOK")} />
            ) : null}
            {report.lines.some((l) => l.credits !== null) ? (
              <Stat
                label={tk("app-account-cost-report-view.cost-report-view.label.0d1573b1bcc2")}
                value={String(report.lines.reduce((t, l) => t + (l.credits ?? 0), 0))}
              />
            ) : null}
          </div>
          <Groups
            title={tk("app-account-cost-report-view.cost-report-view.title.94d6137e58c1")}
            groups={report.byService}
            cur={cur}
          />
          {report.byMonth.length > 1 ? (
            <Groups title={tk("app-account-cost-report-view.cost-report-view.title.4d3e52aadb6a")} groups={report.byMonth} cur={cur} />
          ) : null}
          {report.byUser.length > 1 || scope === "project" ? (
            <Groups title={tk("app-account-cost-report-view.cost-report-view.title.d143b4be389a")} groups={report.byUser} cur={cur} />
          ) : null}
          <details>
            <summary className="cursor-pointer text-xs text-text-secondary">
              {tk("app-account-cost-report-view.cost-report-view.summary.b7435a50e708", { length: String(report.lines.length) })}
            </summary>
            <div className="mt-1 max-h-72 overflow-auto rounded-sm border border-border">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-surface-2 text-left text-text-tertiary">
                  <tr>
                    <th className="px-2 py-1">{tk("app-account-cost-report-view.cost-report-view.th.2ab90e37f418")}</th>
                    {scope === "account" ? (
                      <th className="px-2 py-1">{tk("app-account-cost-report-view.cost-report-view.th.98fcce6a5c21")}</th>
                    ) : null}
                    <th className="px-2 py-1">{tk("app-account-cost-report-view.cost-report-view.th.b3f8944269ce")}</th>
                    <th className="px-2 py-1">{tk("app-account-cost-report-view.cost-report-view.th.b1ed6168a460")}</th>
                    <th className="px-2 py-1">{tk("app-account-cost-report-view.cost-report-view.th.b41a537ba27f")}</th>
                    <th className="px-2 py-1 text-right">{tk("app-account-cost-report-view.cost-report-view.th.797fbe4f6d65")}</th>
                    <th className="px-2 py-1 text-right">USD</th>
                    {cur === "NOK" ? <th className="px-2 py-1 text-right">NOK</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {report.lines.map((l) => (
                    <tr key={l.jobId} className="border-t border-border/60 text-text-secondary">
                      <td className="whitespace-nowrap px-2 py-0.5">
                        {new Date(l.date).toLocaleString(locale(), {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      {scope === "account" ? (
                        <td className="px-2 py-0.5">{l.projectName}</td>
                      ) : null}
                      <td className="px-2 py-0.5">{l.user}</td>
                      <td className="px-2 py-0.5">
                        {l.provider} · {l.model}
                      </td>
                      <td className="px-2 py-0.5">{l.subject || l.kind}</td>
                      <td className="whitespace-nowrap px-2 py-0.5 text-right">
                        {l.quantity} {l.unit}
                      </td>
                      <td className="px-2 py-0.5 text-right">
                        {l.amountUsd === null ? "–" : l.amountUsd.toFixed(2)}
                      </td>
                      {cur === "NOK" ? (
                        <td className="px-2 py-0.5 text-right">
                          {l.amountNok === null ? "–" : l.amountNok.toFixed(2)}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <ul className="list-disc pl-4 text-[11px] text-text-tertiary">
            {report.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border bg-surface-2 px-3 py-2">
      <div className="text-[11px] text-text-tertiary">{label}</div>
      <div className="text-sm font-semibold text-text-primary">{value}</div>
    </div>
  );
}

function Groups({
  title,
  groups,
  cur,
}: {
  title: string;
  groups: readonly { key: string; count: number; usd: number; nok: number | null }[];
  cur: Currency;
}) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-medium text-text-secondary">{title}</h3>
      <table className="w-full table-fixed text-xs">
        <tbody>
          {groups.map((g) => (
            <tr key={g.key} className="border-t border-border/60">
              <td className="truncate py-0.5 text-text-primary">{g.key}</td>
              <td className="w-16 py-0.5 text-right text-text-tertiary">{g.count}</td>
              <td className="w-32 py-0.5 text-right text-text-secondary">{money(g.usd, "USD")}</td>
              {cur === "NOK" ? (
                <td className="w-32 py-0.5 text-right text-text-secondary">
                  {money(g.nok, "NOK")}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
