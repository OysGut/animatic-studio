import { evaluateCharacterFrame } from "../animation/evaluate";
/**
 * Én deterministisk rendringsfunksjon for 2D-scener (ADR-0008, mandat kap. 11–12, 14):
 * `renderFrame(tilstand, 2D-scene, bilde)` → tegneliste. Brukes av editoren, avspillingen og senere eksport,
 * slik at det du ser er det du får. Ingen nettleser-API-er her (tegningen skjer i src/engine/compositor).
 */
import { paddingAt } from "./timing";
import type { LayerEffects, ShapeSpec, TextSpec } from "../typography/types";
import { currentTextMeasurer, layoutText, unitStates, type TextLayout } from "../typography/layout";
import type {
  AnimatedProperty,
  AssetVersion,
  BlendMode,
  CameraFrame,
  Composition,
  CompositionLayer,
  Easing,
  Keyframe,
  LayerMask,
  LayerTransform,
  MotionPath,
  ProjectState,
} from "../model";
import { compareKeys } from "../order-key";
import { MASK_FIELD, isMaskProperty } from "./fields";
import { coverVersion, versionsOf } from "../library";
import { assetSymbol } from "../library/symbol";
import { occurrenceKind, type CreditSequence } from "../model";
import { creditDrawTexts, creditSequenceOf } from "../credits";

/** Rulletekstsekvensen for 2D-scenen, når forekomsten er en rulletekst (MTS MT7). */
export function creditsForComposition(s: ProjectState, compositionId: string): CreditSequence | null {
  const comp = s.compositions[compositionId];
  if (!comp) return null;
  const occ = Object.values(s.occurrences).find(
    (o) => o.variantId === comp.variantId && o.active && occurrenceKind(o) === "credits",
  );
  return occ ? creditSequenceOf(s, occ.id) : null;
}

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

/** Bildet laget viser på et bilde: siste bildeskifte fram til bildet, ellers lagets eget (DEC-0052). */
export function layerImageAt(
  l: CompositionLayer,
  frame: number,
): Pick<CompositionLayer, "assetId" | "assetVariantId" | "versionId"> {
  let img: Pick<CompositionLayer, "assetId" | "assetVariantId" | "versionId"> = l;
  for (const w of l.swaps) if (w.frame <= frame) img = w;
  return img;
}

/**
 * Krysstoning på et bilde (AS2, A2): det forrige bildet (som bilde før byttet) og hvor langt overgangen er
 * kommet (0 → 1), eller null når laget ikke er i en krysstoning.
 */
export function layerCrossfadeAt(
  l: Pick<CompositionLayer, "swaps">,
  frame: number,
): { readonly prevFrame: number; readonly mix: number } | null {
  let cur: (typeof l.swaps)[number] | null = null;
  for (const w of l.swaps) if (w.frame <= frame) cur = w;
  if (!cur?.transition) return null;
  const t = (frame - cur.frame + 1) / (cur.transition.frames + 1);
  if (t >= 1) return null;
  return { prevFrame: cur.frame - 1, mix: Math.max(0, t) };
}

/** Sann når laget er innenfor sitt aktive tidsområde på bildet (AS2, A3). Uten område: alltid. */
export function layerActiveAt(l: Pick<CompositionLayer, "activeRange">, frame: number): boolean {
  const r = l.activeRange;
  return !r || (frame >= r.from && frame <= r.to);
}

/**
 * Bildet laget viser: låst versjon, ellers variantens godkjente versjon, ellers variantens nyeste,
 * ellers ressursens forsidebilde. null for fargeflater og ressurser uten bilder. Med `frame` gjelder
 * bildeskiftene i laget.
 */
export function layerVersion(
  s: ProjectState,
  l: CompositionLayer,
  frame?: number,
): AssetVersion | null {
  const img = frame === undefined ? l : layerImageAt(l, frame);
  if (img.assetId === null) return null;
  if (img.versionId !== null) return s.assetVersions[img.versionId] ?? null;
  if (img.assetVariantId !== null) {
    const va = s.assetVariants[img.assetVariantId];
    if (va?.approvedVersionId) return s.assetVersions[va.approvedVersionId] ?? null;
    return versionsOf(s, img.assetVariantId)[0] ?? null; // nyeste først
  }
  return coverVersion(s, img.assetId);
}

