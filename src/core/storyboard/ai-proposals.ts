/** Accepted proposals remain traceable to the job and carry concrete camera geometry. */
import { newId } from "../ids";
import { keyBetween } from "../order-key";
import { defaultLayerFields } from "../composition";
import { panelDetails, SHOT_TYPES, SHOT_ANGLES } from "./editing";
import { panelKeyAfter } from "./index";
import type { Command } from "../commands/types";
import type { Composition, ProjectState } from "../model";
import { t } from "../i18n/keyed";

export function planAiPanels(s: ProjectState, p: Composition, text: string, jobId: string): Command[] {
  const data = JSON.parse(text);
  if (!p.occurrenceId || !jobId || !Array.isArray(data.panels) || data.panels.length < 1 || data.panels.length > 4) throw Error(t("sb7.unavailable"));
  let after = panelKeyAfter(s, p.occurrenceId, p.id);
  const commands: Command[] = [];
  for (const row of data.panels) {
    const f = row.frame;
    if (!SHOT_TYPES.includes(row.shot) || !SHOT_ANGLES.includes(row.angle) || typeof row.title !== "string" || typeof row.movement !== "string" || !f || ![f.x, f.y, f.width, f.height, row.focalMm, row.tilt].every(Number.isFinite) || f.x < 0 || f.y < 0 || f.width <= 0 || f.height <= 0 || f.x + f.width > 1 || f.y + f.height > 1 || row.focalMm <= 0 || row.focalMm > 2000 || Math.abs(row.tilt) > 90) throw Error(t("sb7.unavailable"));
    const panelId = newId<"composition">();
    commands.push({ type: "AddStoryboardPanel", panelId, occurrenceId: p.occurrenceId, variantId: p.variantId, name: row.title, orderKey: after });
    commands.push({ type: "SetStoryboardDetails", panelId, details: { ...panelDetails(p), number: "", fields: { ai_job: jobId, ai_source_panel: p.id }, dialogueIds: [], shot: row.shot, angle: row.angle, movement: row.movement, focalMm: row.focalMm } });
    commands.push({ type: "AddLayers", layers: [{ layerId: newId<"composition_layer">(), compositionId: panelId, fields: { ...defaultLayerFields(s, p, { fill: p.background }), kind: "camera_mark", assetId: null, assetVariantId: null, versionId: null, fill: null, cameraMark: { frame: { x: (f.x - .5) * p.width, y: (f.y - .5) * p.height, width: f.width * p.width, height: f.height * p.height }, zoom: 1 / Math.max(f.width, f.height), pan: { x: (f.x + f.width / 2 - .5) * p.width, y: (f.y + f.height / 2 - .5) * p.height }, tilt: row.tilt } } }] });
    after = keyBetween(after, null);
  }
  return commands;
}