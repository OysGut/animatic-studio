/**
 * Manuseksport til PDF (mandat 5.3, REQ-0088). Skriver sidene nøyaktig slik sidebrytingen i kjernen har lagt dem ut:
 * US Letter, Courier 12 pt (standardfont i PDF – ingen innebygging nødvendig), samme posisjoner som Final Draft.
 * Ren funksjon uten avhengigheter: samme inndata gir byte-identisk PDF (bortsett fra valgfri dato).
 */
import type { Page } from "@/core/screenplay";
import type { NotePlacement } from "@/core/notes";

const PAGE_W = 612;
const PAGE_H = 792;
const BODY_TOP = 81; // grunnlinje for linje 0, målt fra toppen (referansemanuset)
const LINE = 12;
const CHAR = 7.2;
const PAGE_NUMBER_RIGHT = 522.4;
const SCENE_NUMBER_LEFT = 54;
const SCENE_NUMBER_RIGHT = 516.6;

/** Unicode → WinAnsiEncoding (dekker norsk, svensk, dansk, tysk, fransk og typografiske tegn). */
const WIN_ANSI_EXTRA: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  ƒ: 0x83,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  ˆ: 0x88,
  "‰": 0x89,
  Š: 0x8a,
  "‹": 0x8b,
  Œ: 0x8c,
  Ž: 0x8e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "˜": 0x98,
  "™": 0x99,
  š: 0x9a,
  "›": 0x9b,
  œ: 0x9c,
  ž: 0x9e,
  Ÿ: 0x9f,
};

export function toWinAnsi(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff)) out.push(c);
    else if (WIN_ANSI_EXTRA[ch] !== undefined) out.push(WIN_ANSI_EXTRA[ch]);
    else if (c === 0x09) out.push(0x20);
    else out.push(0x3f); // «?» for tegn utenfor tegnsettet
  }
  return out;
}

function pdfString(text: string): string {
  let s = "(";
  for (const b of toWinAnsi(text)) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) s += "\\" + String.fromCharCode(b);
    else if (b < 0x20 || b > 0x7e) s += "\\" + b.toString(8).padStart(3, "0");
    else s += String.fromCharCode(b);
  }
  return s + ")";
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export interface PdfOptions {
  readonly title?: string;
  /** Tittelside: linjer som sentreres øverst på side 1 (før manussidene). */
  readonly titlePage?: readonly string[];
  /** Vis sidetall fra og med side 2 (Final Draft-standard). */
  readonly pageNumbers?: boolean;
  /** Notater som PDF-merknader (markering + tekst, navn og tidspunkt) – DEC-0031. */
  readonly notes?: readonly NotePlacement[];
}

/** Tekststreng i UTF-16 (tåler alle tegn, også i navn og notater). */
function pdfText(text: string): string {
  let hex = "FEFF";
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, "0");
  return `<${hex.toUpperCase()}>`;
}

/** ISO-tid → PDF-dato «D:YYYYMMDDHHmmSSZ». */
function pdfDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `(D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z)`;
}

/** Gul markering med notatet som merknad (åpnes i alle vanlige PDF-lesere). */
function highlight(n: NotePlacement): string {
  const quads: number[] = [];
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const part of n.parts) {
    const base = PAGE_H - (BODY_TOP + part.row * LINE);
    const top = base + 9.5;
    const bottom = base - 2.5;
    const l = part.left * CHAR;
    const r = part.right * CHAR;
    quads.push(l, top, r, top, l, bottom, r, bottom);
    x1 = Math.min(x1, l);
    x2 = Math.max(x2, r);
    y1 = Math.min(y1, bottom);
    y2 = Math.max(y2, top);
  }
  const date = pdfDate(n.note.stampAt);
  return (
    `<< /Type /Annot /Subtype /Highlight /F 4 /Rect [${[x1, y1, x2, y2].map(fmt).join(" ")}]` +
    ` /QuadPoints [${quads.map(fmt).join(" ")}] /C [1 0.82 0.3] /CA 0.45` +
    ` /T ${pdfText(n.note.author)} /Contents ${pdfText(n.note.text)} /Subj (Notat)` +
    ` /NM ${pdfString(n.note.id)}${date ? ` /M ${date} /CreationDate ${date}` : ""} >>`
  );
}

