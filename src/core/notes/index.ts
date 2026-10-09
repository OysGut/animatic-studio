/**
 * Notater i manus (DEC-0031, REQ-0535–0540) og søketreff i sidevisningen (REQ-0541).
 * Ren logikk: hvor et notat står (også etter at teksten er endret), hvilke linjer på siden som skal markeres,
 * og hva et søk traff i hver scene.
 */
import type { Annotation, BlockKind, ProjectState } from "../model";
import { blocksOfVariant, orderedOccurrences } from "../views";
import { formatHeading, type Page, type PageLine } from "../screenplay/paginate";

/** Scenevarianten et notat hører til (blokkens variant for notater på tekst). */
export function annotationVariant(s: ProjectState, a: Annotation): string | null {
  if (a.variantId !== null) return a.variantId;
  return a.blockId ? (s.blocks[a.blockId]?.variantId ?? null) : null;
}

/** Synlige (ikke slettede) notater i rekkefølge: per variant, nåler først, så etter blokk og posisjon. */
const byVariantCache = new WeakMap<object, WeakMap<object, Map<string, Annotation[]>>>();
export function annotationsByVariant(s: ProjectState): ReadonlyMap<string, readonly Annotation[]> {
  let inner = byVariantCache.get(s.annotations);
  if (!inner) {
    inner = new WeakMap();
    byVariantCache.set(s.annotations, inner);
  }
  let m = inner.get(s.blocks);
  if (!m) {
    m = new Map();
    for (const a of Object.values(s.annotations)) {
      if (a.removed) continue;
      const v = annotationVariant(s, a);
      if (!v) continue;
      const list = m.get(v) ?? [];
      list.push(a);
      m.set(v, list);
    }
    for (const list of m.values())
      list.sort(
        (x, y) =>
          Number(x.blockId !== null) - Number(y.blockId !== null) ||
          (x.blockId ?? "").localeCompare(y.blockId ?? "") ||
          x.start - y.start ||
          x.stampAt.localeCompare(y.stampAt),
      );
    inner.set(s.blocks, m);
  }
  return m;
}

export function annotationsOfVariant(s: ProjectState, variantId: string): readonly Annotation[] {
  return annotationsByVariant(s).get(variantId) ?? [];
}

export interface ResolvedRange {
  readonly start: number;
  readonly end: number;
  /** false = teksten er endret slik at det markerte ikke finnes lenger (notatet vises ved blokkens start). */
  readonly found: boolean;
}

/**
 * Hvor notatet står i blokkens nåværende tekst. Står sitatet fortsatt på samme sted, brukes det;
 * ellers velges forekomsten av sitatet nærmest den opprinnelige plasseringen.
 */
export function resolveRange(a: Annotation, blockText: string): ResolvedRange {
  // Notat på hele elementet
  if (a.quote === "" && a.start === 0 && a.end === 0)
    return { start: 0, end: blockText.length, found: true };
  if (blockText.slice(a.start, a.end) === a.quote && a.end > a.start)
    return { start: a.start, end: a.end, found: true };
  if (a.quote) {
    let best = -1;
    for (let i = blockText.indexOf(a.quote); i >= 0; i = blockText.indexOf(a.quote, i + 1))
      if (best < 0 || Math.abs(i - a.start) < Math.abs(best - a.start)) best = i;
    if (best >= 0) return { start: best, end: best + a.quote.length, found: true };
  }
  return { start: 0, end: Math.min(blockText.length, 1), found: false };
}

/**
 * Kobler linjene på siden til tegnposisjoner i blokkteksten. Sidebrytingen endrer bare mellomrom
 * (og store bokstaver for karakternavn), så tegnene kan følges i rekkefølge.
 * Resultat: for hver linje, blokkposisjonen til hvert tegn (−1 der det ikke kan avgjøres).
 */
