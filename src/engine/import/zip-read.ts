/**
 * Leser en zip-fil uten å laste hele filen inn i minnet (sikkerhetskopi, DEC-0049): innholdsfortegnelsen
 * leses fra slutten av filen, og hver fil hentes som en del (Blob.slice) av originalen. Filer som er lagret
 * uten komprimering (slik sikkerhetskopien lager dem), kopieres aldri; komprimerte filer pakkes ut i minnet.
 * Zip64 (filer over 4 GB) støttes ikke – sikkerhetskopien lager aldri slike.
 */
import { inflateSync } from "fflate";

import { t } from "@/core/i18n/keyed";

export interface ZipIndexEntry {
  readonly name: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly localOffset: number;
}

async function bytes(b: Blob, start: number, end: number): Promise<DataView> {
  return new DataView(await b.slice(start, end).arrayBuffer());
}

/** Innholdsfortegnelsen: filnavn → plassering. Kaster med norsk melding hvis filen ikke er en zip-fil. */
export async function readZipIndex(file: Blob): Promise<Map<string, ZipIndexEntry>> {
  const tail = Math.min(file.size, 22 + 65535);
  const end = await bytes(file, file.size - tail, file.size);
  let eocd = -1;
  for (let i = end.byteLength - 22; i >= 0; i--) {
    if (end.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(t("engine-import-zip-read.read-zip-index.message.377a90f2e29b"));
  const count = end.getUint16(eocd + 10, true);
  const cdSize = end.getUint32(eocd + 12, true);
  const cdOffset = end.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff)
    throw new Error(
      t("engine-import-zip-read.read-zip-index.message.508d578599e5"),
    );
  if (cdOffset + cdSize > file.size)
    throw new Error(
      t("engine-import-zip-read.read-zip-index.message.0cf2daef7956"),
    );
  const cd = await bytes(file, cdOffset, cdOffset + cdSize);
  const dec = new TextDecoder("utf-8");
  const out = new Map<string, ZipIndexEntry>();
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > cd.byteLength || cd.getUint32(p, true) !== 0x02014b50)
      throw new Error(
        t("engine-import-zip-read.read-zip-index.message.6fc57fbaa34f"),
      );
    const method = cd.getUint16(p + 10, true);
    const compressedSize = cd.getUint32(p + 20, true);
    const size = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    const localOffset = cd.getUint32(p + 42, true);
    const name = dec.decode(
      new Uint8Array(cd.buffer, cd.byteOffset + p + 46, Math.min(nameLen, cd.byteLength - p - 46)),
    );
    out.set(name, { name, method, compressedSize, size, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Innholdet i én fil i zip-filen. */
export async function zipEntryBlob(file: Blob, e: ZipIndexEntry, type = ""): Promise<Blob> {
  const h = await bytes(file, e.localOffset, e.localOffset + 30);
  if (h.byteLength < 30 || h.getUint32(0, true) !== 0x04034b50)
    throw new Error(t("engine-import-zip-read.zip-entry-blob.message.d7953441644d", { name: String(e.name) }));
  const start = e.localOffset + 30 + h.getUint16(26, true) + h.getUint16(28, true);
  if (start + e.compressedSize > file.size)
    throw new Error(
      t("engine-import-zip-read.zip-entry-blob.message.06b543ceeaa0", { name: String(e.name) }),
    );
  const raw = file.slice(start, start + e.compressedSize, type);
  if (e.method === 0) return raw;
  if (e.method === 8) {
    if (e.size > 256 * 1024 * 1024)
      throw new Error(
        t("engine-import-zip-read.zip-entry-blob.message.5f2329b4c57a", { value1: String(e.name.split("/").pop()) }),
      );
    const data = inflateSync(new Uint8Array(await raw.arrayBuffer()));
    return new Blob([data as unknown as BlobPart], { type });
  }
  throw new Error(
    t("engine-import-zip-read.zip-entry-blob.message.b1d9207dc330", { name: String(e.name) }),
  );
}

export async function zipEntryText(file: Blob, e: ZipIndexEntry): Promise<string> {
  return (await zipEntryBlob(file, e)).text();
}
