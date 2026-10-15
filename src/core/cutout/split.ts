/**
 * Del opp i ruter med delelinjer som kan flyttes (Mars 15.10.2026): hver loddrett og vannrett linje er en
 * brøkdel (0–1) av bildets bredde eller høyde og flyttes for seg. Rutene regnes ut fra linjene, i
 * leserekkefølge (fra venstre mot høyre, ovenfra og ned). Ren TypeScript uten nettleser-API.
 */
import type { PixelBox } from "./index";

/** Minste avstand mellom to delelinjer (og mellom en linje og kanten), som brøkdel av siden. */
export const MIN_LINE_GAP = 0.02;

/** Jevnt fordelte delelinjer for `cells` ruter (cells − 1 linjer). */
export function evenLines(cells: number): number[] {
  const n = Math.max(1, Math.min(12, Math.round(cells)));
  return Array.from({ length: n - 1 }, (_, i) => (i + 1) / n);
}

/**
 * Flytt én delelinje til `to` (brøkdel). Linjen kan ikke krysse naboene: den holdes minst `gap` fra
 * nabolinjene og fra kantene. Returnerer en ny liste.
 */
export function moveLine(
  lines: readonly number[],
  index: number,
  to: number,
  gap = MIN_LINE_GAP,
): number[] {
  const out = [...lines];
  if (index < 0 || index >= out.length || !Number.isFinite(to)) return out;
  const lo = (index > 0 ? out[index - 1]! : 0) + gap;
  const hi = (index < out.length - 1 ? out[index + 1]! : 1) - gap;
  out[index] = lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, to));
  return out;
}

/** Linjene ryddet: innenfor (0, 1), sortert og uten dubletter. */
function cleanLines(lines: readonly number[]): number[] {
  return [...new Set(lines.filter((f) => Number.isFinite(f) && f > 0 && f < 1))].sort(
    (a, b) => a - b,
  );
}

/**
 * Rutene (piksler) fra delelinjene: `xs` er de loddrette linjene og `ys` de vannrette, som brøkdeler av
 * bredden og høyden. Rutene kommer i leserekkefølge og dekker hele bildet uten overlapp.
 */
export function cellsFromLines(
  w: number,
  h: number,
  xs: readonly number[],
  ys: readonly number[],
): PixelBox[] {
  const cx = [0, ...cleanLines(xs).map((f) => Math.round(f * w)), w];
  const cy = [0, ...cleanLines(ys).map((f) => Math.round(f * h)), h];
  const out: PixelBox[] = [];
  for (let j = 0; j < cy.length - 1; j++)
    for (let i = 0; i < cx.length - 1; i++) {
      const x = cx[i]!;
      const y = cy[j]!;
      const bw = cx[i + 1]! - x;
      const bh = cy[j + 1]! - y;
      if (bw > 0 && bh > 0) out.push({ x, y, w: bw, h: bh });
    }
  return out;
}

/** Ruten som inneholder punktet (bildets piksler), eller −1. */
export function cellAt(cells: readonly PixelBox[], x: number, y: number): number {
  return cells.findIndex((c) => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h);
}

/** Navnet på bildet fra en rute: navnet brukeren ga, ellers prefiks + nummer (1-basert). */
export function tileName(names: readonly string[], index: number, prefix: string): string {
  const own = names[index]?.trim();
  return own ? own.slice(0, 200) : `${prefix.trim()} ${index + 1}`.trim();
}
