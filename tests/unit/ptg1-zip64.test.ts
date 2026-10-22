import { expect, it } from "vitest";
import { zipCentralHeader, zipEndRecords } from "@/engine/export/zip64";
import { writeZip } from "@/engine/export/zip";
import { readZipIndex, readZipEntry } from "@/engine/import/zip-read";

it("ZIP64 lagrer syntetiske størrelser og offset over 4 GB uten 4 GB-allokering", () => {
  const size = 0x100000007n, offset = 0x200000003n;
  const header = zipCentralHeader({ name: "large.bin", size, offset, crc: 0 });
  const view = new DataView(header.buffer); const at = 46 + "large.bin".length;
  expect(view.getBigUint64(at + 4, true)).toBe(size); expect(view.getBigUint64(at + 20, true)).toBe(offset);
  const end = new DataView(zipEndRecords(2n, 123n, offset).buffer);
  expect(end.getBigUint64(48, true)).toBe(offset); expect(end.getBigUint64(64, true)).toBe(offset + 123n);
});
it("strømmet ZIP64-pakke kan leses og inneholder tospråklig LESMEG", async () => {
  const chunks: Uint8Array[] = [];
  await writeZip({ write: async b => { chunks.push(b); }, close: async () => {}, abort: async () => {} }, [], {}, { extra: [{ path: "test.txt", data: new TextEncoder().encode("test") }] });
  const blob = new Blob(chunks as BlobPart[]); const index = await readZipIndex(blob);
  const file = index.find(e => e.path === "test.txt"), readme = index.find(e => e.path === "LESMEG.txt");
  if (!file || !readme) throw new Error("missing entries");
  expect(new TextDecoder().decode(await readZipEntry(blob, file))).toBe("test");
  const text = new TextDecoder().decode(await readZipEntry(blob, readme));
  expect(text).toContain("From Pen to Glass"); expect(text).toContain("handleIn"); expect(text).toContain("crossesCut");
});