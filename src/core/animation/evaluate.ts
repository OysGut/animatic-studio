/** Shared evaluator boundary; CA3 anchors are non-rendering metadata, never destructive transforms. */
import type { ProjectState } from "../model";
import type { Frame } from "../composition/render";
import { layerVersion, layersOf } from "../composition/render";
import { fpsToNumber, secondsToFrames } from "../time";
import { rigSpecError } from "./rig";
import { visemeAt } from "./lipsync";
import type { Viseme } from "./parts";
import { planPatternEvents, patternEventAt, DEFAULT_BLINK_SPEC, type AnimationPattern, type PatternEvent } from "./patterns";
export function characterRigAt(s: ProjectState, layerId: string, variantId: string | null) {
  const use = Object.values(s.animationUses).find(u => !u.removed && u.enabled && u.layerId === layerId);
  if (!use) return null;
  const version = s.animationRigVersions[use.rigVersionId];
  const rig = version ? s.animationRigs[version.rigId] : undefined;
  const layer = s.layers[layerId];
  if (!version || version.removed || !rig || rig.removed || rig.variantId !== variantId || !layer || s.occurrences[use.occurrenceId]?.variantId !== s.compositions[layer.compositionId]?.variantId || rigSpecError(version.spec)) return null;
  return { use, rig, version };
}

/** Munnformen for et lag på en frame: aktivert leppesynk for dialogen som klinger der, ellers lukket (X). */
export function mouthVisemeAt(s: ProjectState, occurrenceId: string, frame: number): Viseme {
  const fps = s.project.fps;
  for (const r of Object.values(s.lipsyncResults)) {
    if (r.removed || !r.enabled) continue;
    const clip = s.audioClips[r.clipId];
    if (!clip || clip.removed || clip.occurrenceId !== occurrenceId) continue;
    const start = secondsToFrames(clip.offsetMs / 1000, fps);
    const end = secondsToFrames((clip.offsetMs + clip.lengthMs) / 1000, fps);
    if (frame >= start && frame < end) return visemeAt(r, frame - start);
  }
  return "X";
}

/** Øyets tilstand på en frame: manuelle blink først, så mønsteret (§34–§37). */
export function eyeStateAt(
  s: ProjectState,
  use: { readonly behavior?: { readonly blinkEnabled?: boolean; readonly leftEyePatternId?: string | null; readonly rightEyePatternId?: string | null; readonly seed?: number; readonly manualBlinks?: readonly { readonly eye: "left" | "right" | "both"; readonly frame: number; readonly endFrame: number; readonly intensity: number }[] } },
  rigId: string,
  eye: "left" | "right",
  frame: number,
  durationFrames: number,
): { readonly closed: number } {
  for (const b of use.behavior?.manualBlinks ?? [])
    if ((b.eye === eye || b.eye === "both") && frame >= b.frame && frame < b.endFrame) return { closed: b.intensity };
  if (use.behavior?.blinkEnabled === false) return { closed: 0 };
  const patternId = eye === "left" ? use.behavior?.leftEyePatternId : use.behavior?.rightEyePatternId;
  const pattern: AnimationPattern | undefined = patternId ? s.animationPatterns[patternId] : undefined;
  const spec = pattern && !pattern.removed ? pattern.spec : { ...DEFAULT_BLINK_SPEC, seed: use.behavior?.seed ?? DEFAULT_BLINK_SPEC.seed };
  const event: PatternEvent | null = patternEventAt(planPatternEvents(spec, 0, durationFrames, fpsToNumber(s.project.fps)), frame);
  return { closed: event ? event.intensity : 0 };
}

/** Aktive overleggshendelser for et lag på en frame (§39–§44). */
export function overlayEventsAt(
  s: ProjectState,
  use: { readonly behavior?: { readonly overlayPatternIds?: readonly string[]; readonly seed?: number } },
  frame: number,
  durationFrames: number,
): readonly { readonly pattern: AnimationPattern; readonly event: PatternEvent }[] {
  const out: { pattern: AnimationPattern; event: PatternEvent }[] = [];
  for (const id of use.behavior?.overlayPatternIds ?? []) {
    const pattern = s.animationPatterns[id];
    if (!pattern || pattern.removed || pattern.spec.target !== "overlay") continue;
    const event = patternEventAt(planPatternEvents(pattern.spec, 0, durationFrames, fpsToNumber(s.project.fps)), frame);
    if (event) out.push({ pattern, event });
  }
  return out;
}

export function evaluateCharacterFrame(s: ProjectState, compositionId: string, frame: number, base: Frame): Frame {
  // CA5/CA6 resolves the active mouth/eye/overlay parts per layer; the compositor draws them (rig-parts.ts).
  // Resolve only the currently visible variant, so swaps never inherit another variant's setup (§47).
  for (const layer of layersOf(s, compositionId)) {
    const version = layerVersion(s, layer, frame);
    const setup = characterRigAt(s, layer.id, version?.variantId ?? null);
    // CA3 establishes the shared, version-gated boundary; anchors alone draw no new pixels.
    if (!setup) continue;
  }
  return base;
}
