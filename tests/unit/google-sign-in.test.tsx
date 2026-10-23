/**
 * Google-innlogging med falsk auth-klient: ny bruker (med og uten pass), stengt registrering, eksisterende
 * bruker, personvernsteget, navn fra Google og retur til siden brukeren kom fra. Passkravet og stengingen
 * håndheves i databasen (0092, tests/db/run-db-tests.ts); her testes det appen gjør med svarene.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  classifyOAuthError,
  googleDisplayName,
  loginMethods,
  oauthReturnError,
  sanitizeReturnPath,
  shouldAdoptGoogleName,
} from "@/core/auth/google";

vi.mock("@/integrations/lovable/index", () => ({ lovable: { auth: { signInWithOAuth: vi.fn() } } }));
import { RETURN_PATH_KEY, startGoogleSignIn, takeReturnPath, type GoogleDeps } from "@/adapters/browser/google-auth";

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

/** Falsk innloggingstjeneste med databasens regler: stengt registrering stopper nye kontoer, ikke eksisterende. */
function fakeAuth(opts: { existing: Set<string>; open: boolean; email: string }) {
  const calls: { provider: string; redirect_uri: string }[] = [];
  const oauth: GoogleDeps["oauth"] = async (provider, o) => {
    calls.push({ provider, redirect_uri: o.redirect_uri });
    if (!opts.existing.has(opts.email) && !opts.open) return { error: new Error("Database error saving new user") };
    opts.existing.add(opts.email);
    return {};
  };
  return { oauth, calls };
}

const loc = (pathname: string, search = "") => ({ origin: "https://pentoglass.com", pathname, search, hash: "" });

describe("Google: start og svar", () => {
  it("ny bruker ved åpen registrering (passet trengs ikke for Google): innlogging uten feil, redirect til nettstedets rot", async () => {
    const auth = fakeAuth({ existing: new Set(), open: true, email: "ny@example.com" });
    const storage = memoryStorage();
    expect(await startGoogleSignIn({ oauth: auth.oauth, storage, location: loc("/") })).toBeNull();
    expect(auth.calls).toEqual([{ provider: "google", redirect_uri: "https://pentoglass.com" }]);
  });

  it("ny bruker ved stengt registrering stoppes med meldingen om stengt registrering, og ingen retursti blir liggende", async () => {
    const auth = fakeAuth({ existing: new Set(), open: false, email: "ny@example.com" });
    const storage = memoryStorage();
    expect(await startGoogleSignIn({ oauth: auth.oauth, storage, location: loc("/invitasjon", "?token=abc") })).toBe("closed");
    expect(storage.getItem(RETURN_PATH_KEY)).toBeNull();
  });

  it("eksisterende bruker logger alltid inn, også når registreringen er stengt", async () => {
    const auth = fakeAuth({ existing: new Set(["kari@example.com"]), open: false, email: "kari@example.com" });
    expect(await startGoogleSignIn({ oauth: auth.oauth, storage: memoryStorage(), location: loc("/") })).toBeNull();
  });

  it("feil i returadressen tolkes: stengt (B-109), sperret konto og annen feil", () => {
    expect(oauthReturnError("?error=server_error&error_description=Database+error+saving+new+user", "")).toBe("closed");
    expect(oauthReturnError("", "#error=access_denied&error_description=User+is+banned")).toBe("blocked");
    expect(oauthReturnError("?error=access_denied", "")).toBe("failed");
    expect(oauthReturnError("?token=abc", "")).toBeNull();
    expect(classifyOAuthError("registration_closed")).toBe("closed");
  });
});

