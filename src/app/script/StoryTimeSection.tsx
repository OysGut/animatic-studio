/**
 * Fortellingstid for en scene (mandat 10.7, REQ-0164): «Følger rekkefølgen», tilbakeblikk, fremblikk,
 * drøm eller tidshopp – og når den skjer i historien i forhold til en annen scene. Kontinuiteten
 * (karakterenes utseende) følger dette, ikke rekkefølgen scenene vises i. Lagres med SetStoryTime og kan
 * angres. Vises bare i inspektøren, ikke i selve manuset (REQ-0102).
 */
import { SceneSelect, mainOccurrenceOfScene } from "@/app/shell/SceneSelect";
import { useState } from "react";
import { STORY_KIND_LABEL, STORY_PLACEMENT_LABEL, formatHeading, mainProduction, orderedOccurrences, storyPlacementOf, storyTimeFor, type Command, type ProjectState, type StoryKind, type StoryPlacement } from "@/core";
import { t } from "@/core/i18n/keyed";

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
          ? t("app-script-story-time-section.save.run.217d7895857f")
          : t("app-script-story-time-section.save.run.6e414cb1d8c3", { value1: String(STORY_KIND_LABEL[kind].toLowerCase()) }),
      ),
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        Type
        <select
          aria-label={t("app-script-story-time-section.story-time-section.aria-label.505b5a3a04ee")}
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
            aria-label={t("app-script-story-time-section.story-time-section.aria-label.00af75e9d420")}
            value={placement}
            disabled={!canEdit || !st.anchorSceneId}
            onChange={(e) => save(st.kind, st.anchorSceneId, e.target.value as StoryPlacement)}
            className={ctl}
          >
            {(Object.keys(STORY_PLACEMENT_LABEL) as StoryPlacement[]).map((p) => (
              <option key={p} value={p}>
                {t("app-script-story-time-section.story-time-section.option.a59806a48647")} {STORY_PLACEMENT_LABEL[p]}
              </option>
            ))}
          </select>
          <SceneSelect
            ariaLabel={t("app-script-story-time-section.story-time-section.aria-label.7f5b07ac218a")}
            value={st.anchorSceneId ?? ""}
            disabled={!canEdit}
            onChange={(v) =>
              save(
                st.kind,
                v || null,
                st.anchorSceneId ? placement : defaultPlacement(st.kind),
              )
            }
            className={ctl}
            emptyLabel={t("app-script-story-time-section.story-time-section.option.76bcf4e55c84")}
            options={[
              ...(otherAnchor
                ? [{ value: otherAnchor, occurrence: mainOccurrenceOfScene(state, otherAnchor), label: (() => {
                    const v = Object.values(state.variants).find((x) => x.sceneId === otherAnchor);
                    const heading = v ? formatHeading(v.heading) : "Scene";
                    return t("app-script-story-time-section.story-time-section.const-v-object-values-state-variants-find-x-x-scene-id-other-anchor-const-heading-v-format-heading-v-heading-scene-return-l-heading-ikke-i-hovedfilmen-heading-not-in-the-main-film.9c10c76f625b", { heading: String(heading) });
                  })() }]
                : []),
              ...anchors.map((o) => {
                const v = state.variants[o.variantId];
                return { value: o.sceneId, number: o.productionNumber ?? undefined, label: v ? formatHeading(v.heading) : "", occurrence: o };
              }),
            ]}
          />
        </div>
      ) : null}
      {editable && !inMain ? (
        <p className="text-[11px] text-text-tertiary">
          {t("app-script-story-time-section.story-time-section.p.5bb5fb6db2ba")}
        </p>
      ) : null}
      <p className="text-[11px] text-text-tertiary">
        {st.kind === "linear"
          ? t("app-script-story-time-section.story-time-section.p.dc33db7b4c6e")
          : st.anchorSceneId
            ? t("app-script-story-time-section.story-time-section.p.774137dc39c3")
            : t("app-script-story-time-section.story-time-section.p.e46f9d52c066")}
      </p>
      {err ? (
        <p role="alert" className="text-xs text-status-danger">
          {err}
        </p>
      ) : null}
    </div>
  );
}
