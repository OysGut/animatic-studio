/**
 * DOCX → manuslinjer (ADR-0007). Ren TypeScript uten DOM, slik at den kan kjøres i nettleser, server og tester.
 * Innrykk tolkes fra innledende mellomrom (fast bredde, Courier 12 pt = 7,2 pt per tegn) og avsnittsinnrykk (w:ind).
 * Makroer og eksterne relasjoner ignoreres; bare word/document.xml og word/styles.xml leses.
 */
import { strFromU8, unzipSync } from "fflate";
import type { RawLine } from "@/core/screenplay/types";

const CHAR_WIDTH = 7.2;
const LEFT_MARGIN = 72;
const MAX_UNZIPPED = 60 * 1024 * 1024; // vern mot «zip-bomber»

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

export function docxToLines(data: Uint8Array): RawLine[] {
  let total = 0;
  const files = unzipSync(data, {
    filter: (f) => {
      total += f.originalSize;
      if (total > MAX_UNZIPPED) throw new Error("DOCX-filen er for stor eller skadet");
      return f.name === "word/document.xml" || f.name === "word/styles.xml";
    },
  });
  const docBytes = files["word/document.xml"];
  if (!docBytes)
    throw new Error("Filen er ikke et gyldig Word-dokument (mangler word/document.xml)");
  const xml = strFromU8(docBytes);

  // Stilnavn (styleId → navn), slik at «SCENE OVERSKRIFT» kan gjenkjennes
  const styleNames = new Map<string, string>();
  const stylesBytes = files["word/styles.xml"];
  if (stylesBytes) {
    for (const m of strFromU8(stylesBytes).matchAll(
      /<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>[\s\S]*?<w:name w:val="([^"]+)"/g,
    )) {
      styleNames.set(m[1]!, m[2]!);
    }
  }

  const lines: RawLine[] = [];
  let page = 1;
  let y = 72;
  const body = xml.slice(xml.indexOf("<w:body"));
  for (const pm of body.matchAll(/<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g)) {
    const p = pm[1] ?? "";
    const styleId = /<w:pStyle w:val="([^"]+)"/.exec(p)?.[1];
    const style = styleId ? (styleNames.get(styleId) ?? styleId) : undefined;
    const indTwips = Number(/<w:ind\b[^>]*w:(?:left|start)="(-?\d+)"/.exec(p)?.[1] ?? 0);
    // Avstand før avsnittet (w:spacing w:before, i twips) gir tomme linjer som i Word
    const beforeTw = Number(/<w:spacing\b[^>]*w:before="(\d+)"/.exec(p)?.[1] ?? 0);
    if (beforeTw > 0 && y > 72) y += Math.round(beforeTw / 20 / 12) * 12;
    let text = "";
    // Manuelle linjeskift (<w:br/>) i et avsnitt gir egne linjer i samme element
    const softLines: string[] = [];
    for (const r of p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\b[^>]*\/>/g)) {
      if (r[0].startsWith("<w:tab")) text += "    ";
      else if (r[0].startsWith("<w:br")) {
        if (/w:type="page"/.test(r[0])) {
          page++;
          y = 72;
        } else if (!/w:type="column"/.test(r[0])) {
          softLines.push(text);
          text = "";
        }
      } else text += decodeXml(r[1] ?? "");
    }
    if (softLines.length) {
      // Alle linjer unntatt den siste skrives her; den siste behandles som vanlig under
      const lead0 = softLines[0]!.length - softLines[0]!.trimStart().length;
      for (const t of softLines) {
        if (t.trim()) {
          lines.push({
            page,
            x: LEFT_MARGIN + indTwips / 20 + lead0 * CHAR_WIDTH,
            y,
            text: t.trim(),
            ...(style ? { style } : {}),
          });
        }
        y += 12;
      }
    }
    if (style && /ny\s*side/i.test(style)) {
      // Sidetall-avsnitt markerer ny side i dette dokumentet
      page++;
      y = 36;
      // Avsnittet kan inneholde en fortsettelseslinje («MAJA (CONT'D)   3.») før sidetallet
      const m = /^(.*?)\s*(\d+[A-Z]?\.?)$/.exec(text.trim());
      const pageNo = m ? m[2]! : text.trim();
      const rest = m ? m[1]!.trim() : "";
      lines.push({ page, x: 500, y, text: pageNo, style });
      y = 72;
      if (rest) {
        lines.push({ page, x: LEFT_MARGIN + 22 * CHAR_WIDTH, y, text: rest });
        y += 12;
      }
      continue;
    }
    const lead = text.length - text.trimStart().length;
    // Sentrert avsnitt (f.eks. tittelside): beregn omtrentlig venstrekant
    const centered = /<w:jc w:val="center"\/>/.test(p);
    const rightAligned = /<w:jc w:val="(right|end)"\/>/.test(p);
    if (text.trim().length > 0) {
      lines.push({
        page,
        x: centered
          ? LEFT_MARGIN + Math.max(0, (432 - text.trim().length * CHAR_WIDTH) / 2)
          : rightAligned
            ? LEFT_MARGIN + Math.max(0, 432 - text.trim().length * CHAR_WIDTH)
            : LEFT_MARGIN + indTwips / 20 + lead * CHAR_WIDTH,
        y,
        text: text.trim(),
        ...(style ? { style } : {}),
      });
    }
    y += 12;
    // Seksjonsskift (f.eks. etter tittelsiden) starter ny side
    if (p.includes("<w:sectPr")) {
      page++;
      y = 72;
    }
  }
  return lines;
}
