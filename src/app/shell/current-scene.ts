/**
 * Valgt scene på tvers av skjermene (REQ-0168, DEC-0075): manus, montering og sceneeditor husker sist valgte
 * scene per prosjekt for denne fanen, så «Sceneeditor» i hovedmenyen åpner scenen du sto på – ikke scene 1.
 * Bare i minnet (ingen lagring); ugyldige ID-er ignoreres av skjermen som leser.
 */
const last = new Map<string, string>();

export function rememberScene(projectId: string, occurrenceId: string | null | undefined): void {
  if (occurrenceId) last.set(projectId, occurrenceId);
}

export function lastScene(projectId: string): string | null {
  return last.get(projectId) ?? null;
}
