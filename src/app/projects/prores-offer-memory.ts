/**
 * R1: «Ikke nå» på ProRes-tilbudet huskes per bruker og prosjekt i nettleseren (localStorage). Ingen rad i
 * databasen; tilbudet kan alltid hentes fram igjen fra kvalitetsprofilene. Feil i lagringen (privat modus,
 * full kvote) gjør at valget bare gjelder til siden lastes på nytt.
 */
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function proresOfferKey(userId: string, projectId: string): string {
  return `animatic.prores-offer-dismissed.${userId}.${projectId}`;
}

function store(s?: Store | null): Store | null {
  if (s !== undefined) return s;
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

export function isProresOfferDismissed(userId: string, projectId: string, s?: Store | null): boolean {
  try { return store(s)?.getItem(proresOfferKey(userId, projectId)) === "1"; } catch { return false; }
}

export function setProresOfferDismissed(userId: string, projectId: string, dismissed: boolean, s?: Store | null): void {
  try {
    const st = store(s);
    if (!st) return;
    if (dismissed) st.setItem(proresOfferKey(userId, projectId), "1");
    else st.removeItem(proresOfferKey(userId, projectId));
  } catch { /* Bare til siden lastes på nytt. */ }
}
