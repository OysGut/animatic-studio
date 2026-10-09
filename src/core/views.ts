/**
 * Avledede visninger. Manus og filmmontering bygges fra SAMME ordnede liste av aktive
 * sceneforekomster (INV-01). Det finnes ingen separat lagret filmrekkefølge.
 */
import type { OccurrenceId, ProductionId, SceneId, TakeId } from "./ids";
import { compareKeys } from "./order-key";
import type { ProjectState, SceneHeading, SceneOccurrence, ScriptBlock } from "./model";

/** Alle forekomster i produksjonen i rekkefølge (også deaktiverte). */
export function orderedOccurrences(
  s: ProjectState,
  productionId: ProductionId | string,
): SceneOccurrence[] {
  return Object.values(s.occurrences)
    .filter((o) => o.productionId === productionId)
    .sort((a, b) => compareKeys(a.orderKey, b.orderKey) || (a.id < b.id ? -1 : 1));
}

/** Den aktive produksjonsstrukturen: grunnlaget for både manus og film. */
export function activeStructure(
  s: ProjectState,
  productionId: ProductionId | string,
): SceneOccurrence[] {
  return orderedOccurrences(s, productionId).filter((o) => o.active);
}

/**
 * Indeks variant → synlige blokker i rekkefølge. Bygges én gang per blokksamling (tilstanden er uforanderlig,
 * så samme objekt betyr samme innhold) – ellers ville hvert oppslag gå gjennom alle blokker i prosjektet.
 */
const blockIndex = new WeakMap<object, Map<string, ScriptBlock[]>>();

function indexOf(s: ProjectState): Map<string, ScriptBlock[]> {
  let idx = blockIndex.get(s.blocks);
  if (!idx) {
    idx = new Map();
    for (const b of Object.values(s.blocks)) {
      if (b.removed) continue;
      const list = idx.get(b.variantId);
      if (list) list.push(b);
      else idx.set(b.variantId, [b]);
    }
    for (const list of idx.values()) list.sort((a, b) => compareKeys(a.orderKey, b.orderKey));
    blockIndex.set(s.blocks, idx);
  }
  return idx;
}

export function blocksOfVariant(s: ProjectState, variantId: string): ScriptBlock[] {
  return [...(indexOf(s).get(variantId) ?? [])];
}

export interface ScriptSceneView {
  readonly occurrenceId: OccurrenceId;
  readonly sceneId: SceneId;
  readonly heading: SceneHeading;
  readonly productionNumber: string | null;
  readonly blocks: readonly ScriptBlock[];
}

/** Aktivt manus (mandat 2: deaktiverte scener utelates). */
export function scriptView(
  s: ProjectState,
  productionId: ProductionId | string,
): ScriptSceneView[] {
  return activeStructure(s, productionId).map((o) => ({
    occurrenceId: o.id,
    sceneId: o.sceneId,
    heading: s.variants[o.variantId]?.heading ?? { intExt: "", location: "", time: "" },
    productionNumber: o.productionNumber,
    blocks: blocksOfVariant(s, o.variantId),
  }));
}

export interface AssemblyItemView {
  readonly occurrenceId: OccurrenceId;
  readonly sceneId: SceneId;
  readonly activeTakeId: TakeId | null;
  /** Varighet i bilder for aktiv versjon, ev. utdrag; null = ukjent (plassholder). */
  readonly durationFrames: number | null;
  /** Beregnet start i absolutt filmtid (bilder). Lagres aldri (ADR-0006). */
  readonly startFrame: number;
}

/** Filmmontering: samme rekkefølge som manus, med aktiv versjon og beregnede tidskoder. */
export function assemblyView(
  s: ProjectState,
  productionId: ProductionId | string,
  placeholderFrames = 0,
): AssemblyItemView[] {
  let cursor = 0;
  return activeStructure(s, productionId).map((o) => {
    const take = o.activeTakeId ? s.takes[o.activeTakeId] : undefined;
    let duration: number | null = take?.durationFrames ?? null;
    if (o.excerpt) duration = o.excerpt.outFrame - o.excerpt.inFrame;
    const item: AssemblyItemView = {
      occurrenceId: o.id,
      sceneId: o.sceneId,
      activeTakeId: o.activeTakeId,
      durationFrames: duration,
      startFrame: cursor,
    };
    cursor += duration ?? placeholderFrames;
    return item;
  });
}

