/**
 * PTG3b (B-115): QR-bildet dekodes og inneholder bare den ikke-hemmelige referansen; importen klipper
 * bort tittelkortet og advarer ved lengdeavvik.
 */
import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import jsQR from "jsqr";
import { qrPng } from "@/engine/export/ae-export";
import { decideTitleCardTrim, parsePtgImport, parsePtgImportUrl, ptgImportUrl } from "@/core/interchange/titlecard";

/** Leser vår gråtone-PNG (8 bit, filter 0) til RGBA for jsQR. */
function decodePng(png: Uint8Array): { data: Uint8ClampedArray; width: number; height: number } {
  const dv = new DataView(png.buffer, png.byteOffset);
  let off = 8; let w = 0; let h = 0; const idat: Uint8Array[] = [];
  while (off < png.length) {
    const len = dv.getUint32(off); const type = String.fromCharCode(...png.slice(off + 4, off + 8));
    const data = png.slice(off + 8, off + 8 + len);
    if (type === "IHDR") { w = new DataView(data.buffer).getUint32(0); h = new DataView(data.buffer).getUint32(4); }
    if (type === "IDAT") idat.push(data);
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = raw[y * (w + 1) + 1 + x]!; const i = (y * w + x) * 4;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v; rgba[i + 3] = 255;
  }
  return { data: rgba, width: w, height: h };
}

const ref = { projectId: "11111111-2222-3333-4444-555555555555", occurrenceId: "66666666-7777-8888-9999-000000000000", name: "JULA_SC012_SH010_v003", lengthFrames: 96 };

describe("PTG3b QR-innhold", () => {
  it("QR-bildet dekodes til importlenken med prosjekt, forekomst, skuddnavn og lengde – uten token", async () => {
    const url = ptgImportUrl("https://pentoglass.com", ref);
    const img = decodePng(await qrPng(url));
    const hit = jsQR(img.data, img.width, img.height);
    expect(hit?.data).toBe("https://pentoglass.com/ptg/i?p=11111111-2222-3333-4444-555555555555&o=66666666-7777-8888-9999-000000000000&n=JULA_SC012_SH010_v003&f=96");
    expect(parsePtgImportUrl(hit!.data)).toEqual(ref);
    expect(hit!.data).not.toMatch(/token|secret|key=/i);
  });

  it("ugyldige parametre gir null (nøytral melding)", () => {
    expect(parsePtgImport({ p: "x", o: ref.occurrenceId, n: ref.name, f: "1" })).toBeNull();
    expect(parsePtgImport({ p: ref.projectId, o: ref.occurrenceId, n: "drop table", f: "1" })).toBeNull();
    expect(parsePtgImport({ p: ref.projectId, o: ref.occurrenceId, n: ref.name, f: "-1" })).toBeNull();
    expect(parsePtgImport({ p: ref.projectId, o: ref.occurrenceId, n: ref.name, f: "96" })).toEqual(ref);
  });
});

describe("PTG3b import klipper bort tittelkortet", () => {
  const fps = { num: 24, den: 1 };
  it("film = 1 s + skudd: første sekund klippes, lengden stemmer", () => {
    expect(decideTitleCardTrim({ durationSeconds: 5, expectedFrames: 96, fps })).toEqual({ trimSeconds: 1, frames: 96, lengthMismatch: false });
  });
  it("film uten tittelkort: ingenting klippes", () => {
    expect(decideTitleCardTrim({ durationSeconds: 4, expectedFrames: 96, fps })).toEqual({ trimSeconds: 0, frames: 96, lengthMismatch: false });
  });
  it("QR funnet i første bilde: klippes selv om lengden avviker, og det advares", () => {
    expect(decideTitleCardTrim({ durationSeconds: 7, expectedFrames: 96, fps, qrFound: true })).toEqual({ trimSeconds: 1, frames: 144, lengthMismatch: true });
  });
  it("feil lengde uten tittelkort gir advarsel", () => {
    expect(decideTitleCardTrim({ durationSeconds: 3, expectedFrames: 96, fps }).lengthMismatch).toBe(true);
  });
  it("25 bilder/s og 12 × 2: kortet er ett sekund på tidslinjens bildefrekvens", () => {
    expect(decideTitleCardTrim({ durationSeconds: 5, expectedFrames: 100, fps: { num: 25, den: 1 } }).trimSeconds).toBe(1);
  });
});
