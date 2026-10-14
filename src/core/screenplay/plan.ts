/**
 * Lager én ImportScreenplay-kommando fra et tolket manus (mandat 4.3: permanente sceneidentiteter opprettes ved import).
 * Nye scener legges etter eksisterende scener i produksjonen; ingenting eksisterende endres.
 */
import type { Command, ImportedScene, NewBlock } from "../commands/types";
import type { Id, ProductionId } from "../ids";
import { newId as defaultNewId } from "../ids";
import { keysEvenly } from "../order-key";
import type { ProjectState } from "../model";
import { orderedOccurrences } from "../views";
import { L } from "../i18n";
import type { ParsedScreenplay } from "./types";

export interface PlanOptions {
  readonly productionId: ProductionId;
  /** Hopp over tekst før første sceneoverskrift i stedet for å lage en fortsettelsesscene. */
  readonly skipContinuation?: boolean;
  readonly newId?: <K extends string>() => Id<K>;
}

export function planImport(
  state: ProjectState,
  parsed: ParsedScreenplay,
  opts: PlanOptions,
): Extract<Command, { type: "ImportScreenplay" }> {
  const mk = opts.newId ?? (<K extends string>() => defaultNewId<K>());
  const existing = orderedOccurrences(state, opts.productionId);
  const last = existing.length ? existing[existing.length - 1]!.orderKey : "";
  const parsedScenes = parsed.scenes.filter((s) => !(opts.skipContinuation && s.isContinuation));
  const keys = keysEvenly(parsedScenes.length).map((k) => last + k);
  // Et manus helt uten scenenumre (f.eks. Fountain eller et tidlig utkast) er ikke usikkert; bare når noen
  // scener har nummer og andre ikke, merkes de uten
  const anyNumbered = parsedScenes.some((s) => s.number !== null);
  const scenes: ImportedScene[] = parsedScenes.map((ps, i) => {
    const blockKeys = keysEvenly(ps.elements.length);
    const blocks: NewBlock[] = ps.elements.map((e, j) => ({
      blockId: mk<"script_block">(),
      kind: e.kind,
      text: e.text,
      orderKey: blockKeys[j]!,
      sourceRef: e.source,
      uncertainty: e.uncertain ?? null,
    }));
    const headingNotes = [...ps.warnings];
    if (anyNumbered && ps.number === null && !ps.isContinuation)
      headingNotes.push(
        L(
          "Scenen har ikke scenenummer i originalen",
          "The scene has no scene number in the original",
        ),
      );
    return {
      sceneId: mk<"scene">(),
      variantId: mk<"scene_variant">(),
      occurrenceId: mk<"scene_occurrence">(),
      orderKey: keys[i]!,
      heading: ps.heading,
      headingUncertainty: headingNotes.length ? headingNotes.join(" · ") : null,
      productionNumber: ps.number,
      blocks,
    };
  });
  return { type: "ImportScreenplay", productionId: opts.productionId, scenes };
}
