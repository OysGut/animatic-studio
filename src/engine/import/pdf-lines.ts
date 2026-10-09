/**
 * PDF → manuslinjer med posisjon (ADR-0007). Bruker pdf.js. Lastes bare på klienten eller i tester
 * (SSR-sikkert: kalles via dynamisk import).
 */
import type { RawLine } from "@/core/screenplay/types";

interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
}

const MAX_PAGES = 400;

export async function pdfToLines(
  data: Uint8Array,
  loadPdfJs: () => Promise<typeof import("pdfjs-dist")> = () => import("pdfjs-dist"),
): Promise<RawLine[]> {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true })
    .promise;
  if (doc.numPages > MAX_PAGES)
    throw new Error(`PDF-en har ${doc.numPages} sider – maks ${MAX_PAGES}`);
  const lines: RawLine[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const height = page.getViewport({ scale: 1 }).height;
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; str: string; w: number }[]>();
    for (const it of content.items as TextItemLike[]) {
      if (typeof it.str !== "string" || it.str.length === 0) continue;
      const x = it.transform[4] ?? 0;
      const yTop = Math.round(height - (it.transform[5] ?? 0));
      const key = [...rows.keys()].find((k) => Math.abs(k - yTop) <= 2) ?? yTop;
      const row = rows.get(key) ?? [];
      row.push({ x, str: it.str, w: it.width });
      rows.set(key, row);
    }
    for (const [y, items] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
      items.sort((a, b) => a.x - b.x);
      let text = "";
      let end = -Infinity;
      let prevStr = "";
      for (const it of items) {
        // Overtrykk (fet skrift laget ved å skrive teksten to ganger) – hopp over overlappende kopi
        const a = prevStr.trim();
        const b = it.str.trim();
        if (
          text &&
          it.x < end - 2 &&
          a.length > 0 &&
          (a === b || a.startsWith(b) || b.startsWith(a))
        )
          continue;
        prevStr = it.str;
        if (text && it.x - end > 3 && !text.endsWith(" ") && !it.str.startsWith(" ")) text += " ";
        text += it.str;
        end = it.x + it.w;
      }
      if (text.trim()) lines.push({ page: n, x: items[0]!.x, y, text });
    }
    page.cleanup();
  }
  await doc.destroy();
  return lines;
}
