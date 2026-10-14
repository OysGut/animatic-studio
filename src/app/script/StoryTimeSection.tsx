/**
 * Fortellingstid for en scene (mandat 10.7, REQ-0164): «Følger rekkefølgen», tilbakeblikk, fremblikk,
 * drøm eller tidshopp – og når den skjer i historien i forhold til en annen scene. Kontinuiteten
 * (karakterenes utseende) følger dette, ikke rekkefølgen scenene vises i. Lagres med SetStoryTime og kan
 * angres. Vises bare i inspektøren, ikke i selve manuset (REQ-0102).
 */
import { useState } from "react";
import {
  L,
  STORY_KIND_LABEL,
  STORY_PLACEMENT_LABEL,
  formatHeading,
  mainProduction,
  orderedOccurrences,
  storyPlacementOf,
  storyTimeFor,
  type Command,
  type ProjectState,
  type StoryKind,
  type StoryPlacement,
} from "@/core";

const ctl =
  "h-8 w-full rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary disabled:opacity-50";

export function StoryTimeSection({
  state,
  sceneId,
  productionId,
  editable,
  run,
}: {
  state: ProjectState;
  sceneId: string;
  productionId: string;
  editable: boolean;
  run: (command: Command, label: string) => string | null;
}) {
  const scene = state.scenes[sceneId];
  const [err, setErr] = useState<string | null>(null);
  if (!scene) return null;
  const st = scene.storyTime;
  const placement = storyPlacementOf(st.offset);
  // Ankerscenene: scenene i hovedfilmen (fortellingstiden regnes ut fra den), ellers denne produksjonen
  const main = mainProduction(state);
  const order = orderedOccurrences(state, main?.id ?? productionId).filter(
    (o) => o.sceneId !== sceneId && !state.scenes[o.sceneId]?.mergedIntoSceneId,
  );
  const seen = new Set<string>();
  const anchors = order.filter((o) => (seen.has(o.sceneId) ? false : (seen.add(o.sceneId), true)));
  // Fortellingstiden hører til scenen og deles av alle produksjoner: den endres i hovedfilmen, så en
  // spinoff ikke endrer hovedfilmens kontinuitet (INV-04)
  const inMain = !main || main.id === productionId;
  const canEdit = editable && inMain;
  /** Et anker som ikke er i listen (sammenslått scene, scene bare i en spinoff). */
  const otherAnchor = st.anchorSceneId && !seen.has(st.anchorSceneId) ? st.anchorSceneId : null;
  /** Naturlig plassering når ankeret velges første gang. */
  const defaultPlacement = (kind: StoryKind): StoryPlacement =>
    kind === "flashback" ? "before" : kind === "flashforward" || kind === "jump" ? "after" : "same";

  const save = (kind: StoryKind, anchor: string | null, p: StoryPlacement) => {
    const next = storyTimeFor(kind, anchor, p);
    if (
      next.kind === st.kind &&
      next.anchorSceneId === st.anchorSceneId &&
      next.offset === st.offset
    )
      return;
    setErr(
      run(
        { type: "SetStoryTime", sceneId: sceneId as never, storyTime: next },
        kind === "linear"
          ? L("Scenen følger rekkefølgen", "The scene follows the running order")
          : L(
              `Merk som ${STORY_KIND_LABEL[kind].toLowerCase()}`,
              `Mark as ${STORY_KIND_LABEL[kind].toLowerCase()}`,
            ),
      ),
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        Type
        <select
          aria-label={L("Fortellingstid", "Story time")}
          value={st.kind}
          disabled={!canEdit}
          onChange={(e) => save(e.target.value as StoryKind, st.anchorSceneId, placement)}
          className={ctl}
        >
          {(Object.keys(STORY_KIND_LABEL) as StoryKind[]).map((k) => (
            <option key={k} value={k}>
              {STORY_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      {st.kind !== "linear" ? (
        <div className="grid grid-cols-[112px_1fr] gap-1.5">
          <select
            aria-label={L("Når i historien", "When in the story")}
            value={placement}
            disabled={!canEdit || !st.anchorSceneId}
            onChange={(e) => save(st.kind, st.anchorSceneId, e.target.value as StoryPlacement)}
            className={ctl}
          >
            {(Object.keys(STORY_PLACEMENT_LABEL) as StoryPlacement[]).map((p) => (
              <option key={p} value={p}>
                {L("Skjer", "Happens")} {STORY_PLACEMENT_LABEL[p]}
              </option>
            ))}
          </select>
          <select
            aria-label={L("Scenen det skjer i forhold til", "The scene it happens in relation to")}
            value={st.anchorSceneId ?? ""}
            disabled={!canEdit}
            onChange={(e) =>
              save(
                st.kind,
                e.target.value || null,
                st.anchorSceneId ? placement : defaultPlacement(st.kind),
              )
            }
            className={ctl}
          >
            <option value="">{L("Velg scene …", "Choose a scene …")}</option>
            {otherAnchor ? (
              <option value={otherAnchor}>
                {(() => {
                  const v = Object.values(state.variants).find((x) => x.sceneId === otherAnchor);
                  const heading = v ? formatHeading(v.heading) : "Scene";
                  return L(`${heading} (ikke i hovedfilmen)`, `${heading} (not in the main film)`);
                })()}
              </option>
            ) : null}
            {anchors.map((o) => {
              const v = state.variants[o.variantId];
              return (
                <option key={o.sceneId} value={o.sceneId}>
                  {o.productionNumber ? `${o.productionNumber}. ` : ""}
                  {v ? formatHeading(v.heading) : ""}
                </option>
              );
            })}
          </select>
        </div>
      ) : null}
      {editable && !inMain ? (
        <p className="text-[11px] text-text-tertiary">
          {L(
            "Fortellingstiden gjelder scenen i alle produksjoner og endres i hovedfilmen.",
            "Story time applies to the scene in all productions and is changed in the main film.",
          )}
        </p>
      ) : null}
      <p className="text-[11px] text-text-tertiary">
        {st.kind === "linear"
          ? L(
              "Scenen skjer i historien der den står i filmen.",
              "The scene happens in the story where it sits in the film.",
            )
          : st.anchorSceneId
            ? L(
                "Karakterenes utseende (kontinuitet) regnes ut fra når scenen skjer i historien, ikke hvor den står i filmen.",
                "The characters' appearance (continuity) is worked out from when the scene happens in the story, not where it sits in the film.",
              )
            : L(
                "Velg scenen dette skjer i forhold til, så regnes kontinuiteten riktig. Uten valg brukes plassen i filmen.",
                "Choose the scene this happens in relation to, so continuity is worked out correctly. Without a choice, the place in the film is used.",
              )}
      </p>
      {err ? (
        <p role="alert" className="text-xs text-status-danger">
          {err}
        </p>
      ) : null}
    </div>
  );
}
