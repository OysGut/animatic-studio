/**
 * ML4 (B-049): fontkontroll for manuseksport. Sjekker hvilke tegn eksportformatets font kan vise,
 * før filen lages. Ingen tegn erstattes i stillhet.
 *
 * - PDF bruker Courier når WinAnsi dekker teksten. Ellers (G-1b) bygges Noto-fonter inn per skriftsystem;
 *   eksporten stoppes bare for tegn ingen av fontene har.
 * - Word bruker Courier New, som dekker latin (også utvidet), gresk og kyrillisk. Andre tegn beholdes i
 *   filen, men Word bytter da til en annen font for dem. Det vises som en advarsel, ikke en stopp.
 * - Fountain er ren UTF-8-tekst, og alle tegn beholdes.
 */
import { winAnsiCode } from "../presentation/metrics";
import type { PaginationScene } from "./paginate";
import { notoScriptsNeeded, notoUncovered, type NotoScript } from "../typography/pdf-scripts";

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
  /** G-1b: PDF med tegn utenfor WinAnsi lages med innebygde Noto-fonter for disse skriftsystemene. */
  readonly embedded?: readonly NotoScript[];
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
  if (format === "pdf") {
    // G-1b: Courier når WinAnsi dekker alt (byte-identisk som før), ellers Noto per skriftsystem. Stopp bare for
    // tegn ingen av fontene har (for eksempel emoji) – ingen tegn erstattes i stillhet.
    const list = [...texts];
    let courier = true;
    for (const text of list) for (const ch of text) if (!CONTROL.has(ch) && !pdfCovers(ch)) courier = false;
    if (courier) return { format, font: "Courier", unsupported: [], unsupportedCount: 0, blocking: false };
    const missing = notoUncovered(list);
    return {
      format,
      font: "Noto Sans",
      unsupported: missing.slice(0, limit),
      unsupportedCount: missing.length,
      blocking: missing.length > 0,
      embedded: notoScriptsNeeded(list),
    };
  }
  const covers = docxCovers;
  const seen = new Set<string>();
  for (const text of texts)
    for (const ch of text) if (!CONTROL.has(ch) && !seen.has(ch) && !covers(ch)) seen.add(ch);
  const all = [...seen];
  return {
    format,
    font: "Courier New",
    unsupported: all.slice(0, limit),
    unsupportedCount: all.length,
    blocking: false,
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