function pageContent(page: Page, opts: PdfOptions): string {
  const ops: string[] = ["BT", "/F1 12 Tf"];
  const put = (x: number, yTop: number, text: string) => {
    ops.push(`1 0 0 1 ${fmt(x)} ${fmt(PAGE_H - yTop)} Tm ${pdfString(text)} Tj`);
  };
  if (opts.pageNumbers !== false && page.number > 1) {
    const t = `${page.number}.`;
    put(PAGE_NUMBER_RIGHT - t.length * CHAR, BODY_TOP - 3 * LINE, t);
  }
  for (const l of page.lines) {
    if (!l.text) continue;
    const y = BODY_TOP + l.row * LINE;
    put(l.left * CHAR, y, l.text);
    if (l.kind === "heading" && l.first && l.sceneNumber) {
      put(SCENE_NUMBER_LEFT, y, l.sceneNumber);
      put(SCENE_NUMBER_RIGHT, y, l.sceneNumber);
    }
  }
  ops.push("ET");
  return ops.join("\n");
}

function titleContent(lines: readonly string[]): string {
  const ops: string[] = ["BT", "/F1 12 Tf"];
  let y = 252;
  for (const t of lines) {
    const x = (PAGE_W - t.length * CHAR) / 2;
    ops.push(`1 0 0 1 ${fmt(Math.max(72, x))} ${fmt(PAGE_H - y)} Tm ${pdfString(t)} Tj`);
    y += 2 * LINE;
  }
  ops.push("ET");
  return ops.join("\n");
}

/** Lager en PDF av ferdig sidebrutte manussider. */
export function screenplayPdf(pages: readonly Page[], opts: PdfOptions = {}): Uint8Array {
  const contents: string[] = [];
  if (opts.titlePage?.length) contents.push(titleContent(opts.titlePage));
  for (const p of pages) contents.push(pageContent(p, opts));
  if (contents.length === 0) contents.push("");

  // Objekter: 1 katalog, 2 sidetre, 3 font, 4 info, deretter (side, innhold) parvis, til slutt merknader
  const objs: string[] = [];
  const pageIds: number[] = [];
  const first = 5;
  const titleOffset = opts.titlePage?.length ? 1 : 0;
  const contentIndex = new Map(pages.map((p, i) => [p.number, i + titleOffset]));
  const annotsByContent = new Map<number, string[]>();
  let nextId = first + contents.length * 2;
  for (const n of opts.notes ?? []) {
    const ci = contentIndex.get(n.page);
    if (ci === undefined || !n.parts.length) continue;
    const id = nextId++;
    objs[id] = highlight(n);
    annotsByContent.set(ci, [...(annotsByContent.get(ci) ?? []), `${id} 0 R`]);
  }
  contents.forEach((c, i) => {
    const pageId = first + i * 2;
    pageIds.push(pageId);
    const annots = annotsByContent.get(i);
    objs[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R${annots ? ` /Annots [${annots.join(" ")}]` : ""} >>`;
    objs[pageId + 1] = `<< /Length ${c.length} >>\nstream\n${c}\nendstream`;
  });
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>";
  objs[4] = `<< /Producer (Animatic Studio)${opts.title ? ` /Title ${pdfString(opts.title)}` : ""} >>`;

  let out = "%PDF-1.4\n%âãÏÓ\n";
  const offsets: number[] = [];
  // Alt skrives som Latin-1 (ett tegn = én byte); innholdet er ASCII fordi pdfString koder resten oktalt
  let pos = out.length;
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = pos;
    const chunk = `${i} 0 obj\n${objs[i]}\nendobj\n`;
    out += chunk;
    pos += chunk.length;
  }
  const xref = pos;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Latin-1: hvert tegn er én byte
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
