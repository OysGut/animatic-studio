/**
 * Zip-fil med prosjektets ressurser (DEC-0046): filene hentes én og én og pakkes uten komprimering
 * (bilder, lyd og film er allerede komprimert) med fflate. I nettlesere som støtter det skrives zip-filen
 * rett til disken mens den lages (store prosjekter); ellers samles den i minnet og lastes ned til slutt.
 * Bare på klienten.
 */
import { zipCentralHeader, zipCrcUpdate, zipDescriptor, zipEndRecords, zipLocalHeader, type ZipDirectoryEntry } from "./zip64";
import { interchangeReadme } from "@/core/interchange/readme";
import type { ZipEntry } from "@/core";

import { t as tk } from "@/core/i18n/keyed";

export interface ZipSink {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
  /** Lenke til den ferdige filen når den ble lastet ned fra minnet (vises hvis nedlastingen ble blokkert). */
  link?: () => { url: string; name: string } | null;
}

type SavePicker = (o: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable(): Promise<WritableStreamDefaultWriter & FileSystemWritableLike> }>;
interface FileSystemWritableLike {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

/**
 * Åpner målet for zip-filen. Må kalles rett fra et klikk (før andre «await»), fordi nettleseren bare lar
 * lagringsvinduet åpnes da. null = brukeren avbrøt.
 */
export async function openZipSink(fileName: string): Promise<ZipSink | null> {
  const picker = (globalThis as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: fileName,
        types: [{ description: "Zip-fil", accept: { "application/zip": [".zip"] } }],
      });
      const w = (await handle.createWritable()) as unknown as FileSystemWritableLike;
      return {
        write: (c) => w.write(c),
        close: () => w.close(),
        abort: () => w.abort(),
      };
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return null;
      // Ellers: last ned på vanlig måte
    }
  }
  if (typeof navigator.storage?.getDirectory === "function") {
    const { openAlphaSink } = await import("./alpha");
    return openAlphaSink(fileName, "application/zip");
  }
  const parts: Uint8Array[] = [];
  let link: { url: string; name: string } | null = null;
  return {
    write: async (c) => {
      parts.push(c);
    },
    close: async () => {
      const blob = new Blob(parts as unknown as BlobPart[], { type: "application/zip" });
      parts.length = 0;
      const url = URL.createObjectURL(blob);
      link = { url, name: fileName };
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch {
        // Nedlasting blokkert (f.eks. i en innebygd forhåndsvisning) – lenken i vinduet brukes i stedet
      }
    },
    abort: async () => {
      parts.length = 0;
    },
    link: () => link,
  };
}

export interface ZipProgress {
  readonly files: number;
  readonly totalFiles: number;
  readonly bytes: number;
  readonly totalBytes: number;
}

/**
 * Pakker filene i zip-filen. `urls`: mediesti → signert lenke. Filer som ikke kan hentes, listes i
 * «MANGLER.txt» i zip-filen og returneres.
 */
export async function writeZip(
  sink: ZipSink,
  entries: readonly Pick<ZipEntry, "path" | "mediaPath" | "byteSize">[],
  urls: Readonly<Record<string, string>>,
  o: {
    onProgress?: (p: ZipProgress) => void;
    signal?: AbortSignal;
    /** Filer laget i minnet (f.eks. sikkerhetskopiens data), skrives først. */
    extra?: readonly { readonly path: string; readonly data: Uint8Array }[] | AsyncIterable<{ readonly path: string; readonly data: Uint8Array }>;
  } = {},
): Promise<{ missing: string[] }> {
  let written = 0n;
  const directory: ZipDirectoryEntry[] = [];
  const names = new Set<string>();
  const check = () => { if (o.signal?.aborted) throw new DOMException(tk("engine-export-zip.write-zip.message.080bb98d06cc"), "AbortError"); };
  const write = async (data: Uint8Array) => { check(); await sink.write(data); written += BigInt(data.byteLength); };
  const add = async (name: string, chunks: AsyncIterable<Uint8Array>) => {
    if (names.has(name)) throw new Error(tk("engine-export-zip.zip.message.d8988ee64a25"));
    names.add(name);
    const offset = written;
    await write(zipLocalHeader(name));
    let size = 0n;
    let crc = 0xffffffff;
    for await (const data of chunks) { check(); crc = zipCrcUpdate(crc, data); size += BigInt(data.byteLength); await write(data); }
    crc = (crc ^ 0xffffffff) >>> 0;
    await write(zipDescriptor(crc, size));
    directory.push({ name, offset, size, crc });
  };
  async function* one(data: Uint8Array) { yield data; }
  const totalBytes = entries.reduce((t, e) => t + e.byteSize, 0);
  let bytes = 0;
  const missing: string[] = [];
  try {
    for await (const x of o.extra ?? []) {
      if (o.signal?.aborted) throw new DOMException(tk("engine-export-zip.write-zip.message.080bb98d06cc"), "AbortError");
      await add(x.path, one(x.data));
    }
    if (!names.has("LESMEG.txt")) await add("LESMEG.txt", one(interchangeReadme()));
    for (let i = 0; i < entries.length; i++) {
      if (o.signal?.aborted) throw new DOMException(tk("engine-export-zip.write-zip.message.080bb98d06cc.2"), "AbortError");
      const e = entries[i];
      if (!e) continue;
      const url = urls[e.mediaPath];
      const res = url ? await fetch(url, { signal: o.signal ?? null }).catch(() => null) : null;
      if (!res?.ok || !res.body) {
        missing.push(e.path);
        bytes += e.byteSize;
        continue;
      }
      const reader = res.body.getReader();
      async function* chunks() {
        try {
          for (;;) {
            check(); const { done, value } = await reader.read(); if (done) break;
            bytes += value.byteLength;
            yield value;
            o.onProgress?.({ files: i, totalFiles: entries.length, bytes, totalBytes });
          }
        } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
      }
      await add(e.path, chunks());
      o.onProgress?.({ files: i + 1, totalFiles: entries.length, bytes, totalBytes });
    }
    if (missing.length > 0) {
      // i18n-ignore: fast filnavn i pakkeformatet
      await add("MANGLER.txt", one(
        new TextEncoder().encode(
          tk("engine-export-zip.write-zip.new-text-encoder-encode.d311a09da39a", { value1: String(missing.join("\n")) }),
        ),
      ));
    }
    if (o.signal?.aborted) throw new DOMException(tk("engine-export-zip.write-zip.message.080bb98d06cc.3"), "AbortError");
    const directoryOffset = written;
    for (const e of directory) await write(zipCentralHeader(e));
    const directorySize = written - directoryOffset;
    await write(zipEndRecords(BigInt(directory.length), directorySize, directoryOffset));
    await sink.close();
    return { missing };
  } catch (e) {
    await sink.abort().catch(() => undefined);
    throw e;
  }
}
