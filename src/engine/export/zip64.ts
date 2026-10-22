/** Stored ZIP/ZIP64 records. BigInt prevents truncating offsets above 4 GiB. */
const MAX32 = 0xffffffffn;
const text = new TextEncoder();
function record(size: number) { const bytes = new Uint8Array(size); return { bytes, view: new DataView(bytes.buffer) }; }
export interface ZipDirectoryEntry { readonly name: string; readonly size: bigint; readonly offset: bigint; readonly crc: number }
export function zipLocalHeader(name: string): Uint8Array {
  const n = text.encode(name);
  const { bytes, view: v } = record(30 + n.length + 20);
  v.setUint32(0, 0x04034b50, true); v.setUint16(4, 45, true); v.setUint16(6, 0x808, true);
  v.setUint16(12, 0x21, true); v.setUint32(18, 0xffffffff, true); v.setUint32(22, 0xffffffff, true);
  v.setUint16(26, n.length, true); v.setUint16(28, 20, true); bytes.set(n, 30);
  v.setUint16(30 + n.length, 1, true); v.setUint16(32 + n.length, 16, true);
  return bytes;
}
export function zipDescriptor(crc: number, size: bigint): Uint8Array {
  const { bytes, view: v } = record(24);
  v.setUint32(0, 0x08074b50, true); v.setUint32(4, crc, true);
  v.setBigUint64(8, size, true); v.setBigUint64(16, size, true); return bytes;
}
export function zipCentralHeader(e: ZipDirectoryEntry): Uint8Array {
  const n = text.encode(e.name);
  const { bytes, view: v } = record(46 + n.length + 28);
  v.setUint32(0, 0x02014b50, true); v.setUint16(4, 45, true); v.setUint16(6, 45, true);
  v.setUint16(8, 0x808, true); v.setUint16(14, 0x21, true); v.setUint32(16, e.crc, true);
  v.setUint32(20, 0xffffffff, true); v.setUint32(24, 0xffffffff, true);
  v.setUint16(28, n.length, true); v.setUint16(30, 28, true); v.setUint32(42, 0xffffffff, true);
  bytes.set(n, 46); const at = 46 + n.length;
  v.setUint16(at, 1, true); v.setUint16(at + 2, 24, true);
  v.setBigUint64(at + 4, e.size, true); v.setBigUint64(at + 12, e.size, true); v.setBigUint64(at + 20, e.offset, true);
  return bytes;
}
export function zipEndRecords(count: bigint, directorySize: bigint, directoryOffset: bigint): Uint8Array {
  const { bytes, view: v } = record(56 + 20 + 22);
  v.setUint32(0, 0x06064b50, true); v.setBigUint64(4, 44n, true); v.setUint16(12, 45, true); v.setUint16(14, 45, true);
  v.setBigUint64(24, count, true); v.setBigUint64(32, count, true); v.setBigUint64(40, directorySize, true); v.setBigUint64(48, directoryOffset, true);
  v.setUint32(56, 0x07064b50, true); v.setBigUint64(64, directoryOffset + directorySize, true); v.setUint32(72, 1, true);
  v.setUint32(76, 0x06054b50, true); v.setUint16(84, Number(count > 65535n ? 65535n : count), true);
  v.setUint16(86, Number(count > 65535n ? 65535n : count), true);
  v.setUint32(88, Number(directorySize > MAX32 ? MAX32 : directorySize), true);
  v.setUint32(92, Number(directoryOffset > MAX32 ? MAX32 : directoryOffset), true); return bytes;
}
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
});
export function zipCrcUpdate(crc: number, bytes: Uint8Array): number {
  let c = crc; for (const b of bytes) c = (crcTable[(c ^ b) & 255] ?? 0) ^ (c >>> 8); return c >>> 0;
}