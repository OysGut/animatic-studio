import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error – .mjs uten typer
import { mergeCatalog, parseCatalog } from "../../scripts/i18n/catalog-merge.mjs";

describe("B-097: build-catalog kan ikke tømme catalog.gen.ts", () => {
  const existing: Map<string, string> = parseCatalog(readFileSync("src/core/i18n/catalog.gen.ts", "utf8"));
  it("den eksisterende katalogen leses", () => {
    expect(existing.size).toBeGreaterThan(1000);
  });
  it("0 funn beholder alle eksisterende par", () => {
    expect(mergeCatalog(existing, new Map()).size).toBe(existing.size);
  });
  it("tom katalog og 0 funn feiler høyt", () => {
    expect(() => mergeCatalog(new Map(), new Map())).toThrow(/0 tekstpar/);
  });
  it("en fil uten CATALOG feiler", () => {
    expect(() => parseCatalog("export const X = 1;")).toThrow(/CATALOG/);
  });
});
