// @vitest-environment node
/** Lesing av zip-filer uten å laste hele filen (sikkerhetskopi, DEC-0049). */
import { describe, expect, it } from "vitest";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { readZipIndex, zipEntryBlob, zipEntryText } from "@/engine/import/zip-read";
import { writeZip, type ZipSink } from "@/engine/export/zip";

function build(files: { name: string; data: Uint8Array; deflate?: boolean }[]): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const parts: Uint8Array[] = [];
    const zip = new Zip((err, chunk, final) => {
      if (err) return reject(err);
      parts.push(chunk);
      if (final) resolve(new Blob(parts as unknown as BlobPart[]));
    });
    for (const f of files) {
      const e = f.deflate ? new ZipDeflate(f.name) : new ZipPassThrough(f.name);
      zip.add(e);
      e.push(f.data, true);
    }
    zip.end();
  });
}

const enc = (s: string) => new TextEncoder().encode(s);

describe("zip-lesing", () => {
  it("finner filene og henter innholdet (lagret og komprimert, æøå i navn)", async () => {
    const big = new Uint8Array(200_000).map((_, i) => i % 251);
    const blob = await build([
      { name: "animatic-backup.json", data: enc('{"a":1}') },
      { name: "filer/assets/p/ø/bilde.png", data: big },
      { name: "LES-MEG.txt", data: enc("Hei på deg ".repeat(500)), deflate: true },
    ]);
    const idx = await readZipIndex(blob);
    expect([...idx.keys()]).toEqual([
      "animatic-backup.json",
      "filer/assets/p/ø/bilde.png",
      "LES-MEG.txt",
    ]);
    expect(await zipEntryText(blob, idx.get("animatic-backup.json")!)).toBe('{"a":1}');
    const img = await zipEntryBlob(blob, idx.get("filer/assets/p/ø/bilde.png")!, "image/png");
    expect(img.type).toBe("image/png");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(big);
    expect(await zipEntryText(blob, idx.get("LES-MEG.txt")!)).toBe("Hei på deg ".repeat(500));
  });

  it("avviser filer som ikke er zip", async () => {
    await expect(readZipIndex(new Blob([enc("ikke zip")]))).rejects.toThrow(/ikke en zip-fil/);
  });

  it("writeZip skriver ekstra filer fra minnet først og kan leses igjen", async () => {
    const parts: Uint8Array[] = [];
    const sink: ZipSink = {
      write: async (c) => {
        parts.push(c);
      },
      close: async () => undefined,
      abort: async () => undefined,
    };
    await writeZip(sink, [], {}, { extra: [{ path: "a.json", data: enc("[1,2]") }] });
    const blob = new Blob(parts as unknown as BlobPart[]);
    const idx = await readZipIndex(blob);
    expect(await zipEntryText(blob, idx.get("a.json")!)).toBe("[1,2]");
  });
});
