/**
 * Språket i tjenesten (DEC-0081, REQ-0629/0630): norsk (standard) eller engelsk.
 *
 * Regler for all brukervendt tekst (også verktøytips, aria-label og feilmeldinger):
 * - Inne i funksjoner og komponenter: `L("Lagre", "Save")` – teksten velges når den brukes.
 * - Faste oppslag på modulnivå (etiketter per type o.l.): `localized({ a: ["Norsk", "English"], … })`.
 *   Gir et vanlig `Record<K, string>` som alltid svarer på gjeldende språk.
 * - Datoer og tall: `locale()` i stedet for "nb-NO".
 * - Meldinger fra serveren (som lages på norsk der): vis dem med `tm(melding)`.
 * Ren TypeScript uten avhengigheter (kjernen er plattformnøytral). Brukerens eget innhold (manus,
 * notater, navn) og AI-prompter oversettes ikke.
 */
import { CATALOG } from "./catalog.gen";

export type Lang = "nb" | "en";
export const LANGUAGES: readonly Lang[] = ["nb", "en"];
/** Språkene brukerflaten kan vises på (ML2a): `en-XA` er et testspråk bygd fra engelsk. */
export type UiLang = Lang | "en-XA";
export const UI_LANGUAGES: readonly UiLang[] = ["nb", "en", "en-XA"];
export function isUiLang(v: unknown): v is UiLang {
  return v === "nb" || v === "en" || v === "en-XA";
}

let current: UiLang = "nb";
const listeners = new Set<() => void>();

/** Grunnspråket (nb/en). Testspråket `en-XA` regnes som engelsk her, så eksisterende kode virker uendret. */
export function getLanguage(): Lang {
  return current === "nb" ? "nb" : "en";
}

/** Det valgte visningsspråket, også testspråket `en-XA`. */
export function getUiLanguage(): UiLang {
  return current;
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

/** Brukervendt tekst på begge språk; svarer på gjeldende språk. */
export function L(nb: string, en: string): string {
  return current === "nb" ? nb : current === "en" ? en : pseudoText(en);
}

/** Et tekstpar for faste oppslag (`localized`). */
export type TextPair = readonly [nb: string, en: string];

/**
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
  return current === "nb" ? "nb-NO" : "en-GB";
}

/** Sorteringsspråket (alfabetisk rekkefølge i lister). */
export function collation(): string {
  return current === "nb" ? "nb" : "en";
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
