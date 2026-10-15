/**
 * Elementer som skal inn i flere scener, og oppgavene rundt dem (DEC-0088, Mars 15.10.2026): «Når en legger inn
 * et nytt element i scenen skal systemet spørre om denne også skal inn i andre scener … f.eks. … alle scenene
 * med Maja … spørsmål om manus skal oppdateres med en merknad … listes i den aller øverste menylinjen slik at
 * det er enkelt å gå til neste eller forrige … uten at systemet skal glemme at disse scenene skal oppdateres».
 * Ren TypeScript: planene ligger på ressursen (scenePlans), merknadene er systemnotater med oppgavens ID.
 */
import type { Annotation, Asset, ProjectState, ScenePlan } from "../model";
import { allAssetUsage } from "./index";
import { orderedOccurrences, sceneNumberOf } from "../views";
import { L } from "../i18n";

/** Ligger ressursen som lag i en 2D-scene for scenen (sceneforekomstens variant)? */
export function assetPlacedInScene(
  s: ProjectState,
  assetId: string,
  occurrenceId: string,
): boolean {
  const variantId = s.occurrences[occurrenceId as never]?.variantId;
  if (!variantId) return false;
  for (const l of Object.values(s.layers)) {
    if (l.removed || l.assetId !== assetId) continue;
    const comp = s.compositions[l.compositionId];
    if (comp && !comp.removed && comp.variantId === variantId) return true;
  }
  return false;
}

export interface PendingPlan {
  readonly asset: Asset;
  readonly plan: ScenePlan;
  /** Nummeret på scenen elementet ble lagt til fra (for meldingen). */
  readonly fromNumber: string | null;
}

/** Elementene som skal inn i scenen, men ikke er dratt inn på lerretet ennå (vises med gul ramme). */
export function pendingPlansFor(s: ProjectState, occurrenceId: string): PendingPlan[] {
  const out: PendingPlan[] = [];
  for (const a of Object.values(s.assets)) {
    if (a.removed || a.archived || !a.scenePlans?.length) continue;
    const plan = a.scenePlans.find((p) => p.occurrenceId === occurrenceId);
    if (!plan || assetPlacedInScene(s, a.id, occurrenceId)) continue;
    const from = s.occurrences[plan.fromOccurrenceId as never];
    out.push({ asset: a, plan, fromNumber: from ? sceneNumberOf(s, from) : null });
  }
  return out.sort((x, y) => x.asset.name.localeCompare(y.asset.name));
}

export interface TaskScene {
  readonly occurrenceId: string;
  readonly number: string | null;
  readonly placed: boolean;
  /** Åpen systemmerknad i scenen, eller null. */
  readonly noteId: string | null;
  readonly done: boolean;
}

export interface AssetTask {
  readonly taskId: string;
  readonly assetId: string;
  readonly assetName: string;
  readonly fromOccurrenceId: string;
  readonly at: string;
  /** Scenene i filmens rekkefølge. */
  readonly scenes: readonly TaskScene[];
  readonly remaining: number;
}

/** Åpne systemmerknader per oppgave og scenevariant. */
function openSystemNotes(s: ProjectState): Map<string, Annotation[]> {
  const m = new Map<string, Annotation[]>();
  for (const n of Object.values(s.annotations)) {
    if (n.removed || n.source !== "system" || !n.taskId) continue;
    m.set(n.taskId, [...(m.get(n.taskId) ?? []), n]);
  }
  return m;
}

/**
 * Oppgavene i produksjonen: én per gang et element ble planlagt i flere scener. En scene er ferdig når
 * elementet er dratt inn på lerretet og merknaden (om det finnes en) er lagret som ferdig eller slettet.
 * Bare oppgaver med noe igjen er med.
 */
