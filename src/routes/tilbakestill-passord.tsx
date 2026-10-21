import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getSession, onPasswordRecovery, updateRecoveryPassword } from "@/adapters/browser/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/core/i18n/keyed";
import { LanguageSwitch, useLanguage } from '@/app/i18n/language';

// Fang fragmentet før Supabase fjerner det etter å ha lest recovery-tokenet.
const recoveryHash = typeof window !== "undefined" &&
  new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";

export const Route = createFileRoute("/tilbakestill-passord")({
  head: () => ({ meta: [
    { title: t("auth.password-reset.title") },
    { name: "description", content: t("auth.password-reset.description") },
    { property: "og:title", content: t("auth.password-reset.title") }, // i18n-ignore: metakode
    { property: "og:description", content: t("auth.password-reset.description") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
  ] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  useLanguage();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = onPasswordRecovery(() => {
      if (active) { setReady(true); setChecking(false); }
    });
    void getSession().then((session) => {
      if (!active) return;
      if (recoveryHash && session) setReady(true);
      setChecking(false);
    }).catch(() => { if (active) setChecking(false); });
    return () => { active = false; unsubscribe(); };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) { setError(t("auth.password-reset.too-short")); return; }
    if (password !== confirm) { setError(t("auth.password-reset.mismatch")); return; }
    if (!ready || busy) return;
    setBusy(true);
    try {
      const result = await updateRecoveryPassword(password);
      if (result.error) setError(t("auth.password-reset.failed"));
      else { setDone(true); setPassword(""); setConfirm(""); }
    } catch {
      setError(t("auth.password-reset.failed"));
    } finally { setBusy(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-app px-4">
      <div className="w-full max-w-[360px] space-y-4 border border-border bg-surface-1 p-6 text-text-primary">
        <LanguageSwitch compact />
        <h1 className="text-xl font-semibold">{t("auth.password-reset.heading")}</h1>
        {done ? <p role="status">{t("auth.password-reset.success")}</p> : checking ?
          <p role="status">{t("auth.password-reset.checking")}</p> : !ready ?
          <p role="alert">{t("auth.password-reset.invalid")}</p> : (
            <form onSubmit={submit} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">{t("auth.password-reset.password")}</Label>
                <Input id="new-password" type="password" autoComplete="new-password" minLength={8}
                  required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">{t("auth.password-reset.confirm")}</Label>
                <Input id="confirm-password" type="password" autoComplete="new-password" minLength={8}
                  required value={confirm} onChange={(event) => setConfirm(event.target.value)} disabled={busy} />
              </div>
              {error ? <p role="alert" className="text-sm text-status-danger">{error}</p> : null}
              <Button type="submit" disabled={busy}>{t("auth.password-reset.save")}</Button>
            </form>
          )}
        <Link to="/" className="text-sm text-accent-brand hover:underline">{t("auth.password-reset.login")}</Link>
      </div>
    </main>
  );
}
