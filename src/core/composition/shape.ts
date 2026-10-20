/**
 * Form og speilvending for lag (Mars 2026-10-13/14, DEC-0080):
 *
 * - «Nullstill format»: et lag som er skvist eller strukket (ulik skalering i bredde og høyde), får bildets
 *   egne proporsjoner igjen – enten med bredden beholdt eller høyden beholdt. Fortegnet (speilvending)
 *   beholdes.
 * - Speilvending «fra her»: laget snur fra et nøkkelbilde, glidende (bildet klemmes smalt og vokser ut
 *   speilvendt, som et kort som snus) eller brått (på ett bilde, som i stop motion).
 * - Forstørrelse over 1:1: hvor mange skjermpiksler hver bildepiksel tegnes som i filmen.
 */
import type { CompositionLayer, Keyframe, LayerTransform, ProjectState } from "../model";
import { setKeyframe } from "./animate";
import { renderFrame, valueAt } from "./render";
import { localized } from "../i18n";
import { tLocalized } from "@/core/i18n/keyed";

/** Skaleringen regnes som skvist når bredde og høyde avviker mer enn dette (0,5 %). */
const SQUISH_TOLERANCE = 0.005;

/** Er laget skvist eller strukket (ulik skalering i bredde og høyde)? */
export function isSquished(t: Pick<LayerTransform, "scaleX" | "scaleY">): boolean {
  const ax = Math.abs(t.scaleX);
  const ay = Math.abs(t.scaleY);
  if (ax === 0 || ay === 0) return false;
  return Math.abs(ax - ay) / Math.max(ax, ay) > SQUISH_TOLERANCE;
}

/**
 * Skaleringen etter «Nullstill format». `keep: "x"` beholder bredden (høyden rettes), `keep: "y"` beholder
 * høyden (bredden rettes). Speilvendingen (fortegnet) beholdes.
 */
export function aspectResetScale(
  t: Pick<LayerTransform, "scaleX" | "scaleY">,
  keep: "x" | "y",
): { scaleX: number; scaleY: number } {
  const sx = Math.sign(t.scaleX) || 1;
  const sy = Math.sign(t.scaleY) || 1;
  const m = keep === "x" ? Math.abs(t.scaleX) : Math.abs(t.scaleY);
  return { scaleX: sx * m, scaleY: sy * m };
}

export type FlipMode = "whole" | "smooth" | "cut";

export const FLIP_MODE_LABEL: Record<FlipMode, string> = tLocalized({ whole: "core-composition-shape.flip-mode-label.whole.e6b1d671886b", smooth: "core-composition-shape.flip-mode-label.smooth.2aec5ef8ff45", cut: "core-composition-shape.flip-mode-label.cut.ada546665ed9" });

/**
 * Nøkkelbildene etter speilvending fra et bilde. Laget snur mellom forrige nøkkelbilde (for laget) og
 * `frame`; finnes ikke noe nøkkelbilde før, snur det over `span` bilder (minst ett). Nøkkelbilder for
 * samme skalering etter `frame` snus også, så laget forblir speilvendt resten av scenen.
 * Returnerer null når det ikke er noe å snu fra (bilde 0): bruk da speilvending av hele laget.
 */
export function flippedKeyframesFrom(
  l: Pick<CompositionLayer, "transform" | "keyframes" | "mask">,
  axis: "x" | "y",
  frame: number,
  mode: Exclude<FlipMode, "whole">,
  span: number,
): Keyframe[] | null {
  const prop = axis === "x" ? "scaleX" : "scaleY";
  const at = Math.max(0, Math.round(frame));
  if (at === 0) return null;
  const now = valueAt(l as CompositionLayer, prop, at);
  if (now === 0) return null;
  // Starten på snuingen: forrige nøkkelbilde for laget (alle egenskaper), ellers `span` bilder før
  const before = l.keyframes.filter((k) => k.frame < at).map((k) => k.frame);
  const from = before.length
    ? Math.max(...before)
    : Math.max(0, at - Math.max(1, Math.round(span)));
  const startValue = valueAt(l as CompositionLayer, prop, from);
  let keys: Keyframe[] = [...l.keyframes];
  const old = keys.find((k) => k.property === prop && k.frame === from);
  // Startnøkkelbildet holder verdien fram til snuingen: «brått» = hold til `frame`; «glidende» = en kurve
  // (en eksisterende kurve beholdes, men ikke «hold», som ville gjort snuingen brå)
  const easing =
    mode === "cut" ? "hold" : old && old.easing !== "hold" ? old.easing : "ease-in-out";
  keys = setKeyframe(keys, prop, from, startValue, easing);
  // Etter `frame`: alt for denne skaleringen snus, så laget forblir speilvendt
  keys = keys.map((k) => (k.property === prop && k.frame > at ? { ...k, value: -k.value } : k));
  keys = setKeyframe(keys, prop, at, -now);
  return keys;
}

