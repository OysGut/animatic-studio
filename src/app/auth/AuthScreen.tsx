import { useState, type FormEvent } from "react";
import { sendSignInLink, signInWithPassword, signUp } from "@/adapters/browser/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { PrivacyLink } from "@/app/account/use-account";
import { t } from "@/core/i18n/keyed";

type Mode = "signin" | "signup";

function norwegianAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("banned"))
    return t("app-auth-auth-screen.norwegian-auth-error.message.2c6406a859ea");
  if (m.includes("invalid login"))
    return t("app-auth-auth-screen.norwegian-auth-error.message.95c18548f154");
  if (m.includes("email not confirmed"))
    return t("app-auth-auth-screen.norwegian-auth-error.message.e4bd6f3f7df3");
  if (m.includes("already registered"))
    return t("app-auth-auth-screen.norwegian-auth-error.message.fa8299739ce5");
  if (m.includes("password"))
    return t("app-auth-auth-screen.norwegian-auth-error.message.b3dd07f3b76a");
  if (m.includes("rate limit"))
    return t("app-auth-auth-screen.norwegian-auth-error.message.9048c2290f5e");
  return t("app-auth-auth-screen.norwegian-auth-error.message.4b326751900a");
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
      setError(t("app-auth-auth-screen.submit.set-error.d5170069ebaf"));
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
        t("app-auth-auth-screen.submit.set-notice.a389c2300257"),
      );
  }

  async function sendLink() {
    if (!email) {
      setError(t("app-auth-auth-screen.send-link.set-error.7166e0585ba7"));
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
        t("app-auth-auth-screen.send-link.set-notice.ff4036e3c48c", { email: String(email) }),
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
            {t("app-auth-auth-screen.auth-screen.p.e99ee6ebdf9f")}
          </p>
        </div>
        <form
          onSubmit={submit}
          className="space-y-4 border border-border bg-surface-1 p-6"
          aria-labelledby="auth-title"
        >
          <h2 id="auth-title" className="text-base font-semibold text-text-primary">
            {mode === "signin" ? t("app-auth-auth-screen.auth-screen.h2.852d2eee9390") : t("app-auth-auth-screen.auth-screen.h2.a327ce9931d2")}
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs text-text-secondary">
              {t("app-auth-auth-screen.auth-screen.label.7c26d484c7c6")}
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
              {t("app-auth-auth-screen.auth-screen.label.d38edc077535")}
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
                {t("app-auth-auth-screen.auth-screen.span.58227f6df4c1")}
                <a
                  href="/personvern"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-brand underline-offset-2 hover:underline"
                >
                  {t("app-auth-auth-screen.auth-screen.a.8a48040d6096")}
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
            {mode === "signin" ? t("app-auth-auth-screen.auth-screen.button.852d2eee9390") : t("app-auth-auth-screen.auth-screen.button.a327ce9931d2")}
          </Button>
          <div className="flex items-center justify-between pt-1 text-xs">
            <button
              type="button"
              className="text-accent-brand hover:underline"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin"
                ? t("app-auth-auth-screen.auth-screen.button.22a66d43cb57")
                : t("app-auth-auth-screen.auth-screen.button.0c501076b9f7")}
            </button>
            <button
              type="button"
              className="text-text-secondary hover:text-text-primary"
              onClick={() => void sendLink()}
              disabled={busy}
            >
              {t("app-auth-auth-screen.auth-screen.button.54c2a58316bb")}
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
