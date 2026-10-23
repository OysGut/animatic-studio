/**
 * G-4 punkt 3: all tekst lagres som NFC (kanonisk sammensatt form). Uten det kan samme synlige tegn lagres
 * som to ulike bytesekvenser (for eksempel «é» som U+00E9 eller e + U+0301), og søk, sammenligning og
 * sortering bommer. Normaliseringen skjer i klientveien mot apply_changes og ved import, så eksisterende
 * data ikke skrives om unødvendig.
 */

/** NFC på én streng (ID-er, tall og ASCII er uendret). */
export function nfc(text: string): string {
  return text.normalize("NFC");
}

/**
 * NFC på alle strenger i en verdi (objekter, lister og strenger; alt annet returneres som det er).
 * Brukes på kommandoer før de kjøres lokalt og sendes til serveren, slik at klient og server ser
 * nøyaktig samme bytes. Gir samme referanse tilbake når ingenting endres.
 */
export function nfcDeep<T>(value: T): T {
  if (typeof value === "string") return value.normalize("NFC") as T;
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((x) => {
      const y = nfcDeep(x);
      if (y !== x) changed = true;
      return y;
    });
    return (changed ? out : value) as T;
  }
  if (value !== null && typeof value === "object") {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const y = nfcDeep(v);
      if (y !== v) changed = true;
      out[k] = y;
    }
    return (changed ? out : value) as T;
  }
  return value;
}
