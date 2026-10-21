/**
 * Kostnadsrapport for AI-bruk (DEC-0086, Mars 15.10.2026): «hva jeg har brukt som bruker på dette prosjektet og
 * hva prosjektet som sådan har kostet totalt (bare eier)», med eksport til PDF, Word og Excel for arkivering,
 * budsjett og viderefakturering. Rapporten er underlaget; påslag og viderefakturering gjør brukeren selv.
 *
 * Oppbygning (vanlig for en kostnadsspesifikasjon): tittel med prosjektnavn, periode, hvem som laget den og når;
 * sammendrag; fordeling per tjeneste og modell, per måned og per person; én linje per jobb (dato, hvem,
 * tjeneste, modell, type, hva den gjaldt, mengde, enhetspris, beløp, kurs, leverandørens jobb-ID); merknader.
 * Beløpene er anslått ut fra leverandørens prisliste da jobben ble bestilt, uten merverdiavgift. Jobber som
 * feilet uten å koste, og jobber som venter i køen, er ikke med. Ren TypeScript (ingen nettleser).
 */

import { t as tk } from "@/core/i18n/keyed";

export interface CostJobRow {
  readonly id: string;
  readonly projectId: string;
  readonly kind: "image" | "video" | "prompt" | "sound";
  readonly provider: string;
  readonly model: string;
  readonly status: "running" | "done" | "lost" | "failed" | "queued";
  readonly costUsd: number | null;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly externalId: string | null;
  readonly occurrenceId: string | null;
  readonly assetId: string | null;
  /** Bare enkle verdier fra jobbens innstillinger (sekunder, start og slutt). */
  readonly params: Readonly<Record<string, number | string | boolean | null>>;
}

export type Currency = "USD" | "NOK";

export interface CostReportLine {
  readonly jobId: string;
  readonly date: string; // ISO
  readonly projectName: string;
  readonly user: string;
  readonly provider: string;
  readonly model: string;
  readonly kind: string;
  readonly subject: string;
  readonly quantity: number;
  readonly unit: string;
  readonly unitPriceUsd: number | null;
  readonly amountUsd: number | null;
  /** Kreditter hos Runway (1 kreditt = 0,01 USD), ellers null. */
  readonly credits: number | null;
  readonly rate: number | null;
  readonly amountNok: number | null;
  readonly status: string;
  readonly externalId: string;
}

export interface CostReportGroup {
  readonly key: string;
  readonly count: number;
  readonly usd: number;
  readonly nok: number | null;
}

export interface CostReport {
  readonly title: string;
  readonly projectName: string;
  readonly scopeLabel: string;
  readonly periodLabel: string;
  readonly generatedAt: string;
  readonly generatedBy: string;
  readonly currency: Currency;
  readonly lines: readonly CostReportLine[];
  readonly totalUsd: number;
  readonly totalNok: number | null;
  readonly unknownCount: number;
  readonly byService: readonly CostReportGroup[];
  readonly byMonth: readonly CostReportGroup[];
  readonly byUser: readonly CostReportGroup[];
  readonly notes: readonly string[];
}

/** Jobber som tas med: ferdige, betalt men ikke lagret, og de som pågår hos leverandøren. */
export function billable(r: CostJobRow): boolean {
  return r.status === "done" || r.status === "lost" || r.status === "running";
}

const KIND_LABEL = (k: string) =>
  k === "video"
    ? tk("core-generation-cost-report.kind-label.message.79675ce3b42c")
    : k === "image"
      ? tk("core-generation-cost-report.kind-label.message.8444fe29d13e")
      : k === "sound"
        ? tk("core-generation-cost-report.kind-label.message.eec5b22efdc9")
        : tk("core-generation-cost-report.kind-label.message.d9e84cdaef1c");

const STATUS_LABEL = (s: string) =>
  s === "done"
    ? tk("core-generation-cost-report.status-label.message.04a86e50e1ff")
    : s === "lost"
      ? tk("core-generation-cost-report.status-label.message.ec0ca1c9e2be")
      : tk("core-generation-cost-report.status-label.message.7322ebca7b77");

/** Mengde og enhet: sekunder video/lyd, ellers ett bilde eller én tekst. */
export function jobQuantity(r: CostJobRow): { quantity: number; unit: string } {
  const p = r.params;
  if (r.kind === "video" || r.kind === "sound") {
    let s = typeof p["seconds"] === "number" ? (p["seconds"] as number) : NaN;
    if (!Number.isFinite(s) && typeof p["startMs"] === "number" && typeof p["endMs"] === "number")
      s = ((p["endMs"] as number) - (p["startMs"] as number)) / 1000;
    if (Number.isFinite(s) && s > 0)
      return { quantity: Math.round(s * 10) / 10, unit: tk("core-generation-cost-report.unit.unit.4cfc7caa7804") };
  }
  return {
    quantity: 1,
    unit:
      r.kind === "image"
        ? tk("core-generation-cost-report.unit.unit.6812643b0d0f")
        : r.kind === "prompt"
          ? tk("core-generation-cost-report.unit.unit.f46774dcddd7")
          : tk("core-generation-cost-report.unit.unit.d97f14767060"),
  };
}

