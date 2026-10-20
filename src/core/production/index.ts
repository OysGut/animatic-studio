/**
 * Avledede produksjoner – spinoffer, trailere, kortfilmer m.m. (M7 del 1, DEC-0057, mandat kap. 24,
 * REQ-0353–0366, REQ-0498/0499).
 *
 * - En avledet produksjon lages ved å velge scener fra en annen produksjon (vanligvis hovedfilmen). Scenene
 *   gjenbrukes som referanser (samme scene og scenevariant), ikke kopier (REQ-0360).
 * - Rekkefølge, synlighet, lyd, overganger og materiale per scene er forekomstens egne (REQ-0355/0356).
 * - Endres en gjenbrukt scene i den avledede produksjonen, lages først en egen scenevariant for produksjonen
 *   (`forkPlan`), så hovedfilmen ikke endres (REQ-0365, INV-04).
 * - En 2D-scene som deles med hovedfilmen, kopieres til produksjonens egen variant før den redigeres
 *   (`compositionCopyCommands`).
 */
import type { Command } from "../commands/types";
import { applyCommand } from "../commands/apply";
import { newId, type BlockId, type ProductionId, type TranslationId } from "../ids";
import type { Production, ProductionKind, ProjectState } from "../model";
import { keyBetween, keysEvenly } from "../order-key";
import { orderedOccurrences } from "../views";
import { compositionOfVariant, layersOf } from "../composition/render";
import { layerFieldsOf } from "../composition";
import { collation } from "../i18n";
import { tLocalized } from "@/core/i18n/keyed";

export const PRODUCTION_KIND_LABEL: Record<ProductionKind, string> = tLocalized({ main: "core-production-index.production-kind-label.main.b07446579d03", spinoff: "core-production-index.production-kind-label.spinoff.5de4a0a26157", trailer: "core-production-index.production-kind-label.trailer.1e3f68e48854", teaser: "core-production-index.production-kind-label.teaser.6cce2ccb8b3a", short: "core-production-index.production-kind-label.short.82184e09a5fc", pitch: "core-production-index.production-kind-label.pitch.27685474c28f", pilot: "core-production-index.production-kind-label.pilot.5dc67e07dffa", alternative: "core-production-index.production-kind-label.alternative.e122a4af94a6", other: "core-production-index.production-kind-label.other.e0365556bcd5" });

/** Produksjonene sortert: hovedfilmen først, så etter navn. */
export function sortedProductions(s: ProjectState): Production[] {
  return Object.values(s.productions).sort((a, b) =>
    a.kind === "main" ? -1 : b.kind === "main" ? 1 : a.name.localeCompare(b.name, collation()),
  );
}

/**
 * Kommandoene for en ny avledet produksjon med utvalgte scener (forekomster fra kildeproduksjonen, i den
 * rekkefølgen de har der).
 */
export function deriveProductionCommands(
  s: ProjectState,
  input: {
    readonly productionId: string;
    readonly name: string;
    readonly kind: Exclude<ProductionKind, "main">;
    readonly parentProductionId: string;
    readonly occurrenceIds: readonly string[];
  },
): Command[] {
  const out: Command[] = [
    {
      type: "CreateProduction",
      productionId: input.productionId as ProductionId,
      kind: input.kind,
      name: input.name,
      parentProductionId: input.parentProductionId as ProductionId,
    },
  ];
  return [...out, ...addScenesCommands(s, input.productionId, input.occurrenceIds, null)];
}

/**
 * Kommandoene for å legge scener fra en annen produksjon til i produksjonen (som referanse til samme
 * scenevariant). Scenene legges til sist, i kildens rekkefølge. Scener produksjonen har fra før, hoppes over.
 */
export function addScenesCommands(
  s: ProjectState,
  productionId: string,
  sourceOccurrenceIds: readonly string[],
  /** Rekkefølgenøkkelen til den siste scenen i produksjonen nå (null = tom eller ny produksjon). */
  afterKey: string | null = lastKey(s, productionId),
): Command[] {
  const has = new Set(
    Object.values(s.occurrences)
      .filter((o) => o.productionId === productionId)
      .map((o) => o.sceneId),
  );
  const chosen = new Set(sourceOccurrenceIds);
  const src = Object.values(s.occurrences)
    .filter((o) => chosen.has(o.id) && !has.has(o.sceneId))
    .sort((a, b) => (a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0));
  if (src.length === 0) return [];
  const keys = afterKey === null ? keysEvenly(src.length) : keysAfter(afterKey, src.length);
  return src.map((o, i) => ({
    type: "AddOccurrence",
    productionId: productionId as ProductionId,
    sceneId: o.sceneId,
    variantId: o.variantId,
    occurrenceId: newId<"scene_occurrence">(),
    orderKey: keys[i]!,
  }));
}

