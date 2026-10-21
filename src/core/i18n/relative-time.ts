/**
 * B-097: felles visning av tidspunkter («sist endret» og tider i lister).
 *   < 1 min → «nå nettopp»; < 1 t → «2 min siden»; < 24 t → «3 t siden»;
 *   1–7 dager → ukedag og klokkeslett («onsdag kl. 12:35»); > 7 dager → dato i brukerens datoformat,
 *   årstall bare når det ikke er i år.
 * Ord og ukedager følger språket i grensesnittet; klokke og datoformat følger kontoinnstillingene. Alt via Intl.
 * Plattformnøytral: ingen DOM eller nettleser-API-er (Intl finnes i alle JS-motorer).
 */
import { t } from "./keyed";
import { languageFormatLocale } from './languages';

export type ClockPref = "country" | "24" | "12";
export type DateFormatPref = "country" | "dmy-dot" | "ymd-iso" | "mdy-slash" | "dmy-slash";
export const CLOCK_PREFS: readonly ClockPref[] = ["country", "24", "12"];
export const DATE_FORMAT_PREFS: readonly DateFormatPref[] = ["country", "dmy-dot", "ymd-iso", "mdy-slash", "dmy-slash"];
export const isClockPref = (v: unknown): v is ClockPref => CLOCK_PREFS.includes(v as ClockPref);
export const isDateFormatPref = (v: unknown): v is DateFormatPref => DATE_FORMAT_PREFS.includes(v as DateFormatPref);

export interface TimeFormatOptions {
  /** Språket i grensesnittet (nb, en, en-XA). */
  readonly language: string;
  /** ISO 3166-1 alpha-2, eller null når brukeren ikke har valgt land ennå. */
  readonly country?: string | null | undefined;
  readonly clock?: ClockPref | undefined;
  readonly dateFormat?: DateFormatPref | undefined;
  /** Tidssone (tester bruker "UTC"); standard er maskinens. */
  readonly timeZone?: string | undefined;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Språkkoden Intl får for ord og ukedager. */
function wordLocale(o: TimeFormatOptions): string {
  // Preserve B-097's established English day-period spelling; the country still chooses hour cycle.
  return o.language === 'en' || o.language === 'en-XA' ? 'en' : languageFormatLocale(o.language);
}

/** Landets vanlige språk (for «som landet»), f.eks. US → en-US, DE → de-DE. */
function countryLocale(o: TimeFormatOptions): string {
  const c = o.country && /^[A-Z]{2}$/.test(o.country) ? o.country : null;
  if (!c) return wordLocale(o);
  try {
    return `${new Intl.Locale(`und-${c}`).maximize().language}-${c}`;
  } catch {
    return wordLocale(o);
  }
}

function hour12(o: TimeFormatOptions): boolean {
  const clock = o.clock ?? "country";
  if (clock === "24") return false;
  if (clock === "12") return true;
  const cycle = new Intl.DateTimeFormat(countryLocale(o), { hour: "numeric", minute: "numeric" }).resolvedOptions().hourCycle;
  return cycle === "h11" || cycle === "h12";
}

/** Klokkeslett, f.eks. «12:35» eller «12:35 PM» (AM/PM på grensesnittets språk). */
export function formatClock(at: Date, o: TimeFormatOptions): string {
  return new Intl.DateTimeFormat(wordLocale(o), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: hour12(o),
    ...(o.timeZone ? { timeZone: o.timeZone } : {}),
  }).format(at);
}

function numericParts(at: Date, o: TimeFormatOptions): { y: string; m: string; d: string } {
  const parts = new Intl.DateTimeFormat("en-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(o.timeZone ? { timeZone: o.timeZone } : {}),
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** Dato i brukerens datoformat. `withYear=false` utelater året. */
export function formatUserDate(at: Date, o: TimeFormatOptions, withYear = true): string {
  const fmt = o.dateFormat ?? "country";
  if (fmt === "country") {
    return new Intl.DateTimeFormat(countryLocale(o), {
      day: "2-digit",
      month: "2-digit",
      ...(withYear ? { year: "numeric" } : {}),
      ...(o.timeZone ? { timeZone: o.timeZone } : {}),
    }).format(at);
  }
  const { y, m, d } = numericParts(at, o);
  switch (fmt) {
    case "dmy-dot":
      return withYear ? `${d}.${m}.${y}` : `${d}.${m}.`;
    case "ymd-iso":
      return withYear ? `${y}-${m}-${d}` : `${m}-${d}`;
    case "mdy-slash":
      return withYear ? `${m}/${d}/${y}` : `${m}/${d}`;
    case "dmy-slash":
      return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
  }
}

function weekday(at: Date, o: TimeFormatOptions): string {
  return new Intl.DateTimeFormat(wordLocale(o), {
    weekday: "long",
    ...(o.timeZone ? { timeZone: o.timeZone } : {}),
  }).format(at);
}

function yearOf(at: Date, o: TimeFormatOptions): string {
  return numericParts(at, o).y;
}

/** Nøyaktig tidspunkt (verktøytips): ukedag, dato med år og klokkeslett. */
export function formatExactTime(at: Date | string, o: TimeFormatOptions): string {
  const d = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return "";
  return t("time.exact", { weekday: weekday(d, o), date: formatUserDate(d, o, true), time: formatClock(d, o) }, o.language);
}

/** Relativ visning for lister. Tidspunkt i fremtiden (klokkeavvik) regnes som «nå nettopp». */
export function formatRelativeTime(at: Date | string, now: Date, o: TimeFormatOptions): string {
  const d = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return "";
  const diff = Math.max(0, now.getTime() - d.getTime());
  if (diff < MIN) return t("time.just-now", {}, o.language);
  if (diff < HOUR) return t("time.minutes-ago", { n: String(Math.floor(diff / MIN)) }, o.language);
  if (diff < DAY) return t("time.hours-ago", { n: String(Math.floor(diff / HOUR)) }, o.language);
  if (diff <= 7 * DAY) return t("time.weekday-at", { weekday: weekday(d, o), time: formatClock(d, o) }, o.language);
  return formatUserDate(d, o, yearOf(d, o) !== yearOf(now, o));
}
