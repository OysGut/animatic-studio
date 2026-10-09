/**
 * Manusimport i nettleseren (mandat 4.1–4.3, ADR-0007): fil → linjer → tolket manus.
 * Originalfilen leses bare; den lastes opp uendret (mandat 4.2). pdf.js og arbeideren lastes først når de trengs.
 */
import { parseScreenplayLines, type ParsedScreenplay } from "@/core/screenplay";

export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

export interface ReadScreenplay {
  readonly parsed: ParsedScreenplay;
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly format: "pdf" | "docx";
}

export function formatOf(name: string): "pdf" | "docx" | null {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".docx")) return "docx";
  return null;
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
      "Velg en PDF- eller Word-fil (.pdf eller .docx). Final Draft-filer kan lagres som PDF.",
    );
  if (file.size > MAX_IMPORT_BYTES) throw new Error("Filen er større enn 100 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = await sha256Hex(bytes);
  let lines;
  if (format === "pdf") {
    const { pdfToLines } = await import("./pdf-lines");
    // pdf.js kan overta bufferen; gi den en kopi så originalen er urørt for opplasting
    lines = await pdfToLines(bytes.slice(), loadPdfJs as never);
  } else {
    const { docxToLines } = await import("./docx-lines");
    lines = docxToLines(bytes);
  }
  if (lines.length === 0) {
    throw new Error(
      format === "pdf"
        ? "Fant ingen tekst i PDF-en. Er det en skannet PDF? Den må ha tekst som kan merkes."
        : "Fant ingen tekst i Word-filen.",
    );
  }
  return { parsed: parseScreenplayLines(lines, { format }), bytes, sha256, format };
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
