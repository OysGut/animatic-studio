/**
 * SB-2: storyboardgalleriet som ren modell (ADR-0003). Galleriet viser hele filmen i fortellerrekkefølge
 * per produksjon – samme ordnede forekomstliste som manus og montering (INV-01) – med panelene gruppert
 * per scene. Ingen ny lagring: alt bygges av ProjectState, og alle endringer er SB-1-kommandoer.
 */
import type { Command } from "../commands/types";
import { layerFieldsOf } from "../composition";
import { newId } from "../ids";
import type { Composition, ProjectState, SceneOccurrence } from "../model";
import { keyBetween, keysEvenly } from "../order-key";
import { blocksOfVariant, orderedOccurrences, sceneNumberOf } from "../views";
import {
  PRODUCTION_AREAS,
  panelBlockIds,
  panelTimingFrames,
  productionStatusOf,
  storyboardPanelsOf,
  type ProductionArea,
  type ProductionStatusValue,
} from "./index";

export type StatusFilter = { readonly area: ProductionArea; readonly status: ProductionStatusValue } | null;

export interface GalleryPanel {
  readonly panel: Composition;
  readonly index: number;
  readonly frames: number;
  readonly blockIds: readonly string[];
  readonly statuses: Readonly<Record<ProductionArea, ProductionStatusValue>>;
}

export interface GalleryScene {
  readonly occurrence: SceneOccurrence;
  readonly number: string;
  readonly heading: string;
  readonly statuses: Readonly<Record<ProductionArea, ProductionStatusValue>>;
  readonly panels: readonly GalleryPanel[];
}

export interface GalleryOptions {
  /** Vis også skjulte/deaktiverte paneler (for å gjeninnføre dem). */
  readonly showHidden: boolean;
  readonly filter: StatusFilter;
}

function statusesFor(
  s: ProjectState,
  target: { readonly occurrenceId: string } | { readonly compositionId: string },
): Record<ProductionArea, ProductionStatusValue> {
  const out = {} as Record<ProductionArea, ProductionStatusValue>;
  for (const a of PRODUCTION_AREAS)
    out[a] = productionStatusOf(s, a, target as never)?.status ?? "not_started";
  return out;
}

/** Galleriet for én produksjon: aktive forekomster i fortellerrekkefølge, panelene i panelrekkefølge. */
export function buildGallery(s: ProjectState, productionId: string, o: GalleryOptions): GalleryScene[] {
  const out: GalleryScene[] = [];
  let i = 0;
  for (const occ of orderedOccurrences(s, productionId)) {
    if (!occ.active) continue; // deaktiverte scener er ikke med i filmen
    const sceneStatuses = statusesFor(s, { occurrenceId: occ.id });
    const panels: GalleryPanel[] = [];
    for (const p of storyboardPanelsOf(s, occ.id)) {
      if (!o.showHidden && (p.hidden || p.active === false)) continue;
      const statuses = statusesFor(s, { compositionId: p.id });
      if (o.filter && statuses[o.filter.area] !== o.filter.status && sceneStatuses[o.filter.area] !== o.filter.status) continue;
      panels.push({ panel: p, index: i++, frames: panelTimingFrames(s, p), blockIds: panelBlockIds(s, p.id), statuses });
    }
    if (o.filter && panels.length === 0 && sceneStatuses[o.filter.area] !== o.filter.status) continue;
    const blocks = blocksOfVariant(s, occ.variantId);
    const heading = blocks.find((b) => b.kind === "heading")?.text ?? "";
    out.push({
      occurrence: occ,
      number: sceneNumberOf(s, occ) ?? "",
      heading,
      statuses: sceneStatuses,
      panels,
    });
  }
  return out;
}

/** Alle paneler i galleriet i rekkefølge (til tastaturnavigasjon). */
export function flatPanels(g: readonly GalleryScene[]): GalleryPanel[] {
  return g.flatMap((x) => x.panels);
}

/** Rekkefølgenøkkel for et panel satt inn etter `afterId` (null = først) i en scene. */
export function panelKeyAfter(s: ProjectState, occurrenceId: string, afterId: string | null): string {
  const list = storyboardPanelsOf(s, occurrenceId as never);
  const idx = afterId ? list.findIndex((p) => p.id === afterId) : -1;
  const before = idx >= 0 ? (list[idx]!.orderKey ?? null) : null;
  const after = idx + 1 < list.length ? (list[idx + 1]!.orderKey ?? null) : null;
  return keyBetween(before, after);
}

