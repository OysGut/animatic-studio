/**
 * Manusimport i nettleseren (mandat 4.1–4.3, ADR-0007): fil → linjer → tolket manus.
 * Fountain (.fountain/.spmd/.txt, REQ-0089) er ren tekst og tolkes direkte til samme mellomformat.
 * Originalfilen leses bare; den lastes opp uendret (mandat 4.2). pdf.js og arbeideren lastes først når de trengs.
 */
import { parseFountain, parseScreenplayLines, type ParsedScreenplay } from "@/core/screenplay";
import type { ImportedNote } from "@/core/notes";

export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

export interface ReadScreenplay {
  readonly parsed: ParsedScreenplay;
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly format: ScreenplayFileFormat;
  /** Notater i filen (Word-kommentarer, PDF-merknader eller Fountain-notater [[…]]) – gjenopprettes ved import (DEC-0031). */
  readonly notes: readonly ImportedNote[];
}

export type ScreenplayFileFormat = "pdf" | "docx" | "fountain";

/** Filtyper som kan velges i importdialogene. */
export const SCREENPLAY_ACCEPT =
  ".pdf,.docx,.fountain,.spmd,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

/** MIME-type originalen lagres med. */
export function contentTypeOf(format: ScreenplayFileFormat): string {
  if (format === "pdf") return "application/pdf";
  if (format === "docx")
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "text/plain";
}

export function formatOf(name: string): ScreenplayFileFormat | null {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".docx")) return "docx";
  if (n.endsWith(".fountain") || n.endsWith(".spmd") || n.endsWith(".txt")) return "fountain";
  return null;
}

/**
 * Fountain-tekst fra filens bytes. Avviser binærfiler (NUL-tegn, f.eks. en omdøpt PDF eller DOCX).
 * UTF-8 er standard; filer som ikke er gyldig UTF-8 leses som Windows-1252 (eldre norske tekstfiler).
 */
export function decodeFountain(bytes: Uint8Array): string {
  // UTF-16 med byte-rekkefølgemerke (noen Windows-programmer lagrer slik)
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  const head = bytes.subarray(0, 4);
  const zip = head[0] === 0x50 && head[1] === 0x4b;
  const pdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
  if (zip || pdf || bytes.includes(0))
    throw new Error(
      "Filen er ikke en Fountain-tekstfil. Fountain-manus er ren tekst (.fountain, .spmd eller .txt).",
    );
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function readScreenplayFile(file: File): Promise<ReadScreenplay> {
  const format = formatOf(file.name);
  if (!format)
    throw new Error(
      "Velg en PDF-, Word- eller Fountain-fil (.pdf, .docx eller .fountain). Final Draft-filer kan lagres som PDF.",
    );
  if (file.size > MAX_IMPORT_BYTES) throw new Error("Filen er større enn 100 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = await sha256Hex(bytes);
  if (format === "fountain") {
    const { parsed, notes } = parseFountain(decodeFountain(bytes));
    if (!parsed.scenes.some((sc) => sc.elements.length > 0 || !sc.isContinuation))
      throw new Error("Fant ingen manustekst i Fountain-filen.");
    return { parsed, bytes, sha256, format, notes };
  }
  let lines;
  let notes: ImportedNote[];
  if (format === "pdf") {
    const { pdfToLinesAndNotes } = await import("./pdf-lines");
    // pdf.js kan overta bufferen; gi den en kopi så originalen er urørt for opplasting
    ({ lines, notes } = await pdfToLinesAndNotes(bytes.slice(), loadPdfJs as never));
  } else {
    const { docxToLinesAndNotes } = await import("./docx-lines");
    ({ lines, notes } = docxToLinesAndNotes(bytes));
  }
  if (lines.length === 0) {
    throw new Error(
      format === "pdf"
        ? "Fant ingen tekst i PDF-en. Er det en skannet PDF? Den må ha tekst som kan merkes."
        : "Fant ingen tekst i Word-filen.",
    );
  }
  return { parsed: parseScreenplayLines(lines, { format }), bytes, sha256, format, notes };
}

/** Lagringsnøkkel for originalen: <prosjekt>/<sha256>/<trygt filnavn> (DEC-0020 pkt. 4). */
export function sourceStorageKey(projectId: string, sha256: string, fileName: string): string {
  const safe =
    fileName
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[æÆ]/g, "ae")
      .replace(/[øØ]/g, "o")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120) || "manus";
  return `${projectId}/${sha256}/${safe}`;
}
