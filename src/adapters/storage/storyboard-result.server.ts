/** Persist each paid image before another call, using ordinary reversible commands. */
import { applyCommand, diffStates, newId, type Command } from "@/core";
import { loadProjectState, type AnyClient } from "@/adapters/storage/project-rows";
import { panelCandidateLayer } from "@/core/storyboard/ai";
import { t } from "@/core/i18n/keyed";
export async function saveStoryboardCandidate(db: AnyClient, projectId: string, userId: string, panelId: string, assetId: string, versionId: string, media: import("@/core").AssetMedia, trace: unknown) {
  let state = await loadProjectState(db, projectId);
  const variant = Object.values(state.assetVariants).find(v => v.assetId === assetId && !v.removed);
  const panel = state.compositions[panelId];
  if (!variant || !panel || panel.removed || panel.kind !== "storyboard" || state.assets[assetId]?.removed) throw Error(t("sb7.stale"));
  const existing = state.assetVersions[versionId];
  if (existing && (existing.removed || existing.variantId !== variant.id || existing.mediaPath !== media.path)) throw Error(t("sb7.stale"));
  const commands: Command[] = [];
  if (!state.assetVersions[versionId]) commands.push({ type: "AddAssetVersion", versionId: versionId as never, variantId: variant.id, media, note: JSON.stringify(trace) });
  if (!Object.values(state.layers).some(l => !l.removed && l.compositionId === panelId && l.versionId === versionId)) commands.push(panelCandidateLayer(state, panel, assetId, variant.id, versionId));
  const history: { commandId: string; inverse: Command; affected: readonly string[]; group: string }[] = [];
  for (const command of commands) {
    const id = newId<"command">();
    const result = applyCommand(state, { id, actor: userId as never, at: new Date().toISOString(), command });
    if (!result.ok) throw Error(result.error.message);
    const { error } = await db.rpc("apply_changes", { p_project: projectId, p_actor: userId, p_command_id: id, p_command: command, p_inverse: result.inverse, p_changes: diffStates(state, result.state) });
    if (error) throw Error(t("sb7.stale"));
    history.push({ commandId: id, inverse: result.inverse, affected: result.affected, group: versionId });
    state = result.state;
  }
  return { variantId: variant.id, history };
}