export function alignBlockLines(text: string, lines: readonly string[]): number[][] {
  const lower = text.toLocaleLowerCase("nb");
  let i = 0;
  const out: number[][] = [];
  for (const line of lines) {
    const cols: number[] = [];
    const l = line.toLocaleLowerCase("nb");
    for (let j = 0; j < l.length; j++) {
      const c = l[j]!;
      if (c === " ") {
        cols.push(i < lower.length && /\s/.test(lower[i]!) ? i : Math.max(0, i - 1));
        continue;
      }
      while (i < lower.length && /\s/.test(lower[i]!)) i++;
      if (lower[i] === c) {
        cols.push(i);
        i++;
      } else {
        // Uventet tegn: let et lite stykke framover før vi gir opp
        const k = lower.indexOf(c, i);
        if (k >= 0 && k - i < 4) {
          cols.push(k);
          i = k + 1;
        } else cols.push(-1);
      }
    }
    out.push(cols);
  }
  return out;
}

export type MarkKind = "search" | "note";

export interface LineMark {
  /** Kolonner i linjeteksten (fra og med, til). */
  readonly from: number;
  readonly to: number;
  readonly kind: MarkKind;
  readonly annotationIds?: readonly string[];
}

export interface LineDecor {
  readonly marks: readonly LineMark[];
  /** Notater som starter på denne linjen (for symbolet i margen). */
  readonly notesHere: readonly string[];
}

/** Nøkkel for en linje: «side:indeks». */
export const lineKey = (page: number, index: number) => `${page}:${index}`;

function addRange(
  cols: readonly number[],
  start: number,
  end: number,
): { from: number; to: number } | null {
  let from = -1;
  let to = -1;
  for (let c = 0; c < cols.length; c++) {
    const off = cols[c]!;
    if (off >= start && off < end) {
      if (from < 0) from = c;
      to = c + 1;
    }
  }
  return from >= 0 ? { from, to } : null;
}

function findAll(haystack: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + needle.length))
    out.push(i);
  return out;
}

export interface DecorOptions {
  /** Søketekst som skal markeres (store/små bokstaver spiller ingen rolle). */
  readonly query?: string;
  /** Vis notater (REQ-0538). */
  readonly notes?: boolean;
}

/**
 * Markeringer for sidene: søketreff og notater (REQ-0538, REQ-0541).
 * Søketreff i notatteksten markeres på notatets plass i manuset.
 */
export function pageDecorations(
  pages: readonly Page[],
  s: ProjectState,
  opts: DecorOptions,
): Map<string, LineDecor> {
  const out = new Map<string, LineDecor>();
  const q = opts.query?.trim().toLocaleLowerCase("nb") ?? "";
  if (!q && !opts.notes) return out;
  const marks = new Map<string, LineMark[]>();
  const notesHere = new Map<string, string[]>();
  const push = (key: string, m: LineMark) => {
    const list = marks.get(key) ?? [];
    list.push(m);
    marks.set(key, list);
  };
  const pin = (key: string, id: string) => {
    const list = notesHere.get(key) ?? [];
    list.push(id);
    notesHere.set(key, list);
  };

  // Linjene per blokk (i rekkefølge, også over sideskift) og overskriftslinjer per forekomst
  const blockLines = new Map<string, { key: string; line: PageLine }[]>();
  const headingLine = new Map<string, { key: string; line: PageLine }>();
  pages.forEach((p) =>
    p.lines.forEach((l, i) => {
      const key = lineKey(p.number, i);
      if (l.blockId) {
        const list = blockLines.get(l.blockId) ?? [];
        list.push({ key, line: l });
        blockLines.set(l.blockId, list);
      } else if (l.kind === "heading" && l.first) headingLine.set(l.occurrenceId, { key, line: l });
      // Overskrifter: søk direkte i linjeteksten
      if (q && l.kind === "heading") {
        const lower = l.text.toLocaleLowerCase("nb");
        for (const at of findAll(lower, q))
          push(key, { from: at, to: at + q.length, kind: "search" });
      }
    }),
  );

  const byVariant = opts.notes || q ? annotationsByVariant(s) : new Map<string, Annotation[]>();
  for (const [blockId, lines] of blockLines) {
    const block = s.blocks[blockId];
    if (!block) continue;
    const notes = (byVariant.get(block.variantId) ?? []).filter((a) => a.blockId === blockId);
    // Rask vei: ingen notater og ingen treff i blokken
    if (!notes.length && !(q && block.text.toLocaleLowerCase("nb").includes(q))) continue;
    const cols = alignBlockLines(
      block.text,
      lines.map((x) => x.line.text),
    );
    const ranges: { start: number; end: number; kind: MarkKind; ids?: string[] }[] = [];
    if (q) {
      const lower = block.text.toLocaleLowerCase("nb");
      for (const at of findAll(lower, q))
        ranges.push({ start: at, end: at + q.length, kind: "search" });
    }
    for (const a of notes) {
      const r = resolveRange(a, block.text);
      if (opts.notes) ranges.push({ start: r.start, end: r.end, kind: "note", ids: [a.id] });
      // Søketreff i notatteksten vises på notatets plass
      if (q && a.text.toLocaleLowerCase("nb").includes(q))
        ranges.push({ start: r.start, end: r.end, kind: "search" });
      if (opts.notes) {
        // Symbolet i margen står på linjen der notatet begynner
        const idx = cols.findIndex((c) => c.some((off) => off >= r.start));
        const at = lines[Math.max(0, idx)];
        if (at) pin(at.key, a.id);
      }
    }
    for (const r of ranges) {
      lines.forEach((x, li) => {
        const span = addRange(cols[li]!, r.start, r.end);
        if (span)
          push(x.key, {
            ...span,
            kind: r.kind,
            ...(r.ids ? { annotationIds: r.ids } : {}),
          });
      });
    }
  }

  // Nåler på scenen: symbol ved overskriften
  for (const [occId, h] of headingLine) {
    const occ = s.occurrences[occId];
    if (!occ) continue;
    for (const a of byVariant.get(occ.variantId) ?? []) {
      if (a.blockId !== null) continue;
      if (opts.notes) pin(h.key, a.id);
      if (q && a.text.toLocaleLowerCase("nb").includes(q))
        push(h.key, { from: 0, to: h.line.text.length, kind: "search" });
    }
  }

  for (const key of new Set([...marks.keys(), ...notesHere.keys()]))
    out.set(key, { marks: marks.get(key) ?? [], notesHere: notesHere.get(key) ?? [] });
  return out;
}

