/**
 * Tolker linjer fra et filmmanus (PDF eksportert fra Final Draft, eller DOCX med innrykk) til scener og
 * manuselementer (mandat 4.1–4.3, ADR-0007).
 *
 * Metode: kolonnene finnes statistisk (handling = vanligste venstremarg), og hver linje klassifiseres etter
 * avstand fra handlingskolonnen. Final Draft-standard (US Letter): handling 1,5″, dialog +1″, parentes +1,4–1,5″,
 * karakter +2″, overgang langt til høyre. Scenenummer står i venstre og høyre marg.
 * Ingen scener oppfinnes: manglende eller uregelmessige numre beholdes som de er (mandat 4.1).
 */
import type { BlockKind, SceneHeading } from "../model";
import type { ParsedElement, ParsedScene, ParsedScreenplay, RawLine, SourceRef } from "./types";

const HEADING_RE =
  /^(?:(\d+[A-Z]{0,2})\s+)?((?:INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\/E\.?|INT\.|EXT\.|INNE\.|UTE\.)\s*.+?)(?:\s+(\d+[A-Z]{0,2}))?$/;
const PAGE_NUMBER_RE = /^\d+[A-Z]?\.?$/;
const MORE_RE = /^\((MORE|MER|FORTS\.?)\)$/i;
const CONTD_RE = /\s*\((CONT'D|CONT’D|FORTS\.?|FORTSETTER)\)\s*$/i;
const TRANSITION_RE =
  /(TIL:|TO:|^FADE (IN|OUT)|^OVERTONING|^KUTT|^KLIPP|^CUT TO|^DISSOLVE|^(SLUTT|THE END|END)\.?$)/i;

/** Final Draft «fet» skrift i PDF gir ofte doble tegn («((MMOORREE))», «22..»). */
export function collapseDoubledGlyphs(s: string): string {
  if (s.length >= 2 && s.length % 2 === 0) {
    let doubled = true;
    for (let i = 0; i < s.length; i += 2) {
      if (s[i] !== s[i + 1]) {
        doubled = false;
        break;
      }
    }
    if (doubled) {
      let out = "";
      for (let i = 0; i < s.length; i += 2) out += s[i];
      return out;
    }
  }
  return s;
}

function normalize(text: string): string {
  return collapseDoubledGlyphs(text.replace(/\u00a0/g, " ").trim()).trim();
}

/** «(sukker) Hei» → parentes + replikk. */
function splitParenthetical(text: string): { kind: BlockKind; text: string }[] {
  const m = /^(\([^)]*\))\s*(.*)$/.exec(text.trim());
  if (!m) return [{ kind: "dialogue", text: text.trim() }];
  const out: { kind: BlockKind; text: string }[] = [{ kind: "parenthetical", text: m[1]! }];
  if (m[2]) out.push({ kind: "dialogue", text: m[2] });
  return out;
}

export function parseHeading(raw: string): SceneHeading {
  const text = raw.trim().replace(/\s+/g, " ");
  const m =
    /^(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\/E\.?|INT\.|EXT\.|INNE\.|UTE\.)\s*(.*)$/i.exec(
      text,
    );
  const intExt = m ? m[1]!.toUpperCase().replace(/\s+/g, "") : "";
  const rest = m ? m[2]! : text;
  const dash = rest.lastIndexOf(" - ");
  if (dash > 0)
    return { intExt, location: rest.slice(0, dash).trim(), time: rest.slice(dash + 3).trim() };
  return { intExt, location: rest.trim(), time: "" };
}

function isUpper(s: string): boolean {
  const letters = s.replace(/\([^)]*\)/g, "").replace(/[^A-Za-zÆØÅæøåÄÖÜäöüÉé]/g, "");
  return letters.length > 0 && letters === letters.toUpperCase();
}

function mode(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = 0;
  let bestN = -1;
  for (const [v, n] of counts) if (n > bestN) [best, bestN] = [v, n];
  return best;
}

type LineKind = BlockKind | "page_number" | "more" | "blank";

interface Classified {
  readonly line: RawLine;
  readonly text: string;
  readonly kind: LineKind;
  readonly sceneNumber?: string | null;
  readonly headingText?: string;
  readonly uncertain?: string;
}

export interface ParseOptions {
  readonly format: "pdf" | "docx";
  /** Linjehøyde i punkter (12 pt Courier = 12). */
  readonly lineHeight?: number;
  /** Overstyr handlingskolonnen (pt) hvis statistikken ikke holder. */
  readonly actionX?: number;
}

