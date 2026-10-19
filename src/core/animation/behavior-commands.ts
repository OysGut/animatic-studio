/** CA5/CA6: leppesynk og mønstre skrives som vanlige kommandoer med invers – angre/gjør om virker. */
import { L } from "../i18n";
import { isUuid } from "../ids";
import type { ProjectState } from "../model";
import { lipsyncError, type LipsyncResult } from "./lipsync";
import { patternError, type AnimationPattern } from "./patterns";

export type BehaviorCommand =
  | { type: "SaveLipsyncResult"; result: LipsyncResult }
  | { type: "SetLipsyncEnabled"; lipsyncId: string; enabled: boolean }
  | { type: "SetLipsyncOverrides"; lipsyncId: string; overrides: LipsyncResult["overrides"] }
  | { type: "SaveAnimationPattern"; pattern: AnimationPattern }
  | { type: "RemoveAnimationPattern"; patternId: string }
  | { type: "UndoBehaviorChange"; lipsync: Readonly<Record<string, LipsyncResult | null>>; patterns: Readonly<Record<string, AnimationPattern | null>> };

export function applyBehaviorCommand(s: ProjectState, c: BehaviorCommand) {
  const lipsync = { ...s.lipsyncResults }, patterns = { ...s.animationPatterns };
  const oldLipsync: Record<string, LipsyncResult | null> = {}, oldPatterns: Record<string, AnimationPattern | null> = {};
  const invalid = (message: string): never => { throw new Error(message); };
  const rememberL = (id: string) => { if (!(id in oldLipsync)) oldLipsync[id] = lipsync[id] ?? null; };
  const rememberP = (id: string) => { if (!(id in oldPatterns)) oldPatterns[id] = patterns[id] ?? null; };

  if (c.type === "SaveLipsyncResult") {
    const r = c.result;
    const err = lipsyncError(r); if (err) invalid(err);
    const clip = s.audioClips[r.clipId];
    if (!clip || clip.removed || clip.kind !== "dialogue") invalid(L("Replikken finnes ikke", "The line was not found"));
    const take = s.takes[r.takeId];
    if (!take) invalid(L("Taket finnes ikke", "The take was not found"));
    if (r.blockId !== null && !s.blocks[r.blockId]) invalid(L("Manuslinjen finnes ikke", "The script line was not found"));
    const existing = lipsync[r.id];
    if (!existing && Object.values(lipsync).some(x => !x.removed && x.clipId === r.clipId && x.takeId === r.takeId))
      invalid(L("Replikken har allerede leppesynk for dette taket", "The line already has lip sync for this take"));
    rememberL(r.id);
    // DV2: synken gjelder lydversjonen som er aktiv nå
    const dv = r.dialogueVersionId ?? clip!.activeVersionId ?? null;
    if (dv !== null && s.dialogueVersions[dv]?.clipId !== r.clipId) invalid(L("Lydversjonen hører ikke til replikken", "The audio version does not belong to the line"));
    lipsync[r.id] = { ...r, ...(dv !== null ? { dialogueVersionId: dv } : {}), revision: (existing?.revision ?? 0) + 1 };
  } else if (c.type === "SetLipsyncEnabled") {
    const r = lipsync[c.lipsyncId];
    if (!r || r.removed || typeof c.enabled !== "boolean") return invalid(L("Leppesynket finnes ikke", "The lip sync was not found"));
    rememberL(r.id);
    lipsync[r.id] = { ...r, enabled: c.enabled, revision: r.revision + 1 };
  } else if (c.type === "SetLipsyncOverrides") {
    const r = lipsync[c.lipsyncId];
    if (!r || r.removed) return invalid(L("Leppesynket finnes ikke", "The lip sync was not found"));
    const next = { ...r, overrides: c.overrides };
    const err = lipsyncError(next); if (err) invalid(err);
    rememberL(r.id);
    lipsync[r.id] = { ...next, revision: r.revision + 1 };
  } else if (c.type === "SaveAnimationPattern") {
    const p = c.pattern;
    const err = patternError(p); if (err) invalid(err);
    if (p.rigId !== null) {
      const rig = s.animationRigs[p.rigId];
      if (!rig || rig.removed) invalid(L("Oppsettet finnes ikke", "The setup was not found"));
    }
    rememberP(p.id);
    patterns[p.id] = { ...p, revision: (patterns[p.id]?.revision ?? 0) + 1 };
  } else if (c.type === "RemoveAnimationPattern") {
    const p = patterns[c.patternId];
    if (!p || p.removed) return invalid(L("Mønsteret finnes ikke", "The pattern was not found"));
    rememberP(p.id);
    patterns[p.id] = { ...p, removed: true, revision: p.revision + 1 };
  } else {
    for (const [id, row] of Object.entries(c.lipsync)) {
      rememberL(id);
      if (row) lipsync[id] = { ...row, revision: (lipsync[id]?.revision ?? 0) + 1 }; else delete lipsync[id];
    }
    for (const [id, row] of Object.entries(c.patterns)) {
      rememberP(id);
      if (row) patterns[id] = { ...row, revision: (patterns[id]?.revision ?? 0) + 1 }; else delete patterns[id];
    }
  }
  return {
    state: { ...s, lipsyncResults: lipsync, animationPatterns: patterns },
    inverse: { type: "UndoBehaviorChange" as const, lipsync: oldLipsync, patterns: oldPatterns },
    affected: [...Object.keys(oldLipsync), ...Object.keys(oldPatterns)],
  };
}
