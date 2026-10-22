/**
 * DV5-rest (N3): hvilke ferdige bakgrunnsresultater som legges på angrelisten i denne fanen. Bare resultater
 * brukeren har sett bli ferdige i økten (elementet var ikke ferdig da det ble sett første gang, eller jobben
 * ble startet her). Eldre resultater fra før økten blir ikke plutselig angrebare.
 */
import { adoptedServerCommands } from "@/app/project/use-commands";

interface JobView { readonly id: string; readonly items: readonly { readonly id: string; readonly status: string }[] }

/** Elementer som er sett før de ble ferdige, og jobber som er startet i fanen. */
export const seenOpenItems = new Set<string>();
export const batchesStartedHere = new Set<string>();
/** Elementer som allerede er hentet fra serverhistorikken. */
export const fetchedItems = new Set<string>();

/** Noterer status og gir jobbene med nye ferdige elementer som skal hentes fra serverhistorikken. */
export function batchesToAdopt(jobs: readonly JobView[]): string[] {
  const out: string[] = [];
  for (const job of jobs) {
    let wanted = false;
    for (const item of job.items) {
      if (item.status !== "done") { seenOpenItems.add(item.id); continue; }
      if (fetchedItems.has(item.id)) continue;
      if (seenOpenItems.has(item.id) || batchesStartedHere.has(job.id)) wanted = true;
    }
    if (wanted) out.push(job.id);
  }
  return out;
}

/** Bare elementene som kvalifiserer (og ikke er lagt inn før), i jobbens rekkefølge. */
export function rowsToAdopt<T extends { itemId: string; commandId: string }>(jobId: string, rows: readonly T[]): T[] {
  const out = rows.filter((r) => (seenOpenItems.has(r.itemId) || batchesStartedHere.has(jobId)) && !fetchedItems.has(r.itemId) && !adoptedServerCommands.has(r.commandId));
  for (const r of out) fetchedItems.add(r.itemId);
  return out;
}