/** Alle bildene laget kan vise (eget bilde og bildeskiftene), for innlasting og eksport. */
export function layerVersions(s: ProjectState, l: CompositionLayer): AssetVersion[] {
  const out: AssetVersion[] = [];
  const own = layerVersion(s, l);
  if (own) out.push(own);
  for (const w of l.swaps) {
    const v = layerVersion(s, l, w.frame);
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Størrelse laget tegnes i før skalering (bildets egen størrelse, ellers lagets lagrede størrelse). */
export function layerSize(
  s: ProjectState,
  l: CompositionLayer,
  frame?: number,
): { width: number; height: number } {
  const own = layerVersion(s, l);
  const box =
    own && own.width && own.height
      ? { width: own.width, height: own.height }
      : { width: l.width, height: l.height };
  if (frame === undefined || layerImageAt(l, frame) === l) return box;
  // Bildeskifte (DEC-0052): det nye bildet tegnes innenfor lagets egen ramme, med sitt eget sideforhold
  const v = layerVersion(s, l, frame);
  if (!v || !v.width || !v.height) return box;
  const k = Math.min(box.width / v.width, box.height / v.height);
  return { width: v.width * k, height: v.height * k };
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

/** Standard styrke (ut, inn) for hastighetskurvene, brukt når bare den ene styrken er satt. */
export const EASE_STRENGTH: Record<Exclude<Easing, "hold">, [number, number]> = {
  linear: [0, 0],
  "ease-in": [0.42, 0],
  "ease-out": [0, 0.42],
  "ease-in-out": [0.42, 0.42],
};

/**
 * Ease med styrke som «influence» i After Effects (DEC-0052, REQ-0582): kurven cubic-bezier(ut, 0,
 * 1 − inn, 1). 0/0 er lineær; høyere styrke gir mykere start (ut) og slutt (inn).
 */
export function easeStrength(out: number, inn: number, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  const x1 = Math.min(1, Math.max(0, out));
  const x2 = 1 - Math.min(1, Math.max(0, inn));
  // Finn u der bezier-x(u) = x (stigende), og gi bezier-y(u)
  const bx = (u: number) => 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
  const by = (u: number) => 3 * (1 - u) * u * u + u * u * u;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (bx(mid) < x) lo = mid;
    else hi = mid;
  }
  return by((lo + hi) / 2);
}

function segmentEase(a: Keyframe, b: Keyframe, t: number): number {
  if (a.easing === "hold" || (a.easeOut === undefined && b.easeIn === undefined))
    return ease(a.easing, t);
  const [o, i] = EASE_STRENGTH[a.easing];
  return easeStrength(a.easeOut ?? o, b.easeIn ?? i, t);
}

/** Verdien av én egenskap på et gitt bilde (mellom nøkkelbilder etter hastighetskurven). */
export function valueAt(l: CompositionLayer, property: AnimatedProperty, frame: number): number {
  const keys = l.keyframes.filter((k) => k.property === property);
  if (keys.length === 0) return baseValue(l, property);
  if (frame <= keys[0]!.frame) return keys[0]!.value;
  const last = keys[keys.length - 1]!;
  if (frame >= last.frame) return last.value;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (frame >= a.frame && frame <= b.frame) {
      const t = b.frame === a.frame ? 1 : (frame - a.frame) / (b.frame - a.frame);
      return a.value + (b.value - a.value) * segmentEase(a, b, t);
    }
  }
  return last.value;
}

/** Grunnverdien (uten nøkkelbilder): fra plasseringen, eller fra masken for maskens egenskaper. */
function baseValue(l: Pick<CompositionLayer, "transform" | "mask">, p: AnimatedProperty): number {
  if (!isMaskProperty(p)) return l.transform[p];
  const m = l.mask;
  return m && m.kind !== "layer" ? m[MASK_FIELD[p]] : 0;
}

/**
 * Masken på et bilde (DEC-0072): rektangel og ellipse følger nøkkelbildene for maskens plassering og
 * størrelse; uten nøkkelbilder (også eldre data) er masken som lagret. Maske av et annet lag er alltid lik.
 */
export function maskAt(l: CompositionLayer, frame: number): LayerMask | null {
  const m = l.mask ?? null;
  if (!m || m.kind === "layer" || !l.keyframes.some((k) => isMaskProperty(k.property))) return m;
  return {
    ...m,
    x: valueAt(l, "maskX", frame),
    y: valueAt(l, "maskY", frame),
    width: Math.max(0, valueAt(l, "maskWidth", frame)),
    height: Math.max(0, valueAt(l, "maskHeight", frame)),
  };
}

// ---------- Bevegelsesbane (DEC-0052) ----------

type Seg = readonly [number, number, number, number, number, number, number, number];

/** Kubiske Bézier-segmenter gjennom punktene: kurvet (Catmull-Rom) gjennom «smooth»-punkter, ellers rett. */
export function pathSegments(path: Pick<MotionPath, "points">): Seg[] {
  const p = path.points;
  const out: Seg[] = [];
  const tangent = (i: number) => {
    const q = p[i]!;
    if (!q.smooth) return { x: 0, y: 0 };
    const a = p[Math.max(0, i - 1)]!;
    const b = p[Math.min(p.length - 1, i + 1)]!;
    return { x: (b.x - a.x) / 6, y: (b.y - a.y) / 6 };
  };
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i]!;
    const b = p[i + 1]!;
    const ta = tangent(i);
    const tb = tangent(i + 1);
    out.push([a.x, a.y, a.x + ta.x, a.y + ta.y, b.x - tb.x, b.y - tb.y, b.x, b.y]);
  }
  return out;
}

