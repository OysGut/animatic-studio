/**
 * Notater inn og ut av filer (DEC-0031, REQ-0540): eksport som PDF-merknader og Word-kommentarer, og
 * gjenoppretting når en slik fil importeres igjen – samme tekst, samme sted, samme navn og tidspunkt.
 * Fungerer også for kommentarer andre har skrevet i Word eller merknader i en PDF-leser.
 */
import type { Command, NewAnnotation } from "../commands/types";
import type { Id } from "../ids";
import { newId as defaultNewId } from "../ids";
import type { ProjectState } from "../model";
import type { Page } from "../screenplay/paginate";
import type { ParsedScreenplay } from "../screenplay/types";
import { alignBlockLines, annotationsByVariant, resolveRange } from "./index";

/** Et notat lest fra en fil, festet til en posisjon i kildedokumentet. */
export interface ImportedNote {
  readonly page: number;
  /** Høyden (topp, i punkter) til linjen der notatet begynner – samme målestokk som RawLine.y. */
  readonly y: number;
  /** Teksten notatet er festet til (tom = nål). */
  readonly quote: string;
  readonly text: string;
  readonly author: string;
  /** ISO-tidspunkt fra filen, eller null. */
  readonly date: string | null;
}

/** Ett notat i eksporten, med tekstområde i blokken (eller nål på scenen). */
export interface ExportNote {
  readonly id: string;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly author: string;
  readonly stampAt: string;
}

/** Notater per blokk og nåler per forekomst, for eksport (bare synlige notater). */
export function exportNotes(
  s: ProjectState,
  occurrenceIds: readonly string[],
): { byBlock: Map<string, ExportNote[]>; pins: Map<string, ExportNote[]> } {
  const byBlock = new Map<string, ExportNote[]>();
  const pins = new Map<string, ExportNote[]>();
  const byVariant = annotationsByVariant(s);
  for (const occId of occurrenceIds) {
    const occ = s.occurrences[occId];
    if (!occ) continue;
    for (const a of byVariant.get(occ.variantId) ?? []) {
      const base = { id: a.id, text: a.text, author: a.authorName, stampAt: a.stampAt };
      if (a.blockId === null) {
        pins.set(occId, [...(pins.get(occId) ?? []), { ...base, start: 0, end: 0 }]);
        continue;
      }
      const b = s.blocks[a.blockId];
      if (!b || b.removed) continue;
      const r = resolveRange(a, b.text);
      byBlock.set(b.id, [...(byBlock.get(b.id) ?? []), { ...base, start: r.start, end: r.end }]);
    }
  }
  return { byBlock, pins };
}

/** Hvor et notat står på de ferdige sidene (for PDF-merknader). */
export interface NotePlacement {
  readonly note: ExportNote;
  readonly page: number;
  /** Linjebiter: rad på siden og kolonner fra papirkanten (i tegn). */
  readonly parts: readonly {
    readonly row: number;
    readonly left: number;
    readonly right: number;
  }[];
}

/**
 * Plasserer notatene på de ferdige sidene. `blockTexts` er blokkteksten som ble brutt i linjer
 * (for å koble tegnposisjoner til kolonner på siden).
 */
export function placeNotes(
  pages: readonly Page[],
  blockTexts: ReadonlyMap<string, string>,
  notes: ReturnType<typeof exportNotes>,
): NotePlacement[] {
  const out: NotePlacement[] = [];
  const blockLines = new Map<string, { page: number; row: number; left: number; text: string }[]>();
  for (const p of pages)
    for (const l of p.lines) {
      if (l.blockId) {
        const list = blockLines.get(l.blockId) ?? [];
        list.push({ page: p.number, row: l.row, left: l.left, text: l.text });
        blockLines.set(l.blockId, list);
      } else if (l.kind === "heading" && l.first) {
        for (const n of notes.pins.get(l.occurrenceId) ?? [])
          out.push({
            note: n,
            page: p.number,
            parts: [{ row: l.row, left: l.left, right: l.left + Math.max(1, l.text.length) }],
          });
      }
    }
  for (const [blockId, list] of notes.byBlock) {
    const lines = blockLines.get(blockId);
    const text = blockTexts.get(blockId);
    if (!lines || text === undefined) continue;
    const cols = alignBlockLines(
      text,
      lines.map((l) => l.text),
    );
    for (const n of list) {
      const parts: { page: number; row: number; left: number; right: number }[] = [];
      lines.forEach((l, i) => {
        let from = -1;
        let to = -1;
        cols[i]!.forEach((off, col) => {
          if (off >= n.start && off < n.end) {
            if (from < 0) from = col;
            to = col + 1;
          }
        });
        if (from >= 0)
          parts.push({ page: l.page, row: l.row, left: l.left + from, right: l.left + to });
      });
      if (!parts.length) continue;
      // Et notat over et sideskift blir én merknad per side
      for (const pageNo of [...new Set(parts.map((x) => x.page))])
        out.push({
          note: n,
          page: pageNo,
          parts: parts
            .filter((x) => x.page === pageNo)
            .map(({ row, left, right }) => ({ row, left, right })),
        });
    }
  }
  return out;
}

