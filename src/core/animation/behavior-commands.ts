/** CA5/CA6: leppesynk og mønstre skrives som vanlige kommandoer med invers – angre/gjør om virker. */
import { L } from "../i18n";
import { isUuid } from "../ids";
import type { ProjectState } from "../model";
import { lipsyncError, type LipsyncResult } from "./lipsync";
import { patternError, type AnimationPattern } from "./patterns";
import { t } from "@/core/i18n/keyed";

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
    if (!clip || clip.removed || clip.kind !== "dialogue") invalid(t("core-animation-behavior-commands.apply-behavior-command.invalid.0125a209bbee"));
    const take = s.takes[r.takeId];
    if (!take) invalid(t("core-animation-behavior-commands.apply-behavior-command.invalid.ca091c7264d7"));
    if (r.blockId !== null && !s.blocks[r.blockId]) invalid(t("core-animation-behavior-commands.apply-behavior-command.invalid.37a57c00baeb"));
    const existing = lipsync[r.id];
    if (!existing && Object.values(lipsync).some(x => !x.removed && x.clipId === r.clipId && x.takeId === r.takeId))
      invalid(t("core-animation-behavior-commands.apply-behavior-command.invalid.14de9ddf5b7c"));
    rememberL(r.id);
    // DV2: synken gjelder lydversjonen som er aktiv nå
    const dv = r.dialogueVersionId ?? clip!.activeVersionId ?? null;
    if (dv !== null && s.dialogueVersions[dv]?.clipId !== r.clipId) invalid(t("core-animation-behavior-commands.apply-behavior-command.invalid.dce636ec1cfe"));
    lipsync[r.id] = { ...r, ...(dv !== null ? { dialogueVersionId: dv } : {}), revision: (existing?.revision ?? 0) + 1 };
  } else if (c.type === "SetLipsyncEnabled") {
    const r = lipsync[c.lipsyncId];
    if (!r || r.removed || typeof c.enabled !== "boolean") return invalid(t("core-animation-behavior-commands.apply-behavior-command.invalid.e28c08b63a8e"));
    rememberL(r.id);
    lipsync[r.id] = { ...r, enabled: c.enabled, revision: r.revision + 1 };
  } else if (c.type === "SetLipsyncOverrides") {
    const r = lipsync[c.lipsyncId];
    if (!r || r.removed) return invalid(t("core-animation-behavior-commands.apply-behavior-command.invalid.e28c08b63a8e.2"));
    const next = { ...r, overrides: c.overrides };
    const err = lipsyncError(next); if (err) invalid(err);
    rememberL(r.id);
    lipsync[r.id] = { ...next, revision: r.revision + 1 };
  } else if (c.type === "SaveAnimationPattern") {
    const p = c.pattern;
    const err = patternError(p); if (err) invalid(err);
    if (p.rigId !== null) {
      const rig = s.animationRigs[p.rigId];
      if (!rig || rig.removed) invalid(t("core-animation-behavior-commands.apply-behavior-command.invalid.18db5ae4365a"));
    }
    rememberP(p.id);
    patterns[p.id] = { ...p, revision: (patterns[p.id]?.revision ?? 0) + 1 };
  } else if (c.type === "RemoveAnimationPattern") {
    const p = patterns[c.patternId];
    if (!p || p.removed) return invalid(t("core-animation-behavior-commands.apply-behavior-command.invalid.274c0083e49c"));
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
