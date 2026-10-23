import type { ProjectState } from "../model";
import { t } from "../i18n/keyed";
import { panelDetailsValid, type PanelDetails, type PanelField } from "./editing";

export type StoryboardEditingCommand =
  | { readonly type: "SetStoryboardDetails"; readonly panelId: string; readonly details: PanelDetails | null }
  | { readonly type: "SetStoryboardFields"; readonly fields: readonly PanelField[] | null };
export function applyStoryboardEditing(s: ProjectState, c: StoryboardEditingCommand) {
  const invalid = (): never => { throw new Error(t("sb1.error.invalid-panel")); };
  if (c.type === "SetStoryboardFields") {
    if (c.fields !== null && (!Array.isArray(c.fields) || c.fields.length > 50 || new Set(c.fields.map(f => f.id)).size !== c.fields.length || c.fields.some(f => !/^[a-z][a-z0-9_-]{0,63}$/.test(f.id) || typeof f.name !== "string" || f.name.length > 100 || !["text", "dialogue"].includes(f.kind)))) invalid();
    const old = s.project.storyboardFields ?? null;
    const { storyboardFields: _old, ...project } = s.project;
    const next = { ...project, revision: project.revision + 1, ...(c.fields === null ? {} : { storyboardFields: c.fields.map(f => ({ ...f, name: f.name.normalize("NFC") })) }) };
    // Removing a definition never destroys saved values; they remain dormant until restored.
    return { state: { ...s, project: next }, inverse: { type: "SetStoryboardFields", fields: old } as StoryboardEditingCommand, affected: [s.project.id] };
  }
  const p = s.compositions[c.panelId];
  if (!p || p.removed || p.kind !== "storyboard") return invalid();
  if (c.details !== null && !panelDetailsValid(s, p, c.details)) return invalid();
  const old = p.storyboard ?? null;
  const { storyboard: _old, ...panel } = p;
  const details = c.details === null ? null : { ...c.details, movement: c.details.movement.normalize("NFC"), fields: Object.fromEntries(Object.entries(c.details.fields).map(([k,v]) => [k,v.normalize("NFC")])) };
  return { state: { ...s, compositions: { ...s.compositions, [p.id]: { ...panel, revision: p.revision + 1, ...(details ? { storyboard: details } : {}) } } }, inverse: { type: "SetStoryboardDetails", panelId: p.id, details: old } as StoryboardEditingCommand, affected: [p.id] };
}