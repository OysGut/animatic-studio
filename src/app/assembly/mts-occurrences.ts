/**
 * Nye forekomster av typene filmtittel, tekstscene og rulletekst (MTS MT6/MT7): de lages som en scene med
 * en variant, en komposisjon og en forekomst med `kind`, i én angregruppe. De er aldri manusscener og
 * påvirker ikke nummereringen. Rulleteksten får en standardsekvens, så den virker med en gang.
 */
import { fpsToNumber, keyBetween, newId, orderedOccurrences, type Command, type OccurrenceKind, type ProjectState } from "@/core";

import { tLocalized } from "@/core/i18n/keyed";
export type Run = (command: Command, label: string, group?: string) => string | null;

const MARKER: Record<Exclude<OccurrenceKind, "scene">, string> = tLocalized({ title: "app-assembly-mts-occurrences.marker-title", text: "app-assembly-mts-occurrences.marker-text", credits: "app-assembly-mts-occurrences.marker-credits" });

const LABEL: Record<Exclude<OccurrenceKind, "scene">, string> = tLocalized({ title: "app-assembly-mts-occurrences.label-title", text: "app-assembly-mts-occurrences.label-text", credits: "app-assembly-mts-occurrences.label-credits" });

/**
 * Lager forekomsten sist i filmen (eller etter `afterOccurrenceId`). Gir forekomst-ID-en, eller feilen.
 */
export function createKindScene(
  run: Run,
  state: ProjectState,
  productionId: string,
  kind: Exclude<OccurrenceKind, "scene">,
  afterOccurrenceId?: string,
): { occurrenceId: string | null; error: string | null } {
  const occs = orderedOccurrences(state, productionId);
  const after = afterOccurrenceId ? occs.find((o) => o.id === afterOccurrenceId) : undefined;
  const i = after ? occs.indexOf(after) : occs.length - 1;
  const orderKey = keyBetween(occs[i]?.orderKey ?? null, occs[i + 1]?.orderKey ?? null);
  const sceneId = newId<"scene">();
  const variantId = newId<"scene_variant">();
  const occurrenceId = newId<"scene_occurrence">();
  const compositionId = newId<"composition">();
  const label = LABEL[kind];
  const fps = fpsToNumber(state.project.fps);
  const group = newId<"command">();
  const error =
    run(
      {
        type: "CreateScene",
        productionId: productionId as never,
        sceneId,
        variantId,
        occurrenceId,
        orderKey,
        heading: { intExt: "", location: MARKER[kind], time: "" },
        blocks: [],
        kind,
      },
      label,
      group,
    ) ??
    run(
      {
        type: "CreateComposition",
        compositionId,
        variantId: variantId as never,
        fields: {
          name: label,
          width: state.project.frameWidth,
          height: state.project.frameHeight,
          durationFrames: Math.round(fps * (kind === "credits" ? 30 : 6)),
          background: "#000000",
        },
      },
      label,
      group,
    ) ??
    (kind === "credits"
      ? run(
          {
            type: "SetCreditSequence",
            sequenceId: newId<"credit_sequence">(),
            occurrenceId,
            fields: {
              presentation: "roll",
              durationFrames: Math.round(fps * 2),
              pauseFrames: Math.round(fps),
              speed: 4,
              direction: "up",
            },
          },
          label,
          group,
        )
      : null);
  return { occurrenceId: error ? null : occurrenceId, error };
}
