/**
 * G-5: rydding i endringsloggen fra den eksisterende cron-adressen (/api/public/cron/ai-jobs). Kjøres høyst
 * én gang per PRUNE_INTERVAL_MS; siste kjøring lagres i app_status, så hyppige cron-kall ikke skanner
 * change_log hver gang. Selve ryddingen og reglene ligger i public.prune_change_logs (0097).
 */
import type { AnyClient } from "./project-rows";

export const PRUNE_STATUS_KEY = "change_log_prune";
export const PRUNE_INTERVAL_MS = 20 * 60 * 60 * 1000;

/** Skal ryddingen kjøres nå? Ren regel (testes). */
export function pruneDue(lastAt: string | null | undefined, now: number): boolean {
  if (!lastAt) return true;
  const t = Date.parse(lastAt);
  return !Number.isFinite(t) || now - t >= PRUNE_INTERVAL_MS;
}

/** Gir antall slettede rader, eller null når den ikke var forfalt. */
export async function pruneChangeLogsIfDue(db: AnyClient, now = Date.now()): Promise<number | null> {
  const { data: status } = await db.from("app_status").select("value").eq("key", PRUNE_STATUS_KEY).maybeSingle();
  const lastAt = (status as { value?: { at?: string } } | null)?.value?.at ?? null;
  if (!pruneDue(lastAt, now)) return null;
  const { data, error } = await db.rpc("prune_change_logs" as never, {} as never);
  if (error) throw new Error(error.message);
  const removed = ((data as { removed?: number }[] | null) ?? []).reduce((n, r) => n + Number(r.removed ?? 0), 0);
  const value = { at: new Date(now).toISOString(), removed };
  const row = { key: PRUNE_STATUS_KEY, value, updated_at: value.at };
  if (status) await db.from("app_status").update(row as never).eq("key", PRUNE_STATUS_KEY);
  else await db.from("app_status").insert(row as never);
  return removed;
}
