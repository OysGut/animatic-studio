/**
 * Teksten om bakgrunnsjobben på adminsiden (DEC-0088): når /api/public/cron/ai-jobs sist kjørte og hva den
 * gjorde, og en advarsel når den ikke har kjørt de siste 10 minuttene. Ren funksjon (testes i tests/unit).
 */
import { L, locale } from "@/core";
import type { CronRun } from "@/adapters/account/ai-models.server";

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
  if (minutes < 1) return L("nettopp", "just now");
  if (minutes === 1) return L("for 1 minutt siden", "1 minute ago");
  if (minutes < 120) return L(`for ${minutes} minutter siden`, `${minutes} minutes ago`);
  const h = Math.floor(minutes / 60);
  if (h < 48) return L(`for ${h} timer siden`, `${h} hours ago`);
  const d = Math.floor(h / 24);
  return L(`for ${d} dager siden`, `${d} days ago`);
}

export function cronSummary(run: CronRun | null, now = Date.now()): CronSummary {
  const warning = () =>
    L(
      `Bakgrunnsjobben har ikke kjørt de siste ${CRON_STALE_MINUTES} minuttene. Sjekk at appen er publisert og jobben er satt opp i Animatic Studio.`,
      `The background job has not run in the last ${CRON_STALE_MINUTES} minutes. Check that the app is published and the job is set up in Animatic Studio.`,
    );
  const t = run ? Date.parse(run.at) : Number.NaN;
  if (!run || !Number.isFinite(t))
    return {
      text: L("Bakgrunnsjobb: har ikke kjørt ennå.", "Background job: has not run yet."),
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
    text: L(
      `Bakgrunnsjobb: sist kjørt kl. ${when} (${ago(minutes)}) · ${run.sent} sendt · ${run.done} videoer hentet · ${run.purged} kontoer slettet`,
      `Background job: last run at ${when} (${ago(minutes)}) · ${run.sent} sent · ${run.done} videos fetched · ${run.purged} accounts deleted`,
    ),
    stale,
    warning: stale ? warning() : null,
    error: run.error,
  };
}
