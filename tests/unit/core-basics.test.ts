// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  convertFrames,
  formatTimecode,
  FPS_23_976,
  FPS_25,
  framesToSeconds,
  isUuid,
  isValidOrderKey,
  keyBetween,
  keysEvenly,
  newId,
  secondsToFrames,
} from "@/core";

describe("ID-er (REQ: permanente identiteter, kap. 3.2)", () => {
  it("lager gyldige UUID v7 som sorteres etter tid", () => {
    const a = newId(1_700_000_000_000);
    const b = newId(1_700_000_000_001);
    expect(isUuid(a)).toBe(true);
    expect(a[14]).toBe("7");
    expect(a < b).toBe(true);
  });
});

describe("Tidsmodell (ADR-0006, kap. 6.4)", () => {
  it("regner frem og tilbake mellom sekunder og bilder", () => {
    expect(secondsToFrames(2, FPS_25)).toBe(50);
    expect(framesToSeconds(50, FPS_25)).toBe(2);
    expect(secondsToFrames(1, FPS_23_976)).toBe(24);
  });
  it("konverterer mellom bildefrekvenser", () => {
    expect(convertFrames(25, FPS_25, { num: 50, den: 1 })).toBe(50);
  });
  it("formaterer tidskode", () => {
    expect(formatTimecode(25 * 3661 + 7, FPS_25)).toBe("01:01:01:07");
  });
  it("avviser ugyldig bildefrekvens", () => {
    expect(() => secondsToFrames(1, { num: 0, den: 1 })).toThrow();
  });
});

describe("Sorteringsnøkler (flytting uten omnummerering)", () => {
  const keyArb = fc.stringMatching(/^[0-9a-z]{1,6}$/).filter(isValidOrderKey);
  it("keyBetween gir alltid en gyldig nøkkel strengt mellom to nøkler", () => {
    fc.assert(
      fc.property(keyArb, keyArb, (x, y) => {
        fc.pre(x !== y);
        const [a, b] = x < y ? [x, y] : [y, x];
        const k = keyBetween(a, b);
        return isValidOrderKey(k) && a < k && k < b;
      }),
      { numRuns: 2000 },
    );
  });
  it("åpne ender fungerer", () => {
    fc.assert(
      fc.property(keyArb, (x) => {
        const after = keyBetween(x, null);
        const before = keyBetween(null, x);
        return after > x && before < x && isValidOrderKey(after) && isValidOrderKey(before);
      }),
    );
  });
  it("gjentatt innsetting foran samme nøkkel går aldri tom for plass", () => {
    let hi = "i";
    for (let i = 0; i < 200; i++) {
      const k = keyBetween(null, hi);
      expect(k < hi).toBe(true);
      hi = k;
    }
  });
  it("keysEvenly gir stigende, unike og gyldige nøkler", () => {
    for (const n of [1, 2, 10, 96, 109, 500]) {
      const ks = keysEvenly(n);
      expect(ks).toHaveLength(n);
      ks.forEach((k, i) => {
        expect(isValidOrderKey(k)).toBe(true);
        if (i > 0) expect(ks[i - 1]! < k).toBe(true);
      });
    }
  });
});