/** Linjebredde (tegn) i Final Draft-standard, brukt til å skille manuelle linjeskift fra automatisk bryting. */
/** Standard antall tomme linjer før hvert element (Final Draft). */
const STANDARD_SPACE: Record<string, number> = { action: 1, dialogue: 0, parenthetical: 0 };

const WRAP_WIDTH: Partial<Record<string, number>> = { action: 61, dialogue: 35, parenthetical: 25 };

/**
 * Var linjeskiftet manuelt? I PDF: hvis første ord på neste linje hadde fått plass på forrige linje,
 * har forfatteren brutt linjen selv. I DOCX er hver linje et eget avsnitt – alltid manuelt.
 */
function isHardBreak(format: string, kind: string, prevLine: string, next: string): boolean {
  if (format === "docx") return true;
  const width = WRAP_WIDTH[kind];
  if (!width || prevLine.endsWith("-")) return false;
  const firstWord = next.trimStart().split(/\s+/)[0] ?? "";
  return prevLine.trimEnd().length + 1 + firstWord.length <= width;
}

export function parseScreenplayLines(
  lines: readonly RawLine[],
  opts: ParseOptions,
): ParsedScreenplay {
  const lineHeight = opts.lineHeight ?? 12;
  const pageCount = lines.reduce((m, l) => Math.max(m, l.page), 0);
  const nonEmpty = lines
    .map((l) => ({ ...l, text: normalize(l.text) }))
    .filter((l) => l.text.length > 0);

  // Handlingskolonnen = vanligste venstremarg (avrundet).
  // Få linjer gir svak statistikk: bruk Final Draft-standarden (1,5″ = 108 pt) for PDF.
  const bodyCandidates = nonEmpty.filter((l) => !HEADING_RE.test(l.text) || l.x > 90);
  const actionX =
    opts.actionX ??
    (bodyCandidates.length < 30 && opts.format === "pdf"
      ? 108
      : mode(bodyCandidates.map((l) => Math.round(l.x))));
  const warnings: string[] = [];

  // Tittelside: første side uten sceneoverskrift der få linjer står i kjente kolonner.
  const firstHeadingPage =
    nonEmpty.find((l) => HEADING_RE.test(l.text) && isUpper(l.text.replace(/\d/g, "")))?.page ?? 1;
  const titlePageNumbers = new Set<number>();
  if (firstHeadingPage > 1) {
    const p1 = nonEmpty.filter((l) => l.page === 1);
    const inColumns = p1.filter((l) =>
      [0, 72, 144].some((d) => Math.abs(l.x - actionX - d) < 6),
    ).length;
    if (p1.length > 0 && inColumns / p1.length < 0.5) titlePageNumbers.add(1);
  }
  const titlePage = nonEmpty.filter((l) => titlePageNumbers.has(l.page)).map((l) => l.text);
  const body = nonEmpty.filter((l) => !titlePageNumbers.has(l.page));

  const classify = (l: RawLine & { text: string }): Classified => {
    const text = l.text;
    const dx = l.x - actionX;
    if (opts.format === "pdf" && l.y < 54 && PAGE_NUMBER_RE.test(text))
      return { line: l, text, kind: "page_number" };
    if (l.style && /ny\s*side/i.test(l.style) && PAGE_NUMBER_RE.test(text))
      return { line: l, text, kind: "page_number" };
    if (MORE_RE.test(text)) return { line: l, text, kind: "more" };
    const h = HEADING_RE.exec(text);
    const looksHeading =
      h !== null &&
      isUpper(h[2]!) &&
      (dx < 36 || (l.style !== undefined && /overskrift|heading/i.test(l.style)));
    if (looksHeading) {
      const left = h[1] ?? null;
      const right = h[3] ?? null;
      let uncertain: string | undefined;
      if (left && right && left !== right)
        uncertain = `Ulike scenenumre i margene (${left} / ${right})`;
      return {
        line: l,
        text,
        kind: "heading",
        sceneNumber: left ?? right,
        headingText: h[2]!.trim(),
        ...(uncertain ? { uncertain } : {}),
      };
    }
    if (dx < -18)
      return { line: l, text, kind: "action", uncertain: "Linjen står utenfor kjente kolonner" };
    if (dx < 36)
      return {
        line: l,
        text,
        kind:
          TRANSITION_RE.test(text) && isUpper(text) && text.endsWith(":") ? "transition" : "action",
      };
    if (dx >= 250)
      return {
        line: l,
        text,
        kind: TRANSITION_RE.test(text) || text.endsWith(":") ? "transition" : "action",
        ...(TRANSITION_RE.test(text) || text.endsWith(":")
          ? {}
          : { uncertain: "Høyrestilt tekst tolket som handling" }),
      };
    // Ren parentes på egen linje. Parentes etterfulgt av replikk på samme linje er skrevet inn i replikken – behold.
    if (text.startsWith("(") && (text.endsWith(")") || !text.includes(")")))
      return { line: l, text, kind: "parenthetical" };
    if (text.startsWith("(") && dx < 90) return { line: l, text, kind: "dialogue" };
    if (dx >= 90 && isUpper(text) && text.length <= 50) return { line: l, text, kind: "character" };
    if (dx >= 90) {
      // Karakter, parentes og replikk på samme linje (forekommer i oversatte DOCX-manus)
      const mixed =
        /^([A-ZÆØÅÄÖÜ][A-ZÆØÅÄÖÜ .'’-]+(?:\s*\([A-ZÆØÅÄÖÜ.'’ ]+\))*)\s+(\(.*|[^a-zæøå].*)$/.exec(
          text,
        );
      if (mixed && isUpper(mixed[1]!) && mixed[1]!.trim().length >= 2) {
        return {
          line: l,
          text,
          kind: "character",
          headingText: mixed[2]!,
          uncertain: "Karakter og replikk på samme linje – delt automatisk",
        };
      }
    }
    if (dx >= 90 && dx < 125) return { line: l, text, kind: "parenthetical" };
    if (dx >= 125)
      return {
        line: l,
        text,
        kind: "dialogue",
        uncertain: "Innrykket tekst med små bokstaver tolket som replikk",
      };
    return { line: l, text, kind: "dialogue" };
  };

  const classified = body.map(classify);

  // Bygg scener og elementer.
  const scenes: {
    number: string | null;
    rawHeading: string;
    source: SourceRef;
    isContinuation?: boolean;
    elements: ParsedElement[];
    warnings: string[];
  }[] = [];
  let current: (typeof scenes)[number] | null = null;
  let last: { kind: LineKind; line: RawLine; text: string; element: ParsedElement | null } | null =
    null;
  let lastHeadingLine: RawLine | null = null;
  let pendingContinuation = false; // (MORE) sett – neste karakterlinje med (CONT'D) er fortsettelse
  let lastCharacter: string | null = null;

  const pushElement = (e: ParsedElement) => {
    if (!current) {
      current = {
        number: null,
        rawHeading: "",
        source: e.source,
        isContinuation: true,
        elements: [],
        warnings: ["Tekst før første sceneoverskrift (fortsettelse fra tidligere scene)"],
      };
      scenes.push(current);
    }
    current.elements.push(e);
  };

  for (const c of classified) {
    const src: SourceRef = { page: c.line.page, y: c.line.y };
    if (c.kind === "page_number" || c.kind === "blank") continue;
    if (c.kind === "more") {
      pendingContinuation = true;
      continue;
    }
    if (c.kind === "heading") {
      current = {
        number: c.sceneNumber ?? null,
        rawHeading: c.headingText ?? c.text,
        source: src,
        elements: [],
        warnings: c.uncertain ? [c.uncertain] : [],
      };
      scenes.push(current);
      last = null;
      lastHeadingLine = c.line;
      lastCharacter = null;
      pendingContinuation = false;
      continue;
    }
    if (c.kind === "character") {
      const name = c.text.replace(CONTD_RE, "").trim();
      if (pendingContinuation && last && c.line.page !== last.line.page && name === lastCharacter) {
        // Replikk fortsetter over sideskift: hopp over «NAVN (CONT'D)»
        pendingContinuation = false;
        continue;
      }
      pendingContinuation = false;
      lastCharacter = name;
      const el: ParsedElement = {
        kind: "character",
        text: name,
        source: src,
        ...(c.uncertain ? { uncertain: c.uncertain } : {}),
      };
      pushElement(el);
      last = { kind: "character", line: c.line, text: name, element: el };
      if (c.headingText) {
        // Resten av linjen (parentes og/eller replikk)
        for (const part of splitParenthetical(c.headingText)) {
          const pe: ParsedElement = {
            kind: part.kind,
            text: part.text,
            source: src,
            uncertain: "Delt fra karakterlinjen",
          };
          pushElement(pe);
          last = { kind: part.kind, line: c.line, text: part.text, element: pe };
        }
      }
      continue;
    }
    // Sammenhengende linjer av samme type på samme side (eller replikk over sideskift) blir ett element.
    const sameParagraph =
      last !== null &&
      last.element !== null &&
      last.kind === c.kind &&
      c.kind !== "transition" &&
      ((last.line.page === c.line.page && c.line.y - last.line.y <= lineHeight * 1.5 + 0.5) ||
        (last.line.page !== c.line.page &&
          c.kind === "dialogue" &&
          pendingContinuation === false &&
          last.kind === "dialogue" &&
          lastCharacter !== null));
    if (sameParagraph && last && last.element && current) {
      const prevText: string = last.element.text;
      const samePage = last.line.page === c.line.page;
      const hard = samePage && isHardBreak(opts.format, c.kind, last.line.text, c.text);
      const joined: string = hard
        ? `${prevText}\n${c.text}`
        : prevText.endsWith("-")
          ? prevText + c.text
          : `${prevText} ${c.text}`;
      const merged: ParsedElement = {
        ...last.element,
        text: joined,
        ...(c.uncertain && !last.element.uncertain ? { uncertain: c.uncertain } : {}),
      };
      const els: ParsedElement[] = current.elements;
      els[els.length - 1] = merged;
      last = { kind: c.kind, line: c.line, text: joined, element: merged };
      continue;
    }
    if (c.kind === "action" || c.kind === "transition")
      lastCharacter = c.kind === "transition" ? null : lastCharacter;
    // Ekstra tomme linjer forfatteren har satt inn (bevares som innledende linjeskift, slik at sidene blir som i originalen)
    const prevLine = last?.line ?? lastHeadingLine;
    let extra = 0;
    if (
      prevLine &&
      prevLine.page === c.line.page &&
      (c.kind === "action" || c.kind === "dialogue" || c.kind === "parenthetical")
    ) {
      extra = Math.min(
        6,
        Math.max(
          0,
          Math.round((c.line.y - prevLine.y) / lineHeight) - 1 - (STANDARD_SPACE[c.kind] ?? 0),
        ),
      );
    }
    const el: ParsedElement = {
      kind: c.kind as BlockKind,
      text: "\n".repeat(extra) + c.text,
      source: src,
      ...(c.uncertain ? { uncertain: c.uncertain } : {}),
    };
    pushElement(el);
    last = { kind: c.kind, line: c.line, text: c.text, element: el };
  }

  // Karakterlinje uten replikk (f.eks. sentrert «SLUTT» til slutt) er ikke en karakter.
  for (const sc of scenes) {
    sc.elements.forEach((e, i) => {
      const next = sc.elements[i + 1];
      if (
        e.kind === "character" &&
        (!next || (next.kind !== "dialogue" && next.kind !== "parenthetical"))
      ) {
        const end = /^(SLUTT|THE END|END|FADE OUT\.?|SLUTT\.?)$/i.test(e.text);
        sc.elements[i] = end
          ? { ...e, kind: "transition" }
          : { ...e, kind: "action", uncertain: "Karakternavn uten replikk – tolket som handling" };
      }
    });
  }

  const out: ParsedScene[] = scenes.map((s) => ({
    number: s.number,
    rawHeading: s.rawHeading,
    heading: s.isContinuation ? { intExt: "", location: "", time: "" } : parseHeading(s.rawHeading),
    elements: s.elements,
    source: s.source,
    ...(s.isContinuation ? { isContinuation: true } : {}),
    warnings: s.warnings,
  }));

  const numbers = out.filter((s) => s.number !== null).map((s) => s.number as string);
  const seen = new Set<string>();
  const duplicateNumbers = [
    ...new Set(numbers.filter((n) => (seen.has(n) ? true : (seen.add(n), false)))),
  ];
  if (duplicateNumbers.length)
    warnings.push(`Scenenumre som forekommer flere ganger: ${duplicateNumbers.join(", ")}`);
  const unnumbered = out.filter((s) => s.number === null && !s.isContinuation).length;
  if (unnumbered) warnings.push(`${unnumbered} scene(r) uten scenenummer`);

  return {
    format: opts.format,
    pageCount,
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
  };
}
