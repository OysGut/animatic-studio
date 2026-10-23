// @vitest-environment node
/**
 * N9 (KI-66/KI-80): pakker over 4 GB og med over 65 535 filer skrives og leses med ZIP64.
 * Ingen 4 GB skrives til disk eller minne: én delt buffer med nullbytes strømmes mange ganger, og
 * «filen» som leses tilbake er en virtuell Blob der nullområdet lages ved behov.
 */
import { afterEach, expect, it, vi } from "vitest";
import { writeZip } from "@/engine/export/zip";
import { readZipIndex, zipEntryText } from "@/engine/import/zip-read";
import { ZIP_MAX_BYTES } from "@/app/library/AssetZip";

afterEach(() => vi.unstubAllGlobals());

const CHUNK = 32 * 1024 * 1024;
const zeros = new Uint8Array(CHUNK);

type Seg = { data: Uint8Array } | { zeros: number };

/** Mottaker som bare beholder topptekster; den delte nullbufferen lagres som en lengde. */
function recordingSink() {
  const segs: Seg[] = [];
  return { segs, sink: { write: async (c: Uint8Array) => { segs.push(c === zeros ? { zeros: c.byteLength } : { data: c.slice() }); }, close: async () => {}, abort: async () => {} } };
}

/** Virtuell Blob over segmentene; slice gir ekte bytes (nuller der dataene var nuller). */
function virtualFile(segs: readonly Seg[]): Blob {
  const starts: number[] = [];
  let size = 0;
  for (const s of segs) { starts.push(size); size += "data" in s ? s.data.byteLength : s.zeros; }
  const slice = (a = 0, b = size, type = ""): Blob => {
    const end = Math.min(b, size);
    if (end - a > 64 * 1024 * 1024) throw new Error("for stor lesing i testen");
    const out = new Uint8Array(Math.max(0, end - a));
    segs.forEach((s, i) => {
      const s0 = starts[i]!, len = "data" in s ? s.data.byteLength : s.zeros;
      const from = Math.max(a, s0), to = Math.min(end, s0 + len);
      if (to > from && "data" in s) out.set(s.data.subarray(from - s0, to - s0), from - a);
    });
    return new Blob([out], { type });
  };
  return { size, slice } as unknown as Blob;
}

it("en fil over 4 GB får ZIP64-størrelse og etterfølgende filer offset over 4 GB, og pakken kan leses", async () => {
  const total = 4 * 1024 * 1024 * 1024 + 2 * CHUNK; // 4 GiB + 64 MiB
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    body: new ReadableStream<Uint8Array>({
      start() {},
      pull(c) { const sent = (this as { n?: number }).n ?? 0; if (sent * CHUNK >= total) { c.close(); return; } (this as { n?: number }).n = sent + 1; c.enqueue(zeros); },
    }),
  }));
  const { segs, sink } = recordingSink();
  const res = await writeZip(sink, [{ path: "film/stor.mov", mediaPath: "m/stor.mov", byteSize: total }, { path: "etter.txt", mediaPath: "m/etter", byteSize: 4 }], { "m/stor.mov": "u1" }, {
    extra: [{ path: "data.json", data: new TextEncoder().encode("{}") }],
  });
  expect(res.missing).toEqual(["etter.txt"]);
  const file = virtualFile(segs);
  expect(file.size).toBeGreaterThan(0xffffffff);
  const index = await readZipIndex(file);
  const big = index.get("film/stor.mov")!;
  expect(big.size).toBe(total);
  expect(big.compressedSize).toBe(total);
  const after = index.get("MANGLER.txt")!;
  expect(after.localOffset).toBeGreaterThan(0xffffffff);
  expect(await zipEntryText(file, after)).toContain("etter.txt");
  expect(await zipEntryText(file, index.get("data.json")!)).toBe("{}");
}, 180_000);

it("over 65 535 filer: antallet ligger i ZIP64-sluttposten og alle filer leses", async () => {
  const n = 70_000;
  const chunks: Uint8Array[] = [];
  const enc = new TextEncoder();
  async function* many() { for (let i = 0; i < n; i++) yield { path: `f/${i}.txt`, data: enc.encode(String(i)) }; }
  await writeZip({ write: async (c) => { chunks.push(c); }, close: async () => {}, abort: async () => {} }, [], {}, { extra: many() });
  const blob = new Blob(chunks as BlobPart[]);
  const index = await readZipIndex(blob);
  expect(index.size).toBe(n + 1); // + LESMEG.txt
  expect(await zipEntryText(blob, index.get("f/69999.txt")!)).toBe("69999");
  // Den vanlige sluttposten har 0xffff som markør
  const tail = new DataView(await blob.slice(blob.size - 22).arrayBuffer());
  expect(tail.getUint32(0, true)).toBe(0x06054b50);
  expect(tail.getUint16(10, true)).toBe(0xffff);
}, 120_000);

it("grensen for zip-filer er ikke lenger formatgrensen på 4 GB", () => {
  expect(ZIP_MAX_BYTES).toBeGreaterThan(4 * 1024 * 1024 * 1024);
});