export function assetTasks(s: ProjectState, productionId: string): AssetTask[] {
  const order = orderedOccurrences(s, productionId);
  const index = new Map(order.map((o, i) => [o.id as string, i]));
  const notes = openSystemNotes(s);
  const tasks: AssetTask[] = [];
  for (const a of Object.values(s.assets)) {
    if (a.removed || !a.scenePlans?.length) continue;
    const byTask = new Map<string, ScenePlan[]>();
    for (const p of a.scenePlans) byTask.set(p.taskId, [...(byTask.get(p.taskId) ?? []), p]);
    for (const [taskId, plans] of byTask) {
      const taskNotes = notes.get(taskId) ?? [];
      const scenes = plans
        .filter((p) => index.has(p.occurrenceId))
        .sort((x, y) => index.get(x.occurrenceId)! - index.get(y.occurrenceId)!)
        .map((p): TaskScene => {
          const occ = s.occurrences[p.occurrenceId as never]!;
          const note = taskNotes.find((n) => n.variantId === occ.variantId) ?? null;
          const placed = assetPlacedInScene(s, a.id, p.occurrenceId);
          return {
            occurrenceId: p.occurrenceId,
            number: sceneNumberOf(s, occ),
            placed,
            noteId: note?.id ?? null,
            done: placed && !note,
          };
        });
      const remaining = scenes.filter((x) => !x.done).length;
      if (!remaining) continue;
      tasks.push({
        taskId,
        assetId: a.id,
        assetName: a.name,
        fromOccurrenceId: plans[0]!.fromOccurrenceId,
        at: plans[0]!.at,
        scenes,
        remaining,
      });
    }
  }
  return tasks.sort((x, y) => y.at.localeCompare(x.at));
}

/** Neste eller forrige scene i oppgaven som ikke er ferdig, fra scenen man står i (rundt i ring). */
export function stepTask(
  task: AssetTask,
  currentOccurrenceId: string | null,
  dir: 1 | -1,
): string | null {
  const open = task.scenes.filter((x) => !x.done);
  if (!open.length) return null;
  const all = task.scenes.map((x) => x.occurrenceId);
  const at = currentOccurrenceId ? all.indexOf(currentOccurrenceId) : -1;
  if (at < 0) return (dir === 1 ? open[0] : open[open.length - 1])!.occurrenceId;
  for (let k = 1; k <= all.length; k++) {
    const i = (at + dir * k + all.length * k) % all.length;
    const sc = task.scenes[i]!;
    if (!sc.done) return sc.occurrenceId;
  }
  return null;
}

export interface SceneChoice {
  readonly key: string;
  readonly label: string;
  readonly occurrenceIds: readonly string[];
}

/**
 * Hurtigvalg for «Skal den også inn i andre scener?»: alle scener med hver karakter i scenen, alle scener på
 * samme sted, og resten av filmen etter denne scenen. Scenen man står i er ikke med.
 */
export function sceneChoices(
  s: ProjectState,
  productionId: string,
  occurrenceId: string,
): SceneChoice[] {
  const order = orderedOccurrences(s, productionId).filter((o) => o.active);
  const usage = allAssetUsage(s, productionId);
  const out: SceneChoice[] = [];
  const here = (uses: readonly { occurrenceId: string }[]) =>
    uses.some((u) => u.occurrenceId === occurrenceId);
  for (const [assetId, uses] of usage) {
    const a = s.assets[assetId];
    if (!a || a.removed || a.archived) continue;
    if ((a.kind === "character" || a.kind === "animal") && here(uses)) {
      const ids = [...new Set(uses.map((u) => u.occurrenceId))].filter((id) => id !== occurrenceId);
      if (ids.length)
        out.push({
          key: `with:${a.id}`,
          label: L(`Alle scener med ${a.name}`, `All scenes with ${a.name}`),
          occurrenceIds: ids,
        });
    }
    if (
      a.kind === "location" &&
      uses.some((u) => u.occurrenceId === occurrenceId && u.how === "location")
    ) {
      const ids = [
        ...new Set(uses.filter((u) => u.how === "location").map((u) => u.occurrenceId)),
      ].filter((id) => id !== occurrenceId);
      if (ids.length)
        out.push({
          key: `at:${a.id}`,
          label: L(`Alle scener på ${a.name}`, `All scenes at ${a.name}`),
          occurrenceIds: ids,
        });
    }
  }
  const i = order.findIndex((o) => o.id === occurrenceId);
  if (i >= 0 && i < order.length - 1)
    out.push({
      key: "rest",
      label: L("Alle scener etter denne", "All scenes after this one"),
      occurrenceIds: order.slice(i + 1).map((o) => o.id),
    });
  return out;
}

/** Standardteksten i systemmerknaden. */
export function planNoteText(assetName: string, fromNumber: string | null): string {
  return fromNumber
    ? L(
        `«${assetName}» skal inn i scenen (lagt til fra scene ${fromNumber}). Skriv det inn i manuset, og lagre merknaden som ferdig.`,
        `“${assetName}” should be in the scene (added from scene ${fromNumber}). Write it into the script, and save the note as done.`,
      )
    : L(
        `«${assetName}» skal inn i scenen. Skriv det inn i manuset, og lagre merknaden som ferdig.`,
        `“${assetName}” should be in the scene. Write it into the script, and save the note as done.`,
      );
}
