// @vitest-environment node
/** ML4 (B-049): releasekontrollen – nb og en må være komplette, ellers stopper bygget. */
import { describe, expect, it } from "vitest";
// @ts-ignore – rent JavaScript-skript uten typer
import { coverageReport, releaseCoverage, assertReleaseCoverage } from "../../scripts/i18n/release-check.mjs";

const ok = { text: "Lagre {name}" };
const en = { text: "Save {name}" };

describe("releasekontroll av språkdekningen", () => {
  it("prosjektets kataloger er komplette for nb og en (100 %)", () => {
    const r = releaseCoverage();
    expect(r.problems).toEqual([]);
    expect(r.coverage.nb).toBe(100);
    expect(r.coverage.en).toBe(100);
    expect(r.complete).toBe(true);
    expect(() => assertReleaseCoverage()).not.toThrow();
  });

  it("en manglende engelsk tekst gjør dekningen ufullstendig", () => {
    const r = coverageReport({ nb: { a: ok, b: ok }, en: { a: en } });
    expect(r.complete).toBe(false);
    expect(r.coverage.en).toBe(50);
    expect(r.problems).toContainEqual({ key: "b", problem: "en mangler" });
  });

  it("en tom norsk tekst er en feil, men bevisst tom på begge språk er komplett", () => {
    expect(coverageReport({ nb: { a: { text: " " } }, en: { a: en } }).complete).toBe(false);
    expect(coverageReport({ nb: { a: { text: "" } }, en: { a: { text: "" } } }).complete).toBe(true);
  });

  it("ulike plassholdere og flertall på bare ett språk stopper", () => {
    expect(coverageReport({ nb: { a: ok }, en: { a: { text: "Save {other}" } } }).problems).toContainEqual({ key: "a", problem: "ulike plassholdere" });
    expect(coverageReport({ nb: { a: { text: "x", plural: { one: "x", other: "y" } } }, en: { a: { text: "x" } } }).complete).toBe(false);
  });

  it("avløste grunnlinjenøkler telles ikke", () => {
    const r = coverageReport({ nb: { a: ok, old: { text: null } }, en: { a: en, old: { text: null } } }, undefined, new Set(["old"]));
    expect(r.complete).toBe(true);
    expect(r.keys).toBe(1);
  });
});
