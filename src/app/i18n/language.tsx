/**
 * Språket i tjenesten (DEC-0081): valget huskes i nettleseren. Serveren og første tegning er alltid på
 * norsk (lik tegning på server og klient); rett etter oppstart byttes det til valgt språk, og hele
 * visningen tegnes på nytt så alle tekster følger med.
 */
import { Languages } from "lucide-react";
import { Fragment, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { L, getLanguage, onLanguageChange, setLanguage, type Lang } from "@/core";

const KEY = "animatic:lang";

function stored(): Lang | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "en" || v === "nb" ? v : null;
  } catch {
    return null;
  }
}

/** Gjeldende språk (tegner komponenten på nytt når det endres). */
export function useLanguage(): Lang {
  return useSyncExternalStore(onLanguageChange, getLanguage, () => "nb");
}

/** Velg språk: huskes i nettleseren og gjelder med én gang. */
export function chooseLanguage(lang: Lang) {
  try {
    window.localStorage.setItem(KEY, lang);
  } catch {
    // privat vindu: gjelder bare denne økten
  }
  setLanguage(lang);
}

/** Rundt hele appen: henter lagret språk og tegner alt på nytt når språket endres. */
export function LanguageRoot({ children }: { children: ReactNode }) {
  const lang = useLanguage();
  useEffect(() => {
    const s = stored();
    if (s) setLanguage(s);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang === "en" ? "en" : "nb";
  }, [lang]);
  return <Fragment key={lang}>{children}</Fragment>;
}

/** «Norsk | English» – på hovedsiden og i toppstripen. */
export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const lang = useLanguage();
  const seg = (on: boolean) =>
    "rounded-sm px-2 py-0.5 text-xs " +
    (on ? "bg-accent-selection text-text-primary" : "text-text-secondary hover:bg-surface-3");
  return (
    <div
      role="group"
      aria-label={L("Språk", "Language")}
      title={L("Språk i tjenesten", "Language of the app")}
      className="flex items-center gap-0.5 rounded-sm border border-border bg-surface-1 p-0.5"
    >
      {compact ? null : <Languages className="mx-1 size-3.5 text-text-tertiary" aria-hidden />}
      <button
        type="button"
        aria-pressed={lang === "nb"}
        className={seg(lang === "nb")}
        onClick={() => chooseLanguage("nb")}
        lang="nb"
      >
        {compact ? "NO" : "Norsk"}
      </button>
      <button
        type="button"
        aria-pressed={lang === "en"}
        className={seg(lang === "en")}
        onClick={() => chooseLanguage("en")}
        lang="en"
      >
        {compact ? "EN" : "English"}
      </button>
    </div>
  );
}
