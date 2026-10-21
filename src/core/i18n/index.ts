/**
 * Språket i tjenesten (DEC-0081, REQ-0629/0630): norsk (standard) eller engelsk.
 *
 * Regler for all brukervendt tekst (også verktøytips, aria-label og feilmeldinger), etter ML2f:
 * - Skriv teksten i katalogen og bruk `t("nøkkel", { … })` fra `@/core/i18n/keyed`; faste oppslag på
 *   modulnivå med `tLocalized({ a: "nøkkel", … })`. Flertall, valg og datoer står i `authored.json`.
 * - `L()` og `localized()` er ikke lenger en skrivevei: `scripts/i18n/check.mjs` stopper nye kall.
 *   Funksjonene finnes bare for å lese gamle tekstpar i testene.
 * - `tm(melding)` brukes bare for gamle, lagrede servermeldinger som ble laget på norsk (f.eks.
 *   begrunnelser lagret i databasen før ML2). Nye servermeldinger bruker stabile feilkoder
 *   (`server-errors.ts`) eller `t()`.
 * - Datoer og tall: `locale()` i stedet for "nb-NO".
 * Ren TypeScript uten avhengigheter (kjernen er plattformnøytral). Brukerens eget innhold (manus,
 * notater, navn) og AI-prompter oversettes ikke.
 */
import { CATALOG } from "./catalog.gen";
import { isUiLang, languageFormatLocale, type UiLang } from './languages';
export { isUiLang, UI_LANGUAGES, type UiLang } from './languages';

export type Lang = "nb" | "en";
export const LANGUAGES: readonly Lang[] = ["nb", "en"];
let current: UiLang = "en";
let requestLanguage: (() => UiLang | undefined) | undefined;
/** Adapter injects request-local SSR state; the core never imports a platform API. */
export function installRequestLanguageReader(reader: () => UiLang | undefined): void { requestLanguage = reader; }
const listeners = new Set<() => void>();

/** Grunnspråket (nb/en). Testspråket `en-XA` regnes som engelsk her, så eksisterende kode virker uendret. */
export function getLanguage(): Lang {
  // Legacy nb/en data/prompt contract, not the open interface-language type.
  return getUiLanguage() === "nb" ? "nb" : "en";
}

/** Det valgte visningsspråket, også testspråket `en-XA`. */
export function getUiLanguage(): UiLang {
  return requestLanguage?.() ?? current;
}

/** Pseudotekst for `en-XA`: aksenter, doble bokstaver og markører, plassholdere `{x}` urørt. Lik inventarets. */
export function pseudoText(text: string): string {
  const map: Record<string, string> = { a: "á", e: "ë", i: "ï", o: "ô", u: "ü", A: "Á", E: "Ë", I: "Ï", O: "Ô", U: "Ü" };
  return `[!! ${text
    .split(/(\{[^{}]+\})/g)
    .map((part) => (part.startsWith("{") ? part : part.replace(/[aeiouAEIOU]/g, (c) => map[c] ?? c).replace(/([a-záëïôü])/gi, "$1$1")))
    .join("")} !!]`;
}

export function setLanguage(lang: UiLang): void {
  if (!isUiLang(lang)) return;
  if (lang === current) return;
  current = lang;
  for (const f of listeners) f();
}