function lastKey(s: ProjectState, productionId: string): string | null {
  const list = orderedOccurrences(s, productionId);
  return list.length ? list[list.length - 1]!.orderKey : null;
}

/** n nøkler etter `after` (fortløpende). */
function keysAfter(after: string, n: number): string[] {
  const out: string[] = [];
  let prev = after;
  for (let i = 0; i < n; i++) out.push((prev = keyBetween(prev, null)));
  return out;
}

/** Deles scenevarianten med hovedfilmen (eller en annen produksjon) i denne produksjonen? */
export function isSharedIn(s: ProjectState, productionId: string, variantId: string): boolean {
  const v = s.variants[variantId];
  const p = s.productions[productionId];
  if (!v || !p) return false;
  return p.kind !== "main" && v.ownerProductionId !== productionId;
}

/** Variant-ID-en en kommando endrer (for automatisk egen variant). */
function targetVariant(s: ProjectState, c: Command): string | null {
  const x = c as unknown as Record<string, unknown>;
  if (typeof x["variantId"] === "string") return x["variantId"];
  for (const k of ["blockId", "targetId", "atBlockId"]) {
    const id = x[k];
    if (typeof id === "string" && s.blocks[id]) return s.blocks[id]!.variantId;
    if (typeof id === "string" && s.variants[id]) return id;
  }
  if (typeof x["occurrenceId"] === "string")
    return s.occurrences[x["occurrenceId"]]?.variantId ?? null;
  return null;
}

const ACTOR = "00000000-0000-7000-8000-000000000000" as never;

/** Fritekst (manus, notater) beholdes uendret når ID-er byttes. */
const FREE_TEXT = new Set(["text", "note", "description", "name", "label", "basedOn"]);

/** Bytt ID-er (verdier og nøkler) i en kommando, men ikke i fritekstfelt. */
function remapIds(v: unknown, ids: Readonly<Record<string, string>>, key = ""): unknown {
  if (typeof v === "string") return FREE_TEXT.has(key) ? v : (ids[v] ?? v);
  if (Array.isArray(v)) return v.map((x) => remapIds(x, ids, key));
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [ids[k] ?? k, remapIds(x, ids, k)]),
    );
  return v;
}
const dry = (s: ProjectState, command: Command) =>
  applyCommand(s, { id: newId<"command">(), actor: ACTOR, at: new Date().toISOString(), command });

/**
 * Når en endring i en avledet produksjon gjelder en scene som deles med hovedfilmen, avviser kjernen den
 * (INV-04). Da lages først en egen scenevariant for produksjonen (ForkVariant), og endringen gjøres på den
 * (alle ID-er for varianten og blokkene byttes til de nye). Returnerer null når det ikke trengs eller ikke går.
 */
export function forkPlan(
  s: ProjectState,
  command: Command,
): { readonly fork: readonly Command[]; readonly command: Command } | null {
  const first = dry(s, command);
  if (first.ok || first.error.code !== "must_fork_variant") return null;
  const productionId = (command as unknown as { productionId?: unknown }).productionId;
  if (typeof productionId !== "string") return null;
  const variantId = targetVariant(s, command);
  if (!variantId) return null;
  const byId = (command as unknown as { occurrenceId?: unknown }).occurrenceId;
  const occ =
    (typeof byId === "string" ? s.occurrences[byId] : undefined) ??
    Object.values(s.occurrences).find(
      (o) => o.productionId === productionId && o.variantId === variantId,
    );
  if (occ && occ.productionId !== productionId) return null;
  if (!occ) return null;
  const newVariantId = newId<"scene_variant">();
  const blockIdMap: Record<string, BlockId> = {};
  for (const b of Object.values(s.blocks))
    if (b.variantId === variantId) blockIdMap[b.id] = newId<"script_block">() as BlockId;
  const fork: Command = {
    type: "ForkVariant",
    occurrenceId: occ.id,
    newVariantId,
    blockIdMap,
    translationIdMap: translationMapFor(s, variantId, blockIdMap),
  };
  const ids: Record<string, string> = { [variantId]: newVariantId, ...blockIdMap };
  let remapped = remapIds(command, ids) as Command;
  // Deling i den nye versjonen: bare denne forekomsten bruker den
  if (remapped.type === "SplitScene")
    remapped = {
      ...remapped,
      newOccurrenceIds: { [occ.id]: remapped.newOccurrenceIds[occ.id]! },
    } as Command;
  // 2D-scenen følger med som kopi, så den egne versjonen ikke mister animaticen
  let after = dry(s, fork);
  if (!after.ok) return null;
  const forks: Command[] = [fork];
  const comp = compositionOfVariant(s, variantId);
  if (comp)
    for (const c of compositionCopyCommands(s, comp.id, newVariantId, blockIdMap)) {
      const r = dry(after.state, c);
      if (!r.ok) return null;
      after = r;
      forks.push(c);
    }
  const second = dry(after.state, remapped);
  if (!second.ok) return null;
  return { fork: forks, command: remapped };
}