function segPoint(g: Seg, t: number): { x: number; y: number } {
  return { x: bezier(g[0], g[2], g[4], g[6], t), y: bezier(g[1], g[3], g[5], g[7], t) };
}

const pathCache = new WeakMap<
  object,
  { lengths: number[]; samples: { x: number; y: number; d: number }[] }
>();

/** Punkter langs banen med avstand fra start (for jevn fart). */
function pathTable(path: MotionPath) {
  let hit = pathCache.get(path);
  if (hit) return hit;
  const samples: { x: number; y: number; d: number }[] = [];
  let d = 0;
  let prev: { x: number; y: number } | null = null;
  for (const g of pathSegments(path)) {
    for (let k = 0; k <= 24; k++) {
      if (prev && k === 0) continue;
      const q = segPoint(g, k / 24);
      if (prev) d += Math.hypot(q.x - prev.x, q.y - prev.y);
      samples.push({ x: q.x, y: q.y, d });
      prev = q;
    }
  }
  hit = { lengths: [d], samples };
  pathCache.set(path, hit);
  return hit;
}

/**
 * Tempokurven (andel av tiden → andel av veien) gjennom (0,0), punktene og (1,1), monoton og myk
 * (Fritsch–Carlson). Uten punkter er den rett (jevn fart).
 */
export function tempoAt(tempo: MotionPath["tempo"], t: number): number {
  const x = Math.min(1, Math.max(0, t));
  if (tempo.length === 0) return x;
  const xs = [0, ...tempo.map((q) => q.t), 1];
  const ys = [0, ...tempo.map((q) => q.p), 1];
  const n = xs.length;
  const dx = xs.slice(1).map((v, i) => v - xs[i]!);
  const sl = ys.slice(1).map((v, i) => (v - ys[i]!) / (dx[i]! || 1e-9));
  const m: number[] = [sl[0]!];
  for (let i = 1; i < n - 1; i++) m.push(sl[i - 1]! * sl[i]! <= 0 ? 0 : (sl[i - 1]! + sl[i]!) / 2);
  m.push(sl[n - 2]!);
  for (let i = 0; i < n - 1; i++) {
    if (sl[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / sl[i]!;
    const b = m[i + 1]! / sl[i]!;
    const h = a * a + b * b;
    if (h > 9) {
      const k = 3 / Math.sqrt(h);
      m[i] = k * a * sl[i]!;
      m[i + 1] = k * b * sl[i]!;
    }
  }
  let i = 0;
  while (i < n - 2 && x > xs[i + 1]!) i++;
  const h = dx[i]! || 1e-9;
  const u = (x - xs[i]!) / h;
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
  const h10 = u ** 3 - 2 * u ** 2 + u;
  const h01 = -2 * u ** 3 + 3 * u ** 2;
  const h11 = u ** 3 - u ** 2;
  return Math.min(
    1,
    Math.max(0, h00 * ys[i]! + h10 * h * m[i]! + h01 * ys[i + 1]! + h11 * h * m[i + 1]!),
  );
}

/** Hvor langt (0–1) laget har kommet langs banen på et bilde: ease ut/inn og tempokurven. */
export function pathProgress(path: MotionPath, frame: number): number {
  const span = path.endFrame - path.startFrame;
  const t = span <= 0 ? 1 : (frame - path.startFrame) / span;
  return tempoAt(path.tempo, easeStrength(path.easeOut, path.easeIn, t));
}

/** Punktet på banen ved andelen `progress` av veien (jevn fart langs banen). */
export function pathPointAt(path: MotionPath, progress: number): { x: number; y: number } {
  const { lengths, samples } = pathTable(path);
  const total = lengths[0]!;
  if (samples.length === 0) return { x: path.points[0]!.x, y: path.points[0]!.y };
  const want = Math.min(1, Math.max(0, progress)) * total;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]!.d < want) lo = mid + 1;
    else hi = mid;
  }
  const b = samples[lo]!;
  const a = samples[Math.max(0, lo - 1)]!;
  const k = b.d === a.d ? 0 : (want - a.d) / (b.d - a.d);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

