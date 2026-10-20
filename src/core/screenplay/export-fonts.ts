/**
 * ML4 (B-049): fontkontroll for manuseksport. Sjekker hvilke tegn eksportformatets font kan vise,
 * før filen lages. Ingen tegn erstattes i stillhet.
 *
 * - PDF bruker standardfonten Courier med WinAnsi-koding. Tegn utenfor tegnsettet (for eksempel
 *   kyrillisk og «č ć đ» i latinsk serbisk) ville blitt «?». Eksporten blir derfor stoppet.
 * - Word bruker Courier New, som dekker latin (også utvidet), gresk og kyrillisk. Andre tegn beholdes i
 *   filen, men Word bytter da til en annen font for dem. Det vises som en advarsel, ikke en stopp.
 * - Fountain er ren UTF-8-tekst, og alle tegn beholdes.
 */
import { winAnsiCode } from "../presentation/metrics";
import type { PaginationScene } from "./paginate";

export type ScriptExportFormat = "pdf" | "docx" | "fountain";

export interface ScriptFontCheck {
  readonly format: ScriptExportFormat;
  /** Fontnavnet formatet bruker (null for Fountain, som ikke har font). */
  readonly font: string | null;
  /** Unike tegn fonten ikke kan vise, i rekkefølgen de først forekommer (maks `limit`). */
  readonly unsupported: readonly string[];
  /** Totalt antall unike tegn fonten ikke kan vise. */
  readonly unsupportedCount: number;
  /** Sann når eksporten ville mistet tekst og derfor skal stoppes. */
  readonly blocking: boolean;
}

const CONTROL = new Set(["\n", "\r", "\t"]);

/** Unicode-områder Courier New dekker (latin, latin utvidet, IPA, gresk, kyrillisk, tegnsetting, valuta). */
const COURIER_NEW: readonly (readonly [number, number])[] = [
  [0x0020, 0x007e],
  [0x00a0, 0x024f],
  [0x0250, 0x02ff],
  [0x0300, 0x036f],
  [0x0370, 0x03ff],
  [0x0400, 0x052f],
  [0x1e00, 0x1eff],
  [0x2000, 0x206f],
  [0x20a0, 0x20cf],
  [0x2100, 0x214f],
];

function pdfCovers(ch: string): boolean {
  return ch === "?" || winAnsiCode(ch) !== 0x3f;
}

function docxCovers(ch: string): boolean {
  const c = ch.codePointAt(0)!;
  return COURIER_NEW.some(([a, b]) => c >= a && c <= b);
}

/** Kontrollerer tekstene mot fonten i formatet. */
export function scriptExportFontCheck(
  texts: Iterable<string>,
  format: ScriptExportFormat,
  limit = 12,
): ScriptFontCheck {
  if (format === "fountain") return { format, font: null, unsupported: [], unsupportedCount: 0, blocking: false };
  const covers = format === "pdf" ? pdfCovers : docxCovers;
  const seen = new Set<string>();
  for (const text of texts)
    for (const ch of text) if (!CONTROL.has(ch) && !seen.has(ch) && !covers(ch)) seen.add(ch);
  const all = [...seen];
  return {
    format,
    font: format === "pdf" ? "Courier" : "Courier New",
    unsupported: all.slice(0, limit),
    unsupportedCount: all.length,
    blocking: format === "pdf" && all.length > 0,
  };
}

/** Alle tekster som havner i en manuseksport: tittelside, sceneoverskrifter og blokker. */
export function scriptExportTexts(
  scenes: readonly PaginationScene[],
  titlePage: readonly string[] = [],
): string[] {
  return [...titlePage, ...scenes.flatMap((s) => [s.headingText, ...s.blocks.map((b) => b.text)])];
}

/** Språkmerket som skrives i Word-filen (BCP-47; norsk kilde blir «nb-NO» som før). */
export function docxLanguageTag(language: string): string {
  return language === "nb" ? "nb-NO" : language;
}
