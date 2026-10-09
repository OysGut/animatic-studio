/**
 * Kameraoverlegget i sceneeditoren (mandat kap. 12): blå ramme = start, rød ramme = slutt, banen mellom dem
 * med Bézier-håndtak. Rene funksjoner (tegning, treffsjekk, dra-utkast) uten React, slik at de kan testes.
 * Alt er redigeringshjelp og tegnes aldri i kameravisningen eller eksporten.
 */
import {
  cameraCorners,
  shotPath,
  type CameraFrame,
  type CameraShot,
  type Command,
  type Composition,
  type CompositionCamera,
} from "@/core";

export interface Pt {
  x: number;
  y: number;
}
/** Scene → skjerm (CSS-piksler): skjerm = scene · zoom + pan. */
export interface View {
  zoom: number;
  x: number;
  y: number;
}
export type FrameSide = "from" | "to";
export type CameraTarget =
  | { kind: "control"; which: "c1" | "c2" }
  | { kind: "corner"; which: FrameSide; index: number }
  | { kind: "edge"; which: FrameSide }
  | { kind: "inside"; which: FrameSide }
  | { kind: "path" };

export const CAMERA_BLUE = "oklch(0.65 0.18 250)";
export const CAMERA_RED = "oklch(0.62 0.2 25)";
export const MIN_CAMERA_ZOOM = 0.1;
export const MAX_CAMERA_ZOOM = 20;
const EDGE_TOLERANCE = 6;
const CORNER_RADIUS = 8;
const CONTROL_RADIUS = 7;
const HANDLE = 6;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const toScreen = (v: View, p: Pt): Pt => ({ x: p.x * v.zoom + v.x, y: p.y * v.zoom + v.y });

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  return dist(p, { x: a.x + dx * t, y: a.y + dy * t });
}

function distToPolyline(p: Pt, pts: readonly Pt[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++)
    best = Math.min(best, distToSegment(p, pts[i - 1]!, pts[i]!));
  return best;
}

function insideQuad(p: Pt, q: readonly Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % q.length]!;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

const screenCorners = (comp: Pick<Composition, "width" | "height">, f: CameraFrame, v: View) =>
  cameraCorners(comp, f).map((p) => toScreen(v, p));

/** Kommandoen som lagrer kameraet (UpdateComposition krever alle felter). */
export function updateCameraCommand(c: Composition, camera: CompositionCamera): Command {
  return {
    type: "UpdateComposition",
    compositionId: c.id,
    fields: {
      name: c.name,
      width: c.width,
      height: c.height,
      durationFrames: c.durationFrames,
      background: c.background,
    },
    camera,
  };
}

/**
 * Hva ligger under skjermpunktet `p`? Rekkefølge: kontrollpunkter, rammehjørner (bare valgt shot), rammekanter,
 * banen, og til slutt innsiden av en ramme (bare valgt shot; kalleren lar lag under pekeren gå foran).
 */
export function pickCamera(
  shot: CameraShot,
  comp: Pick<Composition, "width" | "height">,
  v: View,
  p: Pt,
  selected: boolean,
): CameraTarget | null {
  if (shot.curve) {
    const c1 = toScreen(v, { x: shot.curve.c1x, y: shot.curve.c1y });
    const c2 = toScreen(v, { x: shot.curve.c2x, y: shot.curve.c2y });
    const d1 = dist(p, c1);
    const d2 = dist(p, c2);
    if (Math.min(d1, d2) <= CONTROL_RADIUS)
      return { kind: "control", which: d1 <= d2 ? "c1" : "c2" };
  }
  const sides: FrameSide[] = ["from", "to"];
  const quads = sides.map((s) => screenCorners(comp, shot[s], v));
  if (selected) {
    let best: { which: FrameSide; index: number; d: number } | null = null;
    sides.forEach((which, si) =>
      quads[si]!.forEach((c, index) => {
        const d = dist(p, c);
        if (d <= CORNER_RADIUS && (!best || d < best.d)) best = { which, index, d };
      }),
    );
    if (best) {
      const b = best as { which: FrameSide; index: number };
      return { kind: "corner", which: b.which, index: b.index };
    }
  }
  let edge: { which: FrameSide; d: number } | null = null;
  sides.forEach((which, si) => {
    const q = quads[si]!;
    for (let i = 0; i < 4; i++) {
      const d = distToSegment(p, q[i]!, q[(i + 1) % 4]!);
      if (d <= EDGE_TOLERANCE && (!edge || d < edge.d)) edge = { which, d };
    }
  });
  if (edge) return { kind: "edge", which: (edge as { which: FrameSide }).which };
  const path = shotPath(shot).map((q) => toScreen(v, q));
  if (distToPolyline(p, path) <= EDGE_TOLERANCE) return { kind: "path" };
  if (selected) {
    let best: { which: FrameSide; d: number } | null = null;
    sides.forEach((which, si) => {
      if (!insideQuad(p, quads[si]!)) return;
      const d = dist(p, toScreen(v, shot[which]));
      if (!best || d < best.d) best = { which, d };
    });
    if (best) return { kind: "inside", which: (best as { which: FrameSide }).which };
  }
  return null;
}

export function cursorFor(t: CameraTarget | null): string | null {
  if (!t) return null;
  if (t.kind === "path") return "pointer";
  if (t.kind === "corner") return "nwse-resize";
  return "move";
}

