/** B-109: administrator stenger eller åpner for nye registreringer (eksisterende brukere påvirkes ikke). */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { locale } from "@/core";
import { fetchRegistrationSettings, setRegistrationOpen } from "@/adapters/browser/registration";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fetchCaptchaSettings } from "@/adapters/browser/captcha-auth";
import { t } from "@/core/i18n/keyed";

/** B-110: tydelig varsel når CAPTCHA er av fordi nøklene mangler på serveren. */
export function CaptchaWarning() {
  const q = useQuery({ queryKey: ["captcha-config"], queryFn: fetchCaptchaSettings, staleTime: 300_000 });
  if (!q.data) return null;
  return q.data.enabled ? (
    <p className="text-xs text-status-success" data-testid="admin-captcha-on">{t("b110.admin.on")}</p>
  ) : (
    <div role="alert" className="rounded-md border border-status-discrepancy/60 bg-surface-1 p-3 text-xs text-text-primary" data-testid="admin-captcha-off">
      <strong className="font-semibold">{t("b110.admin.off-title")}</strong> {t("b110.admin.off")}
    </div>
  );
}

export const REGISTRATION_KEY = ["admin-registration"] as const;

export function RegistrationAdmin() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: REGISTRATION_KEY, queryFn: fetchRegistrationSettings });
  const s = q.data ?? null;
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<null | boolean>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => setMessage(s?.message ?? ""), [s?.message]);

  async function apply(open: boolean) {
    setBusy(true);
    setFailed(false);
    const ok = await setRegistrationOpen(open, message.trim() ? message.trim() : null);
    setBusy(false);
    setConfirm(null);
    if (!ok) setFailed(true);
    await qc.invalidateQueries({ queryKey: REGISTRATION_KEY });
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-surface-1 p-4" data-testid="admin-registration">
      <h2 className="text-sm font-semibold text-text-primary">{t("b109.admin.title")}</h2>
      <p className="text-xs text-text-tertiary">{t("b109.admin.note")}</p>
      {s === null ? (
        <p className="text-xs text-text-tertiary">{q.isLoading ? t("b109.admin.loading") : t("b109.admin.unavailable")}</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-secondary">{t("b109.admin.label")}</span>
            <div role="radiogroup" aria-label={t("b109.admin.label")} className="flex overflow-hidden rounded-sm border border-border-control">
              {([true, false] as const).map((open) => (
                <button
                  key={String(open)}
                  type="button"
                  role="radio"
                  aria-checked={s.open === open}
                  data-testid={open ? "registration-open" : "registration-closed"}
                  disabled={busy || s.open === open}
                  onClick={() => setConfirm(open)}
                  className={
                    "px-3 py-1 text-xs " +
                    (s.open === open
                      ? open
                        ? "bg-status-success/20 font-semibold text-text-primary"
                        : "bg-status-danger/20 font-semibold text-text-primary"
                      : "bg-surface-3 text-text-secondary hover:text-text-primary")
                  }
                >
                  {open ? t("b109.admin.open") : t("b109.admin.closed")}
                </button>
              ))}
            </div>
          </div>
          <label className="flex max-w-[520px] flex-col gap-1 text-xs text-text-secondary">
            {t("b109.admin.message")}
            <textarea
              data-testid="registration-message"
              maxLength={500}
              rows={2}
              value={message}
              placeholder={t("b109.auth.closed")}
              onChange={(e) => setMessage(e.target.value)}
              className="rounded-sm border border-border-control bg-surface-3 px-2 py-1 text-xs text-text-primary"
            />
          </label>
          {!s.open ? (
            <div>
              <Button size="sm" variant="secondary" disabled={busy} data-testid="registration-save-message" onClick={() => void apply(false)}>
                {t("b109.admin.save-message")}
              </Button>
            </div>
          ) : null}
          <p className="text-xs text-text-tertiary" data-testid="registration-changed">
            {s.changedAt
              ? t("b109.admin.changed", {
                  when: new Date(s.changedAt).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" }),
                  who: s.changedByName ?? t("b109.admin.unknown-user"),
                })
              : t("b109.admin.never-changed")}
          </p>
          {failed ? (
            <p role="alert" className="text-xs text-status-danger">{t("b109.admin.failed")}</p>
          ) : null}
        </>
      )}
      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent data-testid="registration-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm ? t("b109.admin.confirm-open-title") : t("b109.admin.confirm-close-title")}</AlertDialogTitle>
            <AlertDialogDescription>{confirm ? t("b109.admin.confirm-open") : t("b109.admin.confirm-close")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("b109.admin.cancel")}</AlertDialogCancel>
            <AlertDialogAction data-testid="registration-confirm-ok" onClick={() => confirm !== null && void apply(confirm)}>
              {confirm ? t("b109.admin.confirm-open-ok") : t("b109.admin.confirm-close-ok")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
