import { localized, type BlockKind, type ProjectState } from "@/core";

export const KIND_LABEL: Record<BlockKind, string> = localized({
  heading: ["Sceneoverskrift", "Scene heading"],
  action: ["Handling", "Action"],
  character: ["Karakter", "Character"],
  parenthetical: ["Parentes", "Parenthetical"],
  dialogue: ["Replikk", "Dialogue"],
  transition: ["Overgang", "Transition"],
  shot: ["Innstilling", "Shot"],
  note: ["Notat", "Note"],
});

/** Varianter med usikre tolkninger (overskrift eller blokk). */
export function uncertainVariants(state: ProjectState): Set<string> {
  const out = new Set<string>();
  for (const v of Object.values(state.variants)) if (v.uncertainty) out.add(v.id);
  for (const b of Object.values(state.blocks))
    if (!b.removed && b.uncertainty) out.add(b.variantId);
  return out;
}
