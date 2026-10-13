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
): Promise<AuthResult> {
  const res = await browserClient.auth.signUp({
    email,
    password,
    options: redirect ? { emailRedirectTo: redirect } : {},
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
