/**
 * Teksten om bakgrunnsjobben på adminsiden (DEC-0088): når /api/public/cron/ai-jobs sist kjørte og hva den
 * gjorde, og en advarsel når den ikke har kjørt de siste 10 minuttene. Ren funksjon (testes i tests/unit).
 */
import { locale } from "@/core";
import type { CronRun } from "@/adapters/account/ai-models.server";
import { t as tk } from "@/core/i18n/keyed";

/** Jobben går hvert minutt; har den ikke kjørt på så lenge, er noe galt. */
export const CRON_STALE_MINUTES = 10;

export interface CronSummary {
  /** «Bakgrunnsjobb: sist kjørt kl. 14:05 (for 3 minutter siden) · 2 sendt · …» */
  readonly text: string;
  /** Har ikke kjørt de siste 10 minuttene (eller aldri). */
  readonly stale: boolean;
  readonly warning: string | null;
  /** Feilmelding fra siste kjøring. */
  readonly error: string | null;
}

function ago(minutes: number): string {
  if (minutes < 1) return tk("app-admin-cron-status.ago.message.af45a5e15ce8");
  if (minutes === 1) return tk("app-admin-cron-status.ago.message.8cfe331fedff");
  if (minutes < 120) return tk("app-admin-cron-status.ago.message.c6efd4662c82", { minutes: String(minutes) });
  const h = Math.floor(minutes / 60);
  if (h < 48) return tk("app-admin-cron-status.ago.message.2398dfc32f40", { h: String(h) });
  const d = Math.floor(h / 24);
  return tk("app-admin-cron-status.ago.message.086115f60e72", { d: String(d) });
}

export function cronSummary(run: CronRun | null, now = Date.now()): CronSummary {
  const warning = () =>
    tk("app-admin-cron-status.warning.message.1494cbf069ca", { CRON_STALE_MINUTES: String(CRON_STALE_MINUTES) });
  const t = run ? Date.parse(run.at) : Number.NaN;
  if (!run || !Number.isFinite(t))
    return {
      text: tk("app-admin-cron-status.text.text.9d6153356ac8"),
      stale: true,
      warning: warning(),
      error: null,
    };
  const minutes = Math.max(0, Math.floor((now - t) / 60_000));
  const d = new Date(t);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  const clock = d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  const when = sameDay
    ? clock
    : `${d.toLocaleDateString(locale(), { day: "numeric", month: "short" })} ${clock}`;
  const stale = minutes >= CRON_STALE_MINUTES;
  return {
    text: tk("app-admin-cron-status.text.text.2f7b3cfcd445", { when: String(when), value2: String(ago(minutes)), sent: String(run.sent), done: String(run.done), purged: String(run.purged) }),
    stale,
    warning: stale ? warning() : null,
    error: run.error,
  };
}
