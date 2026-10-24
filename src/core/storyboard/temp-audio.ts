import type { ProjectState } from "../model";
import type { Command } from "../commands/types";
import { panelPosition } from "./position";
import { sourceLanguageOf } from "../dialogue/languages";

/** Explicit confirmation belongs to the caller; this plan never writes or mixes by itself. */
export function usePanelAudioPlan(s: ProjectState, panelId: string, clipId: string): Command[] {
  const panel = s.compositions[panelId];
  const temp = panel?.storyboard?.tempAudio;
  if (!panel || !panel.occurrenceId || !temp) return [];
  const p = panelPosition(s, panel.occurrenceId, panelId, null);
  const version = s.assetVersions[temp.versionId];
  if (!p || !version || version.removed) return [];
  return [{ type: "AddAudioClips", clips: [{ clipId: clipId as never, fields: {
    occurrenceId: panel.occurrenceId, kind: "sfx", name: temp.name, assetId: temp.assetId as never,
    assetVariantId: version.variantId, versionId: version.id, blockId: null,
    offsetMs: p.timeMs, sourceInMs: 0, lengthMs: temp.durationMs, gainDb: 0,
    fadeInMs: 0, fadeOutMs: 0, muted: false, continues: false, volumeKeys: [], language: sourceLanguageOf(s),
  } }] }, { type: "SetStoryboardDetails", panelId: panel.id, details: { ...panel.storyboard, tempAudio: null } as NonNullable<typeof panel.storyboard> }];
}