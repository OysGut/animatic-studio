/**
 * Lydsporene i Asset Studio (AS3, A5): scenens felles lyd (musikk, atmosfære, effekter) og lyden som hører
 * til karakteren eller objektet (dialog der karakteren er taleren, og lyd som er koblet til ressursen med
 * soundLinks). Ren og plattformnøytral.
 */
import type { AudioClip, ProjectState } from "../model";
import { assetNames, nameKey } from "../library";
import { lineInfo } from "./takes";
import { blocksOfVariant } from "../views";

export interface AssetAudioGroups {
  /** Musikk, atmosfære og effekter i scenen som ikke hører til ressursen. */
  readonly scene: readonly AudioClip[];
  /** Lyd som hører til ressursen. */
  readonly asset: readonly AudioClip[];
}

/** Sann når lydklippet hører til ressursen (taleren i replikken, eller koblet med soundLinks). */
export function clipBelongsToAsset(s: ProjectState, clip: AudioClip, assetId: string): boolean {
  const sound = s.assets[clip.assetId];
  if (sound?.soundLinks?.some((l) => l.kind === "asset" && l.id === assetId)) return true;
  if (clip.kind !== "dialogue" || !clip.blockId) return false;
  const asset = s.assets[assetId];
  if (!asset) return false;
  const info = lineInfo(s, clip.occurrenceId, clip.blockId);
  if (!info?.speaker) return false;
  const key = nameKey(info.speaker);
  return assetNames(asset).some((n) => n.trim() && nameKey(n) === key);
}

export function assetAudioGroups(
  s: ProjectState,
  occurrenceId: string,
  assetId: string | null,
): AssetAudioGroups {
  const clips = Object.values(s.audioClips)
    .filter((c) => !c.removed && c.occurrenceId === occurrenceId)
    .sort((a, b) => a.offsetMs - b.offsetMs || a.id.localeCompare(b.id));
  const scene: AudioClip[] = [];
  const asset: AudioClip[] = [];
  for (const c of clips) {
    if (assetId && clipBelongsToAsset(s, c, assetId)) asset.push(c);
    else if (c.kind === "music" || c.kind === "ambience" || c.kind === "sfx") scene.push(c);
  }
  return { scene, asset };
}

/** Replikkene i scenen der ressursen er taleren (for «Vis manus» og forsøksvis redigering, AS3). */
export function assetLineIds(s: ProjectState, occurrenceId: string, assetId: string): string[] {
  const occ = s.occurrences[occurrenceId];
  const asset = s.assets[assetId];
  if (!occ || !asset) return [];
  const keys = new Set(assetNames(asset).filter((n) => n.trim()).map(nameKey));
  const out: string[] = [];
  for (const b of blocksOfVariant(s, occ.variantId)) {
    if (b.kind !== "dialogue") continue;
    const info = lineInfo(s, occurrenceId, b.id);
    if (info?.speaker && keys.has(nameKey(info.speaker))) out.push(b.id);
  }
  return out;
}
