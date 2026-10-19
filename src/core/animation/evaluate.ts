/** Shared evaluator boundary; CA3 anchors are non-rendering metadata, never destructive transforms. */
import type { ProjectState } from "../model";
import type { Frame } from "../composition/render";
import { layerVersion, layersOf, multiply, translate, rotate, scale, type DrawItem } from "../composition/render";
import { effectiveBehavior, exportFlagsOf, breathScaleAt } from "./character";
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

/** Ansiktsankeret en rigg-del plasseres fra. */
function anchorOfSlot(slot: string): "mouth" | "leftEye" | "rightEye" | "head" | "nose" {
  if (slot.startsWith("mouth:")) return "mouth";
  if (slot.startsWith("eye:left")) return "leftEye";
  if (slot.startsWith("eye:right")) return "rightEye";
  return slot === "nose" ? "nose" : "head";
}

/**
 * CA5–CA8: rigg-delene (munnform, lukkede øyne) legges som egne tegneelementer rett over karakterlaget, med
 * eksportvalgene til bruken (§103–§106). Forhåndsvisning og eksport går gjennom samme funksjon, så de er like.
 * Uten aktivert oppsett returneres bildet uendret.
 */
export function evaluateCharacterFrame(s: ProjectState, compositionId: string, frame: number, base: Frame): Frame {
  // Resolve only the currently visible variant, so swaps never inherit another variant's setup (§47).
  let items: DrawItem[] | null = null;
  const fps = fpsToNumber(s.project.fps);
  for (const layer of layersOf(s, compositionId)) {
    const version = layerVersion(s, layer, frame);
    const setup = characterRigAt(s, layer.id, version?.variantId ?? null);
    if (!setup) continue;
    const list: DrawItem[] = items ?? [...base.items];
    const index = list.findIndex(it => it.layerId === layer.id && it.kind === "image");
    if (index < 0) continue;
    items = list;
    const host = list[index]!;
    const flags = exportFlagsOf(setup.use);
    const eff = effectiveBehavior(s, setup.use);
    const use = { ...setup.use, behavior: eff.behavior };
    const breath = breathScaleAt(eff.behavior.breath, frame, fps);
    const matrix = breath === 1 ? host.matrix : multiply(host.matrix, multiply(translate(0, host.height / 2), multiply(scale(1, breath), translate(0, -host.height / 2))));
    if (breath !== 1) list[index] = { ...host, matrix };
    const spec = setup.version.spec;
    const parts = spec.parts ?? {};
    const slots: { slot: string; opacity: number }[] = [];
    if (flags.mouth) {
      const v = mouthVisemeAt(s, setup.use.occurrenceId, frame);
      if (parts[`mouth:${v}`]?.versionId) slots.push({ slot: `mouth:${v}`, opacity: 1 });
    }
    if (flags.blink) for (const eye of ["left", "right"] as const) {
      const closed = eyeStateAt(s, use, setup.rig.id, eye, frame, frame + 1).closed;
      if (closed > 0 && parts[`eye:${eye}:closed`]?.versionId) slots.push({ slot: `eye:${eye}:closed`, opacity: closed });
    }
    const overlays = flags.overlay ? overlayEventsAt(s, use, frame, frame + 1) : [];
    const extra: DrawItem[] = [];
    for (const { slot, opacity } of slots) {
      const part = parts[slot]!;
      const image = part.versionId ? s.assetVersions[part.versionId] : undefined;
      if (!image || image.removed) continue;
      const a = spec.anchors[anchorOfSlot(slot)] ?? { x: 0.5, y: 0.5 };
      const cx = (a.x + part.x - 0.5) * host.width, cy = (a.y + part.y - 0.5) * host.height;
      extra.push({
        layerId: `${layer.id}:rig:${slot}`, kind: "image", version: image, fill: null,
        width: part.width * host.width, height: part.height * host.height,
        matrix: multiply(matrix, multiply(translate(cx, cy), rotate(part.rotation))),
        opacity: host.opacity * opacity * (flags.adjust ? part.adjustments.opacity : 1),
        locked: true, name: slot,
        ...(host.blend ? { blend: host.blend } : {}),
        character: {
          useId: setup.use.id, slot, separate: flags.mode === "separate",
          ...(flags.adjust ? { adjustments: part.adjustments } : {}),
          ...(flags.masks && (part.mask.length || part.drawing.length) ? { part } : {}),
        },
      });
    }
    // Overlegg uten eget bilde merkes på verten, så tegnelaget kan vise dem (§39–§44)
    if (overlays.length)
      list[index] = { ...list[index]!, character: { useId: setup.use.id, slot: "host", separate: false, overlays: overlays.map(o => ({ patternId: o.pattern.id, intensity: o.event.intensity })) } };
    list.splice(index + 1, 0, ...extra);
  }
  return items ? { ...base, items } : base;
}
