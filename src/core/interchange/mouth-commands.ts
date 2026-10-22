import { isUuid } from "../ids";
import type { ProjectState } from "../model";
import { t } from "../i18n/keyed";
import { mouthShapes, validMouthSpans, type MouthSet, type MouthTrack } from "./mouth-types";

export type MouthCommand =
  | { readonly type: "SaveMouthSet"; readonly set: MouthSet }
  | { readonly type: "SaveMouthTrack"; readonly track: MouthTrack }
  | { readonly type: "UndoMouthChange"; readonly sets: Readonly<Record<string, MouthSet | null>>; readonly tracks: Readonly<Record<string, MouthTrack | null>> };
export function applyMouthCommand(s: ProjectState, c: MouthCommand) {
  const sets = { ...s.mouthSets }, tracks = { ...s.mouthTracks };
  const oldSets: Record<string, MouthSet | null> = {}, oldTracks: Record<string, MouthTrack | null> = {};
  const invalid = (): never => { throw new Error(t("ptg4.invalid")); };
  if (c.type === "SaveMouthSet") {
    const x = c.set, character = s.assets[x.characterId];
    if (!isUuid(x.id) || !character || character.removed || !["character", "animal"].includes(character.kind) || !["rhubarb", "preston-blair"].includes(x.system) || typeof x.removed !== "boolean" || !x.variants || Object.keys(x.variants).length > 10) invalid();
    for (const [shape, id] of Object.entries(x.variants)) {
      const variant = id ? s.assetVariants[id] : null;
      if (!mouthShapes(x.system).includes(shape as never) || (id && (!variant || variant.assetId !== x.characterId))) invalid();
    }
    if (Object.values(sets).some(y => y.id !== x.id && !y.removed && y.characterId === x.characterId && !x.removed)) invalid();
    oldSets[x.id] = sets[x.id] ?? null;
    sets[x.id] = { ...x, revision: (sets[x.id]?.revision ?? 0) + 1 };
  } else if (c.type === "SaveMouthTrack") {
    const x = c.track, set = sets[x.setId], clip = s.audioClips[x.clipId], block = s.blocks[x.blockId];
    if (!isUuid(x.id) || !set || set.removed || set.characterId !== x.characterId || !clip || clip.removed || clip.characterAssetId !== x.characterId || clip.occurrenceId !== x.occurrenceId || clip.blockId !== x.blockId || !block || block.removed || !s.occurrences[x.occurrenceId] || !x.source || !["rhubarb","preston-blair"].includes(x.source.setSystem) || !validMouthSpans(x.spans, x.source.setSystem) || typeof x.removed !== "boolean" || x.source.algorithm !== "ptg4-text-1" || typeof x.source.text !== "string" || x.source.text.length > 100000 || !Number.isInteger(x.source.blockRevision) || x.source.blockRevision < 1 || typeof x.source.audioSignature !== "string" || x.source.audioSignature.length > 20000 || !/^[A-Za-z][A-Za-z0-9-]{1,34}$/.test(x.language)) invalid();
    if (Object.values(tracks).some(y => y.id !== x.id && !y.removed && y.clipId === x.clipId && y.language === x.language && !x.removed)) invalid();
    oldTracks[x.id] = tracks[x.id] ?? null;
    tracks[x.id] = { ...x, revision: (tracks[x.id]?.revision ?? 0) + 1 };
  } else {
    for (const [id, x] of Object.entries(c.sets)) { oldSets[id] = sets[id] ?? null; if (x) sets[id] = { ...x, revision: (sets[id]?.revision ?? 0) + 1 }; else delete sets[id]; }
    for (const [id, x] of Object.entries(c.tracks)) { oldTracks[id] = tracks[id] ?? null; if (x) tracks[id] = { ...x, revision: (tracks[id]?.revision ?? 0) + 1 }; else delete tracks[id]; }
  }
  return { state: { ...s, mouthSets: sets, mouthTracks: tracks }, inverse: { type: "UndoMouthChange" as const, sets: oldSets, tracks: oldTracks }, affected: [...Object.keys(oldSets), ...Object.keys(oldTracks)] };
}