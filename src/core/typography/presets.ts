/**
 * Inn- og utanimasjoner (MTS §8, MT3): forhåndsdefinerte oppsett som lager vanlige nøkkelbilder, så alt kan
 * redigeres etterpå i tidslinjen. Ingen egen animasjonsmodell.
 */
import type { CompositionLayer, Keyframe, TransformProperty } from "../model";
import { L, localized } from "../i18n";
import type { LetterAnimation } from "./types";

export type MotionPreset = "fade" | "slide" | "zoom" | "rotate";
export type PresetDirection = "up" | "down" | "left" | "right";

export const MOTION_PRESETS: readonly MotionPreset[] = ["fade", "slide", "zoom", "rotate"];

export const MOTION_PRESET_LABEL: Record<MotionPreset, string> = localized({
  fade: ["Ton inn/ut", "Fade"],
  slide: ["Skli", "Slide"],
  zoom: ["Zoom", "Zoom"],
  rotate: ["Roter", "Rotate"],
});

export interface PresetOptions {
  readonly phase: "in" | "out";
  /** Første bilde for animasjonen (inn: starten, ut: der utgangen begynner). */
  readonly startFrame: number;
  readonly durationFrames: number;
  readonly direction: PresetDirection;
  /** Avstand i piksler (skli). */
  readonly distance: number;
}

/**
 * Nøkkelbildene etter at oppsettet er lagt til: eksisterende nøkkelbilder for de samme egenskapene innenfor
 * tidsrommet erstattes; alle andre beholdes. Hvilestillingen er lagets nåværende plassering.
 */
export function applyMotionPreset(
  layer: Pick<CompositionLayer, "transform" | "keyframes">,
  preset: MotionPreset,
  o: PresetOptions,
): Keyframe[] {
  const t = layer.transform;
  const a = Math.max(0, Math.round(o.startFrame));
  const b = a + Math.max(1, Math.round(o.durationFrames));
  const pairs: [TransformProperty, number, number][] = [];
  // [egenskap, verdi utenfor bildet (skjult), verdi i hvile]
  if (preset === "fade") pairs.push(["opacity", 0, t.opacity]);
  if (preset === "slide") {
    const d = o.distance;
    if (o.direction === "left") pairs.push(["x", t.x - d, t.x]);
    if (o.direction === "right") pairs.push(["x", t.x + d, t.x]);
    if (o.direction === "up") pairs.push(["y", t.y - d, t.y]);
    if (o.direction === "down") pairs.push(["y", t.y + d, t.y]);
    pairs.push(["opacity", 0, t.opacity]);
  }
  if (preset === "zoom")
    pairs.push(["scaleX", 0, t.scaleX], ["scaleY", 0, t.scaleY], ["opacity", 0, t.opacity]);
  if (preset === "rotate") pairs.push(["rotation", t.rotation - 90, t.rotation], ["opacity", 0, t.opacity]);
  const props = new Set(pairs.map((p) => p[0]));
  const kept = layer.keyframes.filter((k) => !(props.has(k.property as TransformProperty) && k.frame >= a && k.frame <= b));
  const added: Keyframe[] = [];
  for (const [property, hidden, rest] of pairs) {
    const [v1, v2] = o.phase === "in" ? [hidden, rest] : [rest, hidden];
    added.push({ frame: a, property, value: v1, easing: o.phase === "in" ? "ease-out" : "ease-in" });
    added.push({ frame: b, property, value: v2, easing: "linear" });
  }
  return [...kept, ...added].sort((x, y) => x.frame - y.frame || x.property.localeCompare(y.property));
}

/** Standard bokstavanimasjon når laget ikke har en fra før (MT3, §9). */
export const DEFAULT_LETTER_ANIM: LetterAnimation = {
  unit: "letter",
  effect: "appear",
  direction: "up",
  startFrame: 0,
  delayFrames: 3,
  durationFrames: 6,
  order: "start",
  seed: 1,
  distance: 40,
};

/** Fullstendig bokstavanimasjon fra den nåværende (eller standardverdiene) og endringen. */
export function letterAnimWith(
  current: Partial<LetterAnimation> | null | undefined,
  patch: Partial<LetterAnimation>,
): LetterAnimation {
  return { ...DEFAULT_LETTER_ANIM, ...(current ?? {}), ...patch };
}

export type PresetWindow = { ok: true; startFrame: number } | { ok: false; reason: string };

/**
 * Hvor inn- og utanimasjonen ligger (MT3): inn starter ved starten av lagets synlige område (eller ved
 * avspillingshodet når det står inne i området), ut slutter ved slutten av området. Inn og ut overlapper aldri.
 */
export function presetWindow(
  layer: Pick<CompositionLayer, "activeRange">,
  phase: "in" | "out",
  o: { readonly frame: number; readonly sceneFrames: number; readonly durationFrames: number },
): PresetWindow {
  const from = Math.max(0, Math.round(layer.activeRange?.from ?? 0));
  const to = Math.max(from, Math.round(layer.activeRange?.to ?? o.sceneFrames));
  const len = Math.max(1, Math.round(o.durationFrames));
  if (to - from <= 2 * len)
    return {
      ok: false,
      reason: L(
        `Laget er for kort for både inn- og utanimasjon: ${to - from} bilder, men det trengs minst ${2 * len + 1}. Gjør animasjonen kortere eller laget lengre.`,
        `The layer is too short for both an in and an out animation: ${to - from} frames, but at least ${2 * len + 1} are needed. Make the animation shorter or the layer longer.`,
      ),
    };
  const outStart = to - len;
  if (phase === "out") return { ok: true, startFrame: outStart };
  const f = Math.round(o.frame);
  const start = f >= from && f + len < outStart ? f : from;
  return { ok: true, startFrame: start };
}
