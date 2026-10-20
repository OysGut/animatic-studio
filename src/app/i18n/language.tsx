/**
 * Språket i tjenesten (DEC-0081, ML2a). Valget huskes i nettleseren. Serveren og første tegning er alltid
 * på norsk, så tegningen på server og klient er lik. Har brukeren valgt et annet språk, skjuler et lite
 * skript i <head> siden til språket er satt, så norsk aldri vises først.
 * Språkbytte tegner visningen på nytt uten å montere den på nytt, så åpne utkast og pågående arbeid
 * beholdes. Sidene og de hurtigbufrede panelene abonnerer med `useLanguage()`.
 * Valgbare språk hentes fra språkmanifestet; testspråk (`en-XA`) vises bare i utviklings- og testmodus.
 */
import { Languages } from "lucide-react";
import { useEffect, useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import { L, getUiLanguage, isUiLang, onLanguageChange, setLanguage, type UiLang } from "@/core";
import manifest from "@/core/i18n/manifest.json";
import { t } from "@/core/i18n/keyed";

export const LANGUAGE_KEY = "animatic:lang";
/** Klasse på <html> mens lagret språk settes (skjuler siden, se `LANGUAGE_BOOT_SCRIPT`). */
export const LANGUAGE_PENDING_CLASS = "lang-pending";

/** Kjøres i <head> før første tegning. Skjuler siden til et ikke-norsk språk er satt (maks 3 s). */
export const LANGUAGE_BOOT_SCRIPT = `(function(){try{var v=localStorage.getItem(${JSON.stringify(LANGUAGE_KEY)});if(v==="en"||v==="en-XA"){var d=document.documentElement;d.lang=v;d.classList.add(${JSON.stringify(LANGUAGE_PENDING_CLASS)});setTimeout(function(){d.classList.remove(${JSON.stringify(LANGUAGE_PENDING_CLASS)})},3000)}}catch(e){}})();`;

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Testspråk er bare valgbare i utviklings- og testmodus. */
export function testLanguagesEnabled(): boolean {
  if (import.meta.env.DEV || import.meta.env.MODE === "test") return true;
  try {
    return window.localStorage.getItem("animatic:test-languages") === "1";
  } catch {
    return false;
  }
}

export interface LanguageOption {
  readonly tag: UiLang;
  readonly nativeName: string;
  readonly testOnly: boolean;
}

/** Språkene i manifestet som brukerflaten kan vises på. */
export function availableLanguages(includeTest = testLanguagesEnabled()): LanguageOption[] {
  return manifest.languages
    .filter((l) => isUiLang(l.tag) && (includeTest || !("testOnly" in l && l.testOnly)))
    .map((l) => ({ tag: l.tag as UiLang, nativeName: l.nativeName, testOnly: "testOnly" in l && !!l.testOnly }));
}

function stored(): UiLang | null {
  try {
    const v = window.localStorage.getItem(LANGUAGE_KEY);
    if (!isUiLang(v)) return null;
    if (v === "en-XA" && !testLanguagesEnabled()) return "en";
    return v;
  } catch {
    return null;
  }
}

/** Roten er hydrert; sider som hydreres etterpå (egne kodebiter) melder fra via useLanguage. */
let rootSettled = false;
const lateHydration = new Set<() => void>();

/** Gjeldende visningsspråk (tegner komponenten på nytt når det endres). */
export function useLanguage(): UiLang {
  useEffect(() => {
    if (rootSettled) for (const f of [...lateHydration]) f();
  }, []);
  return useSyncExternalStore(onLanguageChange, getUiLanguage, () => "nb");
}

/** Velg språk: huskes i nettleseren og gjelder med én gang, uten remontering. */
export function chooseLanguage(lang: UiLang) {
  if (lang === "en-XA" && !testLanguagesEnabled()) return;
  try {
    window.localStorage.setItem(LANGUAGE_KEY, lang);
  } catch {
    // privat vindu: gjelder bare denne økten
  }
  setLanguage(lang);
}

/** Rundt hele appen: henter lagret språk før skjermen males, og oppdaterer <html lang>. */
export function LanguageRoot({ children }: { children: ReactNode }) {
  const lang = useLanguage();
  useEffect(() => {
    // Lagret språk settes først når sidens egen del er hydrert: ruter ligger i egne kodebiter og
    // hydreres etter roten, og ville ellers fått et annet språk enn serveren tegnet. Siden er skjult
    // (lang-pending) til da; vakturet sørger for at den aldri blir stående skjult.
    const s = stored();
    rootSettled = true;
    if (!s) return;
    let done = false;
    const apply = () => {
      if (done) return;
      done = true;
      lateHydration.delete(onLate);
      setLanguage(s);
    };
    const onLate = () => window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.setTimeout(apply, 0)));
    lateHydration.add(onLate);
    const guard = window.setTimeout(apply, 1500);
    return () => {
      lateHydration.delete(onLate);
      window.clearTimeout(guard);
    };
  }, []);
  useIso(() => {
    const d = document.documentElement;
    d.lang = lang;
    d.dir = "ltr";
    if (lang === getUiLanguage()) d.classList.remove(LANGUAGE_PENDING_CLASS);
  }, [lang]);
  return <>{children}</>;
}

/** Språkvelger fra manifestet – på hovedsiden og i toppstripen. */
export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const lang = useLanguage();
  const options = availableLanguages();
  const seg = (on: boolean) =>
    "rounded-sm px-2 py-0.5 text-xs " +
    (on ? "bg-accent-selection text-text-primary" : "text-text-secondary hover:bg-surface-3");
  const short = (tag: UiLang) => (tag === "nb" ? "NO" : tag === "en" ? "EN" : "XA");
  const label = (o: LanguageOption) => (o.tag === "nb" ? "Norsk" : o.tag === "en" ? "English" : o.nativeName);
  return (
    <div
      role="group"
      aria-label={t("app-i18n-language.language-switch.aria-label.a2595484506d")}
      title={t("app-i18n-language.language-switch.title.691fad620f12")}
      data-testid="language-switch"
      className="flex items-center gap-0.5 rounded-sm border border-border bg-surface-1 p-0.5"
    >
      {compact ? null : <Languages className="mx-1 size-3.5 text-text-tertiary" aria-hidden />}
      {options.map((o) => (
        <button
          key={o.tag}
          type="button"
          aria-pressed={lang === o.tag}
          data-testid={`language-${o.tag}`}
          title={o.testOnly ? t("app-i18n-language.language-switch.title.52f62cdf7cf1") : o.nativeName}
          className={seg(lang === o.tag)}
          onClick={() => chooseLanguage(o.tag)}
          lang={o.tag}
        >
          {compact ? short(o.tag) : label(o)}
        </button>
      ))}
    </div>
  );
}
