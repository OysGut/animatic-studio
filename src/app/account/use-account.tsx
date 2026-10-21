/**
 * Kontoen i appen (DEC-0086): min konto (admin, språk, personvern), sist aktiv, språkvalget lagres på kontoen,
 * personvernerklæringen må leses ved ny versjon, og en konto som ikke lenger er aktiv logges ut.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { tm } from "@/core";
import {
  acceptPrivacy,
  fetchMyAccount,
  fetchPrivacyPolicy,
  saveMyLocale,
  touchActivity,
} from "@/adapters/browser/account";
import { signOut, signupCountry } from "@/adapters/browser/auth";
import { saveMyCountry } from "@/adapters/browser/account";
import { CountryPicker } from "./CountryPicker";
import { applyProfileLanguage, onExplicitLanguageChoice, useLanguage } from "@/app/i18n/language";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PrivacyStatement } from "./PrivacyStatement";
import { t } from "@/core/i18n/keyed";

export const MY_ACCOUNT_KEY = ["my-account"] as const;
export const PRIVACY_KEY = ["privacy-policy"] as const;

export function useMyAccount(enabled = true) {
  return useQuery({
    queryKey: MY_ACCOUNT_KEY,
    queryFn: fetchMyAccount,
    enabled,
    staleTime: 60_000,
  });
}

export function usePrivacyPolicy() {
  return useQuery({ queryKey: PRIVACY_KEY, queryFn: fetchPrivacyPolicy, staleTime: 5 * 60_000 });
}

// i18n-ignore: nøkkel i nettleserens lager
const TOUCH_KEY = "animatic:last-touch";

/** I toppfeltet når man er innlogget. Tegner ingenting selv, bortsett fra personvern-dialogen. */
export function AccountWatcher() {
  const qc = useQueryClient();
  const account = useMyAccount();
  const policy = usePrivacyPolicy();
  useLanguage();
  const [readIt, setReadIt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sist aktiv: høyst én gang i timen fra denne nettleseren (databasen sjekker også)
  useEffect(() => {
    try {
      const last = Number(window.localStorage.getItem(TOUCH_KEY) ?? 0);
      if (Date.now() - last < 60 * 60 * 1000) return;
      window.localStorage.setItem(TOUCH_KEY, String(Date.now()));
    } catch {
      /* privat vindu */
    }
    void touchActivity().catch(() => undefined);
  }, []);

  // Profile wins once per sign-in. Only explicit user choices are persisted, never browser detection.
  const a = account.data;
  useEffect(() => {
    if (!a) return;
    void applyProfileLanguage(a.locale);
    const off = onExplicitLanguageChoice(language => {
      if (language === 'en-XA') return;
      void saveMyLocale(language).then(error => {
        if (!error) void qc.invalidateQueries({ queryKey: MY_ACCOUNT_KEY });
      });
    });
    return off;
  }, [a?.locale, !!a, qc]);
  useEffect(() => () => { void applyProfileLanguage(null); }, []);

  // En konto som er blokkert eller låst for sletting, logges ut (innloggingen er også sperret)
  useEffect(() => {
    if (a && a.status !== "active") void signOut();
  }, [a]);

  const mustRead =
    !!a &&
    a.status === "active" &&
    a.privacyVersion !== null &&
    (a.acceptedVersion ?? 0) < a.privacyVersion;
  if (!mustRead) return a && a.status === "active" && a.country === null ? <CountryGate /> : null;
  async function accept() {
    if (!a?.privacyVersion) return;
    setBusy(true);
    const e = await acceptPrivacy(a.privacyVersion);
    setBusy(false);
    if (e) setError(tm(e.message));
    else void qc.invalidateQueries({ queryKey: MY_ACCOUNT_KEY });
  }
  return (
    <Dialog open>
      <DialogContent
        className="max-h-[90vh] max-w-[720px] overflow-hidden p-0 [&>button]:hidden"
        data-testid="privacy-accept"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>{t("app-account-use-account.account-watcher.dialog-title.249ff62113f5")}</DialogTitle>
          <DialogDescription>
            {(a.acceptedVersion ?? 0) > 0
              ? t("app-account-use-account.account-watcher.dialog-description.af08127f81e4")
              : t("app-account-use-account.account-watcher.dialog-description.4e07b85b3227")}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] overflow-y-auto border-y border-border px-5 py-4">
          <PrivacyStatement policy={policy.data ?? null} />
        </div>
        <DialogFooter className="flex-col items-stretch gap-2 px-5 pb-5 sm:flex-col">
          <label className="flex items-center gap-2 text-[13px] text-text-primary">
            <input
              type="checkbox"
              checked={readIt}
              onChange={(e) => setReadIt(e.target.checked)}
              className="size-4 accent-[var(--accent-brand)]"
              data-testid="privacy-read"
            />
            {t("app-account-use-account.account-watcher.label.1341c2d6b674")}
          </label>
          {error ? <p className="text-xs text-status-danger">{error}</p> : null}
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => void signOut()}>
              {t("app-account-use-account.account-watcher.button.87149e26bf0b")}
            </Button>
            <Button
              disabled={!readIt || busy}
              onClick={() => void accept()}
              data-testid="privacy-accept-button"
            >
              {t("app-account-use-account.account-watcher.button.4f70a8b92cf4")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lenke til personvernerklæringen (forsiden, kontosiden). */
export function PrivacyLink({ className }: { className?: string }) {
  return (
    <Link
      to="/personvern"
      className={
        className ??
        "text-xs text-text-tertiary underline-offset-2 hover:text-text-secondary hover:underline"
      }
    >
      {t("app-account-use-account.privacy-link.link.ac42faff7b54")}
    </Link>
  );
}

/**
 * B-097: kontoen mangler land. Landet fra registreringen lagres uten spørsmål; ellers (eksisterende brukere)
 * må landet velges før man går videre. Dialogen kan ikke lukkes uten valg; ingen data endres ellers.
 */
function CountryGate() {
  const qc = useQueryClient();
  const [checked, setChecked] = useState(false);
  const [country, setCountry] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void signupCountry()
      .then(async (c) => {
        if (!live) return;
        if (c && !(await saveMyCountry(c))) {
          void qc.invalidateQueries({ queryKey: MY_ACCOUNT_KEY });
          return;
        }
        setChecked(true);
      })
      .catch(() => live && setChecked(true));
    return () => {
      live = false;
    };
  }, [qc]);
  if (!checked) return null;
  async function save() {
    if (!country) return;
    setBusy(true);
    setError(null);
    const e = await saveMyCountry(country);
    setBusy(false);
    if (e) setError(tm(e.message));
    else void qc.invalidateQueries({ queryKey: MY_ACCOUNT_KEY });
  }
  return (
    <Dialog open>
      <DialogContent
        className="max-w-[420px] [&>button]:hidden"
        data-testid="country-gate"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("b097.country.gate-title")}</DialogTitle>
          <DialogDescription>{t("b097.country.gate-text")}</DialogDescription>
        </DialogHeader>
        <div>
          <CountryPicker value={country} onChange={setCountry} testId="country-gate-picker" />
        </div>
        {error ? <p className="text-xs text-status-danger">{error}</p> : null}
        <DialogFooter>
          <Button disabled={!country || busy} onClick={() => void save()} data-testid="country-gate-save">
            {t("b097.country.gate-save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
