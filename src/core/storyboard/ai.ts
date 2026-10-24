/** SB-7: pure panel inputs and candidate plans. No providers, storage or prompt logging. */
import type { Composition, ProjectState, CompositionLayer } from "../model";
import type { Command } from "../commands/types";
import type { ProviderModel } from "../generation/providers";
import { maxAttachedImagesFor } from "../generation/image-prompt";
import { assetsInScene } from "../library";
import { layersOf, layerVersion } from "../composition/render";
import { defaultLayerFields } from "../composition";
import { newId } from "../ids";
import { keyBetween } from "../order-key";
import { panelDetails } from "./editing";
import { panelBlockIds } from "./index";
import { panelLines } from "./gallery";
import { styleProfileFor, composeStyleText } from "../generation/style";
import { blocksOfVariant } from "../script";

export type PanelAiBasis = "composition" | "sketch" | "script";
export type PanelAiStyle = "line" | "grey" | "color";
export type PanelAiAction = "image" | "coverage" | "between" | "clean" | "describe";
export interface PanelAiOptions {
  readonly basis: PanelAiBasis;
  readonly style: PanelAiStyle;
  readonly visualNotes: boolean;
  readonly sketchVersionId: string | null;
  readonly references: readonly string[];
  readonly mask: string;
  readonly structureVersionId?: string | null;
}
export function panelAiCapabilities(model: ProviderModel) {
  return { imageToImage: !!model.acceptsImage, references: model.acceptsImage ? maxAttachedImagesFor(model) : 0,
    sketch: !!model.acceptsImage, mask: model.panelAi?.mask === true };
}
export function panelResourceLayers(s: ProjectState, p: Composition): CompositionLayer[] {
  return layersOf(s, p.id).filter(l => l.visible && l.assetId && !l.shape && !l.text && !l.note && !l.arrow && !l.cameraMark);
}
export function automaticPanelBasis(s: ProjectState, p: Composition): PanelAiBasis {
  if(layersOf(s,p.id).some(l=>l.visible&&l.sketch?.strokes.length))return "sketch";
  const resources = panelResourceLayers(s, p);
  if (resources.some(l => s.assets[l.assetId ?? ""]?.kind === "character" || s.assets[l.assetId ?? ""]?.kind === "object") || resources.length > 1) return "composition";
  return resources.length ? "sketch" : "script";
}
export function panelCharacters(s: ProjectState, p: Composition) {
  const o = p.occurrenceId ? s.occurrences[p.occurrenceId] : null;
  const ids = new Set(panelResourceLayers(s, p).map(l => l.assetId));
  if (o) for (const row of assetsInScene(s, o.productionId, o.id)) ids.add(row.asset.id);
  return [...ids].flatMap(id => { const a = id ? s.assets[id] : null; return a && !a.removed && ["character", "animal"].includes(a.kind) ? [a] : []; });
}
export function panelAspect(p: Composition, mask: string): number {
  if (mask === "project") return p.width / p.height;
  const values = mask.split(":").map(Number);
  const ratio = values.length === 2 ? (values[0] ?? 0) / (values[1] ?? 1) : Number(mask);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : p.width / p.height;
}
export function panelInstructions(s: ProjectState, p: Composition, visualNotes: boolean): string[] {
  const d = panelDetails(p);
  return [
    `Shot ${d.shot ?? "unspecified"}; angle ${d.angle ?? "unspecified"}; focal length ${d.focalMm ?? "unspecified"}; movement ${d.movement}`,
    ...Object.entries(d.fields).filter(([key]) => key !== "dialogue").map(([key, value]) => `${key}: ${value}`),
    ...layersOf(s, p.id).flatMap(l => l.cameraMark ? [`Camera framing: ${JSON.stringify(l.cameraMark)}`] : l.arrow ? [`Movement instruction (${l.arrow.category}, ${s.layers[l.arrow.layerId ?? ""]?.name ?? l.name}): ${JSON.stringify(l.arrow.points)}`] : l.note && (l.note.noteType !== "visual" || visualNotes) ? [`${l.note.noteType}: ${l.note.text}`] : l.text ? [`Direction: ${l.text.content}`] : [])
  ];
}
/** Server calls this against fresh authorized state; instructions never enter raster input. */
export function buildPanelAiInput(s: ProjectState, p: Composition, options: PanelAiOptions) {
  const lines = panelLines(s, p.variantId, panelBlockIds(s, p.id));
  const scene = s.variants[p.variantId]?.heading;
  const profile = styleProfileFor(s, "animatic");
  const resources = panelResourceLayers(s, p);
  const referenceIds = options.structureVersionId ? [options.structureVersionId] : options.basis === "sketch" && options.sketchVersionId ? [options.sketchVersionId] : options.basis === "composition" ? resources.flatMap(l => { const v = layerVersion(s, l); return v ? [v.id] : []; }) : [];
  const approved = options.references.filter(id => { const v = s.assetVersions[id]; return v && !v.removed && s.assetVariants[v.variantId]?.approvedVersionId === id; });
  const references = [...new Set([...referenceIds, ...approved])].flatMap(id => { const v = s.assetVersions[id]; return v && !v.removed && v.mimeType.startsWith("image/") ? [{ id, path: v.mediaPath, role: id === options.structureVersionId ? "structure" : approved.includes(id) ? "style" : "identity" }] : []; });
  const text = [
    `Create one storyboard image. Basis: ${options.basis}. Style: ${options.style}. Aspect ratio: ${panelAspect(p, options.mask)}.`,
    "Instructions below describe staging, NOT marks to draw. Do not draw arrows, labels, notes, text, guides or camera frames.",
    `Scene: ${JSON.stringify(scene ?? {})}`,
    `Script: ${[...lines.script, ...lines.dialogue.map(l => `${l.speaker}: ${l.text}`)].join("\n")}`,
    ...(options.basis === "composition" ? resources.map(l => `Place ${s.assets[l.assetId ?? ""]?.name}: ${JSON.stringify(l.transform)}; size ${l.width}x${l.height}; layer ${l.orderKey}`) : []),
    ...panelCharacters(s, p).map(a => `Character ${a.name}. Authoritative visual fact sheet: ${a.visualBrief ?? ""}`),
    ...panelInstructions(s, p, options.visualNotes),
    ...(profile ? [composeStyleText(profile.guide)] : []),
    ...references.map((r, i) => `Image ${i + 1}: ${r.role} reference, version ${r.id}`)
  ].join("\n");
  return { text, references, trace: { panelId: p.id, panelRevision: p.revision, resources: resources.map(l => ({ assetId: l.assetId, versionId: layerVersion(s, l)?.id ?? null })), characters: panelCharacters(s, p).map(a => ({ assetId: a.id, revision: a.revision })), basis: options.basis, style: options.style, aspect: panelAspect(p, options.mask) } };
}
export function sceneCoverageText(s: ProjectState, p: Composition): string {
  return blocksOfVariant(s, p.variantId).map(b => `${b.kind}: ${b.text}`).join("\n");
}
/** Hidden layer is a durable candidate; an explicit ordinary UpdateLayers accepts it later. */
export function panelCandidateLayer(s: ProjectState, p: Composition, assetId: string, variantId: string, versionId: string): Command {
  return { type: "AddLayers", layers: [{ layerId: newId<"composition_layer">(), compositionId: p.id, orderKey: keyBetween(layersOf(s, p.id).at(-1)?.orderKey ?? null, null), fields: { ...defaultLayerFields(s, p, { assetId: assetId as never, assetVariantId: variantId as never }), versionId: versionId as never, visible: false } }] };
}