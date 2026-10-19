/**
 * Fordeling av verktøylinjegrupper når bredden ikke strekker til (U2). Ren funksjon: får gruppenes bredde,
 * tilgjengelig bredde og prioritet, og returnerer indeksene som skal flyttes til «Mer …». Lavest prioritet
 * flyttes først; ved lik prioritet flyttes den siste gruppen først. Plassen til «Mer …»-knappen trekkes fra
 * bare når noe faktisk må flyttes.
 */
export function planToolbarOverflow(
  widths: readonly number[],
  available: number,
  priorities: readonly number[] = [],
  moreWidth = 0,
): number[] {
  const total = widths.reduce((s, w) => s + w, 0);
  if (total <= available) return [];
  const order = widths
    .map((_, i) => i)
    .sort((a, b) => (priorities[a] ?? 0) - (priorities[b] ?? 0) || b - a);
  const hidden = new Set<number>();
  let used = total;
  for (const i of order) {
    if (used + moreWidth <= available) break;
    hidden.add(i);
    used -= widths[i]!;
  }
  return [...hidden].sort((a, b) => a - b);
}

/** Antall primærknapper i en verktøylinje; høyst én er tillatt (U2). */
export function countPrimary(variants: readonly (string | undefined)[]): number {
  return variants.filter((v) => v === "primary").length;
}
