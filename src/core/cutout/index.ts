/**
 * Frilegging av bilder (DEC-0053, REQ-0580): gjør bakgrunnen gjennomsiktig uten AI og uten kostnad.
 * Automatisk forslag: fargene langs kanten av bildet regnes som bakgrunn, og alt som henger sammen med
 * kanten og har en lignende farge, fjernes (flomfylling fra kanten – hull inne i figuren, som det hvite i
 * øynene, beholdes). Deretter kan masken rettes med pensel (legg til / fjern). Originalen endres aldri:
 * resultatet blir en ny versjon.
 *
 * Masken er én byte per piksel: 255 = beholdes, 0 = gjennomsiktig. Alt her er ren TypeScript uten
 * nettleser-API (testes i Node).
 */

export interface CutoutOptions {
  /** Hvor ulik bakgrunnsfargen en piksel kan være og fortsatt regnes som bakgrunn (0–100). */
  readonly tolerance: number;
  /** Myk kant i piksler (0–4). */
  readonly feather: number;
}

export const DEFAULT_CUTOUT: CutoutOptions = { tolerance: 30, feather: 1 };

type Rgb = readonly [number, number, number];

/** Største fargeavstand (0–100 → 0–MAX_DIST). */
const MAX_DIST = 180;

const dist2 = (r: number, g: number, b: number, c: Rgb) =>
  (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;

/** Indeksene til alle kantpikslene (øverst, nederst, venstre, høyre). */
function borderIndices(w: number, h: number): number[] {
  const out: number[] = [];
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
 * Bakgrunnsfargene: de vanligste fargene langs kanten (grovt gruppert), opptil fire, hver med minst 8 %
 * av kanten. Gjennomsiktige kantpiksler telles ikke.
 */
export function borderColors(rgba: ArrayLike<number>, w: number, h: number): Rgb[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number; sides: number }>();
  let total = 0;
  // Hvilken kant pikselen ligger på (en farge som bare finnes langs én kant, er ofte figuren selv)
  const side = (i: number) => {
    const x = i % w;
    const y = (i - x) / w;
    return (y === 0 ? 1 : 0) | (y === h - 1 ? 2 : 0) | (x === 0 ? 4 : 0) | (x === w - 1 ? 8 : 0);
  };
  for (const i of borderIndices(w, h)) {
    const p = i * 4;
    if (rgba[p + 3]! < 128) continue;
    const r = rgba[p]!;
    const g = rgba[p + 1]!;
    const b = rgba[p + 2]!;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const k = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0, sides: 0 };
    k.n++;
    k.sides |= side(i);
    k.r += r;
    k.g += g;
    k.b += b;
    buckets.set(key, k);
    total++;
  }
  if (total === 0) return [];
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .filter((k, i) => {
      if (i === 0) return true;
      const sides = [1, 2, 4, 8].filter((b) => k.sides & b).length;
      return k.n >= total * 0.08 && sides >= 2;
    })
    .slice(0, 4)
    .map((k) => [k.r / k.n, k.g / k.n, k.b / k.n] as const);
}

/** Har bildet allerede gjennomsiktig bakgrunn (det meste av kanten er gjennomsiktig)? */
export function hasTransparentBorder(rgba: ArrayLike<number>, w: number, h: number): boolean {
  const idx = borderIndices(w, h);
  let clear = 0;
  for (const i of idx) if (rgba[i * 4 + 3]! < 16) clear++;
  return idx.length > 0 && clear / idx.length > 0.5;
}

/**
 * Automatisk maske. Bilder som allerede er frilagt, beholder sin egen gjennomsiktighet. Ellers fjernes alt
 * som henger sammen med kanten og ligner bakgrunnsfargene; overgangsfarger får delvis gjennomsiktighet.
 */
