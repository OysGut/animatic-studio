/**
 * G-4 punkt 2: felles fold for klientsøk. NFKC (kompatibilitetsform), fjerner alle diakritiske tegn
 * (akutt, grav, trema, tilde …) og gjør om til små bokstaver, slik at «cafe» treffer «Café», «arbol»
 * treffer «árbol» og ligaturer som «ﬁ» treffes av «fi». CJK-tegn berøres ikke. Databasens motstykke er
 * private.fold_text (0096: lower + unaccent).
 */

/** Fold en streng for søkesammenligning. */
export function foldSearch(s: string): string {
  return s.normalize("NFKC").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Finn needle i haystack med foldet sammenligning, men returner posisjon og lengde i ORIGINALTEKSTEN
 * (UTF-16-indekser), slik at treffet kan markeres der det står. null ved ikke-treff.
 */
export function foldMatch(haystack: string, needle: string): { index: number; length: number } | null {
  if (!needle) return null;
  // Fold tegn for tegn og husk hvor hvert foldet tegn begynner i originalen (UTF-16-enheter).
  const map: number[] = [];
  let folded = "";
  let oi = 0;
  for (const ch of haystack) {
    const f = foldSearch(ch);
    for (let k = 0; k < f.length; k++) map.push(oi);
    folded += f;
    oi += ch.length;
  }
  map.push(haystack.length);
  const fNeedle = foldSearch(needle);
  const at = folded.indexOf(fNeedle);
  if (at < 0) return null;
  const index = map[at] ?? haystack.length;
  const end = map[at + fNeedle.length] ?? haystack.length;
  return { index, length: end - index };
}
