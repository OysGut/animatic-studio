/**
 * Etter innlogging med Google: tilbake til siden brukeren kom fra (invitasjon, QR, mobilside, prosjekt).
 * Stien er lagret for økten av startGoogleSignIn og gjelder bare samme nettsted.
 */
import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { useSession } from "./use-session";
import { sessionStorageOrNull, takeReturnPath } from "@/adapters/browser/google-auth";

export function ReturnAfterSignIn() {
  const session = useSession();
  const router = useRouter();
  useEffect(() => {
    if (session.status !== "signed-in") return;
    const path = takeReturnPath(sessionStorageOrNull(), window.location.pathname + window.location.search);
    if (path) router.history.replace(path);
  }, [session.status, router]);
  return null;
}
