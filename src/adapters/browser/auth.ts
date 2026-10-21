/** Innlogging (Supabase Auth) bak et lite grensesnitt for nettleseren (KI-181). */
import type { Session } from "@supabase/supabase-js";
import { browserClient, plainError, type BackendError } from "./client";
import { isCountryCode } from "@/core";

export type { Session };

export interface AuthResult {
  readonly error: BackendError | null;
  readonly session: Session | null;
}

/** Gjeldende økt (null = ikke innlogget). */
export async function getSession(): Promise<Session | null> {
  const { data } = await browserClient.auth.getSession();
  return data.session;
}

/** Varsler ved inn- og utlogging. Returnerer en funksjon som stopper lyttingen. */
export function onSessionChange(listener: (session: Session | null) => void): () => void {
  const { data: sub } = browserClient.auth.onAuthStateChange((_event, session) => {
    listener(session);
  });
  return () => sub.subscription.unsubscribe();
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const res = await browserClient.auth.signInWithPassword({ email, password });
  return { error: plainError(res.error), session: res.data.session };
}

/* B-110: signUp og sendSignInLink ligger i captcha-auth.ts (CAPTCHA og registreringspass først). */

export async function signOut(): Promise<void> {
  await browserClient.auth.signOut();
}

/* B-110: sendPasswordReset ligger i captcha-auth.ts. */

/** Oppdater passordet med recovery-økten, uten current_password. */
export async function updateRecoveryPassword(password: string): Promise<{ error: BackendError | null }> {
  const result = await browserClient.auth.updateUser({ password });
  return { error: plainError(result.error) };
}

/** Recovery-hendelsen beholdes separat fra vanlige innlogginger. */
export function onPasswordRecovery(listener: () => void): () => void {
  const { data } = browserClient.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") listener();
  });
  return () => data.subscription.unsubscribe();
}

/** B-097: landet brukeren valgte ved registreringen (fra kontoens metadata), eller null. */
export async function signupCountry(): Promise<string | null> {
  const { data } = await browserClient.auth.getUser();
  const c = (data.user?.user_metadata as { country?: unknown } | undefined)?.country;
  // Metadata kan endres av brukeren selv; bare kjente ISO-koder godtas
  return typeof c === "string" && isCountryCode(c) ? c : null;
}
