// @vitest-environment node
/** PNG-skriveren som tar bildet stripe for stripe (DEC-0074, KI-131). Dekoder resultatet selv med node:zlib. */
import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { PNG_MAX_WIDTH, crc32, encodePngStrips } from "@/engine/export/png-writer";
import { posterPngSize } from "@/engine/export/poster-canvas";

interface Chunk {
  type: string;
  data: Uint8Array;
  crcOk: boolean;
}

function join(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function chunks(file: Uint8Array): Chunk[] {
  expect([...file.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const v = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const out: Chunk[] = [];
  let at = 8;
  while (at < file.length) {
    const len = v.getUint32(at);
    const type = String.fromCharCode(...file.subarray(at + 4, at + 8));
    const data = file.subarray(at + 8, at + 8 + len);
    const crc = v.getUint32(at + 8 + len);
    out.push({ type, data, crcOk: crc === crc32(file.subarray(at + 4, at + 8 + len)) });
    at += 12 + len;
  }
  expect(at).toBe(file.length);
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Liten PNG-dekoder (RGBA 8 bit, alle fem filtre). */
function decode(file: Uint8Array) {
  const cs = chunks(file);
  const ihdr = cs[0]!;
  expect(ihdr.type).toBe("IHDR");
  const hv = new DataView(ihdr.data.buffer, ihdr.data.byteOffset, 13);
  const width = hv.getUint32(0);
  const height = hv.getUint32(4);
  expect([...ihdr.data.subarray(8)]).toEqual([8, 6, 0, 0, 0]);
  const raw = inflateSync(join(cs.filter((c) => c.type === "IDAT").map((c) => c.data)));
  const stride = width * 4;
  expect(raw.length).toBe(height * (stride + 1));
  const px = new Uint8Array(width * height * 4);
  const filters: number[] = [];
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]!;
    filters.push(f);
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i]!;
      const a = i >= 4 ? px[y * stride + i - 4]! : 0;
      const b = y > 0 ? px[(y - 1) * stride + i]! : 0;
      const c = i >= 4 && y > 0 ? px[(y - 1) * stride + i - 4]! : 0;
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][f];
      if (pred === undefined) throw new Error(`ukjent filter ${f}`);
      px[y * stride + i] = (x + pred) & 0xff;
    }
  }
  return { width, height, px, chunks: cs, filters };
}

/** Et «bilde» definert av globale koordinater, så stripene må settes riktig sammen. */
function pixel(x: number, y: number, k: number): number {
  return k === 3 ? 255 - ((x * 7 + y) % 50) : (x * 31 + y * 17 + k * 101 + ((x * y) % 13)) & 0xff;
}

function stripReader(width: number, calls: [number, number][] = []) {
  return async (y0: number, rows: number) => {
    calls.push([y0, rows]);
    const d = new Uint8ClampedArray(width * rows * 4);
    for (let r = 0; r < rows; r++)
      for (let x = 0; x < width; x++)
        for (let k = 0; k < 4; k++) d[(r * width + x) * 4 + k] = pixel(x, y0 + r, k);
    return d;
  };
}

describe("PNG-skriver i striper", () => {
  it("lager en gyldig PNG med riktige mål, CRC, pHYs og IEND", async () => {
    const parts = await encodePngStrips(
      { width: 7, height: 10, ppi: 300, stripRows: 3 },
      stripReader(7),
    );
    const png = decode(join(parts));
    expect(png.width).toBe(7);
    expect(png.height).toBe(10);
    expect(png.chunks.every((c) => c.crcOk)).toBe(true);
    expect(png.chunks.map((c) => c.type)).toEqual(["IHDR", "pHYs", "IDAT", "IEND"]);
    const phys = png.chunks[1]!.data;
    const ppm = new DataView(phys.buffer, phys.byteOffset, 9).getUint32(0);
    expect(ppm).toBe(Math.round(300 / 0.0254));
    expect(phys[8]).toBe(1);
  });

  it("gir samme piksler som kilden, også over stripegrensene", async () => {
    const width = 53;
    const height = 41;
    const calls: [number, number][] = [];
    const parts = await encodePngStrips({ width, height, stripRows: 6 }, stripReader(width, calls));
    expect(calls).toEqual([
      [0, 6],
      [6, 6],
      [12, 6],
      [18, 6],
      [24, 6],
      [30, 6],
      [36, 5],
    ]);
    const png = decode(join(parts));
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        for (let k = 0; k < 4; k++) expect(png.px[(y * width + x) * 4 + k]).toBe(pixel(x, y, k));
  });

  it("bruker Up-filteret over stripegrenser når radene er like", async () => {
    // Loddrette striper: hver rad er lik raden over, så Up gir bare nuller (også i første rad i en stripe)
    const width = 20;
    const read = async (_y0: number, rows: number) => {
      const d = new Uint8Array(width * rows * 4);
      for (let i = 0; i < d.length; i++) d[i] = ((i % (width * 4)) * 37) & 0xff;
      return d;
    };
    const png = decode(join(await encodePngStrips({ width, height: 9, stripRows: 4 }, read)));
    expect(png.filters.slice(1)).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
  });

  it("deler store bilder i flere IDAT-biter", async () => {
    const width = 700;
    const height = 700;
    let seed = 1;
    const noise = async (_y0: number, rows: number) => {
      const d = new Uint8Array(width * rows * 4);
      for (let i = 0; i < d.length; i++) {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
        d[i] = seed >>> 24;
      }
      return d;
    };
    const progress: number[] = [];
    const parts = await encodePngStrips(
      { width, height, stripRows: 64, onProgress: (p) => progress.push(p) },
      noise,
    );
    const png = decode(join(parts));
    expect(png.chunks.filter((c) => c.type === "IDAT").length).toBeGreaterThan(1);
    expect(png.chunks.every((c) => c.crcOk)).toBe(true);
    expect(progress.at(-1)).toBe(1);
    expect(progress.length).toBe(Math.ceil(height / 64));
  });

  it("stopper med feil når en stripe mangler piksler eller ikke kan tegnes", async () => {
    await expect(
      encodePngStrips({ width: 4, height: 4, stripRows: 2 }, async () => new Uint8Array(3)),
    ).rejects.toThrow("for få piksler");
    await expect(
      encodePngStrips({ width: 4, height: 4, stripRows: 2 }, async () => {
        throw new Error("tegnefeil");
      }),
    ).rejects.toThrow("tegnefeil");
    await expect(
      encodePngStrips({ width: PNG_MAX_WIDTH + 1, height: 1 }, stripReader(1)),
    ).rejects.toThrow();
  });

  it("CRC-32 stemmer med kjent verdi", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new TextEncoder().encode("IEND"))).toBe(0xae426082);
  });
});

describe("plakatens PNG-mål", () => {
  it("70 × 100 cm i 300 ppi gir full trykkoppløsning", () => {
    const s = posterPngSize(700, 1000, 300);
    expect([s.width, s.height]).toEqual([8268, 11811]);
    expect(s.megapixels).toBeCloseTo(97.65, 1);
    expect(s.minBytes).toBeLessThan(s.maxBytes);
  });
});
