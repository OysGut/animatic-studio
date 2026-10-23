/**
 * B-110: CAPTCHA (Cloudflare Turnstile) for registrering, innloggingslenke, «Glemt passord» og innlogging
 * etter gjentatte feil. Lovable Cloud lar oss ikke slå på innloggingstjenestens innebygde CAPTCHA, så
 * kontrollen skjer her. Nye kontoer krever i tillegg et registreringspass (migrasjon 0076), slik at
 * direkte kall fra nettleseren uten bestått CAPTCHA ikke kan lage kontoer.
 * Offentlige serverfunksjoner: de gjør bare det innloggingstjenesten ellers gjør direkte, etter kontrollen.
 */
// i18n-ignore-file – tekniske koder; brukertekst lages i nettleseren
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { CaptchaAction } from "./turnstile.server";
import { t as tk } from "@/core/i18n/keyed";

const srv = async () => ({ ...(await import("./turnstile.server")), ...(await import("./request.server")) });

export type CaptchaFailure = "captcha-invalid" | "captcha-unavailable" | "captcha-missing";
export type AuthCallResult =
  | { readonly ok: true; readonly session?: { readonly access_token: string; readonly refresh_token: string } }
  | { readonly ok: false; readonly code: CaptchaFailure | "auth"; readonly message?: string };

const email = z.string().trim().min(3).max(320).email();
const token = z.string().max(2048).nullable().optional();

async function check(t: string | null | undefined, action: CaptchaAction): Promise<AuthCallResult | null> {
  const { verifyTurnstile, captchaKeys, clientIp, requestHeader } = await srv();
  const r = await verifyTurnstile(t, {
    secret: captchaKeys().secret,
    ip: clientIp((n) => requestHeader(n)),
    action,
  });
  if (r.ok) return null;
  return {
    ok: false,
    code: r.code === "unavailable" ? "captcha-unavailable" : r.code === "missing-token" ? "captcha-missing" : "captcha-invalid",
  };
}

/**
 * G-8: felles hastighetsgrense (migrasjon 0100) per e-post og per IP før innloggingstjenesten kalles.
 * Før 0100 finnes ikke funksjonen; da slipper kallet gjennom som før (CAPTCHA gjelder uansett).
 */
async function limited(scope: "auth" | "signup_pass", address: string | null): Promise<AuthCallResult | null> {
  const { clientIp, requestHeader } = await srv();
  const ip = clientIp((n) => requestHeader(n)) ?? "";
  const keys = [address ? `e:${address.trim().toLowerCase()}` : "", `ip:${ip}`];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("rate_limit_hit" as never, { p_scope: scope, p_keys: keys } as never);
  if (!error) return null;
  const code = (error as { code?: string }).code;
  if (code === "PTG15") return { ok: false, code: "auth", message: tk("adapters-storage-commands-functions.rate-limited") };
  if (code !== "PGRST202" && code !== "42883") console.warn("[captcha] grense: feil", code ?? "?");
  return null;
}

async function issuePass(address: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("issue_signup_pass" as never, { p_email: address } as never);
  if (!error) return true;
  // Før migrasjon 0076 finnes verken funksjonen eller kravet i triggeren
  const code = (error as { code?: string }).code;
  if (code === "PGRST202" || code === "42883") return true;
  console.warn("[captcha] pass: feil", code ?? "?");
  return false;
}

async function auth(path: string, body: Record<string, unknown>, redirect?: string | null): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const u = new URL(`${url}/auth/v1/${path}`);
  if (redirect) u.searchParams.set("redirect_to", redirect);
  const res = await fetch(u, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key },
    body: JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { ok: res.ok, status: res.status, json };
}
const authMessage = (j: Record<string, unknown>) =>
  String(j["msg"] ?? j["error_description"] ?? j["message"] ?? j["error"] ?? "error").slice(0, 300);

/** Offentlig konfigurasjon: nettstedsnøkkelen (offentlig) og om CAPTCHA er på. Aldri den hemmelige nøkkelen. */
export const captchaConfig = createServerFn({ method: "GET" }).handler(async () => {
  const k = (await srv()).captchaKeys();
  return { enabled: k.secret !== null, siteKey: k.siteKey };
});

/** Registrering: bestått CAPTCHA gir et pass for e-postadressen; nettleseren kaller så signUp som før. */
export const requestSignupPass = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ email, token }).parse(d))
  .handler(async ({ data }): Promise<AuthCallResult> => {
    const fail = (await limited("signup_pass", null)) ?? (await check(data.token, "signup"));
    if (fail) return fail;
    return (await issuePass(data.email)) ? { ok: true } : { ok: false, code: "auth", message: "pass" };
  });

/** Innloggingslenke på e-post etter bestått CAPTCHA (lager konto bare når createUser er sann). */
export const sendSignInLinkCaptcha = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ email, token, redirect: z.string().max(2048).nullable().optional(), createUser: z.boolean() }).parse(d),
  )
  .handler(async ({ data }): Promise<AuthCallResult> => {
    const fail = (await limited("auth", data.email)) ?? (await check(data.token, "link"));
    if (fail) return fail;
    if (data.createUser && !(await issuePass(data.email))) return { ok: false, code: "auth", message: "pass" };
    const { safeRedirect, requestHeader } = await srv();
    const r = await auth(
      "otp",
      { email: data.email, create_user: data.createUser, data: {} },
      safeRedirect(data.redirect, requestHeader("origin")),
    );
    return r.ok ? { ok: true } : { ok: false, code: "auth", message: authMessage(r.json) };
  });

/** «Glemt passord» etter bestått CAPTCHA. Samme svar uansett om kontoen finnes. */
export const sendPasswordResetCaptcha = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ email, token }).parse(d))
  .handler(async ({ data }): Promise<AuthCallResult> => {
    const fail = (await limited("auth", data.email)) ?? (await check(data.token, "reset"));
    if (fail) return fail;
    const { safeRedirect, requestHeader } = await srv();
    const origin = requestHeader("origin");
    try {
      await auth("recover", { email: data.email }, safeRedirect(origin ? `${origin}/tilbakestill-passord` : null, origin));
    } catch {
      // Skjules for ikke å røpe kontostatus
    }
    return { ok: true };
  });

/** Innlogging med passord etter gjentatte feil: CAPTCHA først. Gir økten tilbake til nettleseren. */
export const signInWithPasswordCaptcha = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ email, password: z.string().min(1).max(512), token }).parse(d))
  .handler(async ({ data }): Promise<AuthCallResult> => {
    const fail = (await limited("auth", data.email)) ?? (await check(data.token, "login"));
    if (fail) return fail;
    const r = await auth("token?grant_type=password", { email: data.email, password: data.password });
    const at = r.json["access_token"], rt = r.json["refresh_token"];
    if (r.ok && typeof at === "string" && typeof rt === "string")
      return { ok: true, session: { access_token: at, refresh_token: rt } };
    return { ok: false, code: "auth", message: authMessage(r.json) };
  });