/** Kalles når språket endres. Returnerer en funksjon som avslutter abonnementet. */
export function onLanguageChange(f: () => void): () => void {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

/**
 * Brukervendt tekst på begge språk; svarer på gjeldende språk.
 * @deprecated ML2f: ikke en skrivevei lenger – bruk `t()` med en katalognøkkel. Stoppes av i18n-sjekken.
 */
export function L(nb: string, en: string): string {
  const language = getUiLanguage();
  return language === "nb" ? nb : language === "en-XA" ? pseudoText(en) : en;
}

/** Et tekstpar for faste oppslag (`localized`). */
export type TextPair = readonly [nb: string, en: string];

/**
 * @deprecated ML2f: bruk `tLocalized()` med katalognøkler. Stoppes av i18n-sjekken.
 * Et fast oppslag (f.eks. etikett per type) som alltid svarer på gjeldende språk. Brukes på modulnivå,
 * der `L` ville blitt regnet ut én gang.
 */
export function localized<K extends string | number>(
  pairs: Record<K, TextPair>,
): Record<K, string> {
  return new Proxy(pairs as unknown as Record<K, string>, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver) as unknown;
      if (Array.isArray(v) && v.length === 2 && typeof v[0] === "string")
        return L(v[0], v[1] as string);
      return v;
    },
    getOwnPropertyDescriptor(target, prop) {
      const d = Reflect.getOwnPropertyDescriptor(target, prop);
      if (d && Array.isArray(d.value) && d.value.length === 2)
        return { ...d, value: L(d.value[0] as string, d.value[1] as string) };
      return d;
    },
  });
}

/** Språkkoden for datoer og tall. */
export function locale(): string {
  return languageFormatLocale(getUiLanguage());
}

/** Sorteringsspråket (alfabetisk rekkefølge i lister). */
export function collation(): string {
  return languageFormatLocale(getUiLanguage());
}

// ---------------------------------------------------------------- Meldinger fra serveren

interface Compiled {
  readonly re: RegExp;
  readonly en: string;
  /** Lengden på den faste teksten (uten plassholdere): mest spesifikke mønster først. */
  readonly fixed: number;
}
let compiled: Compiled[] | null = null;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compile(): Compiled[] {
  if (compiled) return compiled;
  compiled = Object.entries(CATALOG).map(([nb, en]) => ({
    re: new RegExp(`^${escape(nb).replace(/\\\{(\d+)\\\}/g, "([\\s\\S]*?)")}$`),
    en,
    fixed: nb.replace(/\{\d+\}/g, "").length,
  }));
  // Mest fast tekst først, så «Ugyldig notat» vinner over «Ugyldig {0}»
  compiled.sort((a, b) => b.fixed - a.fixed);
  return compiled;
}

/**
 * Bare for gamle, lagrede servermeldinger (laget på norsk før ML2): viser dem på gjeldende språk.
 * En melding som er laget på norsk et annet sted (serveren), på gjeldende språk. Meldinger med flere
 * setninger oversettes setning for setning. Ukjent tekst vises som den er.
 */
export function tm(message: string): string {
  if (current === "nb" || !message) return message;
  if (current === "en-XA") {
    const en = tmEn(message);
    return en === message ? message : pseudoText(en);
  }
  return tmEn(message);
}

function tmEn(message: string): string {
  const one = (m: string): string | null => {
    // Samme tekst med punktum til slutt teller også («Ugyldig notat.» = «Ugyldig notat»)
    const end = /[.!?]$/.exec(m)?.[0] ?? "";
    const bare = end ? m.slice(0, -1) : null;
    const fill = (c: Compiled, hit: RegExpExecArray, whole: string) =>
      c.en.replace(/\{(\d+)\}/g, (_, i: string) => {
        // Det som står i plassholderen kan selv være en kjent tekst («Ugyldig {0}» + «lengde»)
        const part = hit[Number(i) + 1] ?? "";
        return (part && part !== whole ? one(part) : null) ?? part;
      });
    for (const c of compile()) {
      const hit = c.re.exec(m);
      if (hit) return fill(c, hit, m);
      const hitBare = bare ? c.re.exec(bare) : null;
      if (hitBare && bare) {
        const en = fill(c, hitBare, bare);
        return /[.!?]$/.test(en) ? en : en + end;
      }
    }
    return null;
  };
  // Flere setninger som alle er kjente, oversettes hver for seg (en plassholder skal ikke sluke resten)
  const parts = message.split(/(?<=[.!?])\s+/);
  const each = parts.length > 1 ? parts.map(one) : [];
  if (each.length && each.every((p) => p !== null)) return each.join(" ");
  const whole = one(message);
  if (whole !== null) return whole;
  if (parts.length < 2) return message;
  return parts.map((p, i) => each[i] ?? p).join(" ");
}
