/**
 * Panelene i sceneeditoren – stablet (som før) eller side om side, i rekkefølgen brukeren velger
 * (Mars 15.10.2026: «… slik at brukeren får bedre oversikt. Brukeren kan nå velge hvilken rekke følge de
 * skal ha … Disse instillingene skal huskes på brukerne til neste gang akkurat som språk»).
 * Ren logikk uten React, så den kan testes for seg (tests/unit/scene-panels.test.ts).
 */

/** Stabile ID-er for panelene. Lagres hos brukeren – endres aldri (nye legges til). */
export const PANEL_IDS = ["assets", "nearbyAudio", "layers", "properties", "script", "pages", "credits", "storyboard"] as const;
export type PanelId = (typeof PANEL_IDS)[number];

/** Panelene som står i venstre kolonne i stablet visning (resten står til høyre, som før). */
export const LEFT_PANELS: ReadonlySet<PanelId> = new Set<PanelId>([
  "assets",
  "nearbyAudio",
  "script",
]);

export type PanelMode = "stacked" | "side";

/** Det som lagres: visning og rekkefølge (først = øverst / lengst til venstre). */
export interface PanelPrefs {
  readonly mode: PanelMode;
  readonly order: readonly string[];
}

export const DEFAULT_PANEL_PREFS: PanelPrefs = { mode: "stacked", order: [...PANEL_IDS] };

/** Godtar bare en liten, gyldig verdi (gamle eller ødelagte verdier gir standard). */
export function isPanelPrefs(v: unknown): v is PanelPrefs {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    (o["mode"] === "stacked" || o["mode"] === "side") &&
    Array.isArray(o["order"]) &&
    o["order"].length <= 32 &&
    o["order"].every((x) => typeof x === "string" && x.length <= 40)
  );
}

/**
 * Lagret rekkefølge slått sammen med panelene som finnes: ukjente ID-er (fra en eldre eller nyere versjon)
 * hoppes over, doble fjernes, og paneler som mangler i den lagrede listen legges sist.
 */
export function normalizeOrder(
  saved: readonly string[],
  known: readonly PanelId[] = PANEL_IDS,
): PanelId[] {
  const set = new Set<string>(known);
  const out: PanelId[] = [];
  for (const id of saved) if (set.has(id) && !out.includes(id as PanelId)) out.push(id as PanelId);
  for (const id of known) if (!out.includes(id)) out.push(id);
  return out;
}

/** Flytt et panel ett steg (−1 = fram/til venstre, +1 = bak/til høyre). Uendret ved kanten. */
export function movePanel(order: readonly PanelId[], id: PanelId, delta: -1 | 1): PanelId[] {
  const i = order.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return [...order];
  const next = [...order];
  next[i] = order[j]!;
  next[j] = id;
  return next;
}

/**
 * Flytt et panel til rett foran eller etter et annet bare blant panelene som vises (`visible`); skjulte
 * paneler beholder plassen sin i den lagrede listen.
 */
export function movePanelTo(
  order: readonly PanelId[],
  id: PanelId,
  targetId: PanelId,
  side: "before" | "after",
): PanelId[] {
  if (id === targetId || !order.includes(id) || !order.includes(targetId)) return [...order];
  const rest = order.filter((x) => x !== id);
  const t = rest.indexOf(targetId);
  rest.splice(side === "before" ? t : t + 1, 0, id);
  return rest;
}

/** Som `movePanel`, men stegvis blant panelene som vises nå (et skjult panel hoppes over). */
export function movePanelAmong(
  order: readonly PanelId[],
  visible: readonly PanelId[],
  id: PanelId,
  delta: -1 | 1,
): PanelId[] {
  const shown = order.filter((x) => visible.includes(x));
  const i = shown.indexOf(id);
  const target = shown[i + delta];
  if (i < 0 || !target) return [...order];
  return movePanelTo(order, id, target, delta < 0 ? "before" : "after");
}

/**
 * Lukkede paneler (DEC-0089, Mars 16.10.2026: «alle boksene i tillegg til å kunne flyttes rundt også bør kunne
 * kollapses og ekspanderes for å endre GUI til det som fungerer best»). Lagres som en liste med panel-ID-er.
 */
export function isCollapsedPanels(v: unknown): v is readonly string[] {
  return (
    Array.isArray(v) && v.length <= 32 && v.every((x) => typeof x === "string" && x.length <= 40)
  );
}

/** Lukk eller åpne et panel (ukjente ID-er i listen fjernes). */
export function toggleCollapsed(
  collapsed: readonly string[],
  id: PanelId,
  known: readonly PanelId[] = PANEL_IDS,
): PanelId[] {
  const set = new Set<string>(known);
  const clean = [...new Set(collapsed)].filter((x): x is PanelId => set.has(x));
  return clean.includes(id) ? clean.filter((x) => x !== id) : [...clean, id];
}