export function transformAt(l: CompositionLayer, frame: number): LayerTransform {
  // Bevegelsesbanen styrer posisjonen (DEC-0052)
  const at = l.path ? pathPointAt(l.path, pathProgress(l.path, frame)) : null;
  if (l.keyframes.length === 0) return at ? { ...l.transform, x: at.x, y: at.y } : l.transform;
  return {
    x: at ? at.x : valueAt(l, "x", frame),
    y: at ? at.y : valueAt(l, "y", frame),
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
  /** «group»: en gruppe (tegnes ikke; rammen rundt lagene i gruppen, for markering i editoren). */
  readonly kind: "image" | "fill" | "group" | "text";
  /** Bildet som skal tegnes (bare «image»). */
  readonly version: AssetVersion | null;
  readonly fill: string | null;
  /** Lagets egen størrelse; laget tegnes fra (-w/2, -h/2) til (w/2, h/2) gjennom `matrix`. */
  readonly width: number;
  readonly height: number;
  readonly matrix: Matrix;
  readonly opacity: number;
  readonly locked: boolean;
  /** Hidden items can be drawn as editor ghosts but never intercept pointer selection. */
  readonly hidden?: boolean;
  readonly name: string;
  /** Blandingsmodus (REQ-0175). Mangler = «normal». */
  readonly blend?: BlendMode;
  /** Maske (REQ-0175). Mangler = ingen. */
  readonly mask?: ItemMask;
  /**
   * Symbolet for ressursen (DEC-0079) når laget ikke har bilde ennå: tegnes i stedet for bildet (fylt form i
   * ressursens farge), i editoren og i animaticen.
   */
  readonly symbol?: { readonly path: string; readonly color: string };
  /** Tekstlag (MTS): ferdig plasserte tegn med tilstanden fra bokstavanimasjonen på dette bildet. */
  readonly text?: DrawText;
  /** Form for en fargeflate (MTS). Mangler = rektangel. */
  readonly shape?: ShapeSpec;
  /** Skygge, glød og kontur (MTS). */
  readonly effects?: LayerEffects;
}

export interface DrawGlyph {
  readonly char: string;
  readonly x: number;
  readonly y: number;
  readonly opacity: number;
  readonly dx: number;
  readonly dy: number;
  readonly scale: number;
}

export interface DrawText {
  readonly font: string;
  readonly color: string;
  readonly glyphs: readonly DrawGlyph[];
}

const layoutCache = new WeakMap<TextSpec, { key: string; measurer: unknown; layout: TextLayout }>();

/** Tegnene i et tekstlag på et bilde (oppsett hurtiglagres per tekst og størrelse). */
export function textAt(l: CompositionLayer, frame: number): DrawText | undefined {
  const spec = l.text;
  if (!spec) return undefined;
  const m = currentTextMeasurer();
  const key = `${l.width}x${l.height}`;
  let c = layoutCache.get(spec);
  if (!c || c.key !== key || c.measurer !== m) {
    c = { key, measurer: m, layout: layoutText(spec, l.width, l.height, m) };
    layoutCache.set(spec, c);
  }
  const lay = c.layout;
  const local = frame - (l.activeRange?.from ?? 0);
  const states = unitStates(spec.letterAnim, lay.units, local);
  return {
    font: lay.font,
    color: spec.color,
    glyphs: lay.glyphs.map((g) => {
      const st = states[g.unit] ?? { opacity: 1, dx: 0, dy: 0, scale: 1 };
      return { char: g.char, x: g.x, y: g.y, ...st };
    }),
  };
}

/**
 * Masken slik den tegnes. Rektangel/ellipse i tegneelementets egne koordinater (midten av laget er 0,0,
 * samme rom som (-w/2, -h/2)–(w/2, h/2)), så den følger lagets `matrix`. «layer»: tegneelementet for
 * maskelaget (dets egen maske og blanding brukes ikke); dekningen (alfa) bestemmer hva som vises.
 */
export type ItemMask =
  | {
      readonly kind: "rect" | "ellipse";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly feather: number;
      readonly invert: boolean;
    }
  | { readonly kind: "layer"; readonly item: DrawItem; readonly invert: boolean };

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
  /**
   * Bare disse lagene (Asset Studio, «Bare objektet», AS2 A4). Grupper beregnes fortsatt, så lagene står der
   * de står i scenen. Mangler = alle lag.
   */
  readonly onlyLayers?: ReadonlySet<string>;
}

