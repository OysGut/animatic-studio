/**
 * B-097: land, klokke og datoformat på kontosiden, med forhåndsvisning av hvordan tider vises.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatExactTime, formatRelativeTime, type ClockPref, type DateFormatPref, tm } from "@/core";
import { saveMyCity, saveMyCountry } from "@/adapters/browser/account";
import { useLanguage } from "@/app/i18n/language";
import { useClockPref, useDateFormatPref } from "@/app/i18n/time-format";
import { CountryPicker } from "./CountryPicker";
import { CityPicker } from "./CityPicker";
import { MY_ACCOUNT_KEY, useMyAccount } from "./use-account";
import { t } from "@/core/i18n/keyed";

const select =
  "h-8 w-full rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";

export function RegionSettings() {
  const qc = useQueryClient();
  const account = useMyAccount();
  const language = useLanguage();
  const [clock, setClock] = useClockPref();
  const [dateFormat, setDateFormat] = useDateFormatPref();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const country = account.data?.country ?? null;
  const unavailable = account.data?.country === undefined;

  const city = account.data?.city ?? null;
  const cityUnavailable = account.data?.city === undefined;

  async function changeCountry(c: string) {
    const e = await saveMyCountry(c);
    // B-117: byen hører til landet; nytt land fjerner byen
    if (!e && c !== country && city && !cityUnavailable) await saveMyCity(null);
    setMsg(e ? { ok: false, text: tm(e.message) } : { ok: true, text: t("b097.region.saved") });
    if (!e) void qc.invalidateQueries({ queryKey: MY_ACCOUNT_KEY });
  }

  async function changeCity(c: number | null) {
    const e = await saveMyCity(c);
    setMsg(e ? { ok: false, text: tm(e.message) } : { ok: true, text: t("b117.city.saved") });
    if (!e) void qc.invalidateQueries({ queryKey: MY_ACCOUNT_KEY });
  }

  const now = new Date();
  const o = { language, country, clock, dateFormat };
  const samples = [
    new Date(now.getTime() - 3 * 3600_000),
    new Date(now.getTime() - 2 * 86400_000),
    new Date(now.getFullYear(), 11, 31, 18, 5),
  ];
  const clockLabel: Record<ClockPref, string> = {
    country: t("b097.region.as-country"),
    "24": t("b097.region.clock-24"),
    "12": t("b097.region.clock-12"),
  };
  const dateLabel: Record<DateFormatPref, string> = {
    country: t("b097.region.as-country"),
    "dmy-dot": "31.12.2026",
    "ymd-iso": "2026-12-31",
    "mdy-slash": "12/31/2026",
    "dmy-slash": "31/12/2026",
  };

  return (
    <div className="grid gap-3" data-testid="region-settings">
      <div className="grid grid-cols-[140px_minmax(0,320px)] items-center gap-x-3 gap-y-2 text-[13px]">
        <label htmlFor="account-country" className="text-text-tertiary">
          {t("b097.country.label")}
        </label>
        <div>
          {unavailable ? (
            <p className="text-xs text-text-tertiary">{t("b097.region.unavailable")}</p>
          ) : (
            <CountryPicker id="account-country" value={country} onChange={(c) => void changeCountry(c)} testId="account-country" />
          )}
        </div>
        {!unavailable && !cityUnavailable ? (
          <>
            <label htmlFor="account-city" className="text-text-tertiary">
              {t("b117.city.label")}
            </label>
            <div>
              <CityPicker id="account-city" country={country} value={city} onChange={(c) => void changeCity(c)} testId="account-city" />
              <p className="mt-1 text-[11px] text-text-tertiary">{t("b117.city.credit")}</p>
            </div>
          </>
        ) : null}
        <label htmlFor="account-clock" className="text-text-tertiary">
          {t("b097.region.clock")}
        </label>
        <select
          id="account-clock"
          className={select}
          value={clock}
          data-testid="account-clock"
          onChange={(e) => setClock(e.target.value as ClockPref)}
        >
          {(Object.keys(clockLabel) as ClockPref[]).map((k) => (
            <option key={k} value={k}>
              {clockLabel[k]}
            </option>
          ))}
        </select>
        <label htmlFor="account-date-format" className="text-text-tertiary">
          {t("b097.region.date-format")}
        </label>
        <select
          id="account-date-format"
          className={select}
          value={dateFormat}
          data-testid="account-date-format"
          onChange={(e) => setDateFormat(e.target.value as DateFormatPref)}
        >
          {(Object.keys(dateLabel) as DateFormatPref[]).map((k) => (
            <option key={k} value={k}>
              {dateLabel[k]}
            </option>
          ))}
        </select>
      </div>
      {msg ? (
        <p className={"text-xs " + (msg.ok ? "text-status-success" : "text-status-danger")}>{msg.text}</p>
      ) : null}
      <div className="rounded-sm border border-border bg-surface-2 p-3 text-[13px]" data-testid="region-preview" aria-live="polite">
        <p className="mb-1 text-xs text-text-tertiary">{t("b097.region.preview")}</p>
        <ul className="grid gap-0.5 text-text-primary">
          {samples.map((d) => (
            <li key={d.toISOString()} className="flex gap-3">
              <span className="w-[160px] tabular-nums" data-testid="region-preview-relative">
                {formatRelativeTime(d, now, o)}
              </span>
              <span className="text-text-secondary" data-testid="region-preview-exact">
                {formatExactTime(d, o)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
