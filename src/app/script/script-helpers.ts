import { type BlockKind, type ProjectState } from "@/core";
import { tLocalized } from "@/core/i18n/keyed";

export const KIND_LABEL: Record<BlockKind, string> = tLocalized({ heading: "app-script-script-helpers.kind-label.heading.42418a37eb55", action: "app-script-script-helpers.kind-label.action.77665d4ab14f", character: "app-script-script-helpers.kind-label.character.b5cc58d56174", parenthetical: "app-script-script-helpers.kind-label.parenthetical.02375f854d46", dialogue: "app-script-script-helpers.kind-label.dialogue.ea045400b3b6", transition: "app-script-script-helpers.kind-label.transition.400119123396", shot: "app-script-script-helpers.kind-label.shot.bd1d7be692cf", note: "app-script-script-helpers.kind-label.note.76d962063127" });

/** Varianter med usikre tolkninger (overskrift eller blokk). */
export function uncertainVariants(state: ProjectState): Set<string> {
  const out = new Set<string>();
  for (const v of Object.values(state.variants)) if (v.uncertainty) out.add(v.id);
  for (const b of Object.values(state.blocks))
    if (!b.removed && b.uncertainty) out.add(b.variantId);
  return out;
}
