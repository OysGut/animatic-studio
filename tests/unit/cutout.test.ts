// @vitest-environment node
/** Frilegging uten AI (DEC-0053, REQ-0580): automaske fra kantfargen, pensel og gjennomsiktighet. */
import { describe, expect, it } from "vitest";
import {
  applyMask,
  autoMask,
  borderColors,
  hasTransparentBorder,
  keptShare,
  paintMask,
} from "@/core";

/** Bilde: hvit bakgrunn, rød sirkel i midten med et hvitt «øye» inni. */
function figure(w = 60, h = 40) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const d = Math.hypot(x - 30, y - 20);
      const eye = Math.hypot(x - 33, y - 17) < 3;
      const inside = d < 12 && !eye;
      px[p] = inside ? 200 : 250;
      px[p + 1] = inside ? 30 : 248;
      px[p + 2] = inside ? 30 : 245;
      px[p + 3] = 255;
    }
  return { px, w, h };
}

describe("frilegging (REQ-0580)", () => {
  it("bakgrunnen langs kanten fjernes; hull inne i figuren beholdes", () => {
    const { px, w, h } = figure();
    expect(borderColors(px, w, h)).toHaveLength(1);
    const m = autoMask(px, w, h, { tolerance: 20, feather: 0 });
    expect(m[0]).toBe(0); // hjørnet
    expect(m[20 * w + 30]).toBe(255); // midten av figuren
    expect(m[17 * w + 33]).toBe(255); // det hvite øyet er omsluttet og beholdes
    const share = keptShare(m);
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.3);
  });

  it("myk kant gir delvis gjennomsiktighet bare ved overgangen", () => {
    const { px, w, h } = figure();
    const m = autoMask(px, w, h, { tolerance: 20, feather: 2 });
    expect(m[0]).toBe(0);
    expect(m[20 * w + 30]).toBe(255);
    const edge = [...m].filter((v) => v > 0 && v < 255).length;
    expect(edge).toBeGreaterThan(10);
  });

  it("bilder som allerede er frilagt, beholder sin gjennomsiktighet", () => {
    const { px, w, h } = figure();
    for (let i = 0; i < w * h; i++) if (px[i * 4] === 250) px[i * 4 + 3] = 0;
    expect(hasTransparentBorder(px, w, h)).toBe(true);
    px[(20 * w + 30) * 4 + 3] = 128; // halvt gjennomsiktig piksel i figuren
    const m = autoMask(px, w, h, { tolerance: 0, feather: 0 });
    // Masken er urørt; bildets egen gjennomsiktighet brukes som den er (ikke ganget med seg selv)
    expect(m.every((v) => v === 255)).toBe(true);
    const out = applyMask(px, m);
    expect(out[3]).toBe(0);
    expect(out[(20 * w + 30) * 4 + 3]).toBe(128);
  });

  it("penselen legger til og fjerner, og resultatet får gjennomsiktighet", () => {
    const { px, w, h } = figure();
    const m = autoMask(px, w, h, { tolerance: 20, feather: 0 });
    paintMask(m, w, h, {
      points: [
        { x: 2, y: 2 },
        { x: 8, y: 2 },
      ],
      radius: 2,
      mode: "add",
      hardness: 1,
    });
    expect(m[2 * w + 5]).toBe(255);
    paintMask(m, w, h, { points: [{ x: 30, y: 20 }], radius: 3, mode: "remove", hardness: 1 });
    expect(m[20 * w + 30]).toBe(0);
    const out = applyMask(px, m);
    expect(out[3]).toBe(0);
    expect(out[(2 * w + 5) * 4 + 3]).toBe(255);
    expect(out[(20 * w + 30) * 4 + 3]).toBe(0);
    expect(out[(15 * w + 25) * 4]).toBe(200); // fargen er uendret
  });

  it("høy toleranse fjerner mer, null toleranse bare helt like farger", () => {
    const { px, w, h } = figure();
    // En lys skygge under figuren, koblet til kanten
    for (let y = 33; y < 39; y++)
      for (let x = 10; x < 50; x++) {
        const p = (y * w + x) * 4;
        px[p] = 225;
        px[p + 1] = 222;
        px[p + 2] = 220;
      }
    const lo = keptShare(autoMask(px, w, h, { tolerance: 0, feather: 0 }));
    const hi = keptShare(autoMask(px, w, h, { tolerance: 40, feather: 0 }));
    expect(lo).toBeGreaterThan(hi);
  });

  it("store bilder går raskt", () => {
    const w = 2000;
    const h = 2000;
    const px = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let y = 500; y < 1500; y++) for (let x = 500; x < 1500; x++) px[(y * w + x) * 4] = 0;
    const t = performance.now();
    const m = autoMask(px, w, h, { tolerance: 30, feather: 2 });
    expect(performance.now() - t).toBeLessThan(4000);
    expect(m[1000 * w + 1000]).toBe(255);
    expect(m[0]).toBe(0);
  });

  it("en farge som bare finnes langs én kant (figuren kuttet nederst), er ikke bakgrunn", () => {
    const { px, w, h } = figure();
    // Figuren går ut av bildet nederst: rød langs hele nederste kant
    for (let y = 30; y < h; y++)
      for (let x = 15; x < 45; x++) {
        const p = (y * w + x) * 4;
        px[p] = 200;
        px[p + 1] = 30;
        px[p + 2] = 30;
      }
    const seeds = borderColors(px, w, h);
    expect(seeds).toHaveLength(1);
    expect(seeds[0]![0]).toBeGreaterThan(240);
  });
});
