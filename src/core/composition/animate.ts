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
  LayerMask,
  LayerTransform,
  MaskProperty,
  ProjectState,
} from "../model";
import type { LayerFields } from "../commands/types";
import { estimateProduction } from "../screenplay/duration";
import { mainProduction } from "../model";
import { msToFramesCeil, secondsToFrames } from "../time";
import { sceneAudioEndMs } from "../audio";
import { ANIMATED_PROPERTIES, KEYFRAME_PROPERTIES, MASK_FIELD, MASK_PROPERTIES } from "./fields";
import {
  applyMatrix,
  fullFrameCamera,
  maskAt,
  multiply,
  rotate,
  transformAt,
  translate,
} from "./render";

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
    const est =
      occ && occ.plannedMs === undefined
        ? estimateProduction(s, prod.id).scenes.find((x) => x.occurrenceId === occ.id)
        : undefined;
    // Brukerens planlagte lengde går foran estimatet – samme regel som i monteringen (REQ-0111/0113)
    if (occ?.plannedMs !== undefined) seconds = occ.plannedMs / 1000;
    else if (est) seconds = Math.max(5, est.seconds);
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
  properties: readonly AnimatedProperty[] = KEYFRAME_PROPERTIES,
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
  properties: readonly AnimatedProperty[] = KEYFRAME_PROPERTIES,
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
  properties: readonly AnimatedProperty[] = KEYFRAME_PROPERTIES,
): Keyframe[] {
  return list.map((k) =>
    k.frame === frame && properties.includes(k.property) ? { ...k, easing } : k,
  );
}

/**
 * Styrken på ease ut/inn for nøkkelbildene på et bilde (DEC-0052, REQ-0582): «ut» gjelder bevegelsen
 * videre fra bildet, «inn» bevegelsen fram til det. null fjerner styrken (hastighetskurven gjelder).
 */
export function setKeyframeEase(
  list: readonly Keyframe[],
  frame: number,
  patch: { readonly easeOut?: number | null; readonly easeIn?: number | null },
): Keyframe[] {
  return list.map((k) => {
    if (k.frame !== frame) return k;
    let next: Keyframe = k;
    for (const key of ["easeOut", "easeIn"] as const) {
      const v = patch[key];
      if (v === undefined) continue;
      if (v === null) {
        const { [key]: _drop, ...rest } = next;
        next = rest;
      } else next = { ...next, [key]: Math.min(1, Math.max(0, v)) };
    }
    return next;
  });
}

/**
 * Nøkkelbilder for alle egenskaper på bildet, med verdiene laget har der nå. Med rektangel- eller
 * ellipsemaske får også maskens plassering og størrelse nøkkelbilde (DEC-0072).
 */
export function keyAllAt(l: CompositionLayer, frame: number): Keyframe[] {
  const t = transformAt(l, frame);
  let list: Keyframe[] = [...l.keyframes];
  for (const p of ANIMATED_PROPERTIES) list = setKeyframe(list, p, frame, t[p]);
  const m = maskAt(l, frame);
  if (m && m.kind !== "layer")
    for (const p of MASK_PROPERTIES) list = setKeyframe(list, p, frame, m[MASK_FIELD[p]]);
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
  const base: { -readonly [K in keyof LayerTransform]: number } = { ...fields.transform };
  for (const p of ANIMATED_PROPERTIES) {
    if (next[p] === now[p]) continue;
    // Bevegelsesbanen styrer posisjonen (DEC-0052): x/y endres ved å flytte banen, ikke her
    if (l.path && (p === "x" || p === "y")) continue;
    if (isAnimated(l, p) || opts.autoKey) {
      // Første nøkkelbilde for en egenskap: start fra grunnverdien på bilde 0, så endringen blir en bevegelse
      if (!isAnimated(l, p) && frame > 0) keyframes = setKeyframe(keyframes, p, 0, now[p]);
      keyframes = setKeyframe(keyframes, p, frame, next[p]);
    } else base[p] = next[p];
  }
  return { ...fields, transform: base, keyframes };
}

