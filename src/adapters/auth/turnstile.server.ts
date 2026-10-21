/**
 * B-110: kontroll av Cloudflare Turnstile på serveren (siteverify). Den hemmelige nøkkelen leses bare her,
 * inne i kallet, og logges aldri. Uten nøkkel er CAPTCHA av (utvikling og tester).
 */
// i18n-ignore-file – tekniske koder, ingen brukertekst

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type CaptchaAction = "signup" | "link" | "reset" | "login";

export type VerifyResult =
  | { readonly ok: true; readonly skipped: boolean }
  | { readonly ok: false; readonly code: "missing-token" | "invalid" | "unavailable" };

export interface CaptchaKeys {
  readonly siteKey: string | null;
  readonly secret: string | null;
}

/** Nøklene fra serverens hemmeligheter (leses inne i kallet). CAPTCHA er på bare når begge finnes. */
export function captchaKeys(env: Record<string, string | undefined> = process.env): CaptchaKeys {
  const site = env["TURNSTILE_SITE_KEY"]?.trim() || null;
  const secret = env["TURNSTILE_SECRET_KEY"]?.trim() || null;
  return site && secret ? { siteKey: site, secret } : { siteKey: null, secret: null };
}

/** Klientens IP fra forespørselen (Cloudflare først). */
export function clientIp(header: (name: string) => string | undefined | null): string | null {
  const cf = header("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const xff = header("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || null;
}

/**
 * Kontrollerer et Turnstile-token. `secret = null` betyr at CAPTCHA er av (godkjennes uten kall).
 * Nettverksfeil og uventede svar gir «unavailable», aldri godkjenning.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  opts: { secret: string | null; ip?: string | null; action?: CaptchaAction; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<VerifyResult> {
  if (!opts.secret) return { ok: true, skipped: true };
  if (!token || typeof token !== "string" || token.length > 2048) return { ok: false, code: "missing-token" };
  const body = new URLSearchParams({ secret: opts.secret, response: token });
  if (opts.ip) body.set("remoteip", opts.ip);
  const f = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    });
  } catch {
    console.warn("[captcha] siteverify: nettverksfeil");
    return { ok: false, code: "unavailable" };
  }
  if (!res.ok) {
    console.warn(`[captcha] siteverify: http ${res.status}`);
    return { ok: false, code: "unavailable" };
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { ok: false, code: "unavailable" };
  }
  if (!data || typeof data !== "object" || typeof (data as { success?: unknown }).success !== "boolean")
    return { ok: false, code: "unavailable" };
  const d = data as { success: boolean; action?: unknown };
  if (!d.success) return { ok: false, code: "invalid" };
  // Tokenet skal være laget for samme skjema (Cloudflares testnøkler gir tom action)
  if (opts.action && typeof d.action === "string" && d.action !== "" && d.action !== opts.action)
    return { ok: false, code: "invalid" };
  return { ok: true, skipped: false };
}

/** Bare samme opphav som forespørselen godtas som lenkemål (ingen åpen videresending). */
export function safeRedirect(redirect: string | null | undefined, origin: string | null | undefined): string | null {
  if (!redirect || !origin) return null;
  try {
    const u = new URL(redirect);
    return u.origin === new URL(origin).origin ? u.toString() : null;
  } catch {
    return null;
  }
}