/** Nøkkel for å flytte panelet til plass `toIndex` innen scenen (rekkefølgen uten panelet selv). */
export function panelKeyAt(s: ProjectState, panelId: string, toIndex: number): string | null {
  const p = s.compositions[panelId];
  if (!p?.occurrenceId) return null;
  const rest = storyboardPanelsOf(s, p.occurrenceId).filter((x) => x.id !== panelId);
  const i = Math.max(0, Math.min(rest.length, toIndex));
  return keyBetween(i > 0 ? (rest[i - 1]!.orderKey ?? null) : null, i < rest.length ? (rest[i]!.orderKey ?? null) : null);
}

/** Nøkkel for å flytte en scene til plass `toIndex` i produksjonen (bruker eksisterende MoveOccurrence). */
export function occurrenceKeyAt(s: ProjectState, occurrenceId: string, toIndex: number): string | null {
  const occ = s.occurrences[occurrenceId];
  if (!occ) return null;
  const rest = orderedOccurrences(s, occ.productionId).filter((o) => o.id !== occurrenceId);
  const i = Math.max(0, Math.min(rest.length, toIndex));
  return keyBetween(i > 0 ? rest[i - 1]!.orderKey : null, i < rest.length ? rest[i]!.orderKey : null);
}

/** Kommandoene for «Dupliser panel»: nytt panel rett etter, med samme tittel, timing, forankring og lag. */
export function planDuplicatePanel(s: ProjectState, panelId: string): Command[] {
  const p = s.compositions[panelId];
  if (!p || p.kind !== "storyboard" || !p.occurrenceId) return [];
  const id = newId<"composition">();
  const blocks = anchorRefs(panelBlockIds(s, panelId));
  const cmds: Command[] = [
    {
      type: "AddStoryboardPanel",
      panelId: id,
      occurrenceId: p.occurrenceId,
      variantId: p.variantId,
      orderKey: panelKeyAfter(s, p.occurrenceId, panelId),
      name: p.name,
      durationFrames: p.durationFrames,
      blocks,
    },
  ];
  const layers = Object.values(s.layers)
    .filter((l) => !l.removed && l.compositionId === panelId)
    .sort((a, b) => a.orderKey.localeCompare(b.orderKey));
  if (layers.length > 0)
    cmds.push({
      type: "AddLayers",
      layers: layers.map((l) => ({ layerId: newId<"layer">() as never, compositionId: id as never, orderKey: l.orderKey, fields: layerFieldsOf(l) })),
    });
  return cmds;
}

/** Forankring for et panel som flyttes til en annen scene: de valgte blokkene i ny variant. */
export function anchorRefs(blockIds: readonly string[]) {
  const keys = keysEvenly(blockIds.length);
  return blockIds.map((blockId, i) => ({ linkId: newId(), blockId: blockId as never, orderKey: keys[i]! }));
}

/** Seed-kommandoen for «ett tomt panel per scene» (bare etter brukerens bekreftelse). */
export function seedCommand(s: ProjectState, productionId: string, plan: readonly { occurrenceId: string; variantId: string }[]): Command | null {
  if (plan.length === 0) return null;
  void s;
  return {
    type: "SeedStoryboardPanels",
    productionId,
    panels: plan.slice(0, 1000).map((p) => ({ panelId: newId<"composition">(), occurrenceId: p.occurrenceId, variantId: p.variantId, orderKey: keyBetween(null, null) })),
  };
}

/** Rutenettnavigasjon: neste indeks for en piltast (kolonner = kort per rad). RTL speiler venstre/høyre. */
export function gridStep(index: number, count: number, columns: number, key: string, rtl: boolean): number {
  if (count === 0) return -1;
  const c = Math.max(1, columns);
  let d = 0;
  if (key === "ArrowRight") d = rtl ? -1 : 1;
  else if (key === "ArrowLeft") d = rtl ? 1 : -1;
  else if (key === "ArrowDown") d = c;
  else if (key === "ArrowUp") d = -c;
  else if (key === "Home") return 0;
  else if (key === "End") return count - 1;
  else return index;
  return Math.max(0, Math.min(count - 1, index + d));
}
