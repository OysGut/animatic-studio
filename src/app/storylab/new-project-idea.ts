/**
 * GP4: idéen fra «Utvikle nytt prosjekt med skriveassistent» følger med til Story Lab-intervjuet i samme fane.
 * Den legges i intervjuets tekstfelt; ingenting sendes til AI før brukeren selv sender (T1-valget og
 * kostnadsgodkjenningen gjelder som før).
 */
const key = (projectId: string) => `animatic:new-project-idea:${projectId}`;

export function rememberIdea(projectId: string, idea: string): void {
  try {
    if (idea.trim()) sessionStorage.setItem(key(projectId), idea.trim().slice(0, 4000));
  } catch {
    /* privat modus: idéen skrives inn på nytt */
  }
}

/** Henter idéen én gang (fjernes etterpå). */
export function takeIdea(projectId: string): string {
  try {
    const v = sessionStorage.getItem(key(projectId)) ?? "";
    sessionStorage.removeItem(key(projectId));
    return v;
  } catch {
    return "";
  }
}
