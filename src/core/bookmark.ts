/**
 * DV8 (B1–B4): personlig bokmerke. Ren oversetting mellom bokmerkets mål og adressen i appen.
 * Ren TypeScript (ADR-0003).
 */
export const BOOKMARK_VIEWS = ["oversikt", "scene", "manus", "montering", "bibliotek", "storylab", "utgivelse"] as const;
export type BookmarkView = (typeof BOOKMARK_VIEWS)[number];
export interface BookmarkPlace { readonly view: string; readonly occurrenceId?: string | null; readonly frame?: number | null; readonly tab?: string | null }

const UUID = /^[0-9a-f-]{36}$/i;

/** Adressen et bokmerke åpner, eller null når målet er ugyldig (da navigeres det ikke og bokmerket beholdes). */
export function bookmarkHref(projectId: string, t: BookmarkPlace): string | null {
  if (!UUID.test(projectId) || !(BOOKMARK_VIEWS as readonly string[]).includes(t.view)) return null;
  const base = `/prosjekt/${projectId}`;
  if (t.view === "oversikt") return base;
  const q = new URLSearchParams();
  if (t.occurrenceId && UUID.test(t.occurrenceId)) q.set("scene", t.occurrenceId);
  if (t.view === "scene" && q.has("scene")) {
    if (typeof t.frame === "number" && Number.isInteger(t.frame) && t.frame >= 0) q.set("at", String(t.frame));
    if (t.tab === "animation" || t.tab === "scene") q.set("fane", t.tab);
  }
  const query = q.toString();
  return `${base}/${t.view}${query ? `?${query}` : ""}`;
}

/** Skjermen for en adresse i prosjektet. */
export function bookmarkViewOf(pathname: string, projectId: string): BookmarkView | null {
  const rest = pathname.replace(/\/$/, "").split(`/prosjekt/${projectId}`)[1];
  if (rest === undefined) return null;
  if (rest === "") return "oversikt";
  const v = rest.slice(1).split("/")[0] ?? "";
  return (BOOKMARK_VIEWS as readonly string[]).includes(v) ? (v as BookmarkView) : null;
}
