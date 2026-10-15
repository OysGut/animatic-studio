import { useState, type FormEvent } from "react";
import { sendSignInLink, signInWithPassword, signUp } from "@/adapters/browser/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { L } from "@/core";
import { PrivacyLink } from "@/app/account/use-account";

type Mode = "signin" | "signup";

function norwegianAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("banned"))
    return L(
      "Kontoen er sperret (blokkert eller låst for sletting). Kontakt administrator: oystein@gutu.no.",
      "The account is locked (blocked or locked for deletion). Contact the administrator: oystein@gutu.no.",
    );
  if (m.includes("invalid login"))
    return L("Feil e-post eller passord.", "Wrong email or password.");
  if (m.includes("email not confirmed"))
    return L(
      "E-postadressen er ikke bekreftet ennå. Sjekk innboksen din.",
      "The email address is not confirmed yet. Check your inbox.",
    );
  if (m.includes("already registered"))
    return L(
      "Det finnes allerede en konto med denne e-postadressen.",
      "An account with this email address already exists.",
    );
  if (m.includes("password"))
    return L("Passordet må ha minst 8 tegn.", "The password must be at least 8 characters.");
  if (m.includes("rate limit"))
    return L(
      "For mange forsøk. Vent litt og prøv igjen.",
      "Too many attempts. Wait a little and try again.",
    );
  return L("Noe gikk galt. Prøv igjen.", "Something went wrong. Try again.");
}

/** Innlogging (e-post + passord eller innloggingslenke). Ingen markedsføringsflate – rett til arbeid. */
export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Ny konto: brukeren bekrefter at personvernerklæringen er lest (DEC-0086); den godkjennes også i appen
  const [readPrivacy, setReadPrivacy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "signup" && !readPrivacy) {
      setError(L("Les personvernerklæringen først.", "Read the privacy statement first."));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const redirect = typeof window !== "undefined" ? window.location.href : undefined;
    const res =
      mode === "signin"
        ? await signInWithPassword(email, password)
        : await signUp(email, password, redirect);
    setBusy(false);
    if (res.error) setError(norwegianAuthError(res.error.message));
    else if (mode === "signup" && !res.session)
      setNotice(
        L(
          "Kontoen er opprettet. Bekreft e-postadressen via lenken vi sendte deg.",
          "The account has been created. Confirm your email address via the link we sent you.",
        ),
      );
  }

  async function sendLink() {
    if (!email) {
      setError(L("Skriv inn e-postadressen først.", "Enter your email address first."));
      return;
    }
    setBusy(true);
    setError(null);
    const redirect = typeof window !== "undefined" ? window.location.href : undefined;
    const res = await sendSignInLink(email, redirect);
    setBusy(false);
    if (res.error) setError(norwegianAuthError(res.error.message));
    else
      setNotice(
        L(
          `Vi har sendt en innloggingslenke til ${email}.`,
          `We have sent a sign-in link to ${email}.`,
        ),
      );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-app px-4">
      <div className="w-full max-w-[360px]">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Animatic Studio
          </h1>
          <p className="mt-1 text-[13px] text-text-secondary">
            {L(
              "Fra manus til ferdig film – i én sammenhengende produksjon.",
              "From script to finished film – in one continuous production.",
            )}
          </p>
        </div>
        <form
          onSubmit={submit}
          className="space-y-4 border border-border bg-surface-1 p-6"
          aria-labelledby="auth-title"
        >
          <h2 id="auth-title" className="text-base font-semibold text-text-primary">
            {mode === "signin" ? L("Logg inn", "Sign in") : L("Opprett konto", "Create account")}
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs text-text-secondary">
              {L("E-post", "Email")}
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-8 bg-surface-3"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs text-text-secondary">
              {L("Passord", "Password")}
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-8 bg-surface-3"
            />
          </div>
          {mode === "signup" ? (
            <label className="flex items-start gap-2 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={readPrivacy}
                onChange={(e) => setReadPrivacy(e.target.checked)}
                className="mt-0.5 size-3.5 accent-[var(--accent-brand)]"
                data-testid="signup-privacy"
              />
              <span>
                {L("Jeg har lest ", "I have read the ")}
                <a
                  href="/personvern"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-brand underline-offset-2 hover:underline"
                >
                  {L("personvernerklæringen", "privacy statement")}
                </a>
              </span>
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-status-danger">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="text-xs text-status-success">
              {notice}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "signin" ? L("Logg inn", "Sign in") : L("Opprett konto", "Create account")}
          </Button>
          <div className="flex items-center justify-between pt-1 text-xs">
            <button
              type="button"
              className="text-accent-brand hover:underline"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin"
                ? L("Ny bruker? Opprett konto", "New user? Create an account")
                : L("Har du konto? Logg inn", "Have an account? Sign in")}
            </button>
            <button
              type="button"
              className="text-text-secondary hover:text-text-primary"
              onClick={() => void sendLink()}
              disabled={busy}
            >
              {L("Send innloggingslenke", "Send sign-in link")}
            </button>
          </div>
        </form>
        <div className="mt-3 flex justify-center">
          <PrivacyLink />
        </div>
      </div>
    </main>
  );
}