export function autoMask(
  rgba: ArrayLike<number>,
  w: number,
  h: number,
  opts: CutoutOptions = DEFAULT_CUTOUT,
): Uint8Array {
  const n = w * h;
  const mask = new Uint8Array(n).fill(255);
  if (n === 0) return mask;
  // Allerede frilagt: bildets egen gjennomsiktighet beholdes (masken legges oppå den)
  if (hasTransparentBorder(rgba, w, h)) return mask;
  const seeds = borderColors(rgba, w, h);
  if (seeds.length === 0) return mask;
  const tol = (Math.min(100, Math.max(0, opts.tolerance)) / 100) * MAX_DIST;
  const tol2 = tol * tol;
  // Avstand til nærmeste bakgrunnsfarge (kvadrert)
  const near = (i: number) => {
    const p = i * 4;
    if (rgba[p + 3]! < 16) return 0; // gjennomsiktig er alltid bakgrunn
    let best = Infinity;
    for (const c of seeds) best = Math.min(best, dist2(rgba[p]!, rgba[p + 1]!, rgba[p + 2]!, c));
    return best;
  };
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const seen = new Uint8Array(n);
  for (const i of borderIndices(w, h)) {
    if (seen[i]) continue;
    seen[i] = 1;
    if (near(i) <= tol2) {
      mask[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++]!;
    const x = i % w;
    const y = (i - x) / w;
    const visit = (j: number) => {
      if (seen[j]) return;
      seen[j] = 1;
      if (near(j) <= tol2) {
        mask[j] = 0;
        queue[tail++] = j;
      }
    };
    if (x > 0) visit(i - 1);
    if (x < w - 1) visit(i + 1);
    if (y > 0) visit(i - w);
    if (y < h - 1) visit(i + w);
  }
  // Overgangen: piksler ved bakgrunnen som ligner den litt, blir delvis gjennomsiktige
  if (tol > 0) {
    const soft = tol * 1.6;
    for (let i = 0; i < n; i++) {
      if (mask[i] === 0) continue;
      const x = i % w;
      const y = (i - x) / w;
      const edge =
        (x > 0 && mask[i - 1] === 0) ||
        (x < w - 1 && mask[i + 1] === 0) ||
        (y > 0 && mask[i - w] === 0) ||
        (y < h - 1 && mask[i + w] === 0);
      if (!edge) continue;
      const d = Math.sqrt(near(i));
      if (d < soft) mask[i] = Math.round(((d - tol) / (soft - tol)) * 255);
    }
  }
  return feather(mask, w, h, opts.feather);
}

/** Myk kant: uskarphet bare der masken skifter (resten er urørt, så store bilder går raskt). */
export function feather(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const r = Math.round(Math.min(4, Math.max(0, radius)));
  if (r === 0) return mask;
  // Pikslene nær en overgang
  const near = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = mask[i]!;
      const edge = (x < w - 1 && mask[i + 1] !== v) || (y < h - 1 && mask[i + w] !== v);
      if (!edge) continue;
      for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r + 1); yy++)
        for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r + 1); xx++)
          near[yy * w + xx] = 1;
    }
  const out = new Uint8Array(mask);
  for (let i = 0; i < mask.length; i++) {
    if (!near[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    let sum = 0;
    let cnt = 0;
    for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++)
      for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) {
        sum += mask[yy * w + xx]!;
        cnt++;
      }
    out[i] = Math.round(sum / cnt);
  }
  return out;
}

export interface BrushStroke {
  /** Punktene i bildets piksler. */
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly radius: number;
  /** «add»: legg tilbake (synlig), «remove»: fjern (gjennomsiktig). */
  readonly mode: "add" | "remove";
  /** 0–1: hvor hard kanten på penselen er. */
  readonly hardness: number;
}

/** Penselstrøk på masken (endrer masken; returnerer den). Strøket fylles mellom punktene. */
export function paintMask(mask: Uint8Array, w: number, h: number, s: BrushStroke): Uint8Array {
  const r = Math.max(0.5, s.radius);
  const hard = Math.min(1, Math.max(0, s.hardness));
  const stamp = (cx: number, cy: number) => {
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(h - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d > 1) continue;
        const v = d <= hard ? 1 : (1 - d) / (1 - hard || 1);
        const i = y * w + x;
        const a = Math.round(v * 255);
        mask[i] = s.mode === "add" ? Math.max(mask[i]!, a) : Math.min(mask[i]!, 255 - a);
      }
  };
  const pts = s.points;
  if (pts.length === 0) return mask;
  stamp(pts[0]!.x, pts[0]!.y);
  const step = Math.max(0.5, r / 3);
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1]!;
    const b = pts[k]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.ceil(len / step);
    for (let j = 1; j <= steps; j++) {
      const t = j / steps;
      stamp(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    }
  }
  return mask;
}

/** Bildet med masken som gjennomsiktighet (den opprinnelige gjennomsiktigheten tas med). */
export function applyMask(rgba: ArrayLike<number>, mask: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < mask.length; i++) {
    const p = i * 4;
    out[p] = rgba[p]!;
    out[p + 1] = rgba[p + 1]!;
    out[p + 2] = rgba[p + 2]!;
    out[p + 3] = Math.round((rgba[p + 3]! * mask[i]!) / 255);
  }
  return out;
}

/** Andel av bildet som beholdes (0–1), for å vise om forslaget er rimelig. */
export function keptShare(mask: Uint8Array): number {
  if (mask.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < mask.length; i++) sum += mask[i]!;
  return sum / (mask.length * 255);
}

/** Største bilde som friegges i nettleseren (piksler); større bilder skaleres ned først. */
export const CUTOUT_MAX_PIXELS = 16_000_000;
