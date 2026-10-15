/**
 * AI-forbruk og kostnadsrapport (DEC-0086). Brukes på kontosiden (alt jeg har brukt, alle prosjekter) og i
 * prosjektet («Mitt forbruk i prosjektet» for alle med endringsrett, «Prosjektet totalt» bare for eieren).
 * Kalendermåned eller hele perioden; dollar, eller kroner etter Norges Banks kurs; eksport til PDF/Word/Excel.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import {
  L,
  buildCostReport,
  locale,
  reportMonths,
  tm,
  type CostJobRow,
  type Currency,
} from "@/core";
import {
  fetchAiUsage,
  fetchUsdNokRates,
  type UsageScope,
} from "@/adapters/account/account.functions";
import { Button } from "@/components/ui/button";
import { exportCostReport, type ExportFormat } from "./cost-export";

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
      ? L("Mitt forbruk i alle prosjekter", "My usage in all projects")
      : scope === "mine"
        ? L("Mitt forbruk i prosjektet", "My usage in the project")
        : L("Prosjektet totalt (alle medlemmer)", "The project in total (all members)");
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
              : L("Hele perioden", "The whole period")
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
        {L("Henter forbruket …", "Fetching the usage …")}
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
          aria-label={L("Periode", "Period")}
          data-testid="cost-month"
        >
          <option value="all">
            {scope === "account"
              ? L("Hele perioden", "The whole period")
              : L("Hele prosjektet", "The whole project")}
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
          aria-label={L("Valuta", "Currency")}
          data-testid="cost-currency"
        >
          <option value="NOK">{L("Kroner (og dollar)", "Kroner (and dollars)")}</option>
          <option value="USD">{L("Dollar", "Dollars")}</option>
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
          {L(
            "Kursene fra Norges Bank kunne ikke hentes nå, så beløpene vises i dollar.",
            "The rates from Norges Bank could not be fetched now, so the amounts are shown in dollars.",
          )}
        </p>
      ) : null}
      {error ? <p className="text-xs text-status-danger">{error}</p> : null}
      {!report.lines.length ? (
        <p className="text-xs text-text-tertiary">
          {L("Ingen AI-bruk i perioden.", "No AI usage in the period.")}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={L("Jobber", "Jobs")} value={String(report.lines.length)} />
            <Stat label={L("Sum USD", "Total USD")} value={money(report.totalUsd, "USD")} />
            {cur === "NOK" ? (
              <Stat label={L("Sum NOK", "Total NOK")} value={money(report.totalNok, "NOK")} />
            ) : null}
            {report.lines.some((l) => l.credits !== null) ? (
              <Stat
                label={L("Runway-kreditter", "Runway credits")}
                value={String(report.lines.reduce((t, l) => t + (l.credits ?? 0), 0))}
              />
            ) : null}
          </div>
          <Groups
            title={L("Per tjeneste og modell", "By service and model")}
            groups={report.byService}
            cur={cur}
          />
          {report.byMonth.length > 1 ? (
            <Groups title={L("Per måned", "By month")} groups={report.byMonth} cur={cur} />
          ) : null}
          {report.byUser.length > 1 || scope === "project" ? (
            <Groups title={L("Per person", "By person")} groups={report.byUser} cur={cur} />
          ) : null}
          <details>
            <summary className="cursor-pointer text-xs text-text-secondary">
              {L(`Alle linjene (${report.lines.length})`, `All lines (${report.lines.length})`)}
            </summary>
            <div className="mt-1 max-h-72 overflow-auto rounded-sm border border-border">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-surface-2 text-left text-text-tertiary">
                  <tr>
                    <th className="px-2 py-1">{L("Dato", "Date")}</th>
                    {scope === "account" ? (
                      <th className="px-2 py-1">{L("Prosjekt", "Project")}</th>
                    ) : null}
                    <th className="px-2 py-1">{L("Hvem", "Who")}</th>
                    <th className="px-2 py-1">{L("Tjeneste", "Service")}</th>
                    <th className="px-2 py-1">{L("Gjelder", "Concerns")}</th>
                    <th className="px-2 py-1 text-right">{L("Mengde", "Qty")}</th>
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
