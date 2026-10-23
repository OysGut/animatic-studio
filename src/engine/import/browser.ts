/**
 * Manusimport i nettleseren (mandat 4.1–4.3, ADR-0007): fil → linjer → tolket manus.
 * Fountain (.fountain/.spmd/.txt, REQ-0089) er ren tekst og tolkes direkte til samme mellomformat.
 * Originalfilen leses bare; den lastes opp uendret (mandat 4.2). pdf.js og arbeideren lastes først når de trengs.
 */
import { parseFountain, parseScreenplayLines, type ParsedScreenplay } from "@/core/screenplay";
import { scriptLanguageHint } from "@/core/screenplay/import-language";
import { canonicalLanguageTag } from "@/core/translation/language-tags";
import type { ImportedNote } from "@/core/notes";

import { t } from "@/core/i18n/keyed";

export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

export interface ReadScreenplay {
  readonly parsed: ParsedScreenplay;
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly format: ScreenplayFileFormat;
  /** Notater i filen (Word-kommentarer, PDF-merknader eller Fountain-notater [[…]]) – gjenopprettes ved import (DEC-0031). */
  readonly notes: readonly ImportedNote[];
  /**
   * G-1b: hint om filens språk fra metadata (Word) eller skriftsystemet i teksten.
   * Alltid et usikkert forslag – brukeren bekrefter. Null når ingenting skiller seg ut
   * (for eksempel latinsk tekst); da foreslår brukerflaten prosjektets kildespråk.
   */
  readonly languageHint: { readonly language: string; readonly basis: "metadata" | "script" } | null;
}

export type ScreenplayFileFormat = "pdf" | "docx" | "fountain" | "fdx";

/** Filtyper som kan velges i importdialogene. */
export const SCREENPLAY_ACCEPT =
  ".pdf,.docx,.fdx,.fountain,.spmd,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

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
  if (n.endsWith(".fdx")) return "fdx";
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
      t("engine-import-browser.decode-fountain.message.af53ad05831d"),
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
      t("engine-import-browser.read-screenplay-file.message.d4aaf95bf60f"),
    );
  if (file.size > MAX_IMPORT_BYTES)
    throw new Error(t("engine-import-browser.read-screenplay-file.message.bd8815be4553"));
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = await sha256Hex(bytes);
  if (format === "fountain" || format === "fdx") {
    // G-1b: Final Draft er åpen XML; avsnittene gjøres om til tvungen Fountain og tolkes likt.
    let text = decodeFountain(bytes);
    if (format === "fdx") {
      const { fdxToFountain } = await import("@/core/screenplay/fdx");
      try {
        text = fdxToFountain(text);
      } catch {
        throw new Error(t("g1b-fdx.import.invalid"));
      }
    }
    const { parsed, notes } = parseFountain(text);
    if (!parsed.scenes.some((sc) => sc.elements.length > 0 || !sc.isContinuation))
      throw new Error(
        t("engine-import-browser.read-screenplay-file.message.be31e7cdbed8"),
      );
    const hint = scriptLanguageHint(text);
    return { parsed, bytes, sha256, format, notes, languageHint: hint ? { language: hint, basis: "script" } : null };
  }
  let lines;
  let notes: ImportedNote[];
  let metadataLanguage: string | null = null;
  if (format === "pdf") {
    const { pdfToLinesAndNotes } = await import("./pdf-lines");
    // pdf.js kan overta bufferen; gi den en kopi så originalen er urørt for opplasting
    ({ lines, notes } = await pdfToLinesAndNotes(bytes.slice(), loadPdfJs as never));
  } else {
    const { docxLanguage, docxToLinesAndNotes } = await import("./docx-lines");
    metadataLanguage = docxLanguage(bytes);
    ({ lines, notes } = docxToLinesAndNotes(bytes));
  }
  if (lines.length === 0) {
    throw new Error(
      format === "pdf"
        ? t("engine-import-browser.read-screenplay-file.message.9a0ff2b5e05d")
        : t("engine-import-browser.read-screenplay-file.message.dc9ed1cb5144"),
    );
  }
  const meta = metadataLanguage ? canonicalLanguageTag(metadataLanguage) : null;
  const hint = meta ?? scriptLanguageHint(lines.map((l) => l.text).join("\n"));
  return {
    parsed: parseScreenplayLines(lines, { format }),
    bytes,
    sha256,
    format,
    notes,
    languageHint: hint ? { language: hint, basis: meta ? "metadata" : "script" } : null,
  };
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