// ---------- Import ----------

const WS = /\s+/g;

/** Finn sitatet i teksten uten å bry seg om mellomrom, linjeskift og store/små bokstaver. */
export function findQuote(text: string, quote: string): { start: number; end: number } | null {
  const words = quote.trim().split(WS).filter(Boolean);
  if (!words.length) return null;
  const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Ord delt med bindestrek over linjeskift («sju-» / «åring») kan stå uten mellomrom i teksten
  const pattern = words
    .map((w, i) => (i === 0 ? esc(w) : (words[i - 1]!.endsWith("-") ? "\\s*" : "\\s+") + esc(w)))
    .join("");
  const re = new RegExp(pattern, "iu");
  const m = re.exec(text);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

/** Kort ned uten å dele et tegn (emoji o.l. består av to UTF-16-enheter). */
function cut(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length <= max ? s : chars.slice(0, max).join("");
}

const before = (a: { page: number; y: number }, b: { page: number; y: number }) =>
  a.page < b.page || (a.page === b.page && a.y <= b.y + 2);

/**
 * Gjør notater fra filen om til nye notater på de importerte blokkene og scenene.
 * Et notat festes til elementet der det begynner; finnes ikke den markerte teksten der, prøves elementene
 * rett etter (notater over flere linjer). Notater på sceneoverskriften blir nåler på scenen. Kan et notat
 * ikke plasseres, blir det en nål på nærmeste scene med den markerte teksten først (ingenting går tapt).
 */
export function planImportNotes(
  parsed: ParsedScreenplay,
  cmd: Extract<Command, { type: "ImportScreenplay" }>,
  notes: readonly ImportedNote[],
  opts: {
    readonly skipContinuation?: boolean;
    readonly fallbackAuthor: string;
    readonly newId?: <K extends string>() => Id<K>;
  },
): NewAnnotation[] {
  const mk = opts.newId ?? (<K extends string>() => defaultNewId<K>());
  const scenes = parsed.scenes.filter((s) => !(opts.skipContinuation && s.isContinuation));
  // Alle elementer i rekkefølge, med kildeposisjon
  const flat: { scene: number; el: number; page: number; y: number }[] = [];
  scenes.forEach((sc, i) =>
    sc.elements.forEach((e, j) => flat.push({ scene: i, el: j, ...e.source })),
  );
  const out: NewAnnotation[] = [];
  for (const n of notes) {
    const text = cut(n.text.trim(), 9000);
    if (!text || !cmd.scenes.length) continue;
    const stamp = {
      authorName: cut(n.author || opts.fallbackAuthor, 100),
      ...(n.date && !Number.isNaN(Date.parse(n.date))
        ? { stampAt: new Date(n.date).toISOString() }
        : {}),
    };
    // Sceneoverskrift → nål
    const headIdx = scenes.findIndex(
      (sc) => sc.source.page === n.page && Math.abs(sc.source.y - n.y) <= 2 && !sc.isContinuation,
    );
    // Siste scene som starter før notatet
    let sceneIdx = 0;
    scenes.forEach((sc, i) => {
      if (before(sc.source, n)) sceneIdx = i;
    });
    const pin = (prefix: string) => {
      const sc = cmd.scenes[headIdx >= 0 ? headIdx : sceneIdx];
      if (!sc) return;
      out.push({
        annotationId: mk<"annotation">(),
        blockId: null,
        variantId: sc.variantId,
        start: 0,
        end: 0,
        quote: "",
        text: prefix ? cut(`«${prefix}»: ${text}`, 10000) : text,
        ...stamp,
      });
    };
    if (headIdx >= 0 || !n.quote.trim()) {
      pin("");
      continue;
    }
    let at = -1;
    flat.forEach((f, i) => {
      if (before(f, n)) at = i;
    });
    let placed = false;
    for (let k = Math.max(0, at); k < Math.min(flat.length, Math.max(0, at) + 3) && !placed; k++) {
      const f = flat[k]!;
      const block = cmd.scenes[f.scene]?.blocks[f.el];
      if (!block) continue;
      const hit = findQuote(block.text, n.quote);
      if (!hit) continue;
      out.push({
        annotationId: mk<"annotation">(),
        blockId: block.blockId,
        variantId: null,
        start: hit.start,
        end: hit.end,
        quote: block.text.slice(hit.start, hit.end),
        text,
        ...stamp,
      });
      placed = true;
    }
    if (!placed) pin(cut(n.quote.trim(), 200));
  }
  return out;
}