/**
 * Gruppens transformasjon på et bilde (DEC-0052): lagene i gruppen flyttes, roteres og skaleres rundt
 * gruppens ankerpunkt. I hvile (gruppen står på ankerpunktet, uten rotasjon og skalering) er den nøytral.
 */
export function groupMatrixAt(group: CompositionLayer, frame: number): Matrix {
  const t = transformAt(group, frame);
  const a = group.anchor ?? { x: group.transform.x, y: group.transform.y };
  return multiply(modelMatrix(t), translate(-a.x, -a.y));
}

/** Gruppelaget et lag hører til (som ikke er slettet), eller null. */
export function groupOf(s: ProjectState, l: CompositionLayer): CompositionLayer | null {
  if (l.groupId === null) return null;
  const g = s.layers[l.groupId];
  return g && (g.kind === "group" || g.kind === "page") && !g.removed && g.compositionId === l.compositionId ? g : null;
}

/** Tegnelisten for ett bilde av 2D-scenen (bakerst først). */
/**
 * «Animer på toere» (DEC-0079): bildet som vises på `frame` når bevegelsen bare oppdateres hvert `step`-te
 * bilde – som i stop motion. step 1 (standard) gir samme bilde.
 */
export function steppedFrame(frame: number, step: number | undefined): number {
  const n = step && step > 1 ? Math.round(step) : 1;
  return n === 1 ? frame : Math.floor(frame / n) * n;
}

