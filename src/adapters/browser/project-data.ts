/**
 * Prosjektdata for nettleseren (KI-181): lesing med brukerens egen tilgang (RLS), databaseversjonen og
 * sanntidsvarsler når andre medlemmer endrer prosjektet (change_log, REQ-0520–0522).
 */
import type { ProjectRows, ProjectState, Row } from "@/core";
import {
  checkSchema,
  fetchProjectTable,
  loadProjectRows,
  loadProjectState,
  type SchemaStatus,
} from "@/adapters/storage/project-rows";
import { browserClient, db } from "./client";

/** Hele prosjekttilstanden. */
export function fetchProjectState(projectId: string): Promise<ProjectState> {
  return loadProjectState(db, projectId);
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
}

/** Lytter på nye endringer i prosjektet. Returnerer en funksjon som stopper lyttingen. */
export function subscribeProjectChanges(
  projectId: string,
  onInsert: (row: ChangeLogInsert) => void,
): () => void {
  const channel = browserClient
    .channel(`prosjekt-${projectId}`)
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
