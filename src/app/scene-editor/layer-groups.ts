/**
 * Lukkede og åpne grupper i laglisten, «slik en kan i Photoshop» (Mars 15.10.2026). Hvilke grupper som er
 * lukket, er et visningsvalg per bruker og scene – det endrer aldri scenen eller andres visning.
 * Ren logikk uten React (tests/unit/layer-groups.test.ts).
 */

/** Det laglisten trenger å vite om et lag. */
export interface GroupNode {
  readonly id: string;
  readonly kind: string;
  readonly groupId: string | null;
}

/** Lukkede grupper per 2D-scene (compositionId → gruppe-ID-er). */
export type CollapsedGroups = Readonly<Record<string, readonly string[]>>;

/** Så mange scener huskes (de sist brukte); eldre glemmes, så verdien holdes liten. */
export const COLLAPSED_SCENES_LIMIT = 50;

export function isCollapsedGroups(v: unknown): v is CollapsedGroups {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every(
    (ids) => Array.isArray(ids) && ids.every((x) => typeof x === "string"),
  );
}

/** Gruppen laget ligger i (bare en gruppe som finnes i listen), eller null. */
function parentOf(byId: ReadonlyMap<string, GroupNode>, l: GroupNode): GroupNode | null {
  if (!l.groupId) return null;
  const g = byId.get(l.groupId);
  return g && g.kind === "group" ? g : null;
}

/** Gruppene laget ligger i, innerst først (nestede grupper; vern mot ring). */
export function ancestorGroups(byId: ReadonlyMap<string, GroupNode>, id: string): string[] {
  const out: string[] = [];
  let cur = byId.get(id);
  while (cur) {
    const g = parentOf(byId, cur);
    if (!g || out.includes(g.id) || g.id === id) break;
    out.push(g.id);
    cur = g;
  }
  return out;
}

export interface LayerRow<T extends GroupNode> {
  readonly layer: T;
  /** Hvor mange grupper laget ligger inne i (innrykk). */
  readonly depth: number;
}

/**
 * Radene som vises (i samme rekkefølge som `layers`): lag i en lukket gruppe (også lenger ut) skjules.
 * Gruppen selv vises fortsatt, med antall lag.
 */
export function visibleLayerRows<T extends GroupNode>(
  layers: readonly T[],
  collapsed: ReadonlySet<string>,
): LayerRow<T>[] {
  const byId = new Map<string, GroupNode>(layers.map((l) => [l.id, l]));
  const out: LayerRow<T>[] = [];
  for (const l of layers) {
    const up = ancestorGroups(byId, l.id);
    if (up.some((g) => collapsed.has(g))) continue;
    out.push({ layer: l, depth: up.length });
  }
  return out;
}

/** Lagene som ligger i gruppen, også i grupper inne i den. */
export function groupMemberCount(layers: readonly GroupNode[], groupId: string): number {
  const byId = new Map<string, GroupNode>(layers.map((l) => [l.id, l]));
  return layers.filter((l) => l.id !== groupId && ancestorGroups(byId, l.id).includes(groupId))
    .length;
}

/**
 * Laget som skal være valgt når grupper lukkes: er det valgte laget skjult, velges den ytterste lukkede
 * gruppen det ligger i (den som vises), så valget ikke forsvinner usynlig. Ellers uendret.
 */
export function selectionAfterCollapse(
  layers: readonly GroupNode[],
  collapsed: ReadonlySet<string>,
  selectedId: string | null,
): string | null {
  if (!selectedId) return null;
  const byId = new Map<string, GroupNode>(layers.map((l) => [l.id, l]));
  const up = ancestorGroups(byId, selectedId);
  // Ytterst først: den første lukkede gruppen utenfra er den som vises i listen
  for (let i = up.length - 1; i >= 0; i--) if (collapsed.has(up[i]!)) return up[i]!;
  return selectedId;
}

/** Gruppene som må åpnes for at laget skal synes (f.eks. når det velges på lerretet). */
export function groupsToOpenFor(
  layers: readonly GroupNode[],
  collapsed: ReadonlySet<string>,
  id: string,
): string[] {
  const byId = new Map<string, GroupNode>(layers.map((l) => [l.id, l]));
  return ancestorGroups(byId, id).filter((g) => collapsed.has(g));
}

/**
 * Ny lagret verdi når de lukkede gruppene i én scene endres: scenen flyttes sist (sist brukt), tomme lister
 * fjernes, og bare de `limit` sist brukte scenene beholdes.
 */
export function withCollapsed(
  all: CollapsedGroups,
  compositionId: string,
  ids: readonly string[],
  limit = COLLAPSED_SCENES_LIMIT,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(all)) if (k !== compositionId) out[k] = [...v];
  const unique = [...new Set(ids)];
  if (unique.length) out[compositionId] = unique;
  const keys = Object.keys(out);
  for (const k of keys.slice(0, Math.max(0, keys.length - limit))) delete out[k];
  return out;
}