export function renderFrame(
  s: ProjectState,
  compositionId: string,
  frameIn: number,
  opts: RenderOptions = {},
): Frame {
  const c = s.compositions[compositionId];
  if (!c) return { width: 0, height: 0, background: "#000000", items: [] };
  // Fyll i ny tid (SV1): bare i avspilling og eksport (kameravisning), så editoren viser alt innhold
  const padded =
    opts.view === "camera" ? paddingAt(c, frameIn) : { kind: "content" as const, frame: frameIn };
  if (padded.kind === "black")
    return { width: c.width, height: c.height, background: "#000000", items: [] };
  const backgroundOnly = padded.kind === "background";
  // Toere/treere: lag, kamera og bildeskifter følger samme trinnvise tid
  const frame = steppedFrame(padded.frame, c.step);
  const cam = opts.view === "camera" ? cameraAt(c, frame) : null;
  const items: DrawItem[] = [];
  const layers = layersOf(s, compositionId).filter(
    (l) => !backgroundOnly || l.kind === "background",
  );
  const groups = new Map<string, { matrix: Matrix; opacity: number; visible: boolean; fade: number }>();
  for (const l of layers)
    if (l.kind === "group" || l.kind === "page") {
      // Sideovergangen (MTS MT6): lagene i siden tones inn over overgangens bilder fra sidens start
      let fade = 1;
      const pt = l.kind === "page" ? l.pageTransition : null;
      if (pt && l.activeRange) {
        const into = frame - l.activeRange.from;
        if (into >= 0 && into < pt.frames) fade = (into + 1) / pt.frames;
      }
      groups.set(l.id, {
        matrix: groupMatrixAt(l, frame),
        opacity: transformAt(l, frame).opacity,
        // Aktivt område (AS2): en gruppe utenfor sitt område skjuler lagene i gruppen
        visible: l.visible && layerActiveAt(l, frame),
        fade,
      });
    }
  /** Tegneelementet for et lag (uten maske og blanding), med full dekning. */
  // `imageFrame`: bildet som velger lagets bilde (krysstoning tegner også det forrige bildet, AS2)
  const baseItem = (l: CompositionLayer, imageFrame: number = frame): DrawItem => {
    const g = l.groupId ? groups.get(l.groupId) : undefined;
    const t = transformAt(l, frame);
    const view = cam ? viewMatrix(c, cam, l.parallax) : IDENTITY;
    const size = layerSize(s, l, imageFrame);
    const model = g ? multiply(g.matrix, modelMatrix(t)) : modelMatrix(t);
    const img = layerImageAt(l, imageFrame);
    const version = layerVersion(s, l, imageFrame);
    const sym = !version && img.assetId ? assetSymbol(s, img.assetId) : null;
    const text = l.kind === "text" ? textAt(l, frame) : undefined;
    return {
      layerId: l.id,
      kind: text ? "text" : img.assetId === null ? "fill" : "image",
      ...(text ? { text } : {}),
      ...(l.shape ? { shape: l.shape } : {}),
      ...(l.effects ? { effects: l.effects } : {}),
      version,
      ...(sym ? { symbol: { path: sym.path, color: sym.color } } : {}),
      fill: l.fill,
      width: size.width,
      height: size.height,
      matrix: multiply(view, model),
      opacity: t.opacity * (g?.opacity ?? 1) * (g?.fade ?? 1),
      locked: l.locked,
      name: l.name,
    };
  };
  const byId = new Map(layers.map((l) => [l.id, l]));
  for (const l of layers) {
    if (l.kind === "group" || l.kind === "page") continue;
    const g = l.groupId ? groups.get(l.groupId) : undefined;
    const visible = l.visible && (g?.visible ?? true);
    if (!visible && !opts.includeHidden) continue;
    if (opts.onlyLayers && !opts.onlyLayers.has(l.id)) continue;
    // Aktivt tidsområde (AS2, A3): utenfor tegnes laget ikke (samme i editor, avspilling og eksport)
    if (!layerActiveAt(l, frame)) continue;
    const base = baseItem(l);
    const mask = itemMask(l, frame, base, byId, (x) => baseItem(x));
    const opacity = visible ? base.opacity : base.opacity * 0.25;
    const extra = {
      ...(!visible ? { hidden: true } : {}),
      ...(l.blend && l.blend !== "normal" ? { blend: l.blend } : {}),
      ...(mask ? { mask } : {}),
    };
    // Krysstoning (AS2, A2): det forrige bildet tones ut mens det nye tones inn, i sin egen størrelse
    // rundt samme ankerpunkt; animasjonen (transform) er den samme for begge
    const xf = layerCrossfadeAt(l, frame);
    if (xf) {
      const prev = baseItem(l, xf.prevFrame);
      items.push({ ...prev, opacity: opacity * (1 - xf.mix), ...extra });
      items.push({ ...base, opacity: opacity * xf.mix, ...extra });
    } else items.push({ ...base, opacity, ...extra });
  }
  // Grupper og sider i editoren: en ramme rundt lagene i gruppen/siden (tegnes ikke)
  if (!cam)
    for (const l of layers) {
      if (l.kind !== "group" && l.kind !== "page") continue;
      const corners = items
        .filter((it) => s.layers[it.layerId]?.groupId === l.id)
        .flatMap((it) => itemCorners(it));
      const t = transformAt(l, frame);
      const xs = corners.map((p) => p.x);
      const ys = corners.map((p) => p.y);
      const box = corners.length
        ? {
            x: (Math.min(...xs) + Math.max(...xs)) / 2,
            y: (Math.min(...ys) + Math.max(...ys)) / 2,
            w: Math.max(1, Math.max(...xs) - Math.min(...xs)),
            h: Math.max(1, Math.max(...ys) - Math.min(...ys)),
          }
        : { x: t.x, y: t.y, w: 40, h: 40 };
      items.push({
        layerId: l.id,
        kind: "group",
        version: null,
        fill: null,
        width: box.w,
        height: box.h,
        matrix: translate(box.x, box.y),
        opacity: 0,
        locked: l.locked,
        name: l.name,
      });
    }
  // Rulletekst (MTS MT7, §63): deltakerlagene lagres ikke – de lages virtuelt fra sekvensen, deltakerne
  // og tiden, og bare det som er synlig i bildet, tegnes. Samme vei i forhåndsvisning og eksport.
  const credits = creditsForComposition(s, compositionId);
  if (credits && !backgroundOnly) {
    for (const t of creditDrawTexts(s, credits, frame, c.width, c.height)) {
      const spec: TextSpec = {
        content: t.text,
        fontId: "inter",
        size: t.size,
        weight: 400,
        italic: false,
        color: "#ffffff",
        letterSpacing: 0,
        lineHeight: 1.2,
        align: "center",
        vAlign: "top",
        wrap: false,
      };
      const lay = layoutText(spec, c.width, t.size * 1.5);
      items.push({
        layerId: `credit:${t.participantId}`,
        kind: "text",
        version: null,
        fill: null,
        width: c.width,
        height: t.size * 1.5,
        matrix: translate(t.x, t.y + (t.size * 1.5) / 2),
        opacity: t.opacity,
        locked: true,
        name: t.text,
        text: {
          font: lay.font,
          color: spec.color,
          glyphs: lay.glyphs.map((g) => ({ char: g.char, x: g.x, y: g.y, opacity: 1, dx: 0, dy: 0, scale: 1 })),
        },
      });
    }
  }
  return evaluateCharacterFrame(s, compositionId, frame, { width: c.width, height: c.height, background: c.background, items });
}

