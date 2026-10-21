/**
 * B-110: innloggingskall med CAPTCHA (Cloudflare Turnstile). Registrering, innloggingslenke og «Glemt passord»
 * går via serverfunksjonene i `src/adapters/auth/captcha.functions.ts`, som kontrollerer tokenet først.
 * Egen modul, så resten av appen (som bare trenger økten) ikke drar inn serverfunksjonene.
 */
import { browserClient, plainError, type BackendError } from "./client";
import type { AuthResult } from "./auth";
import {
  captchaConfig,
  requestSignupPass,
  sendPasswordResetCaptcha,
  sendSignInLinkCaptcha,
  signInWithPasswordCaptcha,
  type AuthCallResult,
} from "@/adapters/auth/captcha.functions";

/** CAPTCHA-feil kommer som «captcha:<kode>», så skjermen kan vise en rolig melding. */
export const CAPTCHA_ERROR = "captcha:";
const captchaError = (r: AuthCallResult): BackendError | null =>
  r.ok ? null : r.code === "auth" ? { message: r.message ?? "error" } : { message: CAPTCHA_ERROR + r.code };

export interface CaptchaSettings {
  readonly enabled: boolean;
  readonly siteKey: string | null;
}

/** Om CAPTCHA er på, og den offentlige nettstedsnøkkelen. Ved feil: av (serveren kontrollerer uansett). */
export async function fetchCaptchaSettings(): Promise<CaptchaSettings> {
  try {
    const c = await captchaConfig();
    return { enabled: c.enabled && !!c.siteKey, siteKey: c.siteKey };
  } catch {
    return { enabled: false, siteKey: null };
  }
}

/** Innlogging med passord etter gjentatte feil: CAPTCHA kontrolleres på serveren først. */
export async function signInWithPasswordChecked(
  email: string,
  password: string,
  captchaToken: string | null,
): Promise<AuthResult> {
  const r = await signInWithPasswordCaptcha({ data: { email, password, token: captchaToken } });
  if (!r.ok || !r.session) return { error: captchaError(r) ?? { message: "error" }, session: null };
  const res = await browserClient.auth.setSession(r.session);
  return { error: plainError(res.error), session: res.data.session };
}

/** Ny konto: først CAPTCHA på serveren (gir e-postadressen et kortlivet registreringspass), så signUp. */
export async function signUp(
  email: string,
  password: string,
  redirect: string | undefined,
  country?: string,
  captchaToken: string | null = null,
): Promise<AuthResult> {
  const pass = await requestSignupPass({ data: { email, token: captchaToken } });
  if (!pass.ok) return { error: captchaError(pass), session: null };
  // B-097: landet følger kontoen fra registreringen og lagres i profilen ved første innlogging
  const res = await browserClient.auth.signUp({
    email,
    password,
    options: {
      ...(redirect ? { emailRedirectTo: redirect } : {}),
      ...(country ? { data: { country } } : {}),
    },
  });
  return { error: plainError(res.error), session: res.data.session };
}

/** Innloggingslenke på e-post, sendt av serveren etter CAPTCHA-kontrollen. */
export async function sendSignInLink(
  email: string,
  redirect: string | undefined,
  createUser = true,
  captchaToken: string | null = null,
): Promise<AuthResult> {
  // B-109: når registreringen er stengt, lages ingen ny konto via lenken (databasen stopper det uansett)
  const r = await sendSignInLinkCaptcha({ data: { email, redirect: redirect ?? null, createUser, token: captchaToken } });
  return { error: captchaError(r), session: null };
}

/** «Glemt passord»: samme svar uavhengig av om kontoen finnes; bare CAPTCHA-feil meldes tilbake. */
export async function sendPasswordReset(email: string, captchaToken: string | null = null): Promise<AuthResult> {
  try {
    const r = await sendPasswordResetCaptcha({ data: { email, token: captchaToken } });
    if (!r.ok && r.code !== "auth") return { error: captchaError(r), session: null };
  } catch {
    // Også transportfeil skjules for å unngå å røpe kontostatus.
  }
  return { error: null, session: null };
}
