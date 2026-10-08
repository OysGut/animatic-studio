import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "signin" | "signup";

function norwegianAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "Feil e-post eller passord.";
  if (m.includes("email not confirmed"))
    return "E-postadressen er ikke bekreftet ennå. Sjekk innboksen din.";
  if (m.includes("already registered"))
    return "Det finnes allerede en konto med denne e-postadressen.";
  if (m.includes("password")) return "Passordet må ha minst 8 tegn.";
  if (m.includes("rate limit")) return "For mange forsøk. Vent litt og prøv igjen.";
  return "Noe gikk galt. Prøv igjen.";
}

/** Innlogging (e-post + passord eller innloggingslenke). Ingen markedsføringsflate – rett til arbeid. */
export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const redirect = typeof window !== "undefined" ? window.location.href : undefined;
    const res =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: redirect ? { emailRedirectTo: redirect } : {},
          });
    setBusy(false);
    if (res.error) setError(norwegianAuthError(res.error.message));
    else if (mode === "signup" && !res.data.session)
      setNotice("Kontoen er opprettet. Bekreft e-postadressen via lenken vi sendte deg.");
  }

  async function sendLink() {
    if (!email) {
      setError("Skriv inn e-postadressen først.");
      return;
    }
    setBusy(true);
    setError(null);
    const redirect = typeof window !== "undefined" ? window.location.href : undefined;
    const res = await supabase.auth.signInWithOtp({
      email,
      options: redirect ? { emailRedirectTo: redirect } : {},
    });
    setBusy(false);
    if (res.error) setError(norwegianAuthError(res.error.message));
    else setNotice("Vi har sendt en innloggingslenke til " + email + ".");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-app px-4">
      <div className="w-full max-w-[360px]">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Animatic Studio
          </h1>
          <p className="mt-1 text-[13px] text-text-secondary">
            Fra manus til ferdig film – i én sammenhengende produksjon.
          </p>
        </div>
        <form
          onSubmit={submit}
          className="space-y-4 border border-border bg-surface-1 p-6"
          aria-labelledby="auth-title"
        >
          <h2 id="auth-title" className="text-base font-semibold text-text-primary">
            {mode === "signin" ? "Logg inn" : "Opprett konto"}
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs text-text-secondary">
              E-post
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
              Passord
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
            {mode === "signin" ? "Logg inn" : "Opprett konto"}
          </Button>
          <div className="flex items-center justify-between pt-1 text-xs">
            <button
              type="button"
              className="text-accent-brand hover:underline"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "Ny bruker? Opprett konto" : "Har du konto? Logg inn"}
            </button>
            <button
              type="button"
              className="text-text-secondary hover:text-text-primary"
              onClick={() => void sendLink()}
              disabled={busy}
            >
              Send innloggingslenke
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
