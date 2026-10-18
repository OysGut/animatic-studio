/**
 * Nye forekomster av typene filmtittel, tekstscene og rulletekst (MTS MT6/MT7): de lages som en scene med
 * en variant, en komposisjon og en forekomst med `kind`, i én angregruppe. De er aldri manusscener og
 * påvirker ikke nummereringen. Rulleteksten får en standardsekvens, så den virker med en gang.
 */
import {
  L,
  fpsToNumber,
  keyBetween,
  newId,
  orderedOccurrences,
  type Command,
  type OccurrenceKind,
  type ProjectState,
} from "@/core";

export type Run = (command: Command, label: string, group?: string) => string | null;

const MARKER: Record<Exclude<OccurrenceKind, "scene">, { nb: string; en: string }> = {
  title: { nb: "FILMTITTEL", en: "FILM TITLE" },
  text: { nb: "MELLOMTEKST", en: "TEXT CARD" },
  credits: { nb: "RULLETEKST", en: "CREDITS" },
};

const LABEL: Record<Exclude<OccurrenceKind, "scene">, { nb: string; en: string }> = {
  title: { nb: "Ny filmtittel", en: "New film title" },
  text: { nb: "Ny tekstscene", en: "New text scene" },
  credits: { nb: "Ny rulletekst", en: "New credits" },
};

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
  const label = L(LABEL[kind].nb, LABEL[kind].en);
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
        heading: { intExt: "", location: L(MARKER[kind].nb, MARKER[kind].en), time: "" },
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
