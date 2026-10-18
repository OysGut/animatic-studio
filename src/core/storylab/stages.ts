/**
 * Story Lab (SL1): profilendringer over karakterbuen. Grunnprofilen og stadiene slås sammen i
 * fortellingstid (ikke rekkefølgen i filmen). En fjernet profil gir null.
 */
import type { AssetId, SceneId } from "../ids";
import type { ProjectState, StoryCharacterProfile } from "../model";
import { mergeProfile, type StoryProfile } from "./profile";
import { storyTimeOf } from "./facts";

/** Den aktive profilen for ressursen (ikke fjernet), eller undefined. */
export function activeProfileOf(
  s: ProjectState,
  assetId: AssetId | string,
): StoryCharacterProfile | undefined {
  return Object.values(s.storyProfiles).find((p) => p.assetId === assetId && !p.removed);
}

/** Profilen slik den er i scenen (null = ingen aktiv profil). Uten scene: bare grunnprofilen. */
export function profileAt(
  s: ProjectState,
  assetId: AssetId | string,
  sceneId: SceneId | string | null,
): StoryProfile | null {
  const base = activeProfileOf(s, assetId);
  if (!base) return null;
  if (sceneId === null) return base.profile;
  const t = storyTimeOf(s, sceneId, Number.NEGATIVE_INFINITY);
  const stages = Object.values(s.storyProfileStages)
    .filter((g) => g.assetId === assetId && !g.removed)
    .map((g) => ({ g, t: storyTimeOf(s, g.fromSceneId, Number.POSITIVE_INFINITY) }))
    .filter((x) => x.t <= t)
    .sort((a, b) => a.t - b.t || (a.g.id < b.g.id ? -1 : a.g.id > b.g.id ? 1 : 0));
  return stages.reduce((p, x) => mergeProfile(p, x.g.patch), base.profile);
}
