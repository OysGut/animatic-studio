/**
 * G-3 punkt 3, 4 og 7: innstillingshierarki bruker → arbeidsgruppe → prosjekt.
 *
 * Én resolver for språk, enheter, papir, valuta, tidssone, manusformat, eksportnavn og prosjektkode (PTG).
 * Det mest spesifikke nivået som har en verdi vinner (prosjekt over arbeidsgruppe over bruker); ellers en
 * standard avledet av brukerens land (B-097). Resultatet sier hvor hver verdi kommer fra, så grensesnittet
 * kan vise «fra arbeidsgruppen» osv. Plattformnøytral og uten sideeffekter.
 */

export type PaperSize = "A4" | "Letter";
export type Units = "metric" | "imperial";
export type ScriptFormatKind = "us_letter_courier12" | "a4_europe" | "custom";

export interface ScriptFormat {
  readonly kind: ScriptFormatKind;
  /** «Én side er ett minutt»-regelen. Av for egendefinert format uten kalibrering. */
  readonly pageIsMinute: boolean;
  /** Bare for «custom»: sekunder per side. */
  readonly secondsPerPage?: number;
}

export interface SettingValues {
  readonly language: string;
  readonly units: Units;
  readonly paper: PaperSize;
  readonly currency: string;
  readonly timeZone: string;
  readonly scriptFormat: ScriptFormat;
  readonly exportName: string;
  readonly projectCode: string;
}

export type SettingKey = keyof SettingValues;
export type SettingLevel = Partial<SettingValues>;
export type SettingSource = "project" | "workspace" | "user" | "country" | "default";

export interface ResolvedSetting<K extends SettingKey> {
  readonly value: SettingValues[K];
  readonly source: SettingSource;
}

export type ResolvedSettings = { readonly [K in SettingKey]: ResolvedSetting<K> };

/** Land som bruker US Letter (ANSI): USA, Canada, Mexico, Filippinene, Chile, Colombia, Venezuela m.fl. */
const LETTER_COUNTRIES = new Set(["US", "CA", "MX", "PH", "CL", "CO", "VE", "GT", "CR", "PA", "DO", "PR", "SV", "NI", "BZ"]);
/** Land som bruker imperiske enheter i dagligtale. */
const IMPERIAL_COUNTRIES = new Set(["US", "LR", "MM"]);

/** Mest brukte valuta per land (ISO 4217); brukes bare som standard. Ukjent land gir USD. */
const COUNTRY_CURRENCY: Readonly<Record<string, string>> = {
  NO: "NOK", SE: "SEK", DK: "DKK", IS: "ISK", FI: "EUR", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR",
  PT: "EUR", NL: "EUR", BE: "EUR", AT: "EUR", IE: "EUR", GR: "EUR", PL: "PLN", CZ: "CZK", CH: "CHF",
  GB: "GBP", US: "USD", CA: "CAD", MX: "MXN", BR: "BRL", AR: "ARS", JP: "JPY", CN: "CNY", KR: "KRW",
  IN: "INR", AU: "AUD", NZ: "NZD", ZA: "ZAR", TH: "THB", SA: "SAR", AE: "AED", EG: "EGP", TR: "TRY",
  RU: "RUB", UA: "UAH", TW: "TWD", HK: "HKD", SG: "SGD", PH: "PHP", ID: "IDR", IL: "ILS",
};

export function paperForCountry(country: string | null | undefined): PaperSize {
  return country && LETTER_COUNTRIES.has(country.toUpperCase()) ? "Letter" : "A4";
}

export function scriptFormatForCountry(country: string | null | undefined): ScriptFormat {
  return paperForCountry(country) === "Letter"
    ? { kind: "us_letter_courier12", pageIsMinute: true }
    : { kind: "a4_europe", pageIsMinute: true };
}

export function countryDefaults(country: string | null | undefined): SettingLevel {
  const c = country?.toUpperCase() ?? null;
  if (!c) return {};
  return {
    paper: paperForCountry(c),
    scriptFormat: scriptFormatForCountry(c),
    units: IMPERIAL_COUNTRIES.has(c) ? "imperial" : "metric",
    ...(COUNTRY_CURRENCY[c] ? { currency: COUNTRY_CURRENCY[c] } : {}),
  };
}

export const GLOBAL_DEFAULTS: SettingValues = {
  language: "en",
  units: "metric",
  paper: "A4",
  currency: "USD",
  timeZone: "UTC",
  scriptFormat: { kind: "a4_europe", pageIsMinute: true },
  exportName: "",
  projectCode: "",
};

function has(level: SettingLevel | null | undefined, k: SettingKey): boolean {
  const v = level?.[k];
  return v !== undefined && v !== null && v !== "";
}

/**
 * Løser alle innstillinger. Prosjektkode og eksportnavn arves også (en arbeidsgruppe kan ha et felles
 * prefiks), men tomt betyr «ikke satt».
 */
export function resolveSettings(input: {
  readonly user?: SettingLevel | null;
  readonly workspace?: SettingLevel | null;
  readonly project?: SettingLevel | null;
  readonly country?: string | null;
}): ResolvedSettings {
  const country = countryDefaults(input.country);
  const levels: [SettingSource, SettingLevel | null | undefined][] = [
    ["project", input.project],
    ["workspace", input.workspace],
    ["user", input.user],
    ["country", country],
  ];
  const out: Record<string, ResolvedSetting<SettingKey>> = {};
  for (const k of Object.keys(GLOBAL_DEFAULTS) as SettingKey[]) {
    const hit = levels.find(([, l]) => has(l, k));
    out[k] = hit
      ? { value: hit[1]![k] as SettingValues[SettingKey], source: hit[0] }
      : { value: GLOBAL_DEFAULTS[k], source: "default" };
  }
  return out as ResolvedSettings;
}

export function isIanaTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isCurrencyCode(c: string): boolean {
  if (!/^[A-Z]{3}$/.test(c)) return false;
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: c });
    return true;
  } catch {
    return false;
  }
}

/** Sekunder per manusside for formatet («én side er ett minutt» = 60). */
export function secondsPerPage(f: ScriptFormat): number {
  if (f.kind === "custom") return f.secondsPerPage && f.secondsPerPage > 0 ? f.secondsPerPage : 60;
  return f.pageIsMinute ? 60 : 60;
}