/** Kursen for en dato: siste noterte kurs på eller før datoen (helger og helligdager har ingen notering). */
export function rateOn(rates: ReadonlyMap<string, number>, isoDate: string): number | null {
  const day = isoDate.slice(0, 10);
  let best: string | null = null;
  for (const d of rates.keys()) if (d <= day && (best === null || d > best)) best = d;
  return best ? rates.get(best)! : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CostReportInput {
  readonly rows: readonly CostJobRow[];
  readonly projectName: string;
  readonly scopeLabel: string;
  readonly periodLabel: string;
  readonly generatedBy: string;
  readonly currency: Currency;
  readonly projectNames?: Readonly<Record<string, string>>;
  readonly userNames?: Readonly<Record<string, string>>;
  readonly subjectOf?: (r: CostJobRow) => string;
  /** USD→NOK per dato (Norges Bank). Tom = kroner kan ikke regnes ut. */
  readonly rates?: ReadonlyMap<string, number>;
  readonly now?: Date;
}

export function buildCostReport(i: CostReportInput): CostReport {
  const rates = i.rates ?? new Map<string, number>();
  const rows = i.rows.filter(billable).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let unknown = 0;
  const lines: CostReportLine[] = rows.map((r) => {
    const { quantity, unit } = jobQuantity(r);
    const usd = r.costUsd != null && Number.isFinite(r.costUsd) ? r.costUsd : null;
    if (usd === null) unknown++;
    const rate = rateOn(rates, r.createdAt);
    return {
      jobId: r.id,
      date: r.createdAt,
      projectName: i.projectNames?.[r.projectId] ?? i.projectName,
      user: i.userNames?.[r.createdBy] || tk("core-generation-cost-report.user.user.f7adb03339c0"),
      provider: r.provider,
      model: r.model,
      kind: KIND_LABEL(r.kind),
      subject: i.subjectOf?.(r) ?? "",
      quantity,
      unit,
      unitPriceUsd:
        usd !== null && quantity > 0 ? Math.round((usd / quantity) * 10000) / 10000 : null,
      amountUsd: usd,
      credits: usd !== null && r.provider === "runway" ? Math.round(usd * 100) : null,
      rate,
      amountNok: usd !== null && rate !== null ? round2(usd * rate) : null,
      status: STATUS_LABEL(r.status),
      externalId: r.externalId ?? "",
    };
  });
  const group = (key: (l: CostReportLine) => string): CostReportGroup[] => {
    const m = new Map<string, { count: number; usd: number; nok: number | null }>();
    for (const l of lines) {
      const k = key(l);
      const g = m.get(k) ?? { count: 0, usd: 0, nok: 0 };
      g.count++;
      g.usd += l.amountUsd ?? 0;
      g.nok =
        g.nok === null || (l.amountUsd !== null && l.amountNok === null)
          ? null
          : g.nok + (l.amountNok ?? 0);
      m.set(k, g);
    }
    return [...m.entries()]
      .map(([k, g]) => ({
        key: k,
        count: g.count,
        usd: round2(g.usd),
        nok: g.nok === null ? null : round2(g.nok),
      }))
      .sort((a, b) => b.usd - a.usd || a.key.localeCompare(b.key));
  };
  const totalUsd = round2(lines.reduce((t, l) => t + (l.amountUsd ?? 0), 0));
  const nokMissing = lines.some((l) => l.amountUsd !== null && l.amountNok === null);
  const totalNok = nokMissing ? null : round2(lines.reduce((t, l) => t + (l.amountNok ?? 0), 0));
  const byMonth = group((l) => l.date.slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key));
  const notes = [
    tk("core-generation-cost-report.notes.message.82a7fced1fcf"),
    tk("core-generation-cost-report.notes.message.f34a87af0299"),
    tk("core-generation-cost-report.notes.message.20d9d4d7d68a"),
    ...(i.currency === "NOK"
      ? [
          tk("core-generation-cost-report.notes.message.2abe86d011df"),
        ]
      : []),
    ...(unknown
      ? [
          tk("core-generation-cost-report.notes.message.dd9f4f5c6394", { unknown: String(unknown) }),
        ]
      : []),
    tk("core-generation-cost-report.notes.message.58fbf5353a7b"),
  ];
  return {
    title: tk("core-generation-cost-report.title.title.e2031f987a1d"),
    projectName: i.projectName,
    scopeLabel: i.scopeLabel,
    periodLabel: i.periodLabel,
    generatedAt: (i.now ?? new Date()).toISOString(),
    generatedBy: i.generatedBy,
    currency: i.currency,
    lines,
    totalUsd,
    totalNok,
    unknownCount: unknown,
    byService: group((l) => `${l.provider} · ${l.model}`),
    byMonth,
    byUser: group((l) => l.user),
    notes,
  };
}

/** Kalendermånedene (YYYY-MM) med jobber, nyeste først. */
export function reportMonths(rows: readonly CostJobRow[]): string[] {
  return [...new Set(rows.filter(billable).map((r) => r.createdAt.slice(0, 7)))].sort().reverse();
}

/** Les kursene fra Norges Banks SDMX-JSON (EXR/B.USD.NOK.SP). */
export function parseNorgesBankRates(json: unknown): Map<string, number> {
  const out = new Map<string, number>();
  const root = ((json as { data?: unknown })?.data ?? json) as {
    dataSets?: { series?: Record<string, { observations?: Record<string, unknown[]> }> }[];
    structure?: { dimensions?: { observation?: { id?: string; values?: { id?: string }[] }[] } };
  };
  const series = root.dataSets?.[0]?.series ?? {};
  const time =
    root.structure?.dimensions?.observation?.find((d) => d.id === "TIME_PERIOD")?.values ?? [];
  const first = Object.values(series)[0];
  for (const [idx, val] of Object.entries(first?.observations ?? {})) {
    const day = time[Number(idx)]?.id;
    const rate = Number(val?.[0]);
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(rate) && rate > 0)
      out.set(day, rate);
  }
  return out;
}
