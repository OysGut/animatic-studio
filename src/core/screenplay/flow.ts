/**
 * Lesevisning uten ark (Mars 2026-10-14, DEC-0080): «Vis kun valgt scene» viser scenen som én sammenhengende
 * tekst, toppjustert, uten sideskift, (MORE), (CONT'D) og sidetall. Manusformen (innrykk og linjebredde)
 * beholdes. Linjene er de samme som på sidene, så markering, notater og søk virker som før.
 */
import type { Page, PageLine } from "./paginate";

export interface FlowLine extends PageLine {
  /** Siden linjen står på i den paginerte visningen (for markeringer, nøkkel «side:indeks»). */
  readonly page: number;
  /** Linjens indeks på siden. */
  readonly index: number;
}

export interface Flow {
  readonly lines: readonly FlowLine[];
  /** Antall linjer i alt (høyden i linjer). */
  readonly rows: number;
}

/**
 * Linjene fra sidene i én sammenhengende flyt: tomrommet nederst på hver side og sideskiftmarkørene fjernes.
 * Fortsetter en blokk over sideskiftet, følger linjene rett etter hverandre; ellers står én tom linje mellom.
 */
export function flowLines(pages: readonly Page[]): Flow {
  const out: FlowLine[] = [];
  let acc = 0;
  let prevLast: PageLine | null = null;
  for (const p of pages) {
    const kept = p.lines
      .map((l, index) => ({ l, index }))
      .filter(({ l }) => l.kind !== "more" && l.kind !== "contd" && l.row >= 0);
    if (!kept.length) continue;
    const min = Math.min(...kept.map((k) => k.l.row));
    const max = Math.max(...kept.map((k) => k.l.row));
    const first = kept.find((k) => k.l.row === min)!.l;
    // Samme blokk fortsetter på neste side: ingen tom linje imellom
    const continues =
      prevLast !== null &&
      !first.first &&
      first.blockId !== null &&
      first.blockId === prevLast.blockId;
    if (prevLast !== null && !continues) acc += 1;
    for (const { l, index } of kept)
      out.push({ ...l, row: acc + (l.row - min), page: p.number, index });
    acc += max - min + 1;
    prevLast = kept.reduce((a, b) => (b.l.row >= a.l.row ? b : a)).l;
  }
  return { lines: out, rows: acc };
}