/**
 * Fortellingstid (DEC-0020 pkt. 6):
 * - lineære scener: plass i hovedproduksjonens rekkefølge (alle forekomster, også deaktiverte);
 * - flashback/flashforward/drøm/tidshopp: ankerscenens fortellingstid + forskyvning (endres ikke ved flytting);
 * - scener som bare finnes i en annen produksjon: nærmeste foregående scene i sin egen produksjon som også
 *   finnes i hovedfilmen, + en liten forskyvning.
 * Returnerer et tall per scene; større = senere i fortellingen.
 */
export function storyTimes(s: ProjectState): Map<string, number> {
  const out = new Map<string, number>();
  const main = Object.values(s.productions).find((p) => p.kind === "main");
  const mainOrder = main ? orderedOccurrences(s, main.id) : [];
  const linearIndex = new Map<string, number>();
  mainOrder.forEach((o, i) => {
    if (!linearIndex.has(o.sceneId)) linearIndex.set(o.sceneId, i + 1);
  });

  const resolving = new Set<string>();
  const resolve = (sceneId: string): number => {
    const cached = out.get(sceneId);
    if (cached !== undefined) return cached;
    const sc = s.scenes[sceneId];
    if (!sc) return 0;
    if (resolving.has(sceneId)) return linearIndex.get(sceneId) ?? 0; // syklus: fall tilbake
    resolving.add(sceneId);
    let t: number;
    if (sc.storyTime.kind !== "linear" && sc.storyTime.anchorSceneId) {
      t = resolve(sc.storyTime.anchorSceneId) + sc.storyTime.offset;
    } else if (linearIndex.has(sceneId)) {
      t = linearIndex.get(sceneId)!;
    } else {
      const own = orderedOccurrences(s, sc.originProductionId);
      const idx = own.findIndex((o) => o.sceneId === sceneId);
      let base = 0;
      let steps = 0;
      for (let i = idx - 1; i >= 0; i--) {
        steps++;
        const prev = own[i]!;
        if (linearIndex.has(prev.sceneId)) {
          base = resolve(prev.sceneId);
          break;
        }
      }
      t = base + Math.min(0.999, 0.001 * Math.max(1, steps)) + (sc.storyTime.offset ?? 0);
    }
    resolving.delete(sceneId);
    out.set(sceneId, t);
    return t;
  };
  for (const id of Object.keys(s.scenes)) resolve(id);
  return out;
}

export interface OutdatedTake {
  readonly takeId: TakeId;
  readonly occurrenceId: OccurrenceId;
  /** Blokker som er endret (eller lagt til/fjernet) siden materialet ble produsert. */
  readonly changedBlockIds: readonly string[];
}

/**
 * Produsert materiale som ikke lenger samsvarer med gjeldende manus (mandat 2.1, 21.1).
 * Materialet endres aldri; dette er bare grunnlaget for avvik (INV-07, INV-08).
 */
export function outdatedTakes(s: ProjectState): OutdatedTake[] {
  const out: OutdatedTake[] = [];
  for (const t of Object.values(s.takes)) {
    const occ = s.occurrences[t.occurrenceId];
    if (!occ) continue;
    const current = new Map(
      blocksOfVariant(s, occ.variantId).map((b) => [b.id as string, b.currentRev]),
    );
    const used = t.producedFrom.blockRevisions;
    const changed = new Set<string>();
    for (const [id, rev] of current) if (used[id] !== rev) changed.add(id);
    for (const id of Object.keys(used)) if (!current.has(id)) changed.add(id);
    if (changed.size > 0)
      out.push({ takeId: t.id, occurrenceId: occ.id, changedBlockIds: [...changed] });
  }
  return out;
}
