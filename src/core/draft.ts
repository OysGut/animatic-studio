/**
 * Prøveversjon for scenen (Asset Studio AS1, B5): kommandoene samles lokalt og vises med applyCommand på en
 * kopi. Ingenting lagres før utkastet gjøres om til én samlet kommando (UpdateSceneDraft). Ressurser og notater
 * går aldri gjennom utkastet; de skrives direkte (B4). Ren og plattformnøytral.
 */
import type { Command, CommandEnvelope } from "./commands/types";
import { applyCommand, MAX_SCENE_DRAFT_STEPS, SCENE_DRAFT_STEPS } from "./commands/apply";
import type { ProjectState } from "./model";

export interface SceneDraft {
  readonly base: ProjectState;
  readonly occurrenceId: string;
  readonly compositionId: string;
  /** Trinnene som er brukt (i rekkefølge). */
  readonly steps: readonly Command[];
  /** Angrede trinn som kan gjøres om (sist angret først). */
  readonly redo: readonly Command[];
  /** Tilstanden med alle trinnene brukt. */
  readonly state: ProjectState;
}

export type DraftResult =
  | { readonly ok: true; readonly draft: SceneDraft }
  | { readonly ok: false; readonly message: string };

const ACTOR = "00000000-0000-0000-0000-000000000000";
function env(command: Command): CommandEnvelope {
  return { id: "draft", actor: ACTOR, at: new Date(0).toISOString(), command } as never;
}

function replay(base: ProjectState, steps: readonly Command[]) {
  let s = base;
  for (const [i, step] of steps.entries()) {
    const r = applyCommand(s, env(step));
    if (!r.ok) return { ok: false as const, index: i, message: r.error.message };
    s = r.state;
  }
  return { ok: true as const, state: s };
}

export function createDraft(
  base: ProjectState,
  occurrenceId: string,
  compositionId: string,
): SceneDraft {
  return { base, occurrenceId, compositionId, steps: [], redo: [], state: base };
}

/** Legg et trinn i utkastet. Bare scenekommandoer er tillatt. */
export function pushDraft(d: SceneDraft, cmd: Command): DraftResult {
  if (!SCENE_DRAFT_STEPS.has(cmd.type))
    return { ok: false, message: `Not a scene command: ${cmd.type}` };
  if (d.steps.length >= MAX_SCENE_DRAFT_STEPS) return { ok: false, message: "Draft is full" };
  const r = applyCommand(d.state, env(cmd));
  if (!r.ok) return { ok: false, message: r.error.message };
  return { ok: true, draft: { ...d, steps: [...d.steps, cmd], redo: [], state: r.state } };
}

export function undoDraft(d: SceneDraft): SceneDraft {
  if (d.steps.length === 0) return d;
  const steps = d.steps.slice(0, -1);
  const r = replay(d.base, steps);
  return { ...d, steps, redo: [d.steps[d.steps.length - 1]!, ...d.redo], state: r.ok ? r.state : d.base };
}

export function redoDraft(d: SceneDraft): SceneDraft {
  const [next, ...rest] = d.redo;
  if (!next) return d;
  const r = applyCommand(d.state, env(next));
  if (!r.ok) return d;
  return { ...d, steps: [...d.steps, next], redo: rest, state: r.state };
}

export function isDraftEmpty(d: SceneDraft): boolean {
  return d.steps.length === 0;
}

/** Legg utkastet oppå en nyere tilstand (etter direkte skriving eller revisjonskonflikt). */
export function rebaseDraft(
  d: SceneDraft,
  newBase: ProjectState,
):
  | { readonly ok: true; readonly draft: SceneDraft }
  | { readonly ok: false; readonly index: number; readonly message: string } {
  const r = replay(newBase, d.steps);
  if (!r.ok) return r;
  return { ok: true, draft: { ...d, base: newBase, redo: [], state: r.state } };
}

/** Utkastet som én samlet kommando, eller null når det er tomt. */
export function draftCommand(d: SceneDraft): Command | null {
  if (d.steps.length === 0) return null;
  return {
    type: "UpdateSceneDraft",
    occurrenceId: d.occurrenceId,
    compositionId: d.compositionId,
    steps: d.steps,
  } as never;
}

/** Objektene utkastet endrer, med revisjonen i grunnlaget (baseRevisions ved lagring). */
export function draftBaseRevisions(d: SceneDraft): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (id: string) => {
    const e =
      (d.base.layers as Record<string, { revision: number }>)[id] ??
      (d.base.audioClips as Record<string, { revision: number }>)[id] ??
      (d.base.compositions as Record<string, { revision: number }>)[id];
    if (e) out[id] = e.revision;
  };
  for (const s of d.steps) {
    if (s.type === "UpdateLayers") s.layers.forEach((l) => add(l.layerId));
    else if (s.type === "UpdateAudioClips")
      (s as unknown as { clips: { clipId: string }[] }).clips.forEach((c) => add(c.clipId));
    else if (s.type === "UpdateComposition") add(s.compositionId);
  }
  return out;
}

/** Hvilke av utkastets objekter andre har endret siden grunnlaget (konfliktdialogen, F3). */
export function draftConflicts(d: SceneDraft, fresh: ProjectState): string[] {
  const base = draftBaseRevisions(d);
  return Object.keys(base).filter((id) => {
    const e =
      (fresh.layers as Record<string, { revision: number }>)[id] ??
      (fresh.audioClips as Record<string, { revision: number }>)[id] ??
      (fresh.compositions as Record<string, { revision: number }>)[id];
    return !e || e.revision !== base[id];
  });
}
