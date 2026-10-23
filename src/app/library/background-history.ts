/**
 * DV5-rest (N3): hvilke ferdige bakgrunnsresultater som legges på angrelisten i denne fanen. Bare resultater
 * brukeren har sett bli ferdige i økten (elementet var ikke ferdig da det ble sett første gang, eller jobben
 * ble startet her). Eldre resultater fra før økten blir ikke plutselig angrebare.
 */
import { adoptedServerCommands } from "@/app/project/use-commands";
import type { ServerHistoryRow } from "@/app/project/use-commands";

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

/**
 * N9 (KI-22): jobber per prosjekt som har elementer brukeren har sett eller startet i økten, og som ikke er
 * hentet ennå. Lukkes panelet, hentes de neste gang en arbeidsflate åpnes (samme fane og økt).
 * Angrelisten ligger bare i minnet: ved omlasting forsvinner den, som for alle andre angresteg.
 */
export const watchedBatches = new Map<string, Set<string>>();

export function watchBatches(projectId: string, jobs: readonly JobView[]): void {
  const set = watchedBatches.get(projectId) ?? new Set<string>();
  for (const job of jobs) {
    const pending = job.items.some((i) => !fetchedItems.has(i.id) && (i.status !== "done" ? true : seenOpenItems.has(i.id) || batchesStartedHere.has(job.id)));
    if (pending) set.add(job.id);
    else set.delete(job.id);
  }
  if (set.size) watchedBatches.set(projectId, set);
  else watchedBatches.delete(projectId);
}

export interface CatchUpIo {
  list(projectId: string): Promise<readonly JobView[]>;
  history(projectId: string, batchId: string): Promise<readonly { itemId: string; commandId: string; inverseJson: string; affected: readonly string[] }[]>;
  adopt(projectId: string, rows: readonly ServerHistoryRow[]): number;
}

/** Henter ferdige resultater for jobber som følges i prosjektet. Gir antall nye angresteg. */
export async function catchUpProject(projectId: string, io: CatchUpIo): Promise<number> {
  const watched = watchedBatches.get(projectId);
  if (!watched?.size) return 0;
  const jobs = (await io.list(projectId)).filter((j) => watched.has(j.id));
  let n = 0;
  for (const batchId of batchesToAdopt(jobs)) {
    const rows = rowsToAdopt(batchId, await io.history(projectId, batchId));
    n += io.adopt(projectId, rows.map((r) => ({ commandId: r.commandId, inverse: JSON.parse(r.inverseJson), affected: r.affected })));
  }
  watchBatches(projectId, jobs);
  return n;
}
