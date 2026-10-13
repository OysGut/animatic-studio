import { useEffect, useState } from "react";
import { getSession, onSessionChange, type Session } from "@/adapters/browser/auth";

export type SessionState =
  { status: "loading" } | { status: "signed-out" } | { status: "signed-in"; session: Session };

/** Innloggingsstatus. Kjøres bare i nettleseren (SSR viser «loading»). */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    void getSession().then((session) => {
      if (!alive) return;
      setState(session ? { status: "signed-in", session } : { status: "signed-out" });
    });
    const unsubscribe = onSessionChange((session) => {
      setState(session ? { status: "signed-in", session } : { status: "signed-out" });
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  return state;
}
