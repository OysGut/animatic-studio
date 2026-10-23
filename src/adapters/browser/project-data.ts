/**
 * Prosjektdata for nettleseren (KI-181): lesing med brukerens egen tilgang (RLS), databaseversjonen og
 * sanntidsvarsler når andre medlemmer endrer prosjektet (change_log, REQ-0520–0522).
 */
import { blockRevisionFromRow, stateFromRows, type BlockRevision, type ProjectRows, type ProjectState, type Row } from "@/core";
import {
  checkSchema,
  fetchBlockHistoryRows,
  fetchChangeLogAfter,
  loadProjectSnapshot,
  fetchProjectTable,
  loadProjectRows,
  loadProjectState,
  type SchemaStatus,
} from "@/adapters/storage/project-rows";
import { browserClient, db, uniqueChannelName } from "./client";

/** Hele prosjekttilstanden. */
export function fetchProjectState(projectId: string): Promise<ProjectState> {
  return loadProjectState(db, projectId);
}

/**
 * G-2: prosjektet for redigering i nettleseren – ett øyeblikksbilde med bare gjeldende tekstrevisjon og
 * loggposisjonen (project_seq) det bygger på. Full historikk hentes etterpå med fetchBlockHistory.
 */
export async function fetchProjectSnapshot(projectId: string): Promise<{ state: ProjectState; logSeq: number | null; via: string }> {
  const snap = await loadProjectSnapshot(db, projectId, { history: "current" });
  return { state: stateFromRows(snap.rows), logSeq: snap.logSeq, via: snap.via };
}

/** Full teksthistorikk for prosjektet. */
export async function fetchBlockHistory(projectId: string): Promise<BlockRevision[]> {
  return (await fetchBlockHistoryRows(db, projectId)).map(blockRevisionFromRow);
}

/** Loggrader etter `after` (project_seq), for å tette hull i sanntidsvarslene. */
export function fetchChangesAfter(projectId: string, after: number, limit?: number): Promise<Row[]> {
  return fetchChangeLogAfter(db, projectId, after, limit);
}

/** Prosjektradene (til sikkerhetskopi). */
export function fetchProjectRows(projectId: string): Promise<ProjectRows> {
  return loadProjectRows(db, projectId);
}

/** Alle rader i en tabell for prosjektet (tabell som mangler, gir tom liste). */
export function fetchTable(table: string, projectId: string): Promise<Row[]> {
  return fetchProjectTable(db, table, projectId);
}

/** Databaseversjonen i Lovable Cloud. */
export function fetchSchemaStatus(): Promise<SchemaStatus> {
  return checkSchema(db);
}

/** En ny rad i change_log (det sanntidsvarselet inneholder). */
export interface ChangeLogInsert {
  readonly id?: string;
  readonly affected_ids?: string[] | null;
  /** G-2 (0093): sammenhengende teller per prosjekt. */
  readonly project_seq?: number | null;
  readonly actor?: string;
  readonly created_at?: string;
  readonly command?: unknown;
}

/** Lytter på nye endringer i prosjektet. Returnerer en funksjon som stopper lyttingen. */
export function subscribeProjectChanges(
  projectId: string,
  onInsert: (row: ChangeLogInsert) => void,
): () => void {
  const channel = browserClient
    .channel(uniqueChannelName(`prosjekt-${projectId}`))
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "change_log",
        filter: `project_id=eq.${projectId}`,
      },
      (payload: { new: ChangeLogInsert }) => onInsert(payload.new),
    )
    .subscribe();
  return () => {
    void browserClient.removeChannel(channel);
  };
}
