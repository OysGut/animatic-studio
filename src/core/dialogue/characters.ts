/** DV3: character identity is confirmed; name matches are suggestions only. */
import { blocksOfVariant } from "../views";
import { assetNames, nameKey } from "../library";
import { L } from "../i18n";
import type { AudioClip, ProjectState } from "../model";
import { speakerKeyOf } from "./versions";

export function dialogueSpeaker(s: ProjectState, occurrenceId: string, blockId: string | null): string {
  const occ = s.occurrences[occurrenceId];
  if (!occ || !blockId) return "";
  let speaker = "";
  for (const b of blocksOfVariant(s, occ.variantId)) {
    if (b.id === blockId) return speaker;
    if (b.kind === "character") speaker = b.text.trim();
  }
  return "";
}

export function suggestedDialogueCharacter(s: ProjectState, occurrenceId: string, blockId: string | null) {
  const k = nameKey(dialogueSpeaker(s, occurrenceId, blockId));
  if (!k) return null;
  const matches = Object.values(s.assets).filter(a => !a.removed && !a.archived &&
    ["character", "animal", "other"].includes(a.kind) && assetNames(a).some(n => nameKey(n) === k));
  return matches.length === 1 ? matches[0] ?? null : null;
}

/** One suggestion per permanent line/asset identity; confirmation links every duplicate clip. */
export function dialogueCharacterSuggestions(s: ProjectState, occurrenceId: string) {
  const groups = new Map<string, { clip: AudioClip; clipIds: AudioClip["id"][]; asset: ProjectState["assets"][string] }>();
  for (const clip of Object.values(s.audioClips)) {
    if (clip.removed || clip.kind !== "dialogue" || clip.occurrenceId !== occurrenceId || !clip.blockId || clip.characterAssetId) continue;
    const asset = suggestedDialogueCharacter(s, occurrenceId, clip.blockId);
    if (!asset) continue;
    const key = `${clip.blockId}:${asset.id}`;
    const existing = groups.get(key);
    if (existing) existing.clipIds.push(clip.id);
    else groups.set(key, { clip, clipIds: [clip.id], asset });
  }
  return [...groups.values()];
}

export function dialogueTrackLabel(s: ProjectState, clip: AudioClip): string {
  return (clip.characterAssetId ? s.assets[clip.characterAssetId]?.name : null) ||
    dialogueSpeaker(s, clip.occurrenceId, clip.blockId) || L("Ukjent taler", "Unknown speaker");
}

/** One projected row per speaker, never one row per alternative version. */
export function groupDialogueTracks<T extends { clip: AudioClip }>(s: ProjectState, items: readonly T[]) {
  const groups = new Map<string, { key: string; label: string; assetId: string | null; items: T[] }>();
  for (const item of items) {
    const c = item.clip;
    const key = c.kind === "dialogue" ? `${c.occurrenceId}:${speakerKeyOf(s, c) ?? c.id}` : c.id;
    let group = groups.get(key);
    if (!group) {
      group = { key, label: c.kind === "dialogue" ? dialogueTrackLabel(s, c) : c.name,
        assetId: c.characterAssetId ?? null, items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
}