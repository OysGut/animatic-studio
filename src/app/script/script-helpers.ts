import type { BlockKind, ProjectState } from "@/core";

export const KIND_LABEL: Record<BlockKind, string> = {
  heading: "Sceneoverskrift",
  action: "Handling",
  character: "Karakter",
  parenthetical: "Parentes",
  dialogue: "Replikk",
  transition: "Overgang",
  shot: "Innstilling",
  note: "Notat",
};

/** Varianter med usikre tolkninger (overskrift eller blokk). */
export function uncertainVariants(state: ProjectState): Set<string> {
  const out = new Set<string>();
  for (const v of Object.values(state.variants)) if (v.uncertainty) out.add(v.id);
  for (const b of Object.values(state.blocks))
    if (!b.removed && b.uncertainty) out.add(b.variantId);
  return out;
}
