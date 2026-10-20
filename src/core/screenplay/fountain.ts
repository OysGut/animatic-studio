/**
 * Fountain (https://fountain.io/syntax) – import og eksport av manus som ren tekst (REQ-0089, DEC-0013).
 *
 * Import gir samme mellomformat som PDF/DOCX (`ParsedScreenplay` + notater), slik at scenedeteksjon, forhåndsvisning
 * og opprettelse av scener går gjennom samme rørledning (planImport / planImportNotes).
 * Eksport tar samme inndata som DOCX (`PaginationScene[]` fra exportPaginationInput) og bruker tvungne elementer
 * (`!`, `@`, `.`, `>`) der det trengs for at en ny import gir samme elementtyper.
 *
 * Markering manusmodellen ikke har egne felt for (DEC-0073, KI-164):
 * - Dobbel dialog (`NAVN ^`), sentrert tekst (`> tekst <`) og sangtekst (`~tekst`) blir vanlige blokker
 *   (karakter/replikk og handling) med ren tekst, og markeringen lagres i blokkens kildereferanse
 *   (`sourceRef.fountain`, se FountainMarks i types.ts). Valget er gjort fordi nye blokktyper eller kolonner
 *   krever migrasjon og berører visning, PDF/DOCX, oversettelse og karakterlister, mens tegn som `^` og `> <`
 *   i teksten ville blitt med i navn, PDF og DOCX. `sourceRef` er jsonb og kopieres uendret ved import,
 *   splitting og sammenslåing, så en rundtur Fountain → Animatic Studio → Fountain gir samme markering.
 *   Manusvisningen og PDF/DOCX viser foreløpig ikke dobbel dialog side om side eller sentrering.
 * - Dobbel dialog merkes usikker bare når det ikke står en replikk rett foran (da er det uklart hvem som
 *   snakker samtidig); ellers er tolkningen sikker.
 *
 * Andre forenklinger:
 * - «shot» og «note»-blokker eksporteres som handling.
 * - Fountain har ingen faste sider: sidetallet ved import er beregnet med manusvisningens sidebryting, og
 *   kildereferansens side teller bare eksplisitte sideskift (`===`).
 * - Notater er punktmerker i Fountain og eksporteres der notatområdet slutter. Ved import festes notatet til
 *   blokken og linjen merket står på, og dekker teksten foran merket på samme linje, slik at det havner på
 *   riktig tegnposisjon også når samme tekst står flere steder i blokken. Notat først på en linje dekker
 *   teksten etter; notat på egen linje blir nål på scenen.
 *
 * Ren TypeScript uten DOM (ADR-0003).
 */
import { findQuote, type ImportedNote } from "../notes/transfer";
import { formatHeading, paginate, type PaginationScene } from "./paginate";
import { parseHeading } from "./parse";
import type {
  FountainMarks,
  ParsedElement,
  ParsedScene,
  ParsedScreenplay,
  SourceRef,
} from "./types";
import type { BlockKind, SceneHeading } from "../model";

import { t as tk } from "@/core/i18n/keyed";

/** Linjehøyde i den virtuelle kildereferansen (samme målestokk som RawLine.y: 12 pt per linje). */
const LINE = 12;

// ---------- Felles regler (brukes av både import og eksport, så de alltid er enige) ----------

/** Sceneoverskrift uten tvang: INT, EXT, EST, INT./EXT, INT/EXT, I/E fulgt av punktum eller mellomrom. */
const AUTO_HEADING_RE = /^(?:INT\.?\/EXT|INT\/EXT|INT|EXT|EST|I\/E)[.\s]/i;
/** Tvungen sceneoverskrift: ett punktum fulgt av bokstav eller tall (ikke «...»). */
const FORCED_HEADING_RE = /^\.(?=[\p{L}\p{N}])/u;
/** Scenenummer på slutten av overskriften: #42A#, #I-1-A#, #1.2# */
const SCENE_NUMBER_RE = /\s*#([\p{L}\p{N}.-]+)#\s*$/u;
const PAGE_BREAK_RE = /^={3,}\s*$/;
/** Sentrert linje: «> tekst <». */
const CENTERED_RE = /^\s*>(.*)<\s*$/;
const TITLE_KEYS = new Set([
  "title",
  "credit",
  "author",
  "authors",
  "source",
  "draft date",
  "date",
  "contact",
  "copyright",
  "notes",
  "revision",
]);

