/**
 * Fraksjonelle sorteringsnøkler (strenger over 0-9a-z, sammenlignes leksikografisk).
 * Gjør det mulig å flytte en scene ved å endre ÉN nøkkel – ingen omnummerering av andre (INV-02/03).
 * Nøkler slutter aldri på '0', slik at det alltid finnes plass foran.
 */

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";
const BASE = DIGITS.length;

function digitAt(s: string, i: number): number {
  const ch = s[i];
  if (ch === undefined) return 0;
  const d = DIGITS.indexOf(ch);
  if (d < 0) throw new Error(`Ugyldig tegn i sorteringsnøkkel: ${s}`);
  return d;
}

export function isValidOrderKey(key: string): boolean {
  return /^[0-9a-z]+$/.test(key) && !key.endsWith("0");
}

function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) throw new Error(`Ugyldig intervall: ${a} >= ${b}`);
  if (b !== null) {
    let n = 0;
    while (n < b.length && (a[n] ?? "0") === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const da = a.length > 0 ? digitAt(a, 0) : 0;
  const db = b !== null ? digitAt(b, 0) : BASE;
  if (db - da > 1) {
    return DIGITS[Math.round((da + db) / 2)] as string;
  }
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return (DIGITS[da] as string) + midpoint(a.slice(1), null);
}

/** Nøkkel strengt mellom `before` og `after` (null = åpen ende). */
export function keyBetween(before: string | null, after: string | null): string {
  if (before !== null && !isValidOrderKey(before)) throw new Error(`Ugyldig nøkkel ${before}`);
  if (after !== null && !isValidOrderKey(after)) throw new Error(`Ugyldig nøkkel ${after}`);
  if (before !== null && after !== null && before >= after) {
    throw new Error(`before (${before}) må være mindre enn after (${after})`);
  }
  return midpoint(before ?? "", after);
}

/** n jevnt fordelte, stigende nøkler (til import av mange scener i en tom produksjon). */
export function keysEvenly(n: number): string[] {
  if (n <= 0) return [];
  let len = 1;
  while (BASE ** len < (n + 1) * 4) len++;
  const span = BASE ** len;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    let v = Math.floor(((i + 1) * span) / (n + 1));
    let s = "";
    for (let k = 0; k < len; k++) {
      s = (DIGITS[v % BASE] as string) + s;
      v = Math.floor(v / BASE);
    }
    if (s.endsWith("0")) s += "i";
    out.push(s);
  }
  return out;
}

export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
