/**
 * G-5/G-8 adminsiden: tolking av grensefelt. Tomt felt = ingen grense (null). Bare hele, ikke-negative tall.
 * Lagring i GB vises og skrives som desimaltall og lagres i byte.
 */
export type LimitParse = { readonly ok: true; readonly value: number | null } | { readonly ok: false };

export function parseLimit(text: string, opts: { readonly min?: number; readonly max?: number } = {}): LimitParse {
  const s = text.trim();
  if (s === "") return { ok: true, value: null };
  if (!/^\d+$/.test(s)) return { ok: false };
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < (opts.min ?? 0) || n > (opts.max ?? Number.MAX_SAFE_INTEGER)) return { ok: false };
  return { ok: true, value: n };
}

export const BYTES_PER_GB = 1024 ** 3;

/** «2,5» eller «2.5» GB → byte. Tomt = ingen grense. */
export function parseGigabytes(text: string): LimitParse {
  const s = text.trim().replace(",", ".");
  if (s === "") return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false };
  const n = Math.round(Number(s) * BYTES_PER_GB);
  return Number.isSafeInteger(n) ? { ok: true, value: n } : { ok: false };
}

export function gigabytesText(bytes: number | null): string {
  if (bytes === null) return "";
  return String(Math.round((bytes / BYTES_PER_GB) * 100) / 100);
}

/** Tall som admin_set_rate_limit_rule godtar (0101). */
export function rateLimitError(r: { windowSeconds: number; perKey: number; perIp: number }): boolean {
  const ok = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;
  return !(ok(r.windowSeconds, 1, 86400) && ok(r.perKey, 1, 1_000_000) && ok(r.perIp, 1, 1_000_000));
}
