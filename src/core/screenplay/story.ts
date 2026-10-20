/**
 * Ikke-lineær fortelling (mandat 10.7, REQ-0164/0165): en scene kan merkes som tilbakeblikk, fremblikk,
 * drøm eller tidshopp og plasseres i fortellingstiden i forhold til en annen scene («før», «samtidig med»
 * eller «etter»). Kontinuiteten følger fortellingstiden (`storyTimes` i views.ts), ikke rekkefølgen
 * scenene vises i.
 */
import type { StoryKind, StoryTime } from "../model";

import { tLocalized } from "@/core/i18n/keyed";

export const STORY_KIND_LABEL: Record<StoryKind, string> = tLocalized({ linear: "core-screenplay-story.story-kind-label.linear.e5f5651347ae", flashback: "core-screenplay-story.story-kind-label.flashback.7cd6453c5ef0", flashforward: "core-screenplay-story.story-kind-label.flashforward.7a1f8eead578", dream: "core-screenplay-story.story-kind-label.dream.97c134d786ce", jump: "core-screenplay-story.story-kind-label.jump.c2f61439fb96" });

/** Plassering i forhold til ankerscenen. Enheten er «scener» i hovedfilmens rekkefølge. */
export type StoryPlacement = "before" | "same" | "after";

export const STORY_PLACEMENT_OFFSET: Record<StoryPlacement, number> = {
  before: -0.5,
  same: 0,
  after: 0.5,
};

export const STORY_PLACEMENT_LABEL: Record<StoryPlacement, string> = tLocalized({ before: "core-screenplay-story.story-placement-label.before.37e200bfa66e", same: "core-screenplay-story.story-placement-label.same.f9ddbfcdb327", after: "core-screenplay-story.story-placement-label.after.93e3ed5f9972" });

export function storyPlacementOf(offset: number): StoryPlacement {
  return offset < 0 ? "before" : offset > 0 ? "after" : "same";
}

/** Fortellingstiden for et valg i brukerflaten (lineær har aldri anker). */
export function storyTimeFor(
  kind: StoryKind,
  anchorSceneId: string | null,
  placement: StoryPlacement,
): StoryTime {
  if (kind === "linear") return { kind, anchorSceneId: null, offset: 0 };
  return {
    kind,
    anchorSceneId: anchorSceneId as never,
    offset: anchorSceneId ? STORY_PLACEMENT_OFFSET[placement] : 0,
  };
}
