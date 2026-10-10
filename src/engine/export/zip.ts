/**
 * Zip-fil med prosjektets ressurser (DEC-0046): filene hentes én og én og pakkes uten komprimering
 * (bilder, lyd og film er allerede komprimert) med fflate. I nettlesere som støtter det skrives zip-filen
 * rett til disken mens den lages (store prosjekter); ellers samles den i minnet og lastes ned til slutt.
 * Bare på klienten.
 */
import { Zip, ZipPassThrough } from "fflate";
import type { ZipEntry } from "@/core";

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
  entries: readonly ZipEntry[],
  urls: Readonly<Record<string, string>>,
  o: { onProgress?: (p: ZipProgress) => void; signal?: AbortSignal } = {},
): Promise<{ missing: string[] }> {
  let chain = Promise.resolve();
  let failure: unknown = null;
  const zip = new Zip((err, data, final) => {
    if (err) {
      failure = err;
      return;
    }
    chain = chain.then(() => sink.write(data));
    if (final) chain = chain.then(() => sink.close());
  });
  const totalBytes = entries.reduce((t, e) => t + e.byteSize, 0);
  let bytes = 0;
  const missing: string[] = [];
  try {
    for (let i = 0; i < entries.length; i++) {
      if (o.signal?.aborted) throw new DOMException("Avbrutt", "AbortError");
      const e = entries[i]!;
      const url = urls[e.mediaPath];
      const res = url ? await fetch(url, { signal: o.signal ?? null }).catch(() => null) : null;
      if (!res?.ok || !res.body) {
        missing.push(e.path);
        bytes += e.byteSize;
        continue;
      }
      const f = new ZipPassThrough(e.path);
      zip.add(f);
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        f.push(value);
        bytes += value.byteLength;
        // Ikke la minnet fylles: vent til skrivingen har tatt igjen
        await chain;
        if (failure) throw failure;
        o.onProgress?.({ files: i, totalFiles: entries.length, bytes, totalBytes });
      }
      f.push(new Uint8Array(0), true);
      await chain;
      o.onProgress?.({ files: i + 1, totalFiles: entries.length, bytes, totalBytes });
    }
    if (missing.length > 0) {
      const note = new ZipPassThrough("MANGLER.txt");
      zip.add(note);
      note.push(
        new TextEncoder().encode(
          `Disse filene kunne ikke hentes da zip-filen ble laget:\n\n${missing.join("\n")}\n`,
        ),
        true,
      );
    }
    zip.end();
    await chain;
    if (failure) throw failure;
    return { missing };
  } catch (e) {
    zip.terminate();
    await chain.catch(() => undefined);
    await sink.abort().catch(() => undefined);
    throw e;
  }
}
