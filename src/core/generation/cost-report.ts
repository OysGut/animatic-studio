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
import { L } from "../i18n";

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
    ? L("Video", "Video")
    : k === "image"
      ? L("Bilde", "Image")
      : k === "sound"
        ? L("Lyd", "Sound")
        : L("Tekst", "Text");

const STATUS_LABEL = (s: string) =>
  s === "done"
    ? L("Ferdig", "Done")
    : s === "lost"
      ? L("Betalt, ikke lagret", "Paid, not saved")
      : L("Pågår", "Running");

/** Mengde og enhet: sekunder video/lyd, ellers ett bilde eller én tekst. */
export function jobQuantity(r: CostJobRow): { quantity: number; unit: string } {
  const p = r.params;
  if (r.kind === "video" || r.kind === "sound") {
    let s = typeof p["seconds"] === "number" ? (p["seconds"] as number) : NaN;
    if (!Number.isFinite(s) && typeof p["startMs"] === "number" && typeof p["endMs"] === "number")
      s = ((p["endMs"] as number) - (p["startMs"] as number)) / 1000;
    if (Number.isFinite(s) && s > 0)
      return { quantity: Math.round(s * 10) / 10, unit: L("sek", "sec") };
  }
  return {
    quantity: 1,
    unit:
      r.kind === "image"
        ? L("bilde", "image")
        : r.kind === "prompt"
          ? L("tekst", "text")
          : L("stk", "pcs"),
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
      user: i.userNames?.[r.createdBy] || L("Ukjent bruker", "Unknown user"),
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
    L(
      "Beløpene er anslått ut fra leverandørens prisliste da jobben ble bestilt. Den endelige fakturaen fra leverandøren kan avvike; bruk leverandørens jobb-ID til avstemming.",
      "The amounts are estimated from the provider's price list when the job was ordered. The provider's final invoice may differ; use the provider's job ID for reconciliation.",
    ),
    L(
      "Beløpene er uten merverdiavgift. Kjøp av slike tjenester fra utlandet har normalt omvendt avgiftsplikt.",
      "The amounts are without VAT. Purchases of such services from abroad are normally subject to reverse charge.",
    ),
    L(
      "Jobber som feilet uten å koste noe, og jobber som venter i køen, er ikke med. «Betalt, ikke lagret» er med fordi leverandøren kan ha tatt betalt.",
      "Jobs that failed without cost, and jobs waiting in the queue, are not included. “Paid, not saved” is included because the provider may have charged for it.",
    ),
    ...(i.currency === "NOK"
      ? [
          L(
            "Kronebeløpene er regnet om med Norges Banks valutakurs (USD/NOK) for dagen jobben ble laget, eller siste noterte kurs før den.",
            "The NOK amounts are converted with Norges Bank's exchange rate (USD/NOK) for the day the job was made, or the last rate quoted before it.",
          ),
        ]
      : []),
    ...(unknown
      ? [
          L(
            `${unknown} jobb(er) mangler prisanslag og er regnet som 0.`,
            `${unknown} job(s) have no price estimate and are counted as 0.`,
          ),
        ]
      : []),
    L(
      "Runway oppgir pris i kreditter: 1 kreditt = 0,01 USD.",
      "Runway states prices in credits: 1 credit = 0.01 USD.",
    ),
  ];
  return {
    title: L("Kostnadsoversikt – AI-tjenester", "Cost statement – AI services"),
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
