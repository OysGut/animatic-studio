/**
 * Én deterministisk rendringsfunksjon for 2D-scener (ADR-0008, mandat kap. 11–12, 14):
 * `renderFrame(tilstand, 2D-scene, bilde)` → tegneliste. Brukes av editoren, avspillingen og senere eksport,
 * slik at det du ser er det du får. Ingen nettleser-API-er her (tegningen skjer i src/engine/compositor).
 */
import type {
  AnimatedProperty,
  AssetVersion,
  CameraFrame,
  Composition,
  CompositionLayer,
  Easing,
  LayerTransform,
  ProjectState,
} from "../model";
import { compareKeys } from "../order-key";
import { coverVersion, versionsOf } from "../library";

/** 2D-transformasjon [a, b, c, d, e, f] som i Canvas: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function translate(x: number, y: number): Matrix {
  return [1, 0, 0, 1, x, y];
}

export function scale(sx: number, sy: number = sx): Matrix {
  return [sx, 0, 0, sy, 0, 0];
}

/** Rotasjon i grader, med klokka (y peker nedover). */
export function rotate(deg: number): Matrix {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}

export function invert(m: Matrix): Matrix | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

export function applyMatrix(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

// ---------- Lag og bilder ----------

/** Per lagsamling (uforanderlig): lagene per 2D-scene, sortert. Avspilling ber om dette hvert bilde. */
const layerCache = new WeakMap<object, Map<string, CompositionLayer[]>>();

/** Lagene i 2D-scenen, bakerst først. Slettede lag er med bare når det bes om. */
export function layersOf(
  s: ProjectState,
  compositionId: string,
  opts: { includeRemoved?: boolean } = {},
): CompositionLayer[] {
  const key = `${compositionId}|${opts.includeRemoved ? 1 : 0}`;
  let byComp = layerCache.get(s.layers);
  if (!byComp) layerCache.set(s.layers, (byComp = new Map()));
  let list = byComp.get(key);
  if (!list) {
    list = Object.values(s.layers)
      .filter((l) => l.compositionId === compositionId && (opts.includeRemoved || !l.removed))
      .sort((a, b) => compareKeys(a.orderKey, b.orderKey));
    byComp.set(key, list);
  }
  return [...list];
}

/** 2D-scenen for en scenevariant (den første som ikke er slettet), eller null. */
export function compositionOfVariant(s: ProjectState, variantId: string): Composition | null {
  return (
    Object.values(s.compositions)
      .filter((c) => c.variantId === variantId && !c.removed)
      .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null
  );
}

/**
 * Bildet laget viser: låst versjon, ellers variantens godkjente versjon, ellers variantens nyeste,
 * ellers ressursens forsidebilde. null for fargeflater og ressurser uten bilder.
 */
export function layerVersion(s: ProjectState, l: CompositionLayer): AssetVersion | null {
  if (l.assetId === null) return null;
  if (l.versionId !== null) return s.assetVersions[l.versionId] ?? null;
  if (l.assetVariantId !== null) {
    const va = s.assetVariants[l.assetVariantId];
    if (va?.approvedVersionId) return s.assetVersions[va.approvedVersionId] ?? null;
    return versionsOf(s, l.assetVariantId)[0] ?? null; // nyeste først
  }
  return coverVersion(s, l.assetId);
}

/** Størrelse laget tegnes i før skalering (bildets egen størrelse, ellers lagets lagrede størrelse). */
export function layerSize(s: ProjectState, l: CompositionLayer): { width: number; height: number } {
  const v = layerVersion(s, l);
  if (v && v.width && v.height) return { width: v.width, height: v.height };
  return { width: l.width, height: l.height };
}

// ---------- Tid: nøkkelbilder og hastighetskurver ----------

export function ease(e: Easing, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  switch (e) {
    case "linear":
      return x;
    case "ease-in":
      return x * x * x;
    case "ease-out":
      return 1 - (1 - x) ** 3;
    case "ease-in-out":
      return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
    case "hold":
      return x >= 1 ? 1 : 0;
  }
}

/** Verdien av én egenskap på et gitt bilde (mellom nøkkelbilder etter hastighetskurven). */
export function valueAt(l: CompositionLayer, property: AnimatedProperty, frame: number): number {
  const keys = l.keyframes.filter((k) => k.property === property);
  if (keys.length === 0) return l.transform[property];
  if (frame <= keys[0]!.frame) return keys[0]!.value;
  const last = keys[keys.length - 1]!;
  if (frame >= last.frame) return last.value;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (frame >= a.frame && frame <= b.frame) {
      const t = b.frame === a.frame ? 1 : (frame - a.frame) / (b.frame - a.frame);
      return a.value + (b.value - a.value) * ease(a.easing, t);
    }
  }
  return last.value;
}

export function transformAt(l: CompositionLayer, frame: number): LayerTransform {
  if (l.keyframes.length === 0) return l.transform;
  return {
    x: valueAt(l, "x", frame),
    y: valueAt(l, "y", frame),
    scaleX: valueAt(l, "scaleX", frame),
    scaleY: valueAt(l, "scaleY", frame),
    rotation: valueAt(l, "rotation", frame),
    opacity: Math.min(1, Math.max(0, valueAt(l, "opacity", frame))),
  };
}

// ---------- Kamera ----------

/** Kameraet som viser hele formatet (ingen shots). */
export function fullFrameCamera(c: Pick<Composition, "width" | "height">): CameraFrame {
  return { x: c.width / 2, y: c.height / 2, zoom: 1, rotation: 0 };
}

function bezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Kameraets utsnitt på et gitt bilde: innenfor et shot langs banen, ellers holdt på nærmeste shot. */
export function cameraAt(c: Composition, frame: number): CameraFrame {
  const shots = c.camera.shots;
  if (shots.length === 0) return fullFrameCamera(c);
  const shot = shots.find((sh) => frame >= sh.startFrame && frame <= sh.endFrame);
  if (!shot) {
    const before = shots.filter((sh) => sh.endFrame < frame);
    if (before.length) return before[before.length - 1]!.to;
    return shots[0]!.from;
  }
  const span = shot.endFrame - shot.startFrame;
  const t = ease(shot.easing, span === 0 ? 1 : (frame - shot.startFrame) / span);
  const { from, to, curve } = shot;
  return {
    x: curve ? bezier(from.x, curve.c1x, curve.c2x, to.x, t) : from.x + (to.x - from.x) * t,
    y: curve ? bezier(from.y, curve.c1y, curve.c2y, to.y, t) : from.y + (to.y - from.y) * t,
    zoom: from.zoom * (to.zoom / from.zoom) ** t, // jevn zoom (geometrisk)
    rotation: from.rotation + (to.rotation - from.rotation) * t,
  };
}

/**
 * Hva laget ser gjennom kameraet, med parallakse (mandat 11.1): et lag med parallakse p ser bare p ganger
 * kameraets forflytning og zoom. p = 1 er scenens plan; bakgrunnen (p < 1) flytter seg mindre.
 */
export function viewMatrix(
  c: Pick<Composition, "width" | "height">,
  cam: CameraFrame,
  parallax: number,
): Matrix {
  const cx = c.width / 2;
  const cy = c.height / 2;
  const px = cx + (cam.x - cx) * parallax;
  const py = cy + (cam.y - cy) * parallax;
  const zoom = 1 + (cam.zoom - 1) * parallax;
  return multiply(
    multiply(multiply(translate(cx, cy), rotate(-cam.rotation)), scale(zoom)),
    translate(-px, -py),
  );
}

export function modelMatrix(t: LayerTransform): Matrix {
  return multiply(multiply(translate(t.x, t.y), rotate(t.rotation)), scale(t.scaleX, t.scaleY));
}

// ---------- Tegnelisten ----------

export interface DrawItem {
  readonly layerId: string;
  readonly kind: "image" | "fill";
  /** Bildet som skal tegnes (bare «image»). */
  readonly version: AssetVersion | null;
  readonly fill: string | null;
  /** Lagets egen størrelse; laget tegnes fra (-w/2, -h/2) til (w/2, h/2) gjennom `matrix`. */
  readonly width: number;
  readonly height: number;
  readonly matrix: Matrix;
  readonly opacity: number;
  readonly locked: boolean;
  readonly name: string;
}

export interface Frame {
  readonly width: number;
  readonly height: number;
  readonly background: string;
  readonly items: readonly DrawItem[];
}

export interface RenderOptions {
  /** «scene»: hele scenen uten kamera (editorvisning). Ellers kameraet på bildet (avspilling/eksport). */
  readonly view?: "scene" | "camera";
  /** Ta med skjulte lag (dempet i editoren). Standard: nei. */
  readonly includeHidden?: boolean;
}

/** Tegnelisten for ett bilde av 2D-scenen (bakerst først). */
export function renderFrame(
  s: ProjectState,
  compositionId: string,
  frame: number,
  opts: RenderOptions = {},
): Frame {
  const c = s.compositions[compositionId];
  if (!c) return { width: 0, height: 0, background: "#000000", items: [] };
  const cam = opts.view === "camera" ? cameraAt(c, frame) : null;
  const items: DrawItem[] = [];
  for (const l of layersOf(s, compositionId)) {
    if (!l.visible && !opts.includeHidden) continue;
    const t = transformAt(l, frame);
    const view = cam ? viewMatrix(c, cam, l.parallax) : IDENTITY;
    const version = layerVersion(s, l);
    const size = layerSize(s, l);
    items.push({
      layerId: l.id,
      kind: l.assetId === null ? "fill" : "image",
      version,
      fill: l.fill,
      width: size.width,
      height: size.height,
      matrix: multiply(view, modelMatrix(t)),
      opacity: l.visible ? t.opacity : t.opacity * 0.25,
      locked: l.locked,
      name: l.name,
    });
  }
  return { width: c.width, height: c.height, background: c.background, items };
}

/** Øverste lag under et punkt (i samme koordinater som tegnelisten), eller null. */
export function hitTest(
  frame: Frame,
  x: number,
  y: number,
  opts: { includeLocked?: boolean } = {},
): DrawItem | null {
  for (let i = frame.items.length - 1; i >= 0; i--) {
    const it = frame.items[i]!;
    if (it.locked && !opts.includeLocked) continue;
    const inv = invert(it.matrix);
    if (!inv) continue;
    const p = applyMatrix(inv, x, y);
    if (Math.abs(p.x) <= it.width / 2 && Math.abs(p.y) <= it.height / 2) return it;
  }
  return null;
}

/** Hjørnene til et tegneelement (for markering og håndtak): øverst venstre, øverst høyre, nederst høyre, nederst venstre. */
export function itemCorners(it: DrawItem): { x: number; y: number }[] {
  const w = it.width / 2;
  const h = it.height / 2;
  return [
    applyMatrix(it.matrix, -w, -h),
    applyMatrix(it.matrix, w, -h),
    applyMatrix(it.matrix, w, h),
    applyMatrix(it.matrix, -w, h),
  ];
}
