/**
 * Sidebryting av manus i bransjestandard (mandat 4.5, 17.x; ADR-0007; KI-08).
 * US Letter, Courier 12 pt (10 tegn per tomme, 6 linjer per tomme). Målene er kalibrert mot
 * referansemanuset (Final Draft 11): 54 tekstlinjer per side, handling 1,5" fra venstre kant.
 *
 * Ren funksjon: samme inndata gir alltid samme sider. Brukes av manusvisning og eksport.
 */
import type { BlockKind } from "../model";

export interface PageLayout {
  readonly linesPerPage: number;
  /** Venstre kant (i tegn fra papirkanten, 10 tegn per tomme) og bredde (tegn) per elementtype. */
  readonly columns: Readonly<Record<BlockKind, { readonly left: number; readonly width: number }>>;
  /** Tomme linjer før hvert element (bortfaller øverst på en side). */
  readonly spaceBefore: Readonly<Record<BlockKind, number>>;
  /** Minste antall linjer av et oppdelt avsnitt eller en replikk på hver side av et sideskift. */
  readonly minSplitLines: number;
  /** Som over, for handling. */
  readonly minActionSplitLines: number;
  /** Hvor avsnitt og replikker kan deles over sideskift. */
  readonly splitAt: "sentence" | "line";
  readonly moreText: string;
  readonly contdSuffix: string;
}

export const US_LETTER_LAYOUT: PageLayout = {
  linesPerPage: 54,
  columns: {
    heading: { left: 15, width: 61 },
    action: { left: 15, width: 61 },
    shot: { left: 15, width: 61 },
    note: { left: 15, width: 61 },
    character: { left: 35, width: 38 },
    parenthetical: { left: 29, width: 25 },
    dialogue: { left: 25, width: 35 },
    transition: { left: 60, width: 15 },
  },
  spaceBefore: {
    heading: 2,
    action: 1,
    shot: 1,
    note: 1,
    character: 1,
    parenthetical: 0,
    dialogue: 0,
    transition: 1,
  },
  minSplitLines: 2,
  minActionSplitLines: 3,
  splitAt: "sentence",
  moreText: "(MORE)",
  contdSuffix: " (CONT'D)",
};

export interface PaginationBlock {
  readonly id: string;
  readonly kind: BlockKind;
  readonly text: string;
  /** Låste sider: blokken begynner på denne siden i originalen. Gir sideskift hvis vi ennå er på en tidligere side. */
  readonly lockedPage?: number;
}

export interface PaginationScene {
  readonly occurrenceId: string;
  /** Scenenummeret som vises i margen (null = unummerert). */
  readonly number: string | null;
  readonly headingText: string;
  readonly blocks: readonly PaginationBlock[];
  readonly lockedPage?: number;
}

export type PageLineKind = BlockKind | "more" | "contd";

export interface PageLine {
  /** Linjenummer på siden (0-basert, 0 = øverste tekstlinje; -1 = «NAVN (CONT'D)» i toppmargen, som i Final Draft). */
  readonly row: number;
  readonly kind: PageLineKind;
  readonly text: string;
  /** Venstre kant i tegn fra papirkanten. */
  readonly left: number;
  readonly occurrenceId: string;
  /** Blokken linjen tilhører (null for overskrift og (MORE)/(CONT'D)). */
  readonly blockId: string | null;
  /** Første linje i blokken? (for redigering og markering) */
  readonly first: boolean;
  readonly sceneNumber?: string | null;
}

export interface Page {
  /** Sidetall (1 = første manusside, uten tittelside). */
  readonly number: number;
  readonly lines: readonly PageLine[];
}

export interface Pagination {
  readonly pages: readonly Page[];
  /** Første side for hver sceneforekomst. */
  readonly sceneStartPage: Readonly<Record<string, number>>;
}

/** Grådig ordbryting. Bryter etter mellomrom og etter bindestrek; for lange ord deles hardt. */
export function wrapText(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const tokens = para.match(/[^\s-]+-+|[^\s-]+|-+|\s+/g) ?? [];
    let line = "";
    for (const tok of tokens) {
      if (/^\s+$/.test(tok)) {
        if (line) line += " ";
        continue;
      }
      const candidate = line + tok;
      if (candidate.trimEnd().length <= width) {
        line = candidate;
        continue;
      }
      if (line.trim()) out.push(line.trimEnd());
      let rest = tok;
      while (rest.length > width) {
        out.push(rest.slice(0, width));
        rest = rest.slice(width);
      }
      line = rest;
    }
    out.push(line.trimEnd());
  }
  return out.length ? out : [""];
}

