/**
 * TODO-boksen på prosjektsiden (DEC-0088, Mars 15.10.2026): «Der vil Teddybjørn jobben ligge, og andre ting
 * som må kikkes på og merknader og kommentarer fra andre, mao her får en oversikt over hva som skal gjøres».
 * Ren TypeScript: samler åpne oppgaver, merknader fra andre og scener med avvik for én produksjon.
 */
import type { Annotation, ProjectState } from "../model";
import { orderedOccurrences, sceneNumberOf } from "../views";
import { assetTasks, type AssetTask } from "./scene-plans";

export interface TodoNote {
  readonly annotation: Annotation;
  /** Scenen i produksjonen notatet står i, eller null om scenen ikke er med i produksjonen. */
  readonly occurrenceId: string | null;
  readonly number: string | null;
}

export interface ProjectTodo {
  readonly tasks: readonly AssetTask[];
  /** Notater skrevet av andre enn meg (nyeste først). Systemmerknader hører til oppgavene og er ikke med. */
  readonly notesFromOthers: readonly TodoNote[];
}

/** Hvilken scenevariant notatet hører til (nål på scenen eller notat på en linje). */
export function noteVariantId(s: ProjectState, a: Annotation): string | null {
  if (a.variantId) return a.variantId;
  if (a.blockId) {
    const b = s.blocks[a.blockId];
    return b && !b.removed ? b.variantId : null;
  }
  return null;
}

export function projectTodo(
  s: ProjectState,
  productionId: string,
  opts: { readonly myName: string },
): ProjectTodo {
  const order = orderedOccurrences(s, productionId);
  const byVariant = new Map(order.map((o) => [o.variantId as string, o]));
  const me = opts.myName.trim().toLocaleLowerCase();
  const notesFromOthers: TodoNote[] = [];
  for (const a of Object.values(s.annotations)) {
    if (a.removed || a.source === "system") continue;
    if (me && a.authorName.trim().toLocaleLowerCase() === me) continue;
    const variantId = noteVariantId(s, a);
    if (!variantId) continue;
    const occ = byVariant.get(variantId);
    if (!occ) continue;
    notesFromOthers.push({
      annotation: a,
      occurrenceId: occ.id,
      number: sceneNumberOf(s, occ),
    });
  }
  notesFromOthers.sort((x, y) => y.annotation.stampAt.localeCompare(x.annotation.stampAt));
  return { tasks: assetTasks(s, productionId), notesFromOthers };
}