/** Linje med nøyaktig to mellomrom = tom linje inne i et element (Fountain-spesifikasjonen). */
const SPACER = "  ";

function hasLetter(s: string): boolean {
  return /\p{L}/u.test(s);
}

/** Store bokstaver (parentetiske tillegg som «(V.O.)» eller «(on the radio)» teller ikke). */
function isUpperName(s: string): boolean {
  const name = s.replace(/\([^)]*\)/g, "").trim();
  return name.length > 0 && hasLetter(name) && name === name.toLocaleUpperCase("nb");
}

type LineClass =
  | "heading"
  | "transition"
  | "centered"
  | "character"
  | "special" // tvunget eller ikke-manustekst (notat, avsnitt, synopsis, sideskift, sangtekst, boneyard)
  | "action";

/**
 * Hvordan en linje som står først etter en tom linje tolkes. `nextBlank` = linjen etter er tom (eller filslutt).
 * Eksporten bruker samme funksjon til å avgjøre når et element må tvinges.
 */
export function classifyFountainLine(line: string, nextBlank: boolean): LineClass {
  const t = line.trim();
  if (t === "") return "action";
  if (/^(!|@|~|=|#|\[\[|\/\*)/.test(t) || PAGE_BREAK_RE.test(t)) {
    if (t.startsWith("!")) return "action";
    if (t.startsWith("@")) return "character";
    return "special";
  }
  if (FORCED_HEADING_RE.test(t) || AUTO_HEADING_RE.test(t)) return "heading";
  if (t.startsWith(">")) return t.endsWith("<") ? "centered" : "transition";
  if (nextBlank && isUpperName(t) && t.endsWith("TO:")) return "transition";
  if (!nextBlank && isUpperName(t.replace(/\^\s*$/, ""))) return "character";
  return "action";
}

// ---------- Innebygd formatering (*kursiv*, **fet**, _understreket_, \* escape) ----------

const ESC: Record<string, string> = { "*": "\uE000", _: "\uE001" };

/** Fjerner Fountain-utheving og escape-tegn (datamodellen har ikke utheving). */
function inline(s: string): string {
  let out = s.replace(/\\([*_])/g, (_m, c: string) => ESC[c]!);
  out = out.replace(/(\*{1,3})(?=\S)([^*\n]*?\S)\1/g, "$2");
  out = out.replace(/_(?=\S)([^_\n]*?\S)_/g, "$1");
  return out.replace(/\uE000/g, "*").replace(/\uE001/g, "_");
}

/** Escape av tegn som ellers blir tolket som utheving. */
function escapeInline(s: string): string {
  // «[[» ville blitt et notat ved ny import: skilles med et mellomrom
  return s
    .replace(/[*_]/g, (c) => `\\${c}`)
    .replace(/\[\[/g, "[ [")
    .replace(/\]\]/g, "] ]");
}

// ---------- Import ----------

export interface FountainImport {
  readonly parsed: ParsedScreenplay;
  /** Fountain-notater `[[…]]` – gjenopprettes som notater ved import (DEC-0031). */
  readonly notes: readonly ImportedNote[];
}

interface Row {
  /** Linjen uten notater og boneyard. */
  readonly raw: string;
  /** Notater som stod på linjen: kolonne i `raw` og innhold. */
  readonly notes: readonly { readonly col: number; readonly text: string }[];
}

/** Fjerner notater, men husker hvor de stod. Linjer som bare bestod av notater fjernes helt. */
function extractNotes(text: string): { rows: Row[]; dropped: { after: number; text: string }[] } {
  const rows: Row[] = [];
  const dropped: { after: number; text: string }[] = [];
  let cur = "";
  let curNotes: { col: number; text: string }[] = [];
  let i = 0;
  const flush = () => {
    const hadNote = curNotes.length > 0;
    if (hadNote && cur.trim() === "" && cur !== SPACER) {
      for (const n of curNotes) dropped.push({ after: rows.length - 1, text: n.text });
    } else rows.push({ raw: cur, notes: curNotes });
    cur = "";
    curNotes = [];
  };
  while (i < text.length) {
    if (text.startsWith("[[", i)) {
      const end = text.indexOf("]]", i + 2);
      if (end >= 0) {
        curNotes.push({ col: cur.length, text: text.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    const ch = text[i]!;
    if (ch === "\n") flush();
    else cur += ch;
    i++;
  }
  flush();
  return { rows, dropped };
}

/** «Navn (2026-10-12): tekst» (slik eksporten skriver dem) → forfatter, dato og tekst. */
function noteFields(raw: string): { text: string; author: string; date: string | null } {
  const body = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  const m = /^([^\n:]{1,100}?) \((\d{4}-\d{2}-\d{2})\): ([\s\S]+)$/.exec(body);
  if (m) return { author: m[1]!.trim(), date: m[2]!, text: m[3]!.trim() };
  return { author: "", date: null, text: body };
}

function isBlankRow(r: Row): boolean {
  return r.raw.trim() === "" && r.raw !== SPACER;
}

function fountainHeading(raw: string): SceneHeading {
  const text = raw.trim().replace(/\s+/g, " ");
  const m =
    /^(INT\.?\s*\/\s*EXT\.?|INT\/EXT\.?|EST\.?|I\/E\.?|INT\.?|EXT\.?)(?=[\s.]|$)\s*(.*)$/i.exec(
      text,
    );
  if (!m) return parseHeading(text);
  const intExt = m[1]!.toUpperCase().replace(/\s+/g, "");
  const rest = m[2]!;
  // Bindestrek, tankestrek eller lang tankestrek mellom sted og tid
  const m2 = /^(.*\S)\s+[-–—]\s+(\S.*)$/.exec(rest);
  if (m2) return { intExt, location: m2[1]!.trim(), time: m2[2]!.trim() };
  return { intExt, location: rest.trim(), time: "" };
}

/** Tittelsiden: «Nøkkel: verdi» øverst i filen, avsluttet av første tomme linje. */
function readTitlePage(lines: readonly string[]): { titlePage: string[]; consumed: number } {
  let start = 0;
  while (start < lines.length && lines[start]!.trim() === "") start++;
  const first = lines[start];
  const key = first ? /^([A-Za-z][A-Za-z ]*):(.*)$/.exec(first.trim()) : null;
  if (!key || !TITLE_KEYS.has(key[1]!.trim().toLowerCase())) return { titlePage: [], consumed: 0 };
  const titlePage: string[] = [];
  let i = start;
  for (; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.trim() === "") break;
    const kv = /^([A-Za-z][A-Za-z ]*):(.*)$/.exec(l.trim());
    const indented = /^(\t| {3,})/.test(l);
    if (kv && !indented) {
      const v = kv[2]!.trim();
      if (v) titlePage.push(inline(v));
    } else titlePage.push(inline(l.trim()));
  }
  return { titlePage, consumed: i };
}

/** Teksten foran et notat på samme linje, uten tvangstegn og formatering (brukes til å feste notatet). */
function quoteBefore(raw: string, col: number): string {
  const before = inline(raw.slice(0, col).replace(/^\s*[!@~.>]/, "")).trim();
  if (before) return before;
  return inline(raw.slice(col).replace(/^\s*[!@~.>]/, "")).trim();
}

/** Teksten foran notatet slik den står i blokken: uten tvangstegn, sentrering, sangtegn, «^» og formatering. */
function cleanBefore(raw: string, col: number): string {
  let t = raw.slice(0, col).replace(/^\s*[!@~.>]/, "");
  if (CENTERED_RE.test(raw)) t = t.replace(/\s*<\s*$/, "");
  return inline(t.replace(/\s*\^\s*$/, "")).trim();
}

/** Hvor en rad havnet: teksten i blokken og linjenummeret i den. */
interface RowPlace {
  readonly text: string;
  readonly line: number;
}

/**
 * Teksten notatet skal dekke, valgt slik at planImportNotes (som tar første treff i blokken) finner nøyaktig
 * riktig sted: teksten fra linjestart frem til merket, eller fra blokkstart hvis samme tekst står tidligere i
 * blokken. Notat først på linjen dekker resten av linjen. Faller tilbake til teksten rundt merket.
 */
function noteQuote(raw: string, col: number, place: RowPlace | undefined): string {
  const fallback = quoteBefore(raw, col);
  if (!place) return fallback;
  const lines = place.text.split("\n");
  const line = lines[place.line];
  if (line === undefined) return fallback;
  const lineStart = lines.slice(0, place.line).reduce((n, l) => n + l.length + 1, 0);
  const before = cleanBefore(raw, col);
  const exact = (q: string, at: "start" | "end", pos: number) => {
    const hit = findQuote(place.text, q);
    return hit !== null && (at === "end" ? hit.end === pos : hit.start === pos);
  };
  if (before) {
    const p = line.indexOf(before);
    if (p < 0) return fallback;
    const end = lineStart + p + before.length;
    for (const from of [lineStart + p, 0]) {
      const q = place.text.slice(from, end).trim();
      if (q && exact(q, "end", end)) return q;
    }
    return fallback;
  }
  const start = lineStart + (line.length - line.trimStart().length);
  for (const to of [lineStart + line.length, place.text.length]) {
    const q = place.text.slice(start, to).trim();
    if (q && exact(q, "start", start)) return q;
  }
  return fallback;
}

/**
 * Tolker en Fountain-fil. Gir samme struktur som PDF/DOCX-tolkningen, med kildereferanse
 * `{ page: eksplisitt side (===), y: linjenummer × 12 }`.
 */
export function parseFountain(source: string): FountainImport {
  let text = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  // Boneyard /* … */ ignoreres helt (også over flere linjer)
  text = text.replace(/\/\*[\s\S]*?\*\//g, "");

  const allLines = text.split("\n");
  const { titlePage, consumed } = readTitlePage(
    allLines.map((l) => l.replace(/\[\[[^\]]*\]\]/g, "")),
  );
  const body = allLines.slice(consumed).join("\n");
  const { rows, dropped } = extractNotes(body);

  // Side per rad (eksplisitte sideskift)
  const pageOf: number[] = [];
  let page = 1;
  for (const r of rows) {
    if (PAGE_BREAK_RE.test(r.raw.trim())) page++;
    pageOf.push(page);
  }
  const src = (i: number): SourceRef => ({ page: pageOf[i] ?? page, y: i * LINE });

  interface MutScene {
    number: string | null;
    rawHeading: string;
    heading: SceneHeading;
    source: SourceRef;
    isContinuation?: boolean;
    elements: ParsedElement[];
    warnings: string[];
  }
  const scenes: MutScene[] = [];
  let current: MutScene | null = null;
  const notes: ImportedNote[] = [];

  // Hvilken blokk og linje hver rad havnet i (for å feste notater på riktig tegn)
  const placeOf = new Map<number, RowPlace>();
  const lastKind = (): BlockKind | undefined => {
    const els = scenes[scenes.length - 1]?.elements;
    return els?.[els.length - 1]?.kind;
  };

  const push = (
    kind: BlockKind,
    text: string,
    at: number,
    opts: {
      readonly uncertain?: string;
      readonly marks?: FountainMarks;
      /** Raden hver linje i teksten kom fra. */
      readonly rows?: readonly number[];
    } = {},
  ) => {
    const { uncertain, marks } = opts;
    (opts.rows ?? [at]).forEach((r, line) => placeOf.set(r, { text, line }));
    if (!current) {
      current = {
        number: null,
        rawHeading: "",
        heading: { intExt: "", location: "", time: "" },
        source: src(at),
        isContinuation: true,
        elements: [],
        warnings: [
          tk("core-screenplay-fountain.warnings.warnings.69599da8d826"),
        ],
      };
      scenes.push(current);
    }
    const source = marks
      ? {
          ...src(at),
          fountain:
            marks.centered || marks.lyrics ? { ...marks, textHash: fountainTextHash(text) } : marks,
        }
      : src(at);
    current.elements.push({ kind, text, source, ...(uncertain ? { uncertain } : {}) });
  };

  const isSkip = (r: Row) => {
    const t = r.raw.trim();
    // Sideskift, avsnittsoverskrifter (#) og synopsis (=) er ikke manustekst
    return PAGE_BREAK_RE.test(t) || t.startsWith("#") || (t.startsWith("=") && !t.startsWith("=="));
  };
  // Slutt på et element: tom linje, sideskift eller filslutt
  const blank = (i: number) =>
    i >= rows.length || isBlankRow(rows[i]!) || PAGE_BREAK_RE.test(rows[i]!.raw.trim());

  let i = 0;
  while (i < rows.length) {
    const row = rows[i]!;
    if (isBlankRow(row) || isSkip(row)) {
      i++;
      continue;
    }
    const t = row.raw.trim();
    const cls = classifyFountainLine(row.raw, blank(i + 1) || isSkip(rows[i + 1] ?? row));

    if (cls === "heading") {
      const h = t.startsWith(".") ? t.slice(1) : t;
      const num = SCENE_NUMBER_RE.exec(h);
      const headingText = inline((num ? h.slice(0, num.index) : h).trim());
      current = {
        number: num ? num[1]! : null,
        rawHeading: headingText,
        heading: fountainHeading(headingText),
        source: src(i),
        elements: [],
        warnings: [],
      };
      scenes.push(current);
      i++;
      continue;
    }

    if (cls === "transition") {
      push("transition", inline(t.startsWith(">") ? t.slice(1).trim() : t), i);
      i++;
      continue;
    }

    if (cls === "character") {
      let name = t.startsWith("@") ? t.slice(1).trim() : t;
      const dual = /\^\s*$/.test(name);
      if (dual) name = name.replace(/\s*\^\s*$/, "");
      // Andre taler i dobbel dialog: sikker når det står en replikk rett foran (første taler)
      const prev = lastKind();
      const afterDialogue = prev === "dialogue" || prev === "parenthetical";
      push("character", inline(name), i, {
        ...(dual ? { marks: { dual: true } } : {}),
        ...(dual && !afterDialogue
          ? {
              uncertain: tk("core-screenplay-fountain.uncertain.uncertain.9f4747a15151"),
            }
          : {}),
      });
      i++;
      // Dialoggruppen: parentes og replikk frem til neste tomme linje
      let dlg: string[] = [];
      let dlgRows: number[] = [];
      let dlgLyrics: number[] = [];
      const flushDialogue = () => {
        if (dlg.length)
          push("dialogue", dlg.join("\n"), dlgRows[0]!, {
            rows: dlgRows,
            ...(dlgLyrics.length ? { marks: { lyrics: dlgLyrics } } : {}),
          });
        dlg = [];
        dlgRows = [];
        dlgLyrics = [];
      };
      while (i < rows.length && !blank(i)) {
        const r = rows[i]!;
        const lt = r.raw === SPACER ? "" : r.raw.trim();
        if (lt.startsWith("(")) {
          flushDialogue();
          const at = i;
          const paren = [lt];
          const parenRows = [i];
          while (!paren[paren.length - 1]!.endsWith(")") && i + 1 < rows.length && !blank(i + 1)) {
            i++;
            paren.push(rows[i]!.raw.trim());
            parenRows.push(i);
          }
          push("parenthetical", inline(paren.join("\n")), at, { rows: parenRows });
          i++;
          continue;
        }
        if (lt.startsWith("~")) dlgLyrics.push(dlg.length);
        dlgRows.push(i);
        dlg.push(inline(lt.replace(/^~\s*/, "")));
        i++;
      }
      flushDialogue();
      continue;
    }

    // Handling (også sentrert tekst, sangtekst og alt annet): hele avsnittet frem til tom linje.
    // «!» først på en linje tvinger handling og opphever sentrering og sangtekst for den linjen.
    const at = i;
    const lines: string[] = [];
    const lineRows: number[] = [];
    const centered: number[] = [];
    const lyrics: number[] = [];
    while (i < rows.length && !blank(i)) {
      const r = rows[i]!;
      let l = r.raw === SPACER ? "" : r.raw.replace(/\s+$/, "");
      const c = CENTERED_RE.exec(l);
      if (l.startsWith("!")) l = l.slice(1);
      else if (c && c[1]!.trim()) {
        centered.push(lines.length);
        l = c[1]!.trim();
      } else if (l.trimStart().startsWith("~")) {
        lyrics.push(lines.length);
        l = l.trimStart().slice(1).trim();
      }
      lines.push(inline(l));
      lineRows.push(i);
      i++;
    }
    const marks: FountainMarks = {
      ...(centered.length ? { centered } : {}),
      ...(lyrics.length ? { lyrics } : {}),
    };
    push("action", lines.join("\n"), at, {
      rows: lineRows,
      ...(centered.length || lyrics.length ? { marks } : {}),
    });
  }

  // Notater: festes til linjen de står på (samme regler som Word-kommentarer og PDF-merknader)
  rows.forEach((r, idx) => {
    for (const n of r.notes) {
      const f = noteFields(n.text);
      if (!f.text) continue;
      notes.push({ ...src(idx), quote: noteQuote(r.raw, n.col, placeOf.get(idx)), ...f });
    }
  });
  for (const d of dropped) {
    const f = noteFields(d.text);
    if (!f.text) continue;
    // Eget avsnitt: nål på scenen der det står (litt under forrige linje)
    const at = Math.max(0, d.after);
    notes.push({ page: pageOf[at] ?? 1, y: d.after * LINE + 6, quote: "", ...f });
  }
  notes.sort((a, b) => a.page - b.page || a.y - b.y);

  const out: ParsedScene[] = scenes.map((s) => ({
    number: s.number,
    rawHeading: s.rawHeading,
    heading: s.heading,
    elements: s.elements,
    source: s.source,
    ...(s.isContinuation ? { isContinuation: true } : {}),
    warnings: s.warnings,
  }));

  const warnings: string[] = [];
  if (!out.some((s) => !s.isContinuation) && out.length)
    warnings.push(
      tk("core-screenplay-fountain.parse-fountain.warnings-push.d412c359c655"),
    );
  const numbers = out.filter((s) => s.number !== null).map((s) => s.number as string);
  const seen = new Set<string>();
  const duplicateNumbers = [
    ...new Set(numbers.filter((n) => (seen.has(n) ? true : (seen.add(n), false)))),
  ];
  if (duplicateNumbers.length)
    warnings.push(
      tk("core-screenplay-fountain.parse-fountain.warnings-push.2bbbb4f0bd97", { value1: String(duplicateNumbers.join(", ")) }),
    );
  const unnumbered = out.filter((s) => s.number === null && !s.isContinuation).length;
  if (unnumbered)
    warnings.push(
      tk("core-screenplay-fountain.parse-fountain.warnings-push.171f3499ccaf", { unnumbered: String(unnumbered) }),
    );

  // Fountain har ingen faste sider: beregn sidetallet med manusvisningens sidebryting
  const estimate = paginate(
    out.map((s, k) => ({
      occurrenceId: `s${k}`,
      number: s.number,
      headingText: s.isContinuation ? "" : formatHeading(s.heading),
      blocks: s.elements.map((e, j) => ({ id: `s${k}b${j}`, kind: e.kind, text: e.text })),
    })),
  ).pages.length;

  return {
    parsed: {
      format: "fountain",
      pageCount: Math.max(estimate, page),
      titlePage,
      scenes: out,
      warnings,
      stats: {
        numbered: numbers.length,
        unnumbered,
        uncertain: out.reduce(
          (n, s) => n + s.elements.filter((e) => e.uncertain).length + s.warnings.length,
          0,
        ),
        duplicateNumbers,
      },
    },
    notes,
  };
}

// ---------- Eksport ----------

/**
 * Fountain-markeringen i en blokks kildereferanse (fra databasen, så formen kontrolleres), som felt til
 * PaginationBlock. Tomt objekt når blokken ikke har markering.
 */
/** Kort kontrollsum (FNV-1a) av en tekst – bare for å se om blokken er endret siden importen. */
export function fountainTextHash(t: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function fountainMarksOf(
  ref: { readonly page: number; readonly y: number } | null | undefined,
  /** Blokkens tekst nå: linjemerkene brukes bare når den er uendret siden importen. */
  text?: string,
): { readonly fountain?: FountainMarks } {
  const raw = (ref as { fountain?: unknown } | null | undefined)?.fountain;
  if (!raw || typeof raw !== "object") return {};
  const m = raw as Record<string, unknown>;
  const lines = (v: unknown): number[] =>
    Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n) && n >= 0) : [];
  // Teksten er endret (eller oversatt) siden importen: linjenumrene stemmer ikke lenger
  const hash = typeof m["textHash"] === "string" ? m["textHash"] : null;
  const linesValid = !hash || text === undefined || fountainTextHash(text) === hash;
  const centered = linesValid ? lines(m["centered"]) : [];
  const lyrics = linesValid ? lines(m["lyrics"]) : [];
  const marks: FountainMarks = {
    ...(m["dual"] === true ? { dual: true as const } : {}),
    ...(centered.length ? { centered } : {}),
    ...(lyrics.length ? { lyrics } : {}),
  };
  return Object.keys(marks).length ? { fountain: marks } : {};
}

/** Et notat slik det eksporteres (samme form som til PDF/DOCX). */
interface FountainNote {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly author: string;
  readonly stampAt: string;
}

export interface FountainOptions {
  /** Linjer på tittelsiden (tom = ingen tittelside). */
  readonly titlePage?: readonly string[];
  /** Notater som Fountain-notater `[[…]]` – bare når eksportvalget for notater er på. Nøkler: blokk- og forekomst-ID. */
  readonly notes?: {
    readonly byBlock: ReadonlyMap<string, readonly FountainNote[]>;
    readonly pins: ReadonlyMap<string, readonly FountainNote[]>;
  };
}

function noteMarkup(n: FountainNote): string {
  const body = n.text
    .replace(/\[\[/g, "[ [")
    .replace(/\]\]/g, "] ]")
    .replace(/\/\*/g, "/ *")
    .replace(/\*\//g, "* /")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  const date = Number.isNaN(Date.parse(n.stampAt))
    ? null
    : new Date(n.stampAt).toISOString().slice(0, 10);
  const author = n.author.replace(/[\n:]/g, " ").trim();
  return author && date ? `[[${author} (${date}): ${body}]]` : `[[${body}]]`;
}

/**
 * Linjene i en blokk med escape og notater satt inn der notatområdet slutter.
 * Tomme linjer blir «to mellomrom» (tom linje inne i elementet).
 */
function renderLines(text: string, notes: readonly FountainNote[] = []): string[] {
  const at = new Map<number, string[]>();
  for (const n of notes) {
    const pos = Math.max(0, Math.min(text.length, n.end));
    at.set(pos, [...(at.get(pos) ?? []), noteMarkup(n)]);
  }
  const out: string[] = [];
  let cur = "";
  let marks = "";
  let empty = true;
  const end = () => {
    // Linje med bare mellomrom ville blitt en tom linje (nytt element): skriv «to mellomrom»
    out.push(empty ? SPACER + marks : cur);
    cur = "";
    marks = "";
    empty = true;
  };
  for (let i = 0; i <= text.length; i++) {
    for (const m of at.get(i) ?? []) {
      cur += m;
      marks += m;
    }
    if (i === text.length) break;
    const ch = text[i]!;
    if (ch === "\n") {
      end();
      continue;
    }
    if (!/\s/.test(ch)) empty = false;
    cur += escapeInline(ch);
  }
  end();
  return out;
}

/** Tittelsiden som Fountain-nøkler: første linje er tittelen, «av …» gir Credit/Author, resten Notes. */
function titleBlock(lines: readonly string[]): string[] {
  const clean = lines.map((l) => l.trim()).filter(Boolean);
  if (!clean.length) return [];
  const out = [`Title: ${escapeInline(clean[0]!)}`];
  const rest: string[] = [];
  for (const l of clean.slice(1)) {
    const by = /^(av|by|skrevet av|written by|manus av|manus)\s+(.+)$/i.exec(l);
    if (by) out.push(`Credit: ${escapeInline(by[1]!)}`, `Author: ${escapeInline(by[2]!)}`);
    else if (/^(av|by|skrevet av|written by|manus av|manus)$/i.test(l))
      out.push(`Credit: ${escapeInline(l)}`);
    else if (/^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/.test(l)) out.push(`Draft date: ${l}`);
    else rest.push(l);
  }
  if (rest.length) out.push("Notes:", ...rest.map((l) => `    ${escapeInline(l)}`));
  return out;
}

/**
 * Manus som Fountain-tekst. Tar samme inndata som DOCX-eksporten (nummerering, utgåtte og deaktiverte scener
 * er allerede bestemt av exportPaginationInput). Ingen tekniske ID-er skrives ut (REQ-0104).
 */
export function screenplayFountain(
  scenes: readonly PaginationScene[],
  opts: FountainOptions = {},
): string {
  const out: string[] = [];
  const blankLine = () => {
    if (out.length && out[out.length - 1] !== "") out.push("");
  };
  const title = titleBlock(opts.titlePage ?? []);
  if (title.length) out.push(...title, "");

  scenes.forEach((sc, idx) => {
    const headingText = sc.headingText.trim();
    if (headingText || sc.number !== null || idx > 0) {
      // Scene uten overskrift midt i manuset (fortsettelse fra en import) må likevel skilles fra forrige scene
      // i18n-ignore: manusets formatord (Fountain-tekst i eksportfilen), oversettes ikke
      const base = escapeInline(headingText || "UTEN OVERSKRIFT");
      const natural =
        classifyFountainLine(base, true) === "heading" && !base.trimStart().startsWith(".");
      const line = (natural ? base : `.${base}`) + (sc.number !== null ? ` #${sc.number}#` : "");
      blankLine();
      out.push(line);
      for (const n of opts.notes?.pins.get(sc.occurrenceId) ?? []) {
        blankLine();
        out.push(noteMarkup(n));
      }
    }
    sc.blocks.forEach((b, j) => {
      const notes = opts.notes?.byBlock.get(b.id) ?? [];
      const lines = renderLines(b.text, notes);
      const plain = b.text.split("\n");
      const prev = sc.blocks[j - 1];
      const next = sc.blocks[j + 1];
      const inDialogue =
        prev !== undefined &&
        (prev.kind === "character" || prev.kind === "parenthetical" || prev.kind === "dialogue");
      const lyric = new Set(b.fountain?.lyrics ?? []);
      if ((b.kind === "dialogue" || b.kind === "parenthetical") && inDialogue) {
        // Sangtekst i replikken: «~» først på linjen
        out.push(
          ...lines.map((l, k) =>
            b.kind === "dialogue" && lyric.has(k) ? `~${l === SPACER ? "" : l}` : l,
          ),
        );
        return;
      }
      blankLine();
      if (b.kind === "character") {
        const followed = next?.kind === "dialogue" || next?.kind === "parenthetical";
        const natural =
          followed &&
          plain.length === 1 &&
          classifyFountainLine(plain[0]!, false) === "character" &&
          !plain[0]!.trim().startsWith("@");
        // Andre taler i dobbel dialog: «^» etter navnet
        const dual = b.fountain?.dual ? " ^" : "";
        out.push(natural ? lines[0]!.trim() + dual : `@${lines.join(" ").trim()}${dual}`);
        return;
      }
      if (b.kind === "transition") {
        const natural =
          plain.length === 1 &&
          classifyFountainLine(plain[0]!, true) === "transition" &&
          !plain[0]!.trim().startsWith(">");
        out.push(natural ? lines[0]!.trim() : `>${lines.join(" ").trim()}`);
        return;
      }
      // Handling (og typer Fountain ikke har: shot, note, replikk uten karakter).
      // Sentrerte linjer og sangtekst fra importen skrives med markering igjen (FountainMarks).
      const centered = new Set(b.kind === "action" ? (b.fountain?.centered ?? []) : []);
      const marked = (k: number) =>
        (centered.has(k) && plain[k]!.trim() !== "") ||
        (lyric.has(k) && b.kind !== "parenthetical");
      const markup = (l: string, k: number) => {
        const t = l === SPACER ? "" : l;
        return centered.has(k) && plain[k]!.trim() !== "" ? `> ${t.trim()} <` : `~${t}`;
      };
      // Linjer som ellers ville blitt lest som sentrering eller sangtekst
      const looksMarked = (p: string) => CENTERED_RE.test(p) || p.trimStart().startsWith("~");
      const first = plain[0] ?? "";
      const needsForce =
        first.trim() === "" ||
        first.startsWith("!") ||
        classifyFountainLine(first, plain.length === 1) !== "action";
      const body = lines.map((l, k) => {
        if (marked(k)) return markup(l, k);
        if (k === 0) return needsForce ? `!${l === SPACER ? "" : l}` : l;
        // Et «!» først på en linje er et tvangstegn ved import; doble det så teksten blir stående
        return plain[k]!.startsWith("!") || looksMarked(plain[k]!) ? `!${l}` : l;
      });
      out.push(...body);
    });
  });
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n") + "\n";
}