describe("Google: tilbake til siden brukeren kom fra", () => {
  it.each([
    ["/invitasjon", "?token=abc"],
    ["/invitasjon", "?token=abc&type=gruppe"],
    ["/k/ABC123", ""],
    ["/m/tok", ""],
    ["/prosjekt/p1/scene", "?occ=1"],
  ])("%s%s lagres og brukes én gang etter innlogging", async (pathname, search) => {
    const storage = memoryStorage();
    const auth = fakeAuth({ existing: new Set(["a@example.com"]), open: true, email: "a@example.com" });
    await startGoogleSignIn({ oauth: auth.oauth, storage, location: loc(pathname, search) });
    expect(auth.calls[0]!.redirect_uri).toBe("https://pentoglass.com");
    expect(takeReturnPath(storage, "/")).toBe(pathname + search);
    expect(takeReturnPath(storage, "/")).toBeNull();
  });

  it("andre nettsteder og skjulte adresser godtas aldri som retursti", () => {
    for (const bad of ["https://evil.example/x", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", "/a\nb"])
      expect(sanitizeReturnPath(bad)).toBeNull();
    const storage = memoryStorage();
    storage.setItem(RETURN_PATH_KEY, "//evil.example");
    expect(takeReturnPath(storage, "/")).toBeNull();
    storage.setItem(RETURN_PATH_KEY, "/konto");
    expect(takeReturnPath(storage, "/konto")).toBeNull();
  });
});

describe("Google: profil og innloggingsmetoder", () => {
  it("visningsnavn fra Google brukes bare over standardnavnet fra e-posten, aldri over et eget navn", () => {
    expect(googleDisplayName({ full_name: "  Kari   Nordmann " })).toBe("Kari Nordmann");
    expect(googleDisplayName({ name: "Ola" })).toBe("Ola");
    expect(googleDisplayName({ avatar_url: "https://x" })).toBeNull();
    expect(shouldAdoptGoogleName("", "kari@example.com", "Kari Nordmann")).toBe(true);
    expect(shouldAdoptGoogleName("kari", "kari@example.com", "Kari Nordmann")).toBe(true);
    expect(shouldAdoptGoogleName("Regissøren", "kari@example.com", "Kari Nordmann")).toBe(false);
    expect(shouldAdoptGoogleName("Kari Nordmann", "kari@example.com", "Kari Nordmann")).toBe(false);
  });

  it("innloggingsmetodene leses fra kontoen: Google, e-post eller begge", () => {
    expect(loginMethods({ app_metadata: { provider: "google", providers: ["google"] } })).toEqual(["google"]);
    expect(loginMethods({ app_metadata: { provider: "email", providers: ["email", "google"] } })).toEqual(["google", "email"]);
    expect(loginMethods({ app_metadata: { provider: "email" }, identities: [] })).toEqual(["email"]);
    expect(loginMethods(null)).toEqual([]);
  });
});

// ---------- Personvernsteget ved første innlogging (samme som for e-post) ----------
const account = vi.hoisted(() => ({
  current: null as Record<string, unknown> | null,
  saved: [] as string[],
}));
vi.mock("@/adapters/browser/account", async (orig) => ({
  ...(await orig<typeof import("@/adapters/browser/account")>()),
  fetchMyAccount: async () => account.current,
  fetchPrivacyPolicy: async () => ({ version: 3, textNb: "Tekst", textEn: "Text", publishedAt: null }),
  touchActivity: async () => undefined,
  saveMyLocale: async () => null,
  acceptPrivacy: async () => null,
  saveDisplayName: async (n: string) => { account.saved.push(n); return null; },
}));
vi.mock("@/adapters/browser/auth", async (orig) => ({
  ...(await orig<typeof import("@/adapters/browser/auth")>()),
  getSessionUserId: () => "u1",
  onSessionIdentityChange: () => () => {},
  getSession: async () => ({ user: { id: "u1", email: "kari@example.com", app_metadata: { provider: "google", providers: ["google"] }, user_metadata: { full_name: "Kari Nordmann" } } }),
  signOut: async () => {},
}));
vi.mock("@/app/auth/use-session", () => ({ useSessionUserId: () => "u1", useSession: () => ({ status: "loading" }) }));

describe("Google: første innlogging", () => {
  beforeEach(() => { account.saved = []; });
  it("ny Google-bruker må godta personvernerklæringen, og profilen får navnet fra Google", async () => {
    account.current = { status: "active", isAdmin: false, permanentAdmin: false, locale: null, displayName: "kari", uiPrefs: {}, privacyVersion: 3, acceptedVersion: null, createdAt: null, country: "NO" };
    const { AccountWatcher } = await import("@/app/account/use-account");
    render(<QueryClientProvider client={new QueryClient()}><AccountWatcher /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    await waitFor(() => expect(account.saved).toEqual(["Kari Nordmann"]));
  });
});