export const dragLabel = (t: CameraTarget): string =>
  t.kind === "corner"
    ? "Zoom kamera"
    : t.kind === "control"
      ? "Endre kamerabane"
      : "Flytt kameraramme";

/**
 * Utkast til kamerautsnittet mens pekeren dras fra `startScene` til `scene` (scenekoordinater).
 * Flytt: x/y følger pekeren (Shift = bare vannrett eller loddrett). Hjørne: zoom ut fra avstanden til midten.
 */
export function dragCameraShot(
  shot: CameraShot,
  comp: Pick<Composition, "width" | "height">,
  target: CameraTarget,
  startScene: Pt,
  scene: Pt,
  shift: boolean,
): CameraShot {
  let dx = scene.x - startScene.x;
  let dy = scene.y - startScene.y;
  if (shift && target.kind !== "corner") {
    if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
    else dx = 0;
  }
  const r1 = (n: number) => Math.round(n * 10) / 10;
  if (target.kind === "control" && shot.curve) {
    const k = shot.curve;
    return {
      ...shot,
      curve:
        target.which === "c1"
          ? { ...k, c1x: r1(k.c1x + dx), c1y: r1(k.c1y + dy) }
          : { ...k, c2x: r1(k.c2x + dx), c2y: r1(k.c2y + dy) },
    };
  }
  if (target.kind === "edge" || target.kind === "inside") {
    const f = shot[target.which];
    // Kontrollpunktet ved rammen følger med, så kurven beholder formen
    const k = shot.curve;
    const curve = !k
      ? null
      : target.which === "from"
        ? { ...k, c1x: r1(k.c1x + dx), c1y: r1(k.c1y + dy) }
        : { ...k, c2x: r1(k.c2x + dx), c2y: r1(k.c2y + dy) };
    return { ...shot, curve, [target.which]: { ...f, x: r1(f.x + dx), y: r1(f.y + dy) } };
  }
  if (target.kind === "corner") {
    const f = shot[target.which];
    const d = dist(scene, f);
    if (d < 1e-6) return shot;
    const zoom = clamp(
      Math.hypot(comp.width, comp.height) / 2 / d,
      MIN_CAMERA_ZOOM,
      MAX_CAMERA_ZOOM,
    );
    return { ...shot, [target.which]: { ...f, zoom: Math.round(zoom * 1000) / 1000 } };
  }
  return shot;
}

function sameFrame(a: CameraFrame, b: CameraFrame): boolean {
  const e = 1e-6;
  return (
    Math.abs(a.x - b.x) < e &&
    Math.abs(a.y - b.y) < e &&
    Math.abs(a.zoom - b.zoom) < e &&
    Math.abs(a.rotation - b.rotation) < e
  );
}

function outline(ctx: CanvasRenderingContext2D, q: readonly Pt[]) {
  ctx.beginPath();
  q.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
}

function label(ctx: CanvasRenderingContext2D, q: readonly Pt[], text: string, color: string) {
  const top = q.reduce((a, b) => (b.y < a.y ? b : a));
  ctx.fillStyle = color;
  ctx.font = "10px sans-serif";
  ctx.textBaseline = "bottom";
  ctx.fillText(text, top.x + 3, top.y - 3);
}

/** Tegner start- og sluttramme, bane, kontrollpunkter og dagens kamera (alt 1 px). */
export function drawCameraOverlay(
  ctx: CanvasRenderingContext2D,
  shot: CameraShot,
  comp: Pick<Composition, "width" | "height">,
  v: View,
  opts: { selected: boolean; current: CameraFrame | null },
) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  const qFrom = screenCorners(comp, shot.from, v);
  const qTo = screenCorners(comp, shot.to, v);
  const cur = opts.current;
  if (cur && !sameFrame(cur, shot.from) && !sameFrame(cur, shot.to)) {
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    outline(ctx, screenCorners(comp, cur, v));
  }
  // Bane
  const path = shotPath(shot).map((p) => toScreen(v, p));
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  ctx.setLineDash([]);
  if (shot.curve) {
    const c1 = toScreen(v, { x: shot.curve.c1x, y: shot.curve.c1y });
    const c2 = toScreen(v, { x: shot.curve.c2x, y: shot.curve.c2y });
    const a = toScreen(v, shot.from);
    const b = toScreen(v, shot.to);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(c1.x, c1.y);
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.stroke();
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#1a1c21";
    for (const c of [c1, c2]) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  // Rammer
  ctx.strokeStyle = CAMERA_BLUE;
  outline(ctx, qFrom);
  ctx.strokeStyle = CAMERA_RED;
  outline(ctx, qTo);
  label(ctx, qFrom, "Start", CAMERA_BLUE);
  label(ctx, qTo, "Slutt", CAMERA_RED);
  if (opts.selected) {
    for (const [q, color] of [
      [qFrom, CAMERA_BLUE],
      [qTo, CAMERA_RED],
    ] as const) {
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = color;
      for (const c of q) {
        ctx.fillRect(c.x - HANDLE / 2, c.y - HANDLE / 2, HANDLE, HANDLE);
        ctx.strokeRect(c.x - HANDLE / 2 + 0.5, c.y - HANDLE / 2 + 0.5, HANDLE - 1, HANDLE - 1);
      }
    }
  }
  ctx.restore();
}