/**
 * Kopi av en 2D-scene (med lag, grupper og kamera) til en annen scenevariant – brukes når en avledet
 * produksjon får egen variant av en scene og skal redigere 2D-scenen uten å endre hovedfilmen.
 */
export function compositionCopyCommands(
  s: ProjectState,
  sourceCompositionId: string,
  targetVariantId: string,
  /** Blokkene i den nye versjonen (fra ForkVariant): grunnlaget for avvik følger med (DEC-0054). */
  blockIdMap: Readonly<Record<string, string>> = {},
): Command[] {
  const src = s.compositions[sourceCompositionId];
  if (!src) return [];
  const compositionId = newId<"composition">();
  const layers = layersOf(s, src.id);
  const ids = new Map(layers.map((l) => [l.id as string, newId<"composition_layer">()]));
  const out: Command[] = [
    {
      type: "CreateComposition",
      compositionId,
      variantId: targetVariantId as never,
      fields: {
        name: src.name,
        width: src.width,
        height: src.height,
        durationFrames: src.durationFrames,
        background: src.background,
      },
      ...(src.producedFrom
        ? {
            producedFrom: {
              blockRevisions: Object.fromEntries(
                Object.entries(src.producedFrom.blockRevisions).map(([k, v]) => [
                  blockIdMap[k] ?? k,
                  v,
                ]),
              ),
              // Ressursgrunnlaget følger med egen kopi (REQ-0022, DEC-0078)
              ...(src.producedFrom.assetVersions
                ? { assetVersions: src.producedFrom.assetVersions }
                : {}),
            },
          }
        : {}),
    },
  ];
  if (src.camera.shots.length)
    out.push({
      type: "UpdateComposition",
      compositionId,
      fields: {
        name: src.name,
        width: src.width,
        height: src.height,
        durationFrames: src.durationFrames,
        background: src.background,
      },
      camera: src.camera,
    });
  if (layers.length)
    out.push({
      type: "AddLayers",
      layers: layers.map((l) => {
        const f = layerFieldsOf(l);
        return {
          layerId: ids.get(l.id)!,
          compositionId,
          orderKey: l.orderKey,
          fields: {
            ...f,
            groupId: f.groupId ? ((ids.get(f.groupId) ?? null) as never) : null,
            // Maske av et annet lag (REQ-0175): laget i kopien
            ...(f.mask?.kind === "layer"
              ? {
                  mask: ids.has(f.mask.layerId)
                    ? { ...f.mask, layerId: ids.get(f.mask.layerId)! }
                    : null,
                }
              : {}),
          },
        };
      }),
    });
  return out;
}

/**
 * «Lag egen kopi»: egen scenevariant for produksjonen (hvis den ikke har det) og kopi av 2D-scenen.
 * Returnerer kommandoene (i rekkefølge) eller null når scenen allerede er produksjonens egen.
 */
export function ownCopyCommands(s: ProjectState, occurrenceId: string): Command[] | null {
  const o = s.occurrences[occurrenceId];
  if (!o || !isSharedIn(s, o.productionId, o.variantId)) return null;
  const newVariantId = newId<"scene_variant">();
  const blockIdMap: Record<string, BlockId> = {};
  for (const b of Object.values(s.blocks))
    if (b.variantId === o.variantId) blockIdMap[b.id] = newId<"script_block">() as BlockId;
  const out: Command[] = [
    {
      type: "ForkVariant",
      occurrenceId: o.id,
      newVariantId,
      blockIdMap,
      translationIdMap: translationMapFor(s, o.variantId, blockIdMap),
    },
  ];
  const comp = compositionOfVariant(s, o.variantId);
  if (comp) out.push(...compositionCopyCommands(s, comp.id, newVariantId, blockIdMap));
  return out;
}

/** Nye ID-er for oversettelsene som følger med når scenen får egen versjon (DEC-0058). */
function translationMapFor(
  s: ProjectState,
  variantId: string,
  blockIdMap: Readonly<Record<string, string>>,
): Record<string, TranslationId> {
  const out: Record<string, TranslationId> = {};
  for (const t of Object.values(s.translations))
    if (!t.removed && ((t.blockId && blockIdMap[t.blockId]) || t.variantId === variantId))
      out[t.id] = newId<"translation">();
  return out;
}
