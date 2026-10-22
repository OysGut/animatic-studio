/**
 * DV5-rest (N5): er et bakgrunnsresultat allerede angret fra den lokale angrelisten? Lokal angring skriver
 * resultatets lagrede invers som en vanlig kommando i kommandologgen, og «gjør om» skriver den opprinnelige
 * kommandoen igjen. Resultatet regnes som angret når det finnes flere senere inverser enn senere gjentak.
 * Ren funksjon uten plattformavhengigheter.
 */

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value);
}

/** `later` er kommandoene som er logget etter resultatet, i vilkårlig rekkefølge. */
export function undoneLocally(original: unknown, inverse: unknown, later: readonly unknown[]): boolean {
  const inv = canonical(inverse);
  const orig = canonical(original);
  let undos = 0;
  let redos = 0;
  for (const c of later) {
    const k = canonical(c);
    if (k === inv) undos++;
    else if (k === orig) redos++;
  }
  return undos > redos;
}
