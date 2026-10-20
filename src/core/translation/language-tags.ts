/** ML3: BCP-47-koder for manusspråk. Ingen avhengigheter, så alle deler av kjernen kan bruke dem. */
/**
 * BCP-47 i kanonisk skrivemåte (samme mønster som databasen i 0066): språk (2–3 små bokstaver),
 * valgfritt skript (Latn), region (BR eller 419) og varianter. Det gamle mønsteret «xx» / «xx-YY» er en
 * delmengde, så alle historisk gyldige koder er fortsatt gyldige.
 */
export const SCRIPT_LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?(-([a-z0-9]{5,8}|[0-9][a-z0-9]{3}))*$/;

export function isScriptLanguageTag(tag: unknown): tag is string {
  return typeof tag === "string" && tag.length <= 100 && SCRIPT_LANGUAGE_TAG.test(tag);
}

/** Kanonisk form («EN-us» → «en-US», «sr-latn» → «sr-Latn»), eller null for ugyldige koder. */
export function canonicalLanguageTag(tag: string): string | null {
  try {
    const [c] = Intl.getCanonicalLocales(tag.trim());
    return c && isScriptLanguageTag(c) ? c : null;
  } catch {
    return null;
  }
}

/** Norsk kilde (nb, no og regionsvarianter av dem) kan aldri være et målspråk. */
export function isNorwegianSourceTag(tag: string): boolean {
  const primary = tag.toLowerCase().split("-")[0];
  return primary === "nb" || primary === "no";
}

/** Samme språk uansett store og små bokstaver («en-us» og «en-US»). */
export function sameLanguageTag(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

