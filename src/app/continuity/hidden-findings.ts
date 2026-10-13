/** Skjulte kontinuitetsfunn per prosjekt i nettleserens lokale lagring (KI-105). */
const hiddenStorageKey = (projectId: string) => `animatic:hidden-continuity:${projectId}`;

/** Skjulte funn for prosjektet (KI-105). Uten lagring (privat vindu, blokkert) blir listen tom. */
export function readHiddenFindings(projectId: string): string[] {
  try {
    const raw = window.localStorage.getItem(hiddenStorageKey(projectId));
    if (!raw) return [];
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writeHiddenFindings(projectId: string, keys: Iterable<string>): void {
  const list = [...keys];
  try {
    if (list.length) window.localStorage.setItem(hiddenStorageKey(projectId), JSON.stringify(list));
    else window.localStorage.removeItem(hiddenStorageKey(projectId));
  } catch {
    // Uten lagring fungerer skjuling bare så lenge siden er åpen
  }
}
