/**
 * Tid i 2D-scenen (M3 del 2b, mandat 11.3, 12.2–12.5, DEC-0036): varighet, nøkkelbilder og kamerautsnitt.
 * Rene funksjoner som lager nye feltverdier; endringene lagres med UpdateLayers / UpdateComposition.
 */
import type {
  AnimatedProperty,
  CameraFrame,
  CameraShot,
  Composition,
  CompositionCamera,
  CompositionLayer,
  Easing,
  Keyframe,
  LayerTransform,
  ProjectState,
} from "../model";
import type { LayerFields } from "../commands/types";
import { estimateProduction } from "../screenplay/duration";
import { mainProduction } from "../model";
import { msToFramesCeil, secondsToFrames } from "../time";
import { sceneAudioEndMs } from "../audio";
import { ANIMATED_PROPERTIES } from "./fields";
import { applyMatrix, fullFrameCamera, multiply, rotate, transformAt, translate } from "./render";

// ---------- Varighet ----------

/** Korteste og lengste varighet i editoren (bilder ved 25 fps: 1 sekund til 1 time). */
export const MIN_DURATION_SECONDS = 1;
export const MAX_DURATION_SECONDS = 3600;

/**
 * Varigheten i bilder: satt varighet, ellers scenens beregnede varighet fra manuset (minst 5 sekunder).
 */
export function compositionDuration(s: ProjectState, c: Composition): number {
  if (c.durationFrames > 0) return c.durationFrames;
  const fps = s.project.fps;
  const prod = mainProduction(s);
  let seconds = 5;
  let audioFrames = 0;
  if (prod) {
    const occ = Object.values(s.occurrences).find(
      (o) => o.variantId === c.variantId && o.productionId === prod.id,
    );
    const est = occ
      ? estimateProduction(s, prod.id).scenes.find((x) => x.occurrenceId === occ.id)
      : undefined;
    if (est) seconds = Math.max(5, est.seconds);
    // Aldri kortere enn lyden i scenen (DEC-0044) – samme regel som i filmtidslinjen
    if (occ) audioFrames = msToFramesCeil(sceneAudioEndMs(s).get(occ.id) ?? 0, fps);
  }
  return Math.max(1, secondsToFrames(seconds, fps), audioFrames);
}

// ---------- Nøkkelbilder ----------

const sortKeys = (list: readonly Keyframe[]): Keyframe[] =>
  [...list].sort((a, b) => a.property.localeCompare(b.property) || a.frame - b.frame);

/** Bildene der laget har nøkkelbilder (én gang per bilde), stigende. */
export function keyframeFrames(l: Pick<CompositionLayer, "keyframes">): number[] {
  return [...new Set(l.keyframes.map((k) => k.frame))].sort((a, b) => a - b);
}

/** Er egenskapen animert (har minst ett nøkkelbilde)? */
export function isAnimated(l: Pick<CompositionLayer, "keyframes">, p: AnimatedProperty): boolean {
  return l.keyframes.some((k) => k.property === p);
}

/** Setter (eller erstatter) et nøkkelbilde. Hastighetskurven beholdes hvis det fantes et der fra før. */
export function setKeyframe(
  list: readonly Keyframe[],
  property: AnimatedProperty,
  frame: number,
  value: number,
  easing?: Easing,
): Keyframe[] {
  const old = list.find((k) => k.property === property && k.frame === frame);
  const rest = list.filter((k) => !(k.property === property && k.frame === frame));
  return sortKeys([
    ...rest,
    { frame, property, value, easing: easing ?? old?.easing ?? "ease-in-out" },
  ]);
}

/** Fjerner nøkkelbildene på et bilde (alle egenskaper, eller bare de oppgitte). */
export function removeKeyframesAt(
  list: readonly Keyframe[],
  frame: number,
  properties: readonly AnimatedProperty[] = ANIMATED_PROPERTIES,
): Keyframe[] {
  return list.filter((k) => !(k.frame === frame && properties.includes(k.property)));
}

/**
 * Flytter nøkkelbildene på ett bilde til et annet. Nøkkelbilder som allerede står på målbildet for samme
 * egenskap, erstattes.
 */
export function moveKeyframes(
  list: readonly Keyframe[],
  from: number,
  to: number,
  properties: readonly AnimatedProperty[] = ANIMATED_PROPERTIES,
): Keyframe[] {
  if (from === to) return [...list];
  const target = Math.max(0, Math.round(to));
  const moving = list.filter((k) => k.frame === from && properties.includes(k.property));
  const movingProps = new Set(moving.map((k) => k.property));
  const kept = list.filter(
    (k) =>
      !(k.frame === from && properties.includes(k.property)) &&
      !(k.frame === target && movingProps.has(k.property)),
  );
  return sortKeys([...kept, ...moving.map((k) => ({ ...k, frame: target }))]);
}

/** Endrer hastighetskurven for nøkkelbildene på et bilde. */
export function setKeyframeEasing(
  list: readonly Keyframe[],
  frame: number,
  easing: Easing,
  properties: readonly AnimatedProperty[] = ANIMATED_PROPERTIES,
): Keyframe[] {
  return list.map((k) =>
    k.frame === frame && properties.includes(k.property) ? { ...k, easing } : k,
  );
}

/** Nøkkelbilder for alle egenskaper på bildet, med verdiene laget har der nå. */
export function keyAllAt(l: CompositionLayer, frame: number): Keyframe[] {
  const t = transformAt(l, frame);
  let list: Keyframe[] = [...l.keyframes];
  for (const p of ANIMATED_PROPERTIES) list = setKeyframe(list, p, frame, t[p]);
  return list;
}

