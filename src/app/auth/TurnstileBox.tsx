/**
 * B-110: Cloudflare Turnstile-boksen. Skriptet lastes først når boksen vises, og bare fra Cloudflare.
 * Følger språket og temaet i grensesnittet. Turnstile er selv tilgjengelig med tastatur og skjermleser;
 * ingenting her fanger tastaturet. Ved feil vises en rolig melding med «Prøv igjen».
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; // i18n-ignore – adresse

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(s);
    const started = Date.now();
    const poll = () => {
      if (window.turnstile) resolve(window.turnstile);
      else if (Date.now() - started > 15000) {
        loading = null;
        reject(new Error("turnstile"));
      } else setTimeout(poll, 50);
    };
    poll();
  });
  return loading;
}

export function TurnstileBox({
  siteKey,
  action,
  onToken,
}: {
  siteKey: string;
  action: "signup" | "link" | "reset" | "login";
  onToken: (token: string | null) => void;
}) {
  const lang = useLanguage();
  const ref = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    let id: string | null = null;
    let cancelled = false;
    setFailed(false);
    cb.current(null);
    loadTurnstile()
      .then((api) => {
        if (cancelled || !ref.current) return;
        const theme = document.documentElement.classList.contains("light") ? "light" : "dark";
        id = api.render(ref.current, {
          sitekey: siteKey,
          action,
          theme,
          language: lang === 'en-XA' ? 'en' : lang,
          callback: (tok: string) => cb.current(tok),
          "error-callback": () => {
            cb.current(null);
            setFailed(true);
            return true;
          },
          "expired-callback": () => cb.current(null),
          "timeout-callback": () => cb.current(null),
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey, action, lang, attempt]);

  return (
    <div className="space-y-2" data-testid="captcha">
      <div ref={ref} data-testid="captcha-widget" />
      {failed ? (
        <div role="alert" className="flex items-center gap-2 text-xs text-text-secondary" data-testid="captcha-failed">
          <span>{t("b110.captcha.failed")}</span>
          <Button type="button" size="sm" variant="secondary" data-testid="captcha-retry" onClick={() => setAttempt((n) => n + 1)}>
            {t("b110.captcha.retry")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
