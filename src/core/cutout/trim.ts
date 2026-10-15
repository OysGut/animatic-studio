/**
 * «Fjern luften rundt» (DEC-0080, Mars 15.10.2026: «fungerer ikke»): AI-bilder og vinkelark har som regel
 * hvit eller ensfarget bakgrunn, ikke gjennomsiktig. Grensene for figuren finnes derfor først ut fra
 * gjennomsiktighet (frilagte bilder), ellers ut fra en ensfarget bakgrunn: den dominerende fargen langs
 * kanten, når den dekker det meste av kanten. Ren TypeScript uten nettleser-API.
 */
import { alphaBounds, worthTrimming, type PixelBox } from "./index";

export type Rgb3 = readonly [number, number, number];

/** Hvor stor del av kanten bakgrunnsfargen må dekke for at bakgrunnen regnes som ensfarget. */
export const SOLID_BORDER_SHARE = 0.6;
/** Hvor ulik bakgrunnsfargen en piksel må være (avstand i RGB) for å høre til figuren. */
export const SOLID_TOLERANCE = 24;

/** Kantpikslene (indekser), hver én gang. */
function border(w: number, h: number): number[] {
  const out: number[] = [];
  if (w <= 0 || h <= 0) return out;
  for (let x = 0; x < w; x++) {
    out.push(x);
    if (h > 1) out.push((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    out.push(y * w);
    if (w > 1) out.push(y * w + w - 1);
  }
  return out;
}

/**
 * Den ensfargede bakgrunnen: den vanligste fargen langs kanten (gruppert i trinn på 8), som snittfarge –
 * eller null når ingen farge dekker minst `share` av de synlige kantpikslene.
 */
export function solidBackground(
  rgba: ArrayLike<number>,
  w: number,
  h: number,
  share = SOLID_BORDER_SHARE,
): Rgb3 | null {
  const idx = border(w, h);
  if (!idx.length) return null;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (const i of idx) {
    const p = i * 4;
    if ((rgba[p + 3] ?? 0) < 128) continue;
    const r = rgba[p]!;
    const g = rgba[p + 1]!;
    const b = rgba[p + 2]!;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const k = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    k.n++;
    k.r += r;
    k.g += g;
    k.b += b;
    buckets.set(key, k);
  }
  // Den største gruppen gir fargen; andelen telles etterpå med toleranse (en farge rett på grensen mellom
  // to grupper deles ellers i to)
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const k of buckets.values()) if (!best || k.n > best.n) best = k;
  if (!best) return null;
  const c: Rgb3 = [best.r / best.n, best.g / best.n, best.b / best.n];
  // Andelen regnes blant de synlige kantpikslene (et utsnitt med fri markering har gjennomsiktige hjørner)
  let near = 0;
  let seen = 0;
  for (const i of idx) {
    const p = i * 4;
    if ((rgba[p + 3] ?? 0) < 128) continue;
    seen++;
    if (colorDistance(rgba[p]!, rgba[p + 1]!, rgba[p + 2]!, c) <= SOLID_TOLERANCE) near++;
  }
  return seen > 0 && near / seen >= share ? c : null;
}

export function colorDistance(r: number, g: number, b: number, c: Rgb3): number {
  return Math.sqrt((r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2);
}

/**
 * Det minste rektangelet som rommer alle synlige piksler som avviker mer enn `tolerance` fra
 * bakgrunnsfargen, eller null når hele bildet er bakgrunn.
 */
export function solidBounds(
  rgba: ArrayLike<number>,
  w: number,
  h: number,
  bg: Rgb3,
  tolerance = SOLID_TOLERANCE,
): PixelBox | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  const t2 = tolerance * tolerance;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      if ((rgba[p + 3] ?? 0) <= 8) continue;
      const d = (rgba[p]! - bg[0]) ** 2 + (rgba[p + 1]! - bg[1]) ** 2 + (rgba[p + 2]! - bg[2]) ** 2;
      if (d <= t2) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Hva «Fjern luften rundt» kan fjerne:
 * - `ok`: `box` er figuren (uten luft), funnet ut fra gjennomsiktighet (`by: "alpha"`) eller ensfarget
 *   bakgrunn (`by: "color"`);
 * - `full`: figuren fyller allerede (nesten) hele bildet;
 * - `empty`: bildet er bare bakgrunn (helt gjennomsiktig eller én farge);
 * - `no-background`: kanten er verken gjennomsiktig eller ensfarget.
 */
export type TrimResult =
  | { readonly kind: "ok"; readonly box: PixelBox; readonly by: "alpha" | "color" }
  | { readonly kind: "full" | "empty" | "no-background" };

export function findTrim(rgba: ArrayLike<number>, w: number, h: number): TrimResult {
  if (w <= 0 || h <= 0) return { kind: "empty" };
  // 1. Gjennomsiktighet (som før)
  const a = alphaBounds(rgba, w, h);
  if (!a) return { kind: "empty" };
  if (worthTrimming(a, w, h)) return { kind: "ok", box: a, by: "alpha" };
  // 2. Ensfarget bakgrunn (hvit, grå, farget)
  const bg = solidBackground(rgba, w, h);
  if (!bg) return { kind: "no-background" };
  const b = solidBounds(rgba, w, h, bg);
  if (!b) return { kind: "empty" };
  return worthTrimming(b, w, h) ? { kind: "ok", box: b, by: "color" } : { kind: "full" };
}
