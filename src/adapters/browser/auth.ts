/** Innlogging (Supabase Auth) bak et lite grensesnitt for nettleseren (KI-181). */
import type { Session } from "@supabase/supabase-js";
import { browserClient, plainError, type BackendError } from "./client";

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

export async function signUp(
  email: string,
  password: string,
  redirect: string | undefined,
  country?: string,
): Promise<AuthResult> {
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

/** Innloggingslenke på e-post. */
export async function sendSignInLink(
  email: string,
  redirect: string | undefined,
): Promise<AuthResult> {
  const res = await browserClient.auth.signInWithOtp({
    email,
    options: redirect ? { emailRedirectTo: redirect } : {},
  });
  return { error: plainError(res.error), session: res.data.session };
}

export async function signOut(): Promise<void> {
  await browserClient.auth.signOut();
}

/** Samme svar uavhengig av om kontoen finnes; ikke eksponer backend-feil. */
export async function sendPasswordReset(email: string): Promise<AuthResult> {
  try {
    await browserClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/tilbakestill-passord",
    });
  } catch {
    // Også transportfeil skjules for å unngå å røpe kontostatus.
  }
  return { error: null, session: null };
}

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
