/**
 * Visningsvalg som huskes på brukeren (DEC-0088, Mars 15.10.2026: «Disse instillingene skal huskes på brukerne
 * til neste gang akkurat som språk»). Lagres på kontoen (profiles.ui_prefs, migrasjon 0034) og i nettleseren,
 * så valget virker med én gang og også før migrasjonen er kjørt. Kontoens verdi vinner når den finnes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { saveUiPrefs, type MyAccount } from "@/adapters/browser/account";
import { myAccountKey, useMyAccount } from "./use-account";
import { useSessionUserId } from '@/app/auth/use-session';
import { getSessionUserId, onSessionIdentityChange } from '@/adapters/browser/auth';

const LOCAL = (key: string) => `animatic:ui:${getSessionUserId() ?? 'anonymous'}:${key}`; // i18n-ignore: nøkkel i nettleserens lager
const PREF_CHANGED = "animatic:ui-pref-changed";

function readLocal(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(LOCAL(key));
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    if (value === undefined || value === null) window.localStorage.removeItem(LOCAL(key));
    else window.localStorage.setItem(LOCAL(key), JSON.stringify(value));
  } catch {
    /* privat vindu: gjelder bare denne økten */
  }
}

/** Ventende lagringer på kontoen, slått sammen (få kall når brukeren drar og slipper mye). */
const pending: Record<string, unknown> = {};
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Et visningsvalg. `valid` sjekker en lagret verdi (gamle eller ødelagte verdier gir standardverdien).
 * Setteren lagrer i nettleseren med én gang og på kontoen litt etter.
 */
export function useUiPref<T>(
  key: string,
  fallback: T,
  valid: (v: unknown) => v is T,
): [T, (next: T) => void] {
  const qc = useQueryClient();
  const userId = useSessionUserId();
  const account = useMyAccount();
  const fromAccount = account.data?.uiPrefs?.[key];
  const [value, setValue] = useState<T>(fallback);
  const touched = useRef(false);
  useEffect(() => {
    touched.current = false;
    const local = readLocal(key);
    setValue(valid(local) ? local : fallback);
    return onSessionIdentityChange(() => {
      if (timer) clearTimeout(timer);
      timer = null;
      for (const k of Object.keys(pending)) delete pending[k];
      touched.current = false;
      setValue(fallback);
    });
  }, [userId, key]);
  // Alle monterte visninger får også senere lokale endringer. `touched` beskytter bare mot
  // eldre kontosvar; det må ikke blokkere andre visningers optimistiske oppdateringer.
  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; value: unknown }>).detail;
      if (detail?.key !== key || !valid(detail.value)) return;
      touched.current = true;
      setValue(detail.value);
    };
    window.addEventListener(PREF_CHANGED, changed);
    return () => window.removeEventListener(PREF_CHANGED, changed);
  }, [key, valid]);
  // Første verdi: kontoen, ellers nettleseren, ellers standard
  useEffect(() => {
    if (touched.current) return;
    if (valid(fromAccount)) setValue(fromAccount);
    else {
      const local = readLocal(key);
      setValue(valid(local) ? local : fallback);
    }
  }, [fromAccount, key, valid, userId]);
  const set = useCallback(
    (next: T) => {
      touched.current = true;
      setValue(next);
      writeLocal(key, next);
      window.dispatchEvent(new CustomEvent(PREF_CHANGED, { detail: { key, value: next } }));
      // Oppdater hurtigbufferen, så andre visninger ser valget med én gang
      qc.setQueryData<MyAccount | null>(myAccountKey(userId), (a) =>
        a ? { ...a, uiPrefs: { ...a.uiPrefs, [key]: next } } : a,
      );
      pending[key] = next;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const batch = { ...pending };
        for (const k of Object.keys(pending)) delete pending[k];
        timer = null;
        if (userId !== null && userId === getSessionUserId()) void saveUiPrefs(batch).catch(() => undefined);
      }, 800);
    },
    [key, qc, userId],
  );
  return [value, set];
}