// ---------- Hva søket traff (REQ-0541) ----------

export type HitKind =
  | "number"
  | "heading"
  | "action"
  | "dialogue"
  | "character"
  | "parenthetical"
  | "transition"
  | "other"
  | "note";

export const HIT_LABEL: Record<HitKind, string> = {
  number: "scenenummer",
  heading: "overskrift",
  action: "handling",
  dialogue: "replikk",
  character: "karakter",
  parenthetical: "parentes",
  transition: "overgang",
  other: "tekst",
  note: "notat",
};

const KIND_HIT: Partial<Record<BlockKind, HitKind>> = {
  action: "action",
  dialogue: "dialogue",
  character: "character",
  parenthetical: "parenthetical",
  transition: "transition",
};

/** Hva fritekstsøket traff i hver scene (tom liste = ingen treff). Søker også i notater. */
export function searchHits(
  s: ProjectState,
  productionId: string,
  query: string,
): Map<string, HitKind[]> {
  const q = query.trim().toLocaleLowerCase("nb");
  const out = new Map<string, HitKind[]>();
  if (!q) return out;
  const notes = annotationsByVariant(s);
  for (const o of orderedOccurrences(s, productionId)) {
    const hits = new Set<HitKind>();
    if ((o.productionNumber ?? "").toLocaleLowerCase("nb").includes(q)) hits.add("number");
    const v = s.variants[o.variantId];
    if (v && formatHeading(v.heading).toLocaleLowerCase("nb").includes(q)) hits.add("heading");
    for (const b of blocksOfVariant(s, o.variantId))
      if (b.text.toLocaleLowerCase("nb").includes(q)) hits.add(KIND_HIT[b.kind] ?? "other");
    for (const a of notes.get(o.variantId) ?? [])
      if (a.text.toLocaleLowerCase("nb").includes(q)) hits.add("note");
    if (hits.size) out.set(o.id, [...hits]);
  }
  return out;
}

/** Stempel for visning: «Mars · 9. okt. 2026 kl. 14:32». */
export function formatStamp(a: Pick<Annotation, "authorName" | "stampAt">): string {
  const d = new Date(a.stampAt);
  const date = Number.isNaN(d.getTime())
    ? a.stampAt
    : `${d.toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" })} kl. ${d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}`;
  return `${a.authorName || "Ukjent"} · ${date}`;
}
export * from "./transfer";
