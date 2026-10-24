/** SB-3: immutable panel metadata, locked numbering and explicit arrow-to-path plans. */
import type { Command } from "../commands/types";
import type { Composition, ProjectState } from "../model";
import { applyMatrix, modelMatrix, compositionOfVariant } from "../composition/render";
import { layerFieldsOf } from "../composition";
import { storyboardPanelsOf } from "./index";

export const SHOT_TYPES = ["ECU", "CU", "MCU", "MS", "MWS", "WS", "EWS", "OTS", "POV", "two-shot"] as const;
export const SHOT_ANGLES = ["eye", "high", "low", "bird", "dutch"] as const;
export const STANDARD_PANEL_FIELDS = ["action", "dialogue", "sound", "camera", "notes"] as const;
export interface PanelField { readonly id: string; readonly name: string; readonly kind: "text" | "dialogue" }
/** SB-4: midlertidig lyd på et panel (opptak/opplasting). Blandes aldri inn i scenens lyd uten bekreftelse. */
export interface PanelTempAudio {
  readonly assetId: string;
  readonly versionId: string;
  readonly name: string;
  readonly durationMs: number;
}
export interface PanelDetails {
  readonly number: string;
  readonly sceneNumber: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly dialogueIds: readonly string[];
  readonly shot: typeof SHOT_TYPES[number] | null;
  readonly angle: typeof SHOT_ANGLES[number] | null;
  readonly focalMm: number | null;
  readonly movement: string;
  readonly tempAudio?: PanelTempAudio | null;
}
export const EMPTY_PANEL_DETAILS: PanelDetails = { number: "", sceneNumber: "", fields: {}, dialogueIds: [], shot: null, angle: null, focalMm: null, movement: "", tempAudio: null };
export function panelDetails(p: Composition): PanelDetails { return p.storyboard ?? EMPTY_PANEL_DETAILS; }
export function panelFields(s: ProjectState): readonly PanelField[] {
  return s.project.storyboardFields ?? STANDARD_PANEL_FIELDS.map(id => ({ id, name: "", kind: id === "dialogue" ? "dialogue" : "text" }));
}
export function panelDetailsValid(s: ProjectState, p: Composition, d: PanelDetails): boolean {
  if (!d || typeof d !== "object" || !/^(?:[1-9][0-9]*[A-Z]*)?$/.test(d.number) || !/^(?:[1-9][0-9]*[A-Z]*)?$/.test(d.sceneNumber)) return false;
  if (d.shot !== null && !SHOT_TYPES.includes(d.shot)) return false;
  if (d.angle !== null && !SHOT_ANGLES.includes(d.angle)) return false;
  if (d.focalMm !== null && (!Number.isFinite(d.focalMm) || d.focalMm <= 0 || d.focalMm > 2000)) return false;
  if (typeof d.movement !== "string" || d.movement.length > 10000 || !d.fields || typeof d.fields !== "object" || Array.isArray(d.fields)) return false;
  if (Object.entries(d.fields).some(([k, v]) => !/^[a-z][a-z0-9_-]{0,63}$/.test(k) || typeof v !== "string" || v.length > 10000)) return false;
  if (!Array.isArray(d.dialogueIds) || d.dialogueIds.length > 1000 || new Set(d.dialogueIds).size !== d.dialogueIds.length) return false;
  if (d.tempAudio !== undefined && d.tempAudio !== null) {
    const a = d.tempAudio;
    if (!a || typeof a !== "object" || typeof a.name !== "string" || a.name.length > 500 || !Number.isFinite(a.durationMs) || a.durationMs <= 0 || a.durationMs > 3600000) return false;
    if (!s.assets[a.assetId] || s.assets[a.assetId]!.removed || !s.assetVersions[a.versionId] || s.assetVersions[a.versionId]!.assetId !== a.assetId) return false;
  }
  return d.dialogueIds.every(id => { const b = s.blocks[id]; return b && !b.removed && b.variantId === p.variantId && b.kind === "dialogue"; });
}
function suffix(n: number): string {
  let result = "";
  while (n > 0) { n--; result = String.fromCharCode(65 + n % 26) + result; n = Math.floor(n / 26); }
  return result;
}
/** Insertion never changes an existing locked number: 12 → 12A → 12B. */
export function insertedPanelNumber(previous: string | null, occupied: readonly string[]): string {
  const used = new Set(occupied);
  if (!previous) { let n = 1; while (used.has(String(n))) n++; return String(n); }
  const base = previous.match(/^[1-9][0-9]*/)?.[0] ?? "1";
  let n = 1;
  while (used.has(base + suffix(n))) n++;
  return base + suffix(n);
}
export interface NumberChange { readonly panelId: string; readonly before: string; readonly after: string; readonly sceneBefore: string; readonly sceneAfter: string }
export function planPanelNumbers(s: ProjectState, productionId: string, renumber: boolean): NumberChange[] {
  const occurrences = Object.values(s.occurrences).filter(o => o.productionId === productionId && o.active).sort((a,b) => a.orderKey.localeCompare(b.orderKey));
  const occupiedScenes=occurrences.map(o=>storyboardPanelsOf(s,o.id).map(p=>panelDetails(p).sceneNumber).find(Boolean)??o.productionNumber??"").filter(Boolean);
  let previousScene:string|null=null;
  const assignedScenes=new Set<string>();
  return occurrences.flatMap((o, si) => {
    const panels = storyboardPanelsOf(s, o.id);
    let scene = renumber ? String(si + 1) : panels.map(p => panelDetails(p).sceneNumber).find(Boolean) ?? o.productionNumber ?? "";
    if(!scene||assignedScenes.has(scene)){scene=occupiedScenes.length?insertedPanelNumber(previousScene,occupiedScenes):String(si+1);occupiedScenes.push(scene);}
    previousScene=scene;assignedScenes.add(scene);
    const occupied = panels.map(p => panelDetails(p).number).filter(Boolean);
    let previous: string | null = null;
    const assigned = new Set<string>();
    return panels.map((p, i) => {
      const d = panelDetails(p);
      let after = d.number;
      if (renumber) after = String(i + 1);
      else if (!after || assigned.has(after)) { after = previous ? insertedPanelNumber(previous, occupied) : String(i + 1); if (occupied.includes(after)) after = insertedPanelNumber(previous, occupied); occupied.push(after); }
      assigned.add(after);
      previous = after;
      return { panelId: p.id, before: d.number, after, sceneBefore: d.sceneNumber, sceneAfter: scene };
    }).filter(c => c.before !== c.after || c.sceneBefore !== c.sceneAfter);
  });
}
export function numberCommands(s: ProjectState, plan: readonly NumberChange[]): Command[] {
  return plan.flatMap(c => { const p = s.compositions[c.panelId]; return p ? [{ type: "SetStoryboardDetails", panelId: p.id, details: { ...panelDetails(p), number: c.after, sceneNumber: c.sceneAfter } } as Command] : []; });
}
/** Returns an ordinary draft command; merely drawing an arrow never calls this. */
export function planArrowPath(s: ProjectState, arrowId: string, targetId: string): Command | null {
  const arrow = s.layers[arrowId], target = s.layers[targetId];
  if (!arrow?.arrow || arrow.removed || !target || target.removed || target.locked) return null;
  const panel = s.compositions[arrow.compositionId];
  const scene = panel ? compositionOfVariant(s, panel.variantId) : null;
  if (panel?.kind !== "storyboard" || !scene || target.compositionId !== scene.id) return null;
  if (!panel.occurrenceId) return null;
  const points = arrow.arrow.points.map(p => ({ ...p, ...applyMatrix(modelMatrix(arrow.transform), p.x, p.y) }));
  return { type: "UpdateSceneDraft", occurrenceId: panel.occurrenceId, compositionId: scene.id, steps: [{ type: "UpdateLayers", layers: [{ layerId: target.id, fields: { ...layerFieldsOf(target), path: { points, startFrame: 0, endFrame: Math.max(1, scene.durationFrames - 1), easeOut: 0, easeIn: 0, tempo: [] } } }] }] };
}
export function storyboardShotRows(s: ProjectState, productionId: string): Readonly<Record<string, string | number>>[] {
  return Object.values(s.occurrences).filter(o => o.productionId === productionId && o.active).sort((a,b) => a.orderKey.localeCompare(b.orderKey)).flatMap(o => storyboardPanelsOf(s, o.id).filter(p => p.active !== false).map(p => {
    const d = panelDetails(p);
    return { ...d.fields, occurrenceId:o.id,panelId:p.id,scene: d.sceneNumber, panel: d.number, title: p.name, shot: d.shot ?? "", angle: d.angle ?? "", focalMm: d.focalMm ?? "", movement: d.movement, dialogue: d.dialogueIds.map(id => s.blocks[id]?.text ?? "").join("\n") || d.fields["dialogue"] || "" };
  }));
}