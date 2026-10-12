/**
 * Håndtakene på plakatlerretet (KI-132, DEC-0073): størrelse fra hjørnene og rotasjon fra håndtaket over
 * elementet. Alt regnes i elementets lokale koordinatsystem, så håndtakene virker også når elementet er
 * rotert. Elementet roteres om midtpunktet (samme som tegnelisten), med positive grader med klokka.
 * Rene funksjoner uten React, så de kan testes alene.
 */

export type Corner = "nw" | "ne" | "sw" | "se";

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly rotation: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Minste bredde og høyde (mm) når elementet endres med musen. */
export const MIN_SIZE = 2;

/** Trinnet for rotasjon med Shift (grader). */
export const ROTATION_STEP = 15;

const RAD = Math.PI / 180;

/** Hjørnets retning fra midten: −1 for venstre/oppe, +1 for høyre/nede. */
export function cornerSign(c: Corner): { sx: -1 | 1; sy: -1 | 1 } {
  return { sx: c === "nw" || c === "sw" ? -1 : 1, sy: c === "nw" || c === "ne" ? -1 : 1 };
}

/** Punktet dreid `deg` grader (med klokka i skjermkoordinater, y nedover). */
export function rotatePoint(p: Point, deg: number): Point {
  const a = deg * RAD;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

export function boxCenter(b: Box): Point {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** Vinkelen normalisert til (−180, 180] og avrundet til 0,1 grad. */
export function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  const r = Math.round(a * 10) / 10;
  return r === 0 ? 0 : r;
}

/**
 * Ny ramme når hjørnet `corner` dras fra `start` til `p` (plakatens millimeter). Det motsatte hjørnet står
 * stille på plakaten; rotasjonen beholdes. Med `keepRatio` beholdes forholdet mellom bredde og høyde.
 */
export function resizeBox(
  orig: Box,
  corner: Corner,
  start: Point,
  p: Point,
  keepRatio: boolean,
): { x: number; y: number; w: number; h: number } {
  const { sx, sy } = cornerSign(corner);
  // Musens bevegelse i elementets lokale akser
  const d = rotatePoint({ x: p.x - start.x, y: p.y - start.y }, -orig.rotation);
  let w = Math.max(MIN_SIZE, orig.w + sx * d.x);
  let h = Math.max(MIN_SIZE, orig.h + sy * d.y);
  if (keepRatio && orig.w > 0 && orig.h > 0) {
    // Den aksen som er dratt mest, bestemmer; den andre følger forholdet
    const f = Math.max(w / orig.w, h / orig.h, MIN_SIZE / Math.min(orig.w, orig.h));
    w = orig.w * f;
    h = orig.h * f;
  }
  // Det faste hjørnet (lokalt, fra det gamle midtpunktet) og det nye midtpunktet
  const ax = (-sx * orig.w) / 2;
  const ay = (-sy * orig.h) / 2;
  const local = { x: ax + (sx * w) / 2, y: ay + (sy * h) / 2 };
  const c = boxCenter(orig);
  const off = rotatePoint(local, orig.rotation);
  const cx = c.x + off.x;
  const cy = c.y + off.y;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/**
 * Ny rotasjon når rotasjonshåndtaket dras fra `start` til `p`: vinkelen musen har dreid rundt midtpunktet,
 * lagt til den opprinnelige rotasjonen. Med `snap` i trinn på 15°.
 */
export function rotateBox(orig: Box, start: Point, p: Point, snap: boolean): number {
  const c = boxCenter(orig);
  const a0 = Math.atan2(start.y - c.y, start.x - c.x);
  const a1 = Math.atan2(p.y - c.y, p.x - c.x);
  const deg = orig.rotation + (a1 - a0) / RAD;
  return normalizeAngle(snap ? Math.round(deg / ROTATION_STEP) * ROTATION_STEP : deg);
}

/** Musepekeren for et hjørne, dreid med elementet (nærmeste av de fire pilretningene). */
export function cornerCursor(corner: Corner, rotation: number): string {
  const base = { se: 45, sw: 135, nw: 225, ne: 315 }[corner];
  const a = (((base + rotation) % 180) + 180) % 180;
  const i = Math.round(a / 45) % 4;
  return ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"][i]!;
}

export type DragMode = "move" | Corner | "rotate";

/** Rammen etter et dra med musen fra `start` til `p` (uten avrunding, til visningen under draget). */
export function dragGeometry(
  mode: DragMode,
  orig: Box,
  start: Point,
  p: Point,
  shift: boolean,
): Partial<Box> {
  if (mode === "move") return { x: orig.x + p.x - start.x, y: orig.y + p.y - start.y };
  if (mode === "rotate") return { rotation: rotateBox(orig, start, p, shift) };
  return resizeBox(orig, mode, start, p, shift);
}

/** Endringen som lagres: avrundet til 0,1 mm (og 0,1 grad), og bare feltene som faktisk er endret. */
export function changedFields(orig: Box, patch: Partial<Box>): Partial<Box> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(patch) as [keyof Box, number][]) {
    const r = Math.round(v * 10) / 10;
    if (r !== orig[k]) out[k] = r;
  }
  return out as Partial<Box>;
}
