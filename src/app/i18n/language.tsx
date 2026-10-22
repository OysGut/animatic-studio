/**
 * Språket i tjenesten (B-107/B-111). Serveren velger fra preferansekapsel og Accept-Language;
 * routeren laster samme katalog før hydrering. Profilvalg vinner når kontoen er lest.
 * Et eldre eksplisitt lokalt valg skjuler siden kort til den tilhørende katalogen er klar.
 * Språkbytte tegner visningen på nytt uten å montere den på nytt, så åpne utkast og pågående arbeid
 * beholdes. Sidene og de hurtigbufrede panelene abonnerer med `useLanguage()`.
 * Valgbare språk hentes fra språkmanifestet; testspråk (`en-XA`) er av som standard og slås på
 * med funksjonsbryteren «ui.test-languages» i Admin, eller med lokal utviklerinnstilling.
 */
import { Languages } from "lucide-react";
import { useEffect, useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import { onSessionChange } from '@/adapters/browser/auth';
import { useQueryClient } from '@tanstack/react-query';
import { getUiLanguage, isUiLang, onLanguageChange, setLanguage, type UiLang } from "@/core";
import manifest from "@/core/i18n/manifest.json";
import { t, loadUiCatalog } from "@/core/i18n/keyed";
import { matchUiLanguage } from '@/core/i18n/languages';
import { Button } from '@/components/ui/button';

export const LANGUAGE_KEY = "animatic:lang";
/** Klasse på <html> mens lagret språk settes (skjuler siden, se `LANGUAGE_BOOT_SCRIPT`). */
export const LANGUAGE_PENDING_CLASS = "lang-pending";

/** Kjøres før første tegning. Skjuler avvikende lokalt valg til katalogen er klar (maks 3 s). */
export const LANGUAGE_BOOT_SCRIPT = `(function(){try{var v=localStorage.getItem(${JSON.stringify(LANGUAGE_KEY)}),d=document.documentElement;if(v&&v!==d.lang){d.classList.add(${JSON.stringify(LANGUAGE_PENDING_CLASS)});setTimeout(function(){d.classList.remove(${JSON.stringify(LANGUAGE_PENDING_CLASS)})},3000)}}catch(e){}})();`;

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Settes fra funksjonsbryteren «ui.test-languages» (Admin) når svaret er lest. Standard er av. */
let adminTestLanguages = false;

/** Testspråk er av som standard; Admin slår dem på for alle, testmodus og lokal innstilling for utviklere. */
export function testLanguagesEnabled(): boolean {
  if (import.meta.env.MODE === "test") return true;
  if (adminTestLanguages) return true;
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
  let incomplete = false;
  try { incomplete = window.localStorage.getItem('animatic:incomplete-languages') === '1'; } catch { /* SSR */ }
  return manifest.languages
    .filter((l) => isUiLang(l.tag) && (l.complete || incomplete) && (includeTest || !("testOnly" in l && l.testOnly)))
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

/** Første komplette registrerte grensesnittspråk i nettleserens liste, ellers null. */
export function browserUiLanguage(languages: readonly string[]): UiLang | null {
  return matchUiLanguage(languages);
}

/**
 * ML3: språket feilsiden skal vises på, lest synkront før første tegning – lagret valg, ellers
 * nettleserspråket, ellers gjeldende språk. Feilsiden kan vises før LanguageRoot har satt språket.
 */
export function bootUiLanguage(): UiLang {
  if (typeof window === "undefined") return getUiLanguage();
  if (rootSettled || profileLanguage !== null) return getUiLanguage();
  let fromStore: string | null = null;
  try { fromStore = window.localStorage.getItem(LANGUAGE_KEY); } catch { fromStore = null; }
  if (isUiLang(fromStore)) return fromStore === "en-XA" && !testLanguagesEnabled() ? "en" : fromStore;
  const nav = typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
  return browserUiLanguage(nav.filter(Boolean)) ?? 'en';
}

/** Roten er hydrert; sider som hydreres etterpå (egne kodebiter) melder fra via useLanguage. */
let rootSettled = false;
const lateHydration = new Set<() => void>();
let profileLanguage: UiLang | null = null;
let selectionRevision = 0;
let selectionSettled = false;
const explicitChoices = new Set<(lang: UiLang) => void>();
export function onExplicitLanguageChoice(listener: (lang: UiLang) => void) {
  explicitChoices.add(listener);
  return () => { explicitChoices.delete(listener); };
}
/** Profile wins over browser/local choices at sign-in; never rewrites the explicit local choice. */
export async function applyProfileLanguage(lang: UiLang | null) {
  const revision = ++selectionRevision;
  profileLanguage = lang;
  const next = lang ?? stored() ?? browserUiLanguage(navigator.languages) ?? 'en';
  await commitSelection(next, revision);
}
async function commitSelection(next: UiLang, revision: number) {
  try { await loadUiCatalog(next); } catch { next = 'en'; }
  if (selectionRevision !== revision) return;
  selectionSettled = true;
  setLanguage(next);
  document.cookie = `ptg-ui-language=${encodeURIComponent(next)}; Path=/; SameSite=Lax; Max-Age=31536000${window.location.protocol === 'https:' ? '; Secure' : ''}`;
  document.documentElement.classList.remove(LANGUAGE_PENDING_CLASS);
}

/** Gjeldende visningsspråk (tegner komponenten på nytt når det endres). */
export function useLanguage(): UiLang {
  useEffect(() => {
    if (rootSettled) for (const f of [...lateHydration]) f();
  }, []);
  return useSyncExternalStore(onLanguageChange, getUiLanguage, getUiLanguage);
}

/** Velg språk: huskes i nettleseren og gjelder med én gang, uten remontering. */
export async function chooseLanguage(lang: UiLang) {
  if (lang === "en-XA" && !testLanguagesEnabled()) return;
  const revision = ++selectionRevision;
  try {
    window.localStorage.setItem(LANGUAGE_KEY, lang);
  } catch {
    // privat vindu: gjelder bare denne økten
  }
  if (profileLanguage !== null) profileLanguage = lang;
  for (const listener of explicitChoices) listener(lang);
  await commitSelection(lang, revision);
}

/** Rundt hele appen: henter lagret språk før skjermen males, og oppdaterer <html lang>. */
export function LanguageRoot({ children }: { children: ReactNode }) {
  const lang = useLanguage();
  const queryClient = useQueryClient();
  useEffect(() => {
    let identity: string | null | undefined;
    return onSessionChange(session => {
      const next = session?.user.id ?? null;
      if (identity === next) return;
      const previous = identity;
      identity = next;
      if (previous !== undefined) {
        void queryClient.cancelQueries({ queryKey: ['my-account'] }).then(() => {
          queryClient.removeQueries({ queryKey: ['my-account'] });
          void applyProfileLanguage(null);
        });
      }
    });
  }, [queryClient]);
  useEffect(() => {
    // Lagret språk settes først når sidens egen del er hydrert: ruter ligger i egne kodebiter og
    // hydreres etter roten, og ville ellers fått et annet språk enn serveren tegnet. Siden er skjult
    // (lang-pending) til da; vakturet sørger for at den aldri blir stående skjult.
    const s = stored() ?? browserUiLanguage(navigator.languages) ?? 'en';
    const revision = selectionRevision;
    rootSettled = true;
    if (!s) return;
    let done = false;
    const apply = () => {
      if (done) return;
      done = true;
      lateHydration.delete(onLate);
      const next = profileLanguage ?? s;
      void commitSelection(next, revision);
    };
    // Flere deler kan hydreres etter hverandre: vent til det har vært stille en kort stund.
    let quiet: number | undefined;
    const onLate = () => {
      window.clearTimeout(quiet);
      quiet = window.setTimeout(() => window.requestAnimationFrame(() => window.requestAnimationFrame(apply)), 150);
    };
    lateHydration.add(onLate);
    const guard = window.setTimeout(apply, 2800);
    return () => {
      lateHydration.delete(onLate);
      window.clearTimeout(guard);
      window.clearTimeout(quiet);
    };
  }, []);
  useIso(() => {
    const d = document.documentElement;
    d.lang = lang;
    d.dir = manifest.languages.find(l => l.tag === lang)?.direction ?? 'ltr';
    if (selectionSettled) d.classList.remove(LANGUAGE_PENDING_CLASS);
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
  const short = (tag: UiLang) => tag.toUpperCase();
  const label = (o: LanguageOption) => o.nativeName;
  return (
    <div
      role="group"
      aria-label={t("app-i18n-language.language-switch.aria-label.a2595484506d")}
      title={t("app-i18n-language.language-switch.change-title")}
      data-testid="language-switch"
      className="flex max-w-full flex-wrap items-center gap-0.5 rounded-sm border border-border bg-surface-1 p-0.5"
    >
      {compact ? null : <Languages className="mx-1 size-3.5 text-text-tertiary" aria-hidden />}
      {options.map((o) => (
        <Button
          key={o.tag}
          type="button"
          aria-pressed={lang === o.tag}
          data-testid={`language-${o.tag}`}
          title={o.testOnly ? t("app-i18n-language.language-switch.title.52f62cdf7cf1") : o.nativeName}
          className={seg(lang === o.tag)}
          variant="ghost"
          onClick={() => void chooseLanguage(o.tag)}
          lang={o.tag}
        >
          {compact ? short(o.tag) : label(o)}
        </Button>
      ))}
    </div>
  );
}
