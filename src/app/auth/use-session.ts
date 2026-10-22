import { useEffect, useState, useSyncExternalStore } from "react";
import { getSession, onSessionChange, getSessionUserId, onSessionIdentityChange, type Session } from "@/adapters/browser/auth";

export function useSessionUserId(): string | null {
  return useSyncExternalStore(onSessionIdentityChange, getSessionUserId, () => null);
}

export type SessionState =
  { status: "loading" } | { status: "signed-out" } | { status: "signed-in"; session: Session };

/** Innloggingsstatus. Kjøres bare i nettleseren (SSR viser «loading»). */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    let observedSession = false;
    void getSession().then((session) => {
      if (!alive || observedSession) return;
      setState(session ? { status: "signed-in", session } : { status: "signed-out" });
    });
    const unsubscribe = onSessionChange((session) => {
      observedSession = true;
      setState(session ? { status: "signed-in", session } : { status: "signed-out" });
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  return state;
}