/**
 * Masken for et lag i tegnelisten (REQ-0175), eller null (ingen maske, eller maskelaget er slettet, er en
 * gruppe eller er laget selv – da vises laget uten maske). Masken av et maskelag brukes ikke (ingen ringer).
 */
function itemMask(
  l: CompositionLayer,
  frame: number,
  base: DrawItem,
  layers: ReadonlyMap<string, CompositionLayer>,
  itemOf: (l: CompositionLayer) => DrawItem,
): ItemMask | null {
  // Animert maske (DEC-0072): plassering og størrelse på dette bildet
  const m = maskAt(l, frame);
  if (!m) return null;
  if (m.kind === "layer") {
    const src = layers.get(m.layerId);
    if (!src || src.removed || src.kind === "group" || src.id === l.id) return null;
    return { kind: "layer", item: itemOf(src), invert: m.invert };
  }
  return {
    kind: m.kind,
    x: m.x - base.width / 2,
    y: m.y - base.height / 2,
    width: m.width,
    height: m.height,
    feather: m.feather,
    invert: m.invert,
  };
}

/**
 * Omrisset av en rektangel- eller ellipsemaske i tegnelistens koordinater (for markering i editoren), eller
 * null for ingen maske eller maske av et annet lag.
 */
export function maskOutline(it: DrawItem, segments = 48): { x: number; y: number }[] | null {
  const m = it.mask;
  if (!m || m.kind === "layer") return null;
  if (m.kind === "rect")
    return [
      applyMatrix(it.matrix, m.x, m.y),
      applyMatrix(it.matrix, m.x + m.width, m.y),
      applyMatrix(it.matrix, m.x + m.width, m.y + m.height),
      applyMatrix(it.matrix, m.x, m.y + m.height),
    ];
  const cx = m.x + m.width / 2;
  const cy = m.y + m.height / 2;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    out.push(
      applyMatrix(it.matrix, cx + (Math.cos(a) * m.width) / 2, cy + (Math.sin(a) * m.height) / 2),
    );
  }
  return out;
}

/** Skaleringen en matrise gir (geometrisk snitt av aksene), for myk kant i lerretets piksler. */
export function matrixScale(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
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
    if (it.kind === "group" || it.hidden) continue; // hidden ghosts never intercept visible layers
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
