/**
 * B-097: brukerens tidsvisning – språket i grensesnittet, landet på kontoen og valgene for klokke og
 * datoformat (profiles.ui_prefs). `useNow` gir en klokke som tikker hvert minutt, så «2 min siden» holder seg riktig.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatExactTime,
  formatRelativeTime,
  isClockPref,
  isDateFormatPref,
  type ClockPref,
  type DateFormatPref,
  type TimeFormatOptions,
} from "@/core";
import { useUiPref } from "@/app/account/ui-prefs";
import { useMyAccount } from "@/app/account/use-account";
import { useLanguage } from "./language";

export const CLOCK_PREF_KEY = "time.clock"; // i18n-ignore: nøkkel
export const DATE_FORMAT_PREF_KEY = "time.dateFormat"; // i18n-ignore: nøkkel

export function useClockPref() {
  return useUiPref<ClockPref>(CLOCK_PREF_KEY, "country", isClockPref);
}
export function useDateFormatPref() {
  return useUiPref<DateFormatPref>(DATE_FORMAT_PREF_KEY, "country", isDateFormatPref);
}

export function useTimeFormatOptions(): TimeFormatOptions {
  const language = useLanguage();
  const country = useMyAccount().data?.country ?? null;
  const [clock] = useClockPref();
  const [dateFormat] = useDateFormatPref();
  return useMemo(() => ({ language, country, clock, dateFormat }), [language, country, clock, dateFormat]);
}

/** Nåtiden, oppdatert hvert `everyMs` (standard ett minutt). */
export function useNow(everyMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

/** Formaterer tidspunkter for lister: `relative(iso)` og `exact(iso)` (verktøytips). */
export function useTimeFormat() {
  const o = useTimeFormatOptions();
  const now = useNow();
  const relative = useCallback((at: string | Date) => formatRelativeTime(at, now, o), [now, o]);
  const exact = useCallback((at: string | Date) => formatExactTime(at, o), [o]);
  return { relative, exact, options: o };
}
