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

const GOTO = "animatic-goto-scene";

/**
 * Gå til en scene i arbeidsflaten som er åpen (manus eller sceneeditor), f.eks. fra oppgavene i toppstripen
 * (DEC-0088). Arbeidsflatene lytter med `useGotoScene`.
 */
export function gotoScene(projectId: string, occurrenceId: string): void {
  window.dispatchEvent(new CustomEvent(GOTO, { detail: { projectId, occurrenceId } }));
}

export function onGotoScene(projectId: string, fn: (occurrenceId: string) => void): () => void {
  const on = (e: Event) => {
    const d = (e as CustomEvent<{ projectId: string; occurrenceId: string }>).detail;
    if (d?.projectId === projectId) fn(d.occurrenceId);
  };
  window.addEventListener(GOTO, on);
  return () => window.removeEventListener(GOTO, on);
}