interface Chunk {
  readonly kind: BlockKind;
  readonly lines: string[];
  readonly blockId: string | null;
  readonly sceneNumber?: string | null;
  /** Karakternavnet replikken tilhører (for (CONT'D) ved sideskift). */
  readonly speaker?: string;
  /** Originalteksten (for deling ved setningsslutt). */
  readonly text?: string;
  readonly lockedPage?: number;
}

/**
 * Del tekst over et sideskift. Final Draft deler handling og replikker bare ved setningsslutt
 * (eller manuelt linjeskift); første del brytes på nytt og får plass på siden.
 */
export function splitForPageBreak(
  text: string,
  width: number,
  room: number,
  minLines: number,
  mode: "sentence" | "line",
): { first: string[]; rest: string[] } | null {
  const all = wrapText(text, width);
  if (mode === "line") {
    if (room < minLines || all.length - room < minLines) return null;
    return { first: all.slice(0, room), rest: all.slice(room) };
  }
  let best: { first: string[]; rest: string[] } | null = null;
  for (const m of text.matchAll(/[.!?…]+["»”')]*[ \t]+|\n/g)) {
    const cut = (m.index ?? 0) + m[0].length;
    const head = text.slice(0, cut).trimEnd();
    const tail = text.slice(cut).replace(/^\n+/, "");
    if (!head || !tail) continue;
    const first = wrapText(head, width);
    if (first.length > room) break;
    const rest = wrapText(tail, width);
    if (first.length >= minLines && rest.length >= minLines) best = { first, rest };
  }
  return best;
}

function rightAlign(text: string, col: { left: number; width: number }): number {
  return Math.max(col.left, col.left + col.width - text.length);
}

export function paginate(
  scenes: readonly PaginationScene[],
  layout: PageLayout = US_LETTER_LAYOUT,
): Pagination {
  const pages: Page[] = [];
  const sceneStartPage: Record<string, number> = {};
  let lines: PageLine[] = [];
  let row = 0;
  const newPage = () => {
    pages.push({ number: pages.length + 1, lines });
    lines = [];
    row = 0;
  };
  const N = layout.linesPerPage;

  for (const scene of scenes) {
    const chunks: Chunk[] = [
      {
        kind: "heading",
        lines: wrapText(scene.headingText.toUpperCase(), layout.columns.heading.width),
        blockId: null,
        sceneNumber: scene.number,
        ...(scene.lockedPage !== undefined ? { lockedPage: scene.lockedPage } : {}),
      },
    ];
    let speaker: string | undefined;
    for (const b of scene.blocks) {
      if (b.kind === "character") speaker = b.text.replace(/\s*\((CONT'D|FORTS\.?)\)\s*$/i, "");
      else if (b.kind !== "dialogue" && b.kind !== "parenthetical") speaker = undefined;
      const col = layout.columns[b.kind];
      chunks.push({
        kind: b.kind,
        lines: wrapText(
          b.kind === "character" || b.kind === "transition" ? b.text.toUpperCase() : b.text,
          col.width,
        ),
        blockId: b.id,
        text: b.text,
        ...(b.lockedPage !== undefined ? { lockedPage: b.lockedPage } : {}),
        ...(speaker !== undefined && (b.kind === "dialogue" || b.kind === "parenthetical")
          ? { speaker }
          : {}),
      });
    }

    let started = false;
    for (let i = 0; i < chunks.length; i++) {
      let ch = chunks[i]!;
      // Bare et hint om neste side: flyttede scener eller omskrevet tekst kan aldri gi hopp over flere sider
      if (ch.lockedPage !== undefined && row > 0 && ch.lockedPage === pages.length + 2) newPage();
      // Øverst på en side bortfaller både standardavstand og forfatterens ekstra tomme linjer
      if (row === 0 && ch.lines.length > 1 && ch.lines[0] === "") {
        const firstText = ch.lines.findIndex((l) => l !== "");
        if (firstText > 0) ch = { ...ch, lines: ch.lines.slice(firstText) };
      }
      const col = layout.columns[ch.kind];
      const space = row === 0 ? 0 : layout.spaceBefore[ch.kind];
      // Hvor mange linjer må følge med på samme side?
      let keep = ch.lines.length;
      const next = chunks[i + 1];
      if (ch.kind === "heading" || ch.kind === "character") {
        // Overskrift og karakternavn står aldri alene nederst på siden
        if (next)
          keep += layout.spaceBefore[next.kind] + Math.min(next.lines.length, layout.minSplitLines);
        if (ch.kind === "character" && next?.kind === "parenthetical") {
          const after = chunks[i + 2];
          if (after?.kind === "dialogue") keep += Math.min(after.lines.length, 1);
        }
      }
      const free = N - row - space;
      const splittable = ch.kind === "action" || ch.kind === "dialogue" || ch.kind === "note";
      if (keep > free) {
        const room = ch.kind === "dialogue" ? free - 1 : free; // plass til (MORE)
        const parts =
          splittable && ch.text !== undefined
            ? splitForPageBreak(
                ch.text,
                col.width,
                room,
                ch.kind === "dialogue" ? layout.minSplitLines : layout.minActionSplitLines,
                layout.splitAt,
              )
            : null;
        if (parts) {
          const { first, rest } = parts;
          // Del avsnittet/replikken over sideskiftet
          row += space;
          pushLines(first, ch, col, true);
          if (ch.kind === "dialogue") {
            lines.push({
              row,
              kind: "more",
              text: layout.moreText,
              left: layout.columns.character.left,
              occurrenceId: scene.occurrenceId,
              blockId: null,
              first: false,
            });
            row++;
          }
          newPage();
          if (ch.kind === "dialogue" && ch.speaker) {
            const t = ch.speaker + layout.contdSuffix;
            lines.push({
              row: -1,
              kind: "contd",
              text: t,
              left: layout.columns.character.left,
              occurrenceId: scene.occurrenceId,
              blockId: null,
              first: false,
            });
          }
          pushLines(rest, ch, col, false);
          continue;
        }
        if (row > 0) {
          // Replikk som flyttes til neste side midt i en replikkgruppe: (MORE)/(CONT'D)
          const midSpeech =
            (ch.kind === "dialogue" || ch.kind === "parenthetical") &&
            ch.speaker &&
            i > 0 &&
            chunks[i - 1]!.kind !== "character";
          if (midSpeech && row < N) {
            lines.push({
              row,
              kind: "more",
              text: layout.moreText,
              left: layout.columns.character.left,
              occurrenceId: scene.occurrenceId,
              blockId: null,
              first: false,
            });
          }
          newPage();
          if (midSpeech) {
            lines.push({
              row: -1,
              kind: "contd",
              text: ch.speaker + layout.contdSuffix,
              left: layout.columns.character.left,
              occurrenceId: scene.occurrenceId,
              blockId: null,
              first: false,
            });
          }
        }
      } else {
        row += space;
      }
      if (!started) {
        sceneStartPage[scene.occurrenceId] = pages.length + 1;
        started = true;
      }
      // Lengre enn en hel side (sjeldent): del hardt
      let rest = ch.lines;
      let first = true;
      while (rest.length > 0) {
        const fit = Math.max(1, N - row);
        pushLines(rest.slice(0, fit), ch, col, first);
        rest = rest.slice(fit);
        first = false;
        if (rest.length) newPage();
      }
    }

    function pushLines(
      ls0: readonly string[],
      ch: Chunk,
      col: { left: number; width: number },
      firstPart: boolean,
    ) {
      let ls = ls0;
      while (row === 0 && ls.length > 1 && ls[0] === "") ls = ls.slice(1);
      ls.forEach((t, k) => {
        lines.push({
          row,
          kind: ch.kind,
          text: t,
          left: ch.kind === "transition" ? rightAlign(t, col) : col.left,
          occurrenceId: scene.occurrenceId,
          blockId: ch.blockId,
          first: firstPart && k === 0,
          ...(ch.kind === "heading" && firstPart && k === 0
            ? { sceneNumber: ch.sceneNumber ?? null }
            : {}),
        });
        row++;
      });
      if (!started) {
        sceneStartPage[scene.occurrenceId] = pages.length + 1;
        started = true;
      }
    }
  }
  if (lines.length) newPage();
  return { pages, sceneStartPage };
}

/** Sceneoverskrift som tekst: «INT. STED - TID». */
export function formatHeading(h: {
  readonly intExt: string;
  readonly location: string;
  readonly time: string;
}): string {
  return [h.intExt, h.location].filter(Boolean).join(" ") + (h.time ? ` - ${h.time}` : "");
}
