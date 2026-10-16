/**
 * Teknisk feilmelding på feilsiden (DEC-0091): en kort tekst brukeren kan kopiere og sende videre når en side
 * krasjer. Adressen tas med uten spørrestreng og uten tokenet i mobillenker (/m/<token>), så teksten aldri
 * inneholder noe som gir tilgang.
 */

/** Siden adressen viser, uten spørrestreng, fragment eller mobiltoken. */
export function safePagePath(href: string): string {
  let path = href;
  try {
    path = new URL(href, "http://x").pathname;
  } catch {
    path = href.split(/[?#]/)[0] ?? "";
  }
  return path.replace(/^\/m\/[^/]+/, "/m/…");
}

const MAX_STACK_LINES = 8;

/** Feilteksten som vises og kopieres: tidspunkt, side, feiltype, melding og de første linjene av stakken. */
export function errorReport(error: unknown, href: string, when: Date): string {
  const e = error instanceof Error ? error : null;
  const name = e?.name ?? typeof error;
  const message = e ? e.message : String(error);
  const stack = (e?.stack ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith(`${name}:`) && l !== message)
    .slice(0, MAX_STACK_LINES);
  return [
    `${when.toISOString()}`,
    `${safePagePath(href)}`,
    `${name}: ${message}`.slice(0, 2000),
    ...stack,
  ].join("\n");
}