/** Plassering og størrelse for en rektangel- eller ellipsemaske (lagets egne piksler). */
export interface MaskRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Feltene etter at brukeren har flyttet eller endret størrelsen på masken på et bilde (DEC-0072): samme
 * regel som for lagets plassering. Egenskaper som allerede er animert, får nøkkelbilde på bildet; med
 * `autoKey` får alle endrede egenskaper nøkkelbilde. Ellers endres selve masken (lik i hele scenen).
 * Laget må ha rektangel- eller ellipsemaske; ellers er feltene uendret.
 */
export function fieldsWithMaskAt(
  l: CompositionLayer,
  fields: LayerFields,
  frame: number,
  next: MaskRect,
  opts: { readonly autoKey?: boolean } = {},
): LayerFields {
  const now = maskAt(l, frame);
  const base = fields.mask === undefined ? (l.mask ?? null) : fields.mask;
  if (!now || now.kind === "layer" || !base || base.kind === "layer") return fields;
  let keyframes: Keyframe[] = [...fields.keyframes];
  const shape: { -readonly [K in keyof MaskRect]: number } = {
    x: base.x,
    y: base.y,
    width: base.width,
    height: base.height,
  };
  for (const p of MASK_PROPERTIES) {
    const key = MASK_FIELD[p];
    if (next[key] === now[key]) continue;
    if (isAnimated(l, p) || opts.autoKey) {
      // Første nøkkelbilde: start fra masken som den er på bilde 0, så endringen blir en bevegelse
      if (!isAnimated(l, p) && frame > 0) keyframes = setKeyframe(keyframes, p, 0, now[key]);
      keyframes = setKeyframe(keyframes, p, frame, next[key]);
    } else shape[key] = next[key];
  }
  const mask: LayerMask = { ...base, ...shape };
  return { ...fields, mask, keyframes };
}

/**
 * Masken etter at et håndtak er dratt (dx, dy) i lagets egne piksler (DEC-0072). `handle` -1 flytter hele
 * masken; 0–3 er hjørnene (øverst venstre, øverst høyre, nederst høyre, nederst venstre), og hjørnet rett
 * overfor ligger fast. `keepAspect` beholder forholdet mellom sidene. Minst 1 px, avrundet til 0,1 px.
 */
export function dragMaskRect(
  start: MaskRect,
  handle: number,
  dx: number,
  dy: number,
  keepAspect = false,
): MaskRect {
  const r = (v: number) => Math.round(v * 10) / 10;
  if (handle < 0 || handle > 3) return { ...start, x: r(start.x + dx), y: r(start.y + dy) };
  const sx = handle === 1 || handle === 2 ? 1 : -1;
  const sy = handle >= 2 ? 1 : -1;
  const ox = sx > 0 ? start.x : start.x + start.width;
  const oy = sy > 0 ? start.y : start.y + start.height;
  const cx = (sx > 0 ? start.x + start.width : start.x) + dx;
  const cy = (sy > 0 ? start.y + start.height : start.y) + dy;
  let w = Math.max(1, sx * (cx - ox));
  let h = Math.max(1, sy * (cy - oy));
  if (keepAspect && start.width > 0 && start.height > 0) {
    const f = Math.max(w / start.width, h / start.height);
    w = start.width * f;
    h = start.height * f;
  }
  w = Math.max(1, r(w));
  h = Math.max(1, r(h));
  return { x: r(sx > 0 ? ox : ox - w), y: r(sy > 0 ? oy : oy - h), width: w, height: h };
}

/** Er noe ved masken animert (har minst ett nøkkelbilde)? */
export function isMaskAnimated(l: Pick<CompositionLayer, "keyframes">): boolean {
  return MASK_PROPERTIES.some((p: MaskProperty) => isAnimated(l, p));
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
