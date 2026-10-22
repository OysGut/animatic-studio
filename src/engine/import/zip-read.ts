/**
 * Leser en zip-fil uten å laste hele filen inn i minnet (sikkerhetskopi, DEC-0049): innholdsfortegnelsen
 * leses fra slutten av filen, og hver fil hentes som en del (Blob.slice) av originalen. Filer som er lagret
 * uten komprimering (slik sikkerhetskopien lager dem), kopieres aldri; komprimerte filer pakkes ut i minnet.
 * ZIP64-størrelser leses med BigInt og valideres før Blob.slice.
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
  const safe64 = (v: DataView, at: number) => {
    const n = v.getBigUint64(at, true);
    if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(t("engine-import-zip-read.read-zip-index.message.0cf2daef7956"));
    return Number(n);
  };
  let count = end.getUint16(eocd + 10, true);
  let cdSize = end.getUint32(eocd + 12, true);
  let cdOffset = end.getUint32(eocd + 16, true);
  if (eocd >= 20 && end.getUint32(eocd - 20, true) === 0x07064b50) {
    const offset = safe64(end, eocd - 12);
    const z = await bytes(file, offset, offset + 56);
    if (z.byteLength !== 56 || z.getUint32(0, true) !== 0x06064b50) throw new Error(t("engine-import-zip-read.read-zip-index.message.0cf2daef7956"));
    count = safe64(z, 32); cdSize = safe64(z, 40); cdOffset = safe64(z, 48);
  } else if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new Error(t("engine-import-zip-read.read-zip-index.message.508d578599e5"));
  }
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
    let compressedSize = cd.getUint32(p + 20, true);
    let size = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    let localOffset = cd.getUint32(p + 42, true);
    if (p + 46 + nameLen + extraLen + commentLen > cd.byteLength) throw new Error(t("engine-import-zip-read.read-zip-index.message.6fc57fbaa34f"));
    let q = p + 46 + nameLen;
    const extraEnd = q + extraLen;
    while (q + 4 <= extraEnd) {
      const id = cd.getUint16(q, true), len = cd.getUint16(q + 2, true);
      if (q + 4 + len > extraEnd) throw new Error(t("engine-import-zip-read.read-zip-index.message.6fc57fbaa34f"));
      if (id === 1) {
        let at = q + 4;
        const read = () => { if (at + 8 > q + 4 + len) throw new Error(t("engine-import-zip-read.read-zip-index.message.6fc57fbaa34f")); const n = safe64(cd, at); at += 8; return n; };
        if (size === 0xffffffff) size = read();
        if (compressedSize === 0xffffffff) compressedSize = read();
        if (localOffset === 0xffffffff) localOffset = read();
      }
      q += 4 + len;
    }
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
