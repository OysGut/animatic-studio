/**
 * Innlogging med Google via Lovable Clouds administrerte OAuth. Ingen nøkler i koden.
 * redirect_uri er alltid nettstedets egen rot (forhåndsvisning og eget domene godtas automatisk).
 * Siden brukeren kom fra (invitasjon, QR, mobilside, prosjekt) lagres for økten og åpnes etter innlogging.
 */
import { lovable } from "@/integrations/lovable/index";
import { classifyOAuthError, sanitizeReturnPath, type OAuthReturnError } from "@/core/auth/google";

// i18n-ignore: nøkkel i nettleserens lager
export const RETURN_PATH_KEY = "ptg:return-after-sign-in";

type OAuthFn = (provider: "google", opts: { redirect_uri: string }) => Promise<{ error?: unknown; redirected?: boolean }>;
interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
interface LocationLike {
  origin: string;
  pathname: string;
  search: string;
  hash: string;
}
export interface GoogleDeps {
  oauth: OAuthFn;
  storage: StorageLike | null;
  location: LocationLike;
}

function defaultDeps(): GoogleDeps {
  let storage: StorageLike | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = null;
  }
  return { oauth: (p, o) => lovable.auth.signInWithOAuth(p, o), storage, location: window.location };
}

/** Starter Google-innloggingen. Gir feiltypen, eller null når innloggingen er i gang eller ferdig. */
export async function startGoogleSignIn(deps: GoogleDeps = defaultDeps()): Promise<OAuthReturnError | null> {
  const here = sanitizeReturnPath(deps.location.pathname + deps.location.search);
  try {
    if (here && here !== "/") deps.storage?.setItem(RETURN_PATH_KEY, here);
    else deps.storage?.removeItem(RETURN_PATH_KEY);
  } catch {
    /* privat vindu: brukeren havner på forsiden */
  }
  const res = await deps.oauth("google", { redirect_uri: deps.location.origin });
  if (res.error) {
    deps.storage?.removeItem(RETURN_PATH_KEY);
    const msg = res.error instanceof Error ? res.error.message : String(res.error);
    return classifyOAuthError(msg);
  }
  return null;
}

/** Etter innlogging: stien brukeren skal tilbake til (brukes én gang), eller null. */
export function takeReturnPath(storage: StorageLike | null, currentPath: string): string | null {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(RETURN_PATH_KEY) ?? null;
    storage?.removeItem(RETURN_PATH_KEY);
  } catch {
    return null;
  }
  const path = sanitizeReturnPath(raw);
  return path && path !== currentPath ? path : null;
}

export function sessionStorageOrNull(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