/**
 * Feltene etter at brukeren har endret plasseringen på et bilde (dra på lerretet, skrive inn tall).
 * Egenskaper som allerede er animert, får nøkkelbilde på bildet; med `autoKey` får alle endrede egenskaper
 * nøkkelbilde. Ellers endres grunnverdien (laget står likt i hele scenen).
 */
export function fieldsWithTransformAt(
  l: CompositionLayer,
  fields: LayerFields,
  frame: number,
  next: LayerTransform,
  opts: { readonly autoKey?: boolean } = {},
): LayerFields {
  const now = transformAt(l, frame);
  let keyframes: Keyframe[] = [...fields.keyframes];
  const base: { -readonly [K in AnimatedProperty]: number } = { ...fields.transform };
  for (const p of ANIMATED_PROPERTIES) {
    if (next[p] === now[p]) continue;
    if (isAnimated(l, p) || opts.autoKey) {
      // Første nøkkelbilde for en egenskap: start fra grunnverdien på bilde 0, så endringen blir en bevegelse
      if (!isAnimated(l, p) && frame > 0) keyframes = setKeyframe(keyframes, p, 0, now[p]);
      keyframes = setKeyframe(keyframes, p, frame, next[p]);
    } else base[p] = next[p];
  }
  return { ...fields, transform: base, keyframes };
}

// ---------- Kamera ----------

/** Kamerautsnittet som gjelder på bildet (det som inneholder bildet), eller null. */
export function shotAt(camera: CompositionCamera, frame: number): CameraShot | null {
  return camera.shots.find((sh) => frame >= sh.startFrame && frame <= sh.endFrame) ?? null;
}

/** Hjørnene til kameraets utsnitt i scenekoordinater (øverst venstre, øverst høyre, nederst høyre, nederst venstre). */
export function cameraCorners(
  c: Pick<Composition, "width" | "height">,
  cam: CameraFrame,
): { x: number; y: number }[] {
  const w = c.width / cam.zoom / 2;
  const h = c.height / cam.zoom / 2;
  const m = multiply(translate(cam.x, cam.y), rotate(cam.rotation));
  return [
    applyMatrix(m, -w, -h),
    applyMatrix(m, w, -h),
    applyMatrix(m, w, h),
    applyMatrix(m, -w, h),
  ];
}

/** Nytt kamerautsnitt: starter på hele formatet og ender litt inn mot midten (rett bane). */
export function newShot(
  c: Pick<Composition, "width" | "height">,
  id: string,
  startFrame: number,
  endFrame: number,
  name = "",
): CameraShot {
  const from = fullFrameCamera(c);
  return {
    id,
    name,
    startFrame: Math.max(0, Math.round(startFrame)),
    endFrame: Math.max(Math.round(startFrame), Math.round(endFrame)),
    from,
    to: { ...from, zoom: 1.25 },
    curve: null,
    easing: "ease-in-out",
  };
}

/**
 * Ledig plass for et nytt kamerautsnitt fra `frame` (eller rett etter utsnittet som dekker bildet),
 * inntil `length` bilder og fram til neste utsnitt. null hvis det ikke er plass før slutten.
 */
export function freeShotSlot(
  camera: CompositionCamera,
  frame: number,
  length: number,
  lastFrame: number,
): { startFrame: number; endFrame: number } | null {
  let start = Math.max(0, Math.round(frame));
  for (const sh of camera.shots)
    if (start >= sh.startFrame && start < sh.endFrame) start = sh.endFrame;
  const next = camera.shots.find((sh) => sh.startFrame > start);
  const end = Math.min(start + Math.max(1, length), lastFrame, next ? next.startFrame : Infinity);
  return end > start ? { startFrame: start, endFrame: end } : null;
}

/** Bytter mellom rett og kurvet bane (mandat 12.3). Kurven starter som en rett linje med håndtak på 1/3 og 2/3. */
export function toggleCurve(sh: CameraShot): CameraShot {
  if (sh.curve) return { ...sh, curve: null };
  const dx = sh.to.x - sh.from.x;
  const dy = sh.to.y - sh.from.y;
  return {
    ...sh,
    curve: {
      c1x: sh.from.x + dx / 3,
      c1y: sh.from.y + dy / 3,
      c2x: sh.from.x + (2 * dx) / 3,
      c2y: sh.from.y + (2 * dy) / 3,
    },
  };
}

/** Kameraet med ett utsnitt erstattet (samme id) eller lagt til. Sortert etter start. */
export function withShot(camera: CompositionCamera, sh: CameraShot): CompositionCamera {
  const shots = camera.shots.filter((x) => x.id !== sh.id);
  return {
    shots: [...shots, sh].sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id)),
  };
}

export function withoutShot(camera: CompositionCamera, id: string): CompositionCamera {
  return { shots: camera.shots.filter((x) => x.id !== id) };
}

/** Punkter langs kamerabanen (for å tegne den), fra start til slutt. */
export function shotPath(sh: CameraShot, steps = 32): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!sh.curve) {
      out.push({
        x: sh.from.x + (sh.to.x - sh.from.x) * t,
        y: sh.from.y + (sh.to.y - sh.from.y) * t,
      });
      continue;
    }
    const u = 1 - t;
    const b = (p0: number, p1: number, p2: number, p3: number) =>
      u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    out.push({
      x: b(sh.from.x, sh.curve.c1x, sh.curve.c2x, sh.to.x),
      y: b(sh.from.y, sh.curve.c1y, sh.curve.c2y, sh.to.y),
    });
  }
  return out;
}
