/**
 * B-097: hvilke scener en lagret endring gjelder («Sist endret» i scenelisten).
 * Hver berørt rad (før eller etter kommandoen) følges via foreldrefeltene til scenen: scene → variant →
 * forekomst → komposisjon → lag → lydklipp → manusblokk … Rader som ikke hører til en scene (ressurser,
 * prosjektet, Story Lab …) gir ingen scene.
 */
import type { ProjectState } from "./model";

type Row = Readonly<Record<string, unknown>>;

/** Feltene som peker oppover mot en scene, i den rekkefølgen de prøves. */
const PARENT_FIELDS = [
  "sceneId",
  "variantId",
  "occurrenceId",
  "compositionId",
  "layerId",
  "clipId",
  "audioClipId",
  "blockId",
  "targetId",
] as const;

function indexOf(state: ProjectState): Map<string, { readonly kind: string; readonly row: Row }> {
  const out = new Map<string, { kind: string; row: Row }>();
  for (const [kind, coll] of Object.entries(state)) {
    if (!coll || typeof coll !== "object" || Array.isArray(coll) || kind === "project") continue;
    for (const [id, row] of Object.entries(coll as Record<string, unknown>)) {
      if (row && typeof row === "object") out.set(id, { kind, row: row as Row });
    }
  }
  return out;
}

function sceneOf(id: string, idx: ReadonlyMap<string, { readonly kind: string; readonly row: Row }>, depth = 0): string | null {
  if (depth > 8) return null;
  const hit = idx.get(id);
  if (!hit) return null;
  if (hit.kind === "scenes") return id;
  // Lag i en malforekomst o.l. tilhører en komposisjon; rader for ressurser stopper her
  if (hit.kind === "assets" || hit.kind === "assetVariants" || hit.kind === "assetVersions") return null;
  for (const f of PARENT_FIELDS) {
    const v = hit.row[f];
    if (typeof v !== "string" || !v) continue;
    if (f === "sceneId") return idx.get(v)?.kind === "scenes" ? v : null;
    const s = sceneOf(v, idx, depth + 1);
    if (s) return s;
  }
  return null;
}

/** Scenene (sortert, unike) som de berørte radene hører til, sett både før og etter endringen. */
export function scenesOfChange(before: ProjectState, after: ProjectState, affected: readonly string[]): string[] {
  const a = indexOf(after);
  const b = indexOf(before);
  const out = new Set<string>();
  for (const id of affected) {
    const s = sceneOf(id, a) ?? sceneOf(id, b);
    if (s) out.add(s);
  }
  return [...out].sort();
}
