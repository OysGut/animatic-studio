/**
 * Videreføring av lag mellom scener (GP3, spes. §17–24, S1–S8). Laget kopieres som et nytt lag i målscenenes
 * 2D-scene: samme ressurs, variant, versjon, skala, rotasjon og innstillinger (§20). Animasjonen er lokal
 * (§21): nøkkelbilder, bildeskifter, aktivt tidsområde, gruppe og lagmaske følger ikke med. Finnes ressursen
 * allerede i målscenen, velger brukeren mellom å bruke den som finnes og å legge til en til (§22).
 * Ren funksjon: gir kommandoene, som kjøres som én angregruppe.
 */
import type { Command, LayerFields, NewLayer } from "../commands/types";
import type { CompositionId, LayerId, OccurrenceId } from "../ids";
import { newId } from "../ids";
import type { CompositionLayer, ProjectState } from "../model";
import { activeStructure, sceneNumberOf } from "../views";
import { DEFAULT_COMPOSITION } from "./fields";
import { layerFieldsOf } from "./index";
import { compositionOfVariant, layersOf } from "./render";

export interface CarryTargetOption {
  readonly occurrenceId: OccurrenceId;
  readonly number: string | null;
  readonly heading: string;
  /** Lag i målscenen med samme ressurs (mulige duplikater, §22). */
  readonly duplicates: readonly LayerId[];
  /** Målscenen er samme 2D-scene som kilden (samme scenevariant); kan ikke velges. */
  readonly sameScene: boolean;
}

export type CarryMode = "add" | "existing";

export interface CarryRequest {
  readonly occurrenceId: OccurrenceId;
  readonly mode: CarryMode;
}

export type CarryPlan =
  | {
      readonly ok: true;
      readonly commands: readonly Command[];
      /** Nye lag per målscene. Scener der den eksisterende brukes, er ikke med. */
      readonly created: readonly { readonly occurrenceId: OccurrenceId; readonly layerId: LayerId }[];
      readonly reused: readonly OccurrenceId[];
    }
  | { readonly ok: false; readonly reason: "no_layer" | "no_source" | "no_targets" | "same_scene" };

function headingOf(s: ProjectState, variantId: string): string {
  const h = s.variants[variantId]?.heading;
  return h ? [h.intExt, h.location, h.time].filter(Boolean).join(" ").trim() : "";
}

/** Målscenene i produksjonsrekkefølge (aktive forekomster i kildens produksjon), med duplikatsjekk. */
export function carryTargets(
  s: ProjectState,
  layerId: string,
  sourceOccurrenceId: string,
): { readonly options: readonly CarryTargetOption[]; readonly next: OccurrenceId | null } {
  const layer = s.layers[layerId];
  const src = s.occurrences[sourceOccurrenceId];
  if (!layer || layer.removed || !src) return { options: [], next: null };
  const order = activeStructure(s, src.productionId);
  const options: CarryTargetOption[] = [];
  for (const o of order) {
    if (o.id === src.id) continue;
    const comp = compositionOfVariant(s, o.variantId);
    const sameScene = comp?.id === layer.compositionId || o.variantId === src.variantId;
    const duplicates =
      comp && layer.assetId
        ? layersOf(s, comp.id)
            .filter((l) => l.assetId === layer.assetId)
            .map((l) => l.id)
        : [];
    options.push({
      occurrenceId: o.id,
      number: sceneNumberOf(s, o),
      heading: headingOf(s, o.variantId),
      duplicates,
      sameScene,
    });
  }
  const idx = order.findIndex((o) => o.id === src.id);
  const nextOcc = idx >= 0 ? order.slice(idx + 1).find((o) => o.variantId !== src.variantId) : undefined;
  return { options, next: nextOcc?.id ?? null };
}

/** Feltene som videreføres (§20). Lokal animasjon (§21) følger ikke med. */
export function carriedFields(l: CompositionLayer): LayerFields {
  const f = layerFieldsOf(l);
  return {
    ...f,
    keyframes: [],
    swaps: [],
    groupId: null,
    visible: true,
    locked: false,
    activeRange: null,
    ...(f.mask?.kind === "layer" ? { mask: null } : {}),
  };
}

export function planCarryOver(
  s: ProjectState,
  layerId: string,
  sourceOccurrenceId: string,
  requests: readonly CarryRequest[],
  ids: { readonly layer?: () => LayerId; readonly composition?: () => CompositionId } = {},
): CarryPlan {
  const layer = s.layers[layerId];
  if (!layer || layer.removed) return { ok: false, reason: "no_layer" };
  const src = s.occurrences[sourceOccurrenceId];
  if (!src) return { ok: false, reason: "no_source" };
  if (!requests.length) return { ok: false, reason: "no_targets" };
  const options = new Map(carryTargets(s, layerId, sourceOccurrenceId).options.map((o) => [o.occurrenceId as string, o]));
  const makeLayer = ids.layer ?? (() => newId<"composition_layer">());
  const makeComp = ids.composition ?? (() => newId<"composition">());
  const commands: Command[] = [];
  const layers: NewLayer[] = [];
  const created: { occurrenceId: OccurrenceId; layerId: LayerId }[] = [];
  const reused: OccurrenceId[] = [];
  const seenComp = new Set<string>();
  const fields = carriedFields(layer);
  for (const r of requests) {
    const opt = options.get(r.occurrenceId);
    const occ = s.occurrences[r.occurrenceId];
    if (!opt || !occ) return { ok: false, reason: "no_targets" };
    if (opt.sameScene) return { ok: false, reason: "same_scene" };
    if (r.mode === "existing" && opt.duplicates.length) {
      reused.push(occ.id);
      continue;
    }
    let comp = compositionOfVariant(s, occ.variantId)?.id as CompositionId | undefined;
    // To forekomster av samme scenevariant deler 2D-scene: bare én kopi
    const key = comp ?? `v:${occ.variantId}`;
    if (seenComp.has(key)) continue;
    seenComp.add(key);
    if (!comp) {
      comp = makeComp();
      commands.push({
        type: "CreateComposition",
        compositionId: comp,
        variantId: occ.variantId,
        fields: { ...DEFAULT_COMPOSITION, width: s.project.frameWidth, height: s.project.frameHeight },
      });
    }
    const id = makeLayer();
    layers.push({ layerId: id, compositionId: comp, fields });
    created.push({ occurrenceId: occ.id, layerId: id });
  }
  if (layers.length) commands.push({ type: "AddLayers", layers });
  return { ok: true, commands, created, reused };
}
