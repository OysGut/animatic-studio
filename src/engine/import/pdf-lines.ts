/**
 * PDF → manuslinjer med posisjon (ADR-0007). Bruker pdf.js. Lastes bare på klienten eller i tester
 * (SSR-sikkert: kalles via dynamisk import).
 */
import type { RawLine } from "@/core/screenplay/types";
import type { ImportedNote } from "@/core/notes";

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
  return (await pdfToLinesAndNotes(data, loadPdfJs)).lines;
}

interface RowItem {
  x: number;
  str: string;
  w: number;
}

interface AnnotationLike {
  subtype?: string;
  rect?: number[];
  quadPoints?: ArrayLike<number> | { x: number; y: number }[][] | null;
  contentsObj?: { str?: string };
  titleObj?: { str?: string };
  modificationDate?: string | null;
  creationDate?: string | null;
}

const NOTE_TYPES = new Set(["Highlight", "Underline", "Squiggly", "StrikeOut", "Text", "FreeText"]);

/** PDF-dato «D:20261009143200Z» / «D:20261009143200+02'00'» → ISO. */
export function pdfDateToIso(d: string | null | undefined): string | null {
  const m = /^D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz+-])?(\d{2})?'?(\d{2})?/.exec(
    d ?? "",
  );
  if (!m) return null;
  const [, y, mo = "01", da = "01", h = "00", mi = "00", se = "00", tz, th = "00", tm = "00"] = m;
  const off = !tz || tz === "Z" || tz === "z" ? "Z" : `${tz}${th}:${tm}`;
  const t = Date.parse(`${y}-${mo}-${da}T${h}:${mi}:${se}${off}`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Firkantene en merknad dekker, som [venstre, topp, høyre, bunn] i PDF-koordinater. */
function quads(a: AnnotationLike): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  const q = a.quadPoints;
  if (q && Array.isArray(q) && q.length && Array.isArray(q[0])) {
    for (const quad of q as { x: number; y: number }[][]) {
      const xs = quad.map((p) => p.x);
      const ys = quad.map((p) => p.y);
      out.push([Math.min(...xs), Math.max(...ys), Math.max(...xs), Math.min(...ys)]);
    }
  } else if (q && (q as ArrayLike<number>).length >= 8) {
    const n = q as ArrayLike<number>;
    for (let i = 0; i + 7 < n.length; i += 8) {
      const xs = [n[i]!, n[i + 2]!, n[i + 4]!, n[i + 6]!];
      const ys = [n[i + 1]!, n[i + 3]!, n[i + 5]!, n[i + 7]!];
      out.push([Math.min(...xs), Math.max(...ys), Math.max(...xs), Math.min(...ys)]);
    }
  }
  if (!out.length && a.rect && a.rect.length === 4) {
    const [x1, y1, x2, y2] = a.rect as [number, number, number, number];
    out.push([Math.min(x1, x2), Math.max(y1, y2), Math.max(x1, x2), Math.min(y1, y2)]);
  }
  return out;
}

/** Linjer og notater (merknader) fra en PDF (DEC-0031: notater gjenopprettes ved ny import). */
export async function pdfToLinesAndNotes(
  data: Uint8Array,
  loadPdfJs: () => Promise<typeof import("pdfjs-dist")> = () => import("pdfjs-dist"),
): Promise<{ lines: RawLine[]; notes: ImportedNote[] }> {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true })
    .promise;
  if (doc.numPages > MAX_PAGES)
    throw new Error(`PDF-en har ${doc.numPages} sider – maks ${MAX_PAGES}`);
  const lines: RawLine[] = [];
  const notes: ImportedNote[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const height = page.getViewport({ scale: 1 }).height;
    const content = await page.getTextContent();
    const rows = new Map<number, RowItem[]>();
    for (const it of content.items as TextItemLike[]) {
      if (typeof it.str !== "string" || it.str.length === 0) continue;
      const x = it.transform[4] ?? 0;
      const yTop = Math.round(height - (it.transform[5] ?? 0));
      const key = [...rows.keys()].find((k) => Math.abs(k - yTop) <= 2) ?? yTop;
      const row = rows.get(key) ?? [];
      row.push({ x, str: it.str, w: it.width });
      rows.set(key, row);
    }
    const kept = new Map<number, RowItem[]>();
    for (const [y, items] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
      items.sort((a, b) => a.x - b.x);
      let text = "";
      let end = -Infinity;
      let prevStr = "";
      const used: RowItem[] = [];
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
        used.push(it);
      }
      if (text.trim()) {
        lines.push({ page: n, x: items[0]!.x, y, text });
        kept.set(y, used);
      }
    }

    // Merknader (notater): teksten under markeringen blir sitatet notatet festes til
    let annots: AnnotationLike[] = [];
    try {
      annots = (await page.getAnnotations({ intent: "display" })) as AnnotationLike[];
    } catch {
      annots = [];
    }
    for (const a of annots) {
      if (!a.subtype || !NOTE_TYPES.has(a.subtype)) continue;
      const text = a.contentsObj?.str?.trim() ?? "";
      if (!text) continue;
      const parts: string[] = [];
      let firstY: number | null = null;
      for (const [x1, top, x2, bottom] of quads(a)) {
        const mid = height - (top + bottom) / 2;
        const rowY = [...kept.keys()].find((y) => Math.abs(y - mid) <= 8);
        if (rowY === undefined) continue;
        if (firstY === null) firstY = rowY;
        if (a.subtype === "Text" || a.subtype === "FreeText") break;
        let picked = "";
        let prevEnd = -Infinity;
        for (const it of kept.get(rowY)!) {
          const cw = it.str.length ? it.w / it.str.length : 0;
          let got = "";
          for (let k = 0; k < it.str.length; k++) {
            const cx = it.x + (k + 0.5) * cw;
            if (cx >= x1 - 0.5 && cx <= x2 + 0.5) got += it.str[k];
          }
          // Mellomrom mellom tekstbiter bare der det er et synlig mellomrom i PDF-en
          if (got && picked && it.x - prevEnd > 1 && !picked.endsWith(" ")) picked += " ";
          picked += got;
          prevEnd = it.x + it.w;
        }
        if (picked.trim()) parts.push(picked.trim());
      }
      if (firstY === null) {
        // Uten tekst under: fest til nærmeste linje over merknaden
        const r = quads(a)[0];
        const top = r ? height - r[1] : 0;
        const above = [...kept.keys()].filter((y) => y <= top + 8);
        firstY = above.length ? Math.max(...above) : ([...kept.keys()][0] ?? 72);
      }
      notes.push({
        page: n,
        y: firstY,
        quote: a.subtype === "Text" || a.subtype === "FreeText" ? "" : parts.join(" "),
        text,
        author: a.titleObj?.str?.trim() ?? "",
        date: pdfDateToIso(a.modificationDate ?? a.creationDate),
      });
    }
    page.cleanup();
  }
  await doc.destroy();
  return { lines, notes };
}