/**
 * Hvor mye et bilde er forstørret i filmen på et bilde (frame): filmpiksler per bildepiksel (1 = 1:1).
 * Regnes fra det som faktisk tegnes – lagets skalering, gruppen og kameraets zoom. Over 1 blir bildet
 * uskarpt; da kan det oppskaleres. null når laget ikke viser et bilde (fargeflate, symbol, skjult).
 */
export function layerMagnification(
  s: ProjectState,
  compositionId: string,
  layerId: string,
  frame: number,
): number | null {
  const f = renderFrame(s, compositionId, frame, { includeHidden: true });
  const it = f.items.find((x) => x.layerId === layerId);
  if (!it || it.kind !== "image" || !it.version?.width || !it.version.height) return null;
  const m = it.matrix;
  const sx = Math.hypot(m[0], m[1]);
  const sy = Math.hypot(m[2], m[3]);
  const kx = (sx * it.width) / it.version.width;
  const ky = (sy * it.height) / it.version.height;
  return Math.max(kx, ky);
}

/**
 * Største forstørrelse for laget i scenen: på bildet som vises nå og på alle nøkkelbildene for laget og
 * kameraet (der skaleringen og zoomen er størst).
 */
export function maxLayerMagnification(
  s: ProjectState,
  compositionId: string,
  layerId: string,
  frame: number,
): { readonly value: number; readonly frame: number } | null {
  const l = s.layers[layerId];
  if (!l) return null;
  const frames = new Set<number>([frame, ...l.keyframes.map((k) => k.frame)]);
  const c = s.compositions[compositionId];
  for (const shot of c?.camera.shots ?? []) {
    frames.add(shot.startFrame);
    frames.add(shot.endFrame);
  }
  let best: { value: number; frame: number } | null = null;
  for (const fr of frames) {
    if (fr < 0) continue;
    const v = layerMagnification(s, compositionId, layerId, fr);
    if (v !== null && (!best || v > best.value)) best = { value: v, frame: fr };
  }
  return best;
}

/** Over denne forstørrelsen varsles det (litt slingringsmonn, så 101 % ikke gir advarsel). */
export const MAGNIFICATION_WARN = 1.15;

/**
 * Skvis eller strekk med håndtaket midt på en side (DEC-0080). `p0` og `p1` er pekerens start og nå i lagets
 * eget, roterte koordinatsystem med origo i midten (uten skalering). Uten `symmetric` står motsatt side
 * stille (midtpunktet flyttes); med `symmetric` (Alt) endres begge sider likt rundt midten.
 * `size` er lagets størrelse før skalering. Fortegnet (speilvending) beholdes.
 */
export function stretchedTransform(
  start: LayerTransform,
  size: { readonly x: number; readonly y: number },
  axis: "x" | "y",
  p0: { readonly x: number; readonly y: number },
  p1: { readonly x: number; readonly y: number },
  symmetric: boolean,
): LayerTransform {
  const prop = axis === "x" ? "scaleX" : "scaleY";
  const base = axis === "x" ? size.x : size.y;
  if (!(base > 0)) return start;
  const sign = start[prop] < 0 ? -1 : 1;
  const half0 = (base * Math.abs(start[prop])) / 2;
  const a0 = axis === "x" ? p0.x : p0.y;
  const a1 = axis === "x" ? p1.x : p1.y;
  // Hvilken side som dras: den pekeren startet på
  const side = a0 < 0 ? -1 : 1;
  const delta = (a1 - a0) * side;
  const extent = Math.max(1, 2 * half0 + (symmetric ? 2 * delta : delta));
  const next = { ...start, [prop]: (sign * extent) / base };
  if (symmetric) return next;
  // Motsatt side står stille: midtpunktet flyttes halve endringen mot siden som dras
  const shift = (side * (extent - 2 * half0)) / 2;
  const r = (start.rotation * Math.PI) / 180;
  const ux = axis === "x" ? Math.cos(r) : -Math.sin(r);
  const uy = axis === "x" ? Math.sin(r) : Math.cos(r);
  return { ...next, x: start.x + ux * shift, y: start.y + uy * shift };
}